// server/src/sms/templates.js
// SMS message templates. Keep messages under 160 characters.

const kes = (amount) => Number(amount).toLocaleString("en-KE");

// 254712345678 -> 0712345678 (how Kenyans write numbers)
const localPhone = (phone) => {
  const digits = String(phone).replace(/\D/g, "");
  return digits.startsWith("254") ? `0${digits.slice(3)}` : digits;
};

const templates = {
  paymentReceived: ({ amount, phone }) =>
    `PayLink: Payment of KES ${kes(amount)} received from ${localPhone(phone)}.`,
};

export function buildSMS(templateName, data) {
  const template = templates[templateName];

  if (!template) {
    throw new Error(`Unknown SMS template: ${templateName}`);
  }

  return template(data);
}

export { localPhone };
