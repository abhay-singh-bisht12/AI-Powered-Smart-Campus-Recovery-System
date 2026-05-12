import nodemailer from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const APP_NAME =
  process.env.APP_NAME ||
  "AI-powered Smart Campus Recovery System";

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
    .then(() =>
      console.log("Email sent:", mailOptions.to)
    )
    .catch((err) =>
      console.log(
        "Email failed but ignored:",
        err.message
      )
    );
}

// ================= EMAIL TEMPLATES =================

export function claimApprovedOwnerEmail({ item, claim }) {
  return `
    <div style="font-family:Arial;padding:20px;">
      <h2 style="color:#2563eb;">
        Your Reported Item Has Been Claimed
      </h2>

      <p>Hello,</p>

      <p>
        Your reported item has been successfully claimed.
      </p>

      <p><b>Item:</b> ${item.title || "-"}</p>
      <p><b>Category:</b> ${item.category || "-"}</p>
      <p><b>Location:</b> ${item.location || "-"}</p>

      <hr/>

      <h3>Claimer Details</h3>

      <p>
        <b>Name:</b>
        ${claim.requesterName || "-"}
      </p>

      <p>
        <b>Email:</b>
        ${claim.requesterEmail || "-"}
      </p>

      <p>
        <b>Phone:</b>
        ${claim.requesterPhone || "-"}
      </p>

      <br/>

      <p>
        Regards,<br/>
        AI-powered Smart Campus Recovery System
      </p>
    </div>
  `;
}

export function claimApprovedClaimerEmail({ item, claim }) {
  return `
    <div style="font-family:Arial;padding:20px;">
      <h2 style="color:#16a34a;">
        Claim Approved
      </h2>

      <p>
        Hello ${claim.requesterName || "Student"},
      </p>

      <p>
        Your claim request has been approved by admin.
      </p>

      <p><b>Item:</b> ${item.title || "-"}</p>
      <p><b>Category:</b> ${item.category || "-"}</p>
      <p><b>Location:</b> ${item.location || "-"}</p>

      <br/>

      <p>
        Please contact the reporter/admin for item collection.
      </p>

      <br/>

      <p>
        Regards,<br/>
        AI-powered Smart Campus Recovery System
      </p>
    </div>
  `;
}