// server/src/routes/payments.js
// STK Push, M-Pesa callback (v2: live status, email, SMS,
// notification), status polling and transaction history.
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { prisma } from "../prisma.js";
import { requireAdmin, MERCHANT_ID } from "../auth.js";
import { formatPhone, sendSTK, querySTK } from "../mpesa.js";
import { wrap, limiter } from "../middleware.js";
import { maskPhone, publicPayment } from "../utils.js";

import { sendEmail } from "../services/emailService.js";
import { buildPaymentReceiptEmail } from "../emails/paymentReceipt.js";
import { sendSMS } from "../services/smsService.js";
import { buildSMS, localPhone } from "../sms/templates.js";
import notificationService from "../services/notificationService.js";

const router = express.Router();

const merchantName = () =>
  process.env.MERCHANT_NAME || "PayLink Merchant";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254)
  .optional()
  .or(z.literal(""));

// Send a status update to every payer browser watching this
// payment link. The payload carries paymentId so each browser
// only reacts to its own payment.
function emitToPayer(req, paymentLinkId, payload) {
  const io = req.app.get("io");
  const payerSockets = req.app.get("payerSockets");
  const socketIds = payerSockets.get(paymentLinkId);

  if (socketIds?.size) {
    io.to([...socketIds]).emit("payment-status", payload);
  }
}

// --------------------------------------------------
// Initiate STK Push
// POST /api/payments/initiate  { paymentLinkId, phone, email }
// POST /api/mpesa/stkpush      { linkSlug, phoneNumber }  (v1)
// --------------------------------------------------

const initiatePayment = wrap(async (req, res) => {
  const body = req.body || {};
  const paymentLinkId = body.paymentLinkId;
  const linkSlug = body.linkSlug;
  const phoneInput = body.phone ?? body.phoneNumber;

  const parsedEmail = emailSchema.safeParse(body.email ?? "");

  if (!parsedEmail.success) {
    return res.status(400).json({
      success: false,
      error: parsedEmail.error.issues[0].message,
    });
  }

  if (typeof paymentLinkId !== "string" && typeof linkSlug !== "string") {
    return res.status(400).json({
      success: false,
      error: "paymentLinkId required",
    });
  }

  let phone;

  try {
    phone = formatPhone(phoneInput);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  // Read amount from the database, not the frontend
  const link = await prisma.paymentLink.findUnique({
    where:
      typeof paymentLinkId === "string"
        ? { id: paymentLinkId }
        : { slug: linkSlug },
  });

  if (!link) {
    return res.status(404).json({
      success: false,
      error: "Payment link not found",
    });
  }

  if (!link.active) {
    return res.status(410).json({
      success: false,
      error: "This payment link is no longer active",
    });
  }

  // Request Safaricom to send the payment prompt
  const response = await sendSTK({
    phone,
    amount: link.amount,
    slug: link.slug,
    description: link.description,
  });

  // ResponseCode 0 means the request was accepted.
  // It does NOT mean payment was completed.
  if (
    String(response.ResponseCode) !== "0" ||
    !response.CheckoutRequestID
  ) {
    return res.status(502).json({
      success: false,
      error:
        response.ResponseDescription || "STK request was not accepted",
    });
  }

  // Save a pending transaction
  const payment = await prisma.payment.create({
    data: {
      checkoutRequestId: response.CheckoutRequestID,
      merchantRequestId: response.MerchantRequestID || null,
      phoneNumber: phone,
      amount: link.amount,
      paymentLinkId: link.id,
      accountReference: link.slug.slice(0, 12),
      transactionDesc: link.description,
      payerEmail: parsedEmail.data || null,
      status: "pending",
    },
  });

  // Payer page moves from "Waiting for payment" to "Processing"
  emitToPayer(req, link.id, {
    paymentId: payment.id,
    status: "processing",
  });

  res.status(202).json({
    success: true,
    paymentId: payment.id,
    status: payment.status,
    message: "Check your phone and enter your M-Pesa PIN.",
  });
});

router.post("/payments/initiate", limiter(10), initiatePayment);
router.post("/mpesa/stkpush", limiter(10), initiatePayment);

// --------------------------------------------------
// Safaricom callback endpoint
// POST /api/mpesa/callback?token=...
// --------------------------------------------------

function checkCallbackToken(token) {
  const expected = process.env.MPESA_CALLBACK_TOKEN;

  if (
    !expected ||
    typeof token !== "string" ||
    expected.length !== token.length
  ) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.post("/mpesa/callback", async (req, res) => {
  // Only Safaricom knows the private callback token
  if (!checkCallbackToken(req.query.token)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Immediately respond to Safaricom
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const callback = req.body?.Body?.stkCallback;

    if (
      !callback ||
      typeof callback.CheckoutRequestID !== "string" ||
      !Number.isInteger(Number(callback.ResultCode))
    ) {
      console.error("Malformed M-Pesa callback");
      return;
    }

    const checkoutRequestId = callback.CheckoutRequestID;
    const resultCode = Number(callback.ResultCode);
    const resultDesc = String(callback.ResultDesc || "");

    // Find the payment record. Retry briefly in case the
    // callback arrives before the pending row is saved.
    let payment;

    for (let i = 0; i < 4 && !payment; i++) {
      payment = await prisma.payment.findUnique({
        where: { checkoutRequestId },
        include: { paymentLink: true },
      });

      if (!payment) await sleep(500);
    }

    if (!payment) {
      console.error("Payment not found for checkout:", checkoutRequestId);
      return;
    }

    if (resultCode === 0) {
      // --- PAYMENT SUCCESSFUL ---

      // Parse callback metadata
      const metadata = Object.fromEntries(
        (callback.CallbackMetadata?.Item || [])
          .filter((item) => item && typeof item.Name === "string")
          .map((item) => [item.Name, item.Value])
      );

      const amount = Number(metadata.Amount);
      const mpesaReceiptNumber = String(metadata.MpesaReceiptNumber ?? "");
      const phone = String(metadata.PhoneNumber ?? "");

      // Validate the returned payment details against our record
      if (
        amount !== payment.amount ||
        phone !== payment.phoneNumber ||
        !mpesaReceiptNumber
      ) {
        console.error(
          "Payment success details could not be verified:",
          payment.id
        );
        return;
      }

      const paidAt = new Date();

      // Update payment record. Only succeeds the first time a
      // receipt is saved, so a duplicate callback does not
      // send a second email/SMS/notification.
      const result = await prisma.payment.updateMany({
        where: {
          id: payment.id,
          mpesaReceiptNumber: null,
          status: { in: ["pending", "completed"] },
        },
        data: {
          status: "completed",
          resultCode: 0,
          resultDesc: resultDesc || "Payment successful",
          mpesaReceiptNumber,
          transactionDate: String(metadata.TransactionDate || ""),
          paidAt,
        },
      });

      if (!result.count) return;

      // 1. REAL-TIME: Notify the payer via WebSocket
      emitToPayer(req, payment.paymentLinkId, {
        paymentId: payment.id,
        status: "completed",
        mpesaReceiptNumber,
        amount,
        paidAt: paidAt.toISOString(),
      });

      // 2. EMAIL: Send receipt to payer
      if (payment.payerEmail) {
        const { html, text } = buildPaymentReceiptEmail({
          payerName: "Customer",
          amount,
          merchantName: merchantName(),
          description: payment.paymentLink?.description,
          transactionId: payment.id,
          mpesaReceiptNumber,
          paidAt,
        });

        sendEmail({
          to: payment.payerEmail,
          subject: `Payment Receipt - KES ${amount.toLocaleString("en-KE")}`,
          html,
          text,
        }).catch((err) => console.error("Receipt email failed:", err.message));
      }

      // 3. SMS: Notify the merchant
      if (process.env.MERCHANT_PHONE) {
        const smsMessage = buildSMS("paymentReceived", {
          amount,
          phone,
          mpesaReceipt: mpesaReceiptNumber,
        });

        sendSMS({
          to: process.env.MERCHANT_PHONE,
          message: smsMessage,
        }).catch((err) => console.error("Merchant SMS failed:", err.message));
      }

      // 4. NOTIFICATION: Real-time notification bell for merchant
      await notificationService.createNotification({
        type: "payment_received",
        title: "Payment Received",
        message: `KES ${amount.toLocaleString("en-KE")} received from ${localPhone(phone)}`,
        data: { paymentId: payment.id, amount, mpesaReceiptNumber },
        userId: MERCHANT_ID,
      });
    } else {
      // --- PAYMENT FAILED ---

      const result = await prisma.payment.updateMany({
        where: { id: payment.id, status: "pending" },
        data: {
          status: "failed",
          resultCode,
          resultDesc: resultDesc || "Payment not completed",
        },
      });

      if (!result.count) return;

      // Notify payer via WebSocket
      emitToPayer(req, payment.paymentLinkId, {
        paymentId: payment.id,
        status: "failed",
        reason: resultDesc,
      });

      // Notification for merchant
      await notificationService.createNotification({
        type: "payment_failed",
        title: "Payment Failed",
        message: `Payment of KES ${payment.amount.toLocaleString("en-KE")} failed: ${resultDesc}`,
        data: { paymentId: payment.id, reason: resultDesc },
        userId: MERCHANT_ID,
      });
    }
  } catch (error) {
    console.error("Callback processing error:", error);
  }
});

// --------------------------------------------------
// Poll payment status (fallback when the socket is down
// or Safaricom's callback is slow)
// GET /api/payments/:id/poll
// --------------------------------------------------

const lastQueried = new Map();

router.get(
  "/payments/:id/poll",
  limiter(100),
  wrap(async (req, res) => {
    let payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const age = Date.now() - payment.createdAt.getTime();
    const last = lastQueried.get(payment.id) || 0;

    // Ask Daraja if the payment is still pending
    // and the callback has not arrived.
    if (
      payment.status === "pending" &&
      age > 20000 &&
      Date.now() - last > 20000
    ) {
      lastQueried.set(payment.id, Date.now());

      try {
        const check = await querySTK(payment.checkoutRequestId);

        if (check?.ResultCode !== undefined && check?.ResultCode !== null) {
          const code = Number(check.ResultCode);

          if (Number.isInteger(code)) {
            await prisma.payment.updateMany({
              where: { id: payment.id, status: "pending" },
              data: {
                status: code === 0 ? "completed" : "failed",
                resultCode: code,
                resultDesc: String(
                  check.ResultDesc || "M-Pesa status query result"
                ),
                paidAt: code === 0 ? new Date() : null,
              },
            });
          }
        }
      } catch (err) {
        console.warn(
          "STK query pending:",
          err.response?.data?.errorMessage || err.message
        );
      }
    }

    // Fetch the latest status after reconciliation
    payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
    });

    res.json(publicPayment(payment));
  })
);

// --------------------------------------------------
// Transaction history with status filtering
// GET /api/payments
// --------------------------------------------------

router.get(
  "/payments",
  requireAdmin,
  wrap(async (req, res) => {
    const status = req.query.status;

    if (status && !["pending", "completed", "failed"].includes(status)) {
      return res.status(400).json({ error: "Invalid payment status filter" });
    }

    const payments = await prisma.payment.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        paymentLink: { select: { slug: true, description: true } },
      },
    });

    res.json(
      payments.map((payment) => ({
        ...publicPayment(payment),
        phoneNumber: maskPhone(payment.phoneNumber),
        paymentLink: payment.paymentLink,
        transactionDate: payment.transactionDate,
      }))
    );
  })
);

export default router;
