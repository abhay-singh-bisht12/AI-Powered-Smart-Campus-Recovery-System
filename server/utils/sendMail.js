const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME =
  process.env.BREVO_SENDER_NAME ||
  process.env.APP_NAME ||
  "AI-Powered Smart Campus Recovery System";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function emailLayout({ title, preheader, accent = "#2563eb", content }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 36px rgba(23,32,51,.10);">
          <tr>
            <td style="background:${accent};padding:26px 32px;color:#ffffff;">
              <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">Campus Recovery Portal</div>
              <h1 style="margin:8px 0 0;font-size:25px;line-height:1.3;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
              <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e6eaf0;color:#667085;font-size:13px;line-height:1.6;">
                This is an automated message from the AI-Powered Smart Campus Recovery System.
                Please keep this email for your records.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:9px 12px;color:#667085;width:36%;border-bottom:1px solid #edf0f5;">${escapeHtml(label)}</td>
      <td style="padding:9px 12px;font-weight:600;border-bottom:1px solid #edf0f5;">${escapeHtml(value || "-")}</td>
    </tr>`;
}

export async function sendMail({ to, subject, html }) {
  try {
    if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
      console.warn("Email skipped: BREVO_API_KEY or BREVO_SENDER_EMAIL missing");
      return { success: false, skipped: true };
    }

    if (!to || !subject || !html) {
      console.warn("Email skipped: recipient, subject or HTML is missing");
      return { success: false, skipped: true };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL
        },
        to: [{ email: String(to).trim().toLowerCase() }],
        subject,
        htmlContent: html
      })
    });

    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Brevo Email Error:", data);
      return { success: false, error: data };
    }

    console.log(`Email sent successfully to ${to}`);
    return { success: true, data };
  } catch (error) {
    console.error("Email delivery error:", error.message);
    return { success: false, error: error.message };
  }
}

export function sendMailSafe(mailOptions) {
  void sendMail(mailOptions).then((result) => {
    if (!result?.success) {
      console.warn(`Email delivery failed but workflow continued: ${mailOptions?.to || "-"}`);
    }
  });
}

export function passwordResetOtpEmail({ otp }) {
  return emailLayout({
    title: "Password Reset Verification",
    preheader: "Use your secure OTP to continue resetting your password.",
    accent: "#2563eb",
    content: `
      <p style="margin:0 0 14px;line-height:1.7;">Hello,</p>
      <p style="margin:0 0 22px;line-height:1.7;">
        We received a request to reset the password associated with your campus recovery account.
        Enter the verification code below to continue.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <div style="display:inline-block;background:#eef4ff;border:1px solid #c8d8ff;border-radius:12px;padding:18px 28px;font-size:36px;font-weight:700;letter-spacing:10px;color:#1d4ed8;">
          ${escapeHtml(otp)}
        </div>
      </div>
      <p style="margin:0 0 12px;line-height:1.7;"><strong>This code expires in 5 minutes.</strong></p>
      <p style="margin:0;line-height:1.7;color:#667085;">
        If you did not request a password reset, no action is required. Do not share this code with anyone.
      </p>`
  });
}

export function claimApprovedOwnerEmail({ item, claim }) {
  return emailLayout({
    title: "Claim Approved for Your Reported Item",
    preheader: `A claim for ${item?.title || "your reported item"} has been approved.`,
    accent: "#0f766e",
    content: `
      <p style="margin:0 0 14px;line-height:1.7;">Hello,</p>
      <p style="margin:0 0 22px;line-height:1.7;">
        The administrator has completed the ownership review and approved a claim for your reported item.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6eaf0;border-radius:10px;border-collapse:separate;overflow:hidden;">
        ${detailRow("Item", item?.title)}
        ${detailRow("Category", item?.category)}
        ${detailRow("Reported location", item?.location)}
        ${detailRow("Approved claimant", claim?.requesterName)}
        ${detailRow("Claimant email", claim?.requesterEmail)}
        ${detailRow("Claimant phone", claim?.requesterPhone)}
      </table>
      <div style="margin-top:22px;padding:16px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:8px;line-height:1.7;">
        The item is now marked as claimed. Please follow your campus handover procedure and verify the claimant's identity before transferring the item.
      </div>`
  });
}

export function claimApprovedClaimerEmail({ item, claim }) {
  return emailLayout({
    title: "Your Claim Request Has Been Approved",
    preheader: `Your claim for ${item?.title || "the item"} has been approved.`,
    accent: "#16a34a",
    content: `
      <p style="margin:0 0 14px;line-height:1.7;">Hello ${escapeHtml(claim?.requesterName || "Student")},</p>
      <p style="margin:0 0 22px;line-height:1.7;">
        Your ownership claim has been reviewed and approved by the administrator.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6eaf0;border-radius:10px;border-collapse:separate;overflow:hidden;">
        ${detailRow("Item", item?.title)}
        ${detailRow("Category", item?.category)}
        ${detailRow("Found location", item?.location)}
        ${detailRow("Claim status", "Approved")}
      </table>
      <div style="margin-top:22px;padding:16px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:8px;line-height:1.7;">
        Please contact the reporter or campus administrator to arrange collection. Carry your student identification and any supporting ownership proof requested by the administrator.
      </div>`
  });
}
