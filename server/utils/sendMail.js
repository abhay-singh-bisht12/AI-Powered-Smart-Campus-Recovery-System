import nodemailer from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const APP_NAME = process.env.APP_NAME || "AI-powered Smart Campus Recovery System";

export async function sendMail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: `"${APP_NAME}" <${EMAIL_USER}>`,
    to,
    subject,
    html
  });
}

export function claimApprovedOwnerEmail({ item, claim }) {
  return `
    <div style="font-family:Arial;padding:20px;">
      <h2 style="color:#2563eb;">
        Your Reported Item Has Been Claimed
      </h2>

      <p>Your item claim request has been approved by admin.</p>

      ${
        item.image
          ? `
            <img 
              src="${item.image}" 
              style="max-width:300px;border-radius:10px;"
            />
          `
          : ""
      }

      <h3>Item Details</h3>

      <p><strong>Title:</strong> ${item.title}</p>
      <p><strong>Category:</strong> ${item.category}</p>
      <p><strong>Location:</strong> ${item.location}</p>

      <h3>Claimed By</h3>

      <p><strong>Name:</strong> ${claim.requesterName}</p>
      <p><strong>Email:</strong> ${claim.requesterEmail}</p>

      <br/>

      <p>
        Please contact admin office for final handover.
      </p>
    </div>
  `;
}

export function claimApprovedClaimerEmail({ item }) {
  return `
    <div style="font-family:Arial;padding:20px;">
      <h2 style="color:#16a34a;">
        Your Claim Request Has Been Approved
      </h2>

      <p>
        Congratulations! Admin approved your claim request.
      </p>

      ${
        item.image
          ? `
            <img 
              src="${item.image}" 
              style="max-width:300px;border-radius:10px;"
            />
          `
          : ""
      }

      <h3>Item Details</h3>

      <p><strong>Title:</strong> ${item.title}</p>
      <p><strong>Category:</strong> ${item.category}</p>
      <p><strong>Location:</strong> ${item.location}</p>

      <br/>

      <p>
        Please collect your item from admin office.
      </p>
    </div>
  `;
}