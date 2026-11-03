import nodemailer from "nodemailer";

// Hide part of the payer's phone number
function maskPhone(phone) {
  return (
    `${phone?.slice(0, 4) || "****"}` +
    `****${phone?.slice(-4) || "****"}`
  );
}

export async function sendPaymentEmail(payment) {
  const {
    NOTIFICATION_EMAIL,
    SMTP_HOST,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  // Email is optional.
  if (
    !NOTIFICATION_EMAIL ||
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !SMTP_FROM
  ) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const format = new Intl.NumberFormat("en-KE");

  // Build the email message
  const content = [
    "PayLink payment confirmed",
    `Amount: KES ${format.format(payment.amount)}`,
    `Receipt: ${
      payment.mpesaReceiptNumber || "Not yet available"
    }`,
    `Payer phone: ${maskPhone(payment.phoneNumber)}`,
    `Description: ${
      payment.transactionDesc || "Payment"
    }`,
    `Date: ${payment.createdAt.toISOString()}`,
  ].join("\n");

  await transporter.sendMail({
    from: SMTP_FROM,
    to: NOTIFICATION_EMAIL,
    subject: `PayLink received KES ${format.format(
      payment.amount
    )}`,
    text: content,
  });
}