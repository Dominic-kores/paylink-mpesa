import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import {
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { z } from "zod";

import { prisma } from "./prisma.js";
import { login, requireAdmin } from "./auth.js";

import {
  formatPhone,
  sendSTK,
  querySTK,
} from "./mpesa.js";

import { sendPaymentEmail } from "./email.js";

// --------------------------------------------------
// 1. Validate required environment variables
// --------------------------------------------------

for (const name of [
  "DATABASE_URL",
  "JWT_SECRET",
  "ADMIN_PASSWORD_HASH",
  "FRONTEND_URL",
]) {
  if (!process.env[name]) {
    throw new Error(
      `Missing environment variable: ${name}`
    );
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET must have at least 32 characters"
  );
}

// --------------------------------------------------
// 2. Express application configuration
// --------------------------------------------------

const app = express();

app.disable("x-powered-by");
app.disable("etag");

app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = process.env.FRONTEND_URL
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""));

app.use(
  cors({
    origin(origin, done) {
      if (!origin || allowedOrigins.includes(origin)) {
        return done(null, true);
      }

      done(new Error("Origin not allowed"));
    },
  })
);

app.use(express.json({ limit: "20kb" }));

// Prevent caching of sensitive API responses
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Forward asynchronous errors to Express
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Basic rate limiting
const limiter = (max) =>
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

// --------------------------------------------------
// 3. Input validation and response helpers
// --------------------------------------------------

const linkSchema = z.object({
  amount: z.coerce.number().int().min(1).max(150000),

  description: z
    .string()
    .trim()
    .min(3)
    .max(150),

  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9-]{3,50}$/,
      "Slug: 3–50 lowercase letters, digits, dashes"
    )
    .optional()
    .or(z.literal("")),
});

// Return safe link details
const publicLink = (link) => ({
  id: link.id,
  slug: link.slug,
  amount: link.amount,
  description: link.description,
  active: link.active,
  createdAt: link.createdAt,
});

// Mask the customer's phone number
const maskPhone = (phone) =>
  `${phone.slice(0, 4)}****${phone.slice(-4)}`;

// Return payment details without exposing full phone
const publicPayment = (payment) => ({
  id: payment.id,
  status: payment.status,
  amount: payment.amount,
  resultDesc: payment.resultDesc,
  receipt: payment.mpesaReceiptNumber,
  createdAt: payment.createdAt,
});

// --------------------------------------------------
// 4. Health check and admin login
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "PayLink API",
  });
});

app.post(
  "/api/admin/login",
  limiter(8),
  wrap(login)
);

// --------------------------------------------------
// 5. Create a new payment link
// POST /api/links
// --------------------------------------------------

app.post(
  "/api/links",
  requireAdmin,
  wrap(async (req, res) => {
    const parsed = linkSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0].message,
      });
    }

    const { amount, description } = parsed.data;

    let slug = parsed.data.slug || "";

    // Check custom slug uniqueness
    if (slug) {
      const exists = await prisma.paymentLink.findUnique({
        where: { slug },
      });

      if (exists) {
        return res.status(409).json({
          error: "This slug is already taken",
        });
      }
    }

    // Generate random slug if not provided
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (!slug) {
          slug = randomBytes(4).toString("hex");
        }

        const link = await prisma.paymentLink.create({
          data: {
            slug,
            amount,
            description,
          },
        });

        return res.status(201).json(publicLink(link));
      } catch (err) {
        if (err.code !== "P2002") {
          throw err;
        }

        if (parsed.data.slug) {
          return res.status(409).json({
            error: "This slug is already taken",
          });
        }

        // Retry when a random slug collides
        slug = "";
      }
    }

    return res.status(503).json({
      error: "Could not create a unique slug. Retry.",
    });
  })
);

// --------------------------------------------------
// 6. Get all payment links for the dashboard
// GET /api/links
// --------------------------------------------------

app.get(
  "/api/links",
  requireAdmin,
  wrap(async (_req, res) => {
    const links = await prisma.paymentLink.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        payments: {
          select: {
            amount: true,
            status: true,
          },
        },
      },
    });

    const results = links.map(({ payments, ...link }) => {
      const completed = payments.filter(
        (payment) => payment.status === "completed"
      );

      return {
        ...publicLink(link),

        completedPayments: completed.length,

        totalCollected: completed.reduce(
          (sum, payment) => sum + payment.amount,
          0
        ),
      };
    });

    res.json(results);
  })
);

// --------------------------------------------------
// 7. Get one payment link using its slug
// GET /api/links/:slug
// --------------------------------------------------

app.get(
  "/api/links/:slug",
  wrap(async (req, res) => {
    const link = await prisma.paymentLink.findUnique({
      where: {
        slug: req.params.slug,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: "Payment link not found",
      });
    }

    if (!link.active) {
      return res.status(410).json({
        error: "This payment link is no longer active",
      });
    }

    res.json(publicLink(link));
  })
);

// --------------------------------------------------
// 8. Activate or deactivate a payment link
// PATCH /api/links/:id/toggle
// --------------------------------------------------

app.patch(
  "/api/links/:id/toggle",
  requireAdmin,
  wrap(async (req, res) => {
    const link = await prisma.paymentLink.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: "Link not found",
      });
    }

    const updated = await prisma.paymentLink.update({
      where: {
        id: link.id,
      },
      data: {
        active: !link.active,
      },
    });

    res.json(publicLink(updated));
  })
);

// --------------------------------------------------
// 9. Transaction history with status filtering
// GET /api/payments
// --------------------------------------------------

app.get(
  "/api/payments",
  requireAdmin,
  wrap(async (req, res) => {
    const status = req.query.status;

    if (
      status &&
      !["pending", "completed", "failed"].includes(status)
    ) {
      return res.status(400).json({
        error: "Invalid payment status filter",
      });
    }

    const payments = await prisma.payment.findMany({
      where: status ? { status } : {},

      orderBy: {
        createdAt: "desc",
      },

      take: 500,

      include: {
        paymentLink: {
          select: {
            slug: true,
            description: true,
          },
        },
      },
    });

    const results = payments.map((payment) => ({
      ...publicPayment(payment),

      phoneNumber: maskPhone(payment.phoneNumber),

      paymentLink: payment.paymentLink,

      transactionDate: payment.transactionDate,
    }));

    res.json(results);
  })
);

// --------------------------------------------------
// 10. Download payments for a link as CSV
// GET /api/links/:id/payments.csv
// --------------------------------------------------

function csvCell(value) {
  let text = String(value ?? "");

  // Prevent spreadsheet formula injection
  if (/^[\s]*[=+@\-\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

app.get(
  "/api/links/:id/payments.csv",
  requireAdmin,
  wrap(async (req, res) => {
    const link = await prisma.paymentLink.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: "Link not found",
      });
    }

    const payments = await prisma.payment.findMany({
      where: {
        paymentLinkId: link.id,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    const rows = [
      [
        "Date",
        "Phone (masked)",
        "Amount KES",
        "Status",
        "Receipt",
        "Description",
      ],

      ...payments.map((payment) => [
        payment.createdAt.toISOString(),
        maskPhone(payment.phoneNumber),
        payment.amount,
        payment.status,
        payment.mpesaReceiptNumber,
        payment.transactionDesc,
      ]),
    ];

    const csv = rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    res.set(
      "Content-Disposition",
      `attachment; filename="${link.slug}-payments.csv"`
    );

    res
      .type("text/csv; charset=utf-8")
      .send("\uFEFF" + csv);
  })
);

// --------------------------------------------------
// 11. Initiate STK Push
// POST /api/mpesa/stkpush
// --------------------------------------------------

app.post(
  "/api/mpesa/stkpush",
  limiter(10),
  wrap(async (req, res) => {
    const { linkSlug, phoneNumber } = req.body || {};

    if (typeof linkSlug !== "string") {
      return res.status(400).json({
        error: "linkSlug required",
      });
    }

    let phone;

    try {
      phone = formatPhone(phoneNumber);
    } catch (err) {
      return res.status(400).json({
        error: err.message,
      });
    }

    // Read amount from the database, not the frontend
    const link = await prisma.paymentLink.findUnique({
      where: {
        slug: linkSlug,
      },
    });

    if (!link) {
      return res.status(404).json({
        error: "Payment link not found",
      });
    }

    if (!link.active) {
      return res.status(410).json({
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
        error:
          response.ResponseDescription ||
          "STK request was not accepted",
      });
    }

    // Save a pending transaction
    const payment = await prisma.payment.create({
      data: {
        checkoutRequestId: response.CheckoutRequestID,

        merchantRequestId:
          response.MerchantRequestID || null,

        phoneNumber: phone,
        amount: link.amount,

        paymentLinkId: link.id,

        accountReference: link.slug.slice(0, 12),

        transactionDesc: link.description,

        status: "pending",
      },
    });

    res.status(202).json({
      paymentId: payment.id,
      status: payment.status,
      message:
        "Check your phone and enter your M-Pesa PIN.",
    });
  })
);

// --------------------------------------------------
// 12. Validate callback token
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

  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(token)
  );
}

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------
// 13. Safaricom callback endpoint
// POST /api/mpesa/callback
// --------------------------------------------------

app.post(
  "/api/mpesa/callback",
  wrap(async (req, res) => {
    if (!checkCallbackToken(req.query.token)) {
      return res.status(403).json({
        error: "Forbidden",
      });
    }

    const callback = req.body?.Body?.stkCallback;

    if (
      !callback ||
      typeof callback.CheckoutRequestID !== "string" ||
      !Number.isInteger(Number(callback.ResultCode))
    ) {
      return res.status(400).json({
        error: "Malformed callback",
      });
    }

    let payment;

    // Retry briefly if callback arrives before
    // the initial transaction is fully saved.
    for (let i = 0; i < 4; i++) {
      payment = await prisma.payment.findUnique({
        where: {
          checkoutRequestId:
            callback.CheckoutRequestID,
        },
      });

      if (payment) break;

      await sleep(500);
    }

    if (!payment) {
      return res.status(503).json({
        error: "Checkout not recorded yet",
      });
    }

    const code = Number(callback.ResultCode);

    const metadata = Object.fromEntries(
      (callback.CallbackMetadata?.Item || [])
        .filter(
          (item) =>
            item && typeof item.Name === "string"
        )
        .map((item) => [item.Name, item.Value])
    );

    // SUCCESSFUL PAYMENT
    if (code === 0) {
      const callbackPhone = String(
        metadata.PhoneNumber ?? ""
      );

      const receipt = String(
        metadata.MpesaReceiptNumber ?? ""
      );

      // Validate the returned payment details
      if (
        Number(metadata.Amount) !== payment.amount ||
        callbackPhone !== payment.phoneNumber ||
        !receipt
      ) {
        return res.status(422).json({
          error:
            "Payment success details could not be verified",
        });
      }

      // Update only if a receipt has not already
      // been saved; protects against duplicate callbacks.
      const result = await prisma.payment.updateMany({
        where: {
          id: payment.id,
          mpesaReceiptNumber: null,
          status: {
            in: ["pending", "completed"],
          },
        },

        data: {
          status: "completed",
          resultCode: 0,

          resultDesc: String(
            callback.ResultDesc || "Payment successful"
          ),

          mpesaReceiptNumber: receipt,

          transactionDate: String(
            metadata.TransactionDate || ""
          ),
        },
      });

      // Optional notification, only on first
      // successful receipt update.
      if (result.count) {
        const updated = await prisma.payment.findUnique({
          where: {
            id: payment.id,
          },
        });

        sendPaymentEmail(updated).catch((err) => {
          console.error(
            "Optional email could not be sent:",
            err.message
          );
        });
      }
    } else {
      // FAILED OR CANCELLED PAYMENT
      await prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: "pending",
        },

        data: {
          status: "failed",
          resultCode: code,

          resultDesc: String(
            callback.ResultDesc ||
              "Payment not completed"
          ),
        },
      });
    }

    res.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  })
);

// --------------------------------------------------
// 14. Poll payment status
// GET /api/payments/:id/poll
// --------------------------------------------------

const lastQueried = new Map();

app.get(
  "/api/payments/:id/poll",
  limiter(100),
  wrap(async (req, res) => {
    let payment = await prisma.payment.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!payment) {
      return res.status(404).json({
        error: "Payment not found",
      });
    }

    const age =
      Date.now() - payment.createdAt.getTime();

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
        const check = await querySTK(
          payment.checkoutRequestId
        );

        if (
          check?.ResultCode !== undefined &&
          check?.ResultCode !== null
        ) {
          const code = Number(check.ResultCode);

          if (Number.isInteger(code)) {
            await prisma.payment.updateMany({
              where: {
                id: payment.id,
                status: "pending",
              },

              data: {
                status:
                  code === 0 ? "completed" : "failed",

                resultCode: code,

                resultDesc: String(
                  check.ResultDesc ||
                    "M-Pesa status query result"
                ),
              },
            });
          }
        }
      } catch (err) {
        console.warn(
          "STK query pending:",
          err.response?.data?.errorMessage ||
            err.message
        );
      }
    }

    // Fetch the latest status after reconciliation
    payment = await prisma.payment.findUnique({
      where: {
        id: req.params.id,
      },
    });

    res.json(publicPayment(payment));
  })
);

// --------------------------------------------------
// 15. Global error handling
// --------------------------------------------------

app.use((err, _req, res, _next) => {
  if (err.message === "Origin not allowed") {
    return res.status(403).json({
      error: err.message,
    });
  }

  if (err.response) {
    console.error(
      "Daraja API error:",
      err.response.status,
      err.response.data?.errorMessage ||
        err.message
    );

    return res.status(502).json({
      error:
        err.response.data?.errorMessage ||
        "Payment provider unavailable",
    });
  }

  if (err.code === "P2002") {
    return res.status(409).json({
      error: "Duplicate record",
    });
  }

  console.error("API error:", err.message);

  res.status(500).json({
    error: "Internal server error",
  });
});

// --------------------------------------------------
// 16. Start Express server
// --------------------------------------------------

const port = Number(process.env.PORT || 5001);

app.listen(port, "0.0.0.0", () => {
  console.log(
    `PayLink API listening on port ${port}`
  );
});