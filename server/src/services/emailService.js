// server/src/services/emailService.js
// Sends email through Resend (Lesson 3).
import { Resend } from "resend";

let resend;

export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.info("Email skipped: RESEND_API_KEY/EMAIL_FROM not set");
    return null;
  }

  resend ??= new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || "Resend rejected the email");
  }

  return data;
}
