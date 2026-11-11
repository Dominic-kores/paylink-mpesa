// server/src/emails/paymentReceipt.js
// Builds the payer's receipt email (HTML + plain-text version).

const kes = (value) =>
  `KES ${Number(value).toLocaleString("en-KE")}`;

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(new Date(date));

// Escape values before putting them in HTML
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );

export function buildPaymentReceiptEmail({
  payerName,
  amount,
  merchantName,
  description,
  transactionId,
  mpesaReceiptNumber,
  paidAt,
}) {
  const rows = [
    ["Amount", kes(amount)],
    ["Paid to", merchantName],
    ["For", description || "Payment"],
    ["M-Pesa receipt", mpesaReceiptNumber],
    ["Date", formatDate(paidAt)],
    ["Transaction ID", transactionId],
  ];

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
      <tr>
        <td style="background:#059669;padding:24px;text-align:center;color:#ffffff">
          <div style="font-size:14px;letter-spacing:1px;text-transform:uppercase">PayLink receipt</div>
          <div style="font-size:32px;font-weight:bold;margin-top:8px">${esc(kes(amount))}</div>
          <div style="font-size:14px;margin-top:4px">Payment successful</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px">
          <p style="font-size:15px;margin:0 0 16px">Hi ${esc(payerName)}, thank you for your payment.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px">
            ${rows
              .map(
                ([label, value]) => `<tr>
              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b">${esc(label)}</td>
              <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">${esc(value)}</td>
            </tr>`
              )
              .join("")}
          </table>
          <p style="font-size:12px;color:#64748b;margin:20px 0 0">
            Keep this email for your records. Your M-Pesa confirmation SMS from Safaricom is your official proof of payment.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "PayLink payment receipt",
    "",
    `Hi ${payerName}, thank you for your payment.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");

  return { html, text };
}
