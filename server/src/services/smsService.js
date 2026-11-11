// server/src/services/smsService.js
// Sends SMS through Africa's Talking (Lesson 4).
// Use AT_USERNAME=sandbox with your sandbox API key while testing.
import africastalking from "africastalking";

let sms;

// 0712345678 / 254712345678 -> +254712345678
export function formatPhoneForSMS(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("254")) return `+${digits}`;
  if (digits.startsWith("0")) return `+254${digits.slice(1)}`;
  return `+${digits}`;
}

export async function sendSMS({ to, message }) {
  if (!process.env.AT_USERNAME || !process.env.AT_API_KEY) {
    console.info("SMS skipped: AT_USERNAME/AT_API_KEY not set");
    return null;
  }

  sms ??= africastalking({
    username: process.env.AT_USERNAME,
    apiKey: process.env.AT_API_KEY,
  }).SMS;

  const result = await sms.send({
    to: [formatPhoneForSMS(to)],
    message,
    ...(process.env.AT_SENDER_ID
      ? { from: process.env.AT_SENDER_ID }
      : {}),
  });

  const recipient = result?.SMSMessageData?.Recipients?.[0];

  if (!recipient || recipient.statusCode >= 400) {
    throw new Error(
      recipient?.status ||
        result?.SMSMessageData?.Message ||
        "Africa's Talking did not accept the SMS"
    );
  }

  return recipient;
}
