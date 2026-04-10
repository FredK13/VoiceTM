// src/utils/mailer.ts
import nodemailer from "nodemailer";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let cachedTransporter: nodemailer.Transporter | null = null;

export function getMailer() {
  if (cachedTransporter) return cachedTransporter;

  const host = must("SMTP_HOST");
  const port = Number(must("SMTP_PORT"));
  const user = must("SMTP_USER");
  const pass = must("SMTP_PASS");

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" },
  });

  return cachedTransporter;
}

export async function verifyMailerOnce() {
  const transporter = getMailer();
  try {
    await transporter.verify();
    console.log("✅ SMTP verified");
  } catch (_e) {
    console.error("❌ SMTP verify failed (check SMTP_HOST/PORT/USER/PASS).");
    throw new Error("Email service misconfigured");
  }
}

export async function sendPasswordResetEmail(params: { to: string; resetUrl: string }) {
  const { to, resetUrl } = params;

  const from = must("SMTP_FROM");
  const transporter = getMailer();

  const subject = "Reset your Yap password";
  const text =
    `You requested a password reset.\n\n` +
    `Reset link (valid for 30 minutes):\n${resetUrl}\n\n` +
    `If you didn’t request this, ignore this email.`;

  await transporter.sendMail({ from, to, subject, text });
}
