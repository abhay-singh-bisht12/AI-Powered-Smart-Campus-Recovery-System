import nodemailer from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const APP_NAME = process.env.APP_NAME || "AI-powered Smart Campus Recovery System";

const transporter = nodemailer.createTransport({
  service: "gmail",
  pool: true,
  maxConnections: 1,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000,
});

function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Email timeout")), ms)
    ),
  ]);
}

export async function sendMail({ to, subject, html }) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log("Email skipped: EMAIL_USER or EMAIL_PASS missing");
    return;
  }

  await withTimeout(
    transporter.sendMail({
      from: `"${APP_NAME}" <${EMAIL_USER}>`,
      to,
      subject,
      html,
    }),
    5000
  );
}

export function sendMailSafe(mailOptions) {
  sendMail(mailOptions)
    .then(() => console.log("Email sent:", mailOptions.to))
    .catch((err) => console.log("Email failed but ignored:", err.message));
}