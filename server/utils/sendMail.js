const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME =
  process.env.BREVO_SENDER_NAME ||
  process.env.APP_NAME ||
  "AI-powered Smart Campus Recovery System";

export async function sendMail({ to, subject, html }) {
  try {
    if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
      console.log("Email skipped: BREVO_API_KEY or BREVO_SENDER_EMAIL missing");
      return { success: false, skipped: true };
    }

    if (!to || !subject || !html) {
      console.log("Email skipped: missing to, subject, or html");
      return { success: false, skipped: true };
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: BREVO_SENDER_NAME,
          email: BREVO_SENDER_EMAIL,
        },
        to: [
          {
            email: to,
          },
        ],
        subject,
        htmlContent: html,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.log("Brevo Email Error:", data);
      return { success: false, error: data };
    }

    console.log("Brevo Email Sent:", to);
    return { success: true, data };
  } catch (err) {
    console.log("Brevo Email Failed:", err.message);
    return { success: false, error: err.message };
  }
}

export function sendMailSafe(mailOptions) {
  sendMail(mailOptions)
    .then((res) => {
      if (res?.success) {
        console.log("Email sent:", mailOptions.to);
      } else {
        console.log("Email failed but ignored:", mailOptions.to);
      }
    })
    .catch((err) =>
      console.log("Email failed but ignored:", err.message)
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

      <p><b>Name:</b> ${claim.requesterName || "-"}</p>
      <p><b>Email:</b> ${claim.requesterEmail || "-"}</p>
      <p><b>Phone:</b> ${claim.requesterPhone || "-"}</p>

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