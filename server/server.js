import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { Server } from "socket.io";

import { User } from "./models/User.js";
import { Item } from "./models/Item.js";
import { ClaimRequest } from "./models/ClaimRequest.js";
import { Notification } from "./models/Notification.js";
import { signAuthToken, verifyAuthToken } from "./auth.js";

import {
  sendMail,
  sendMailSafe,
  passwordResetOtpEmail,
  claimApprovedOwnerEmail,
  claimApprovedClaimerEmail
} from "./utils/sendMail.js";

import { findBestMatch } from "./utils/aiMatcher.js";

const app = express();

console.log("SERVER OWNER CLAIM FLOW v17.3.0 LOADED");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configuredOrigins = String(process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().toLowerCase())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...configuredOrigins,
  "http://localhost:5500",
  "http://localhost:5501",
  "http://localhost:5502",
  "http://localhost:5503",
  "http://localhost:5504",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501",
  "http://127.0.0.1:5502",
  "http://127.0.0.1:5503",
  "http://127.0.0.1:5504"
]);

function allowClientOrigin(origin, callback) {
  // Requests without an Origin header include server-to-server calls and health checks.
  if (!origin) {
    return callback(null, true);
  }

  const normalizedOrigin = String(origin).trim().toLowerCase();

  if (allowedOrigins.has(normalizedOrigin)) {
    return callback(null, true);
  }

  try {
    const { protocol, hostname } = new URL(normalizedOrigin);

    const isHttps = protocol === "https:";

    const isProductionFrontend =
      hostname === "ai-powered-smart-campus-recovery-system.vercel.app";

    const isProjectPreview =
      hostname.startsWith("ai-powered-smart-campu") &&
      hostname.endsWith(".vercel.app");

    if (isHttps && (isProductionFrontend || isProjectPreview)) {
      return callback(null, true);
    }
  } catch {
    // Invalid Origin header remains blocked.
  }

  console.warn(`[CORS BLOCKED] origin=${normalizedOrigin}`);
  return callback(null, false);
}

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowClientOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

// Authenticate every Socket.io connection with the same JWT used by the REST API.
// The client cannot choose another user's email room or pretend to be an admin.
io.use(async (socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token || "").trim();

    if (!token) {
      return next(new Error("not_authenticated"));
    }

    const payload = verifyAuthToken(token);
    const email = String(payload?.email || "").trim().toLowerCase();

    if (!email) {
      return next(new Error("invalid_token"));
    }

    const user = await User.findOne({ email }).select("email role");

    if (!user) {
      return next(new Error("invalid_user"));
    }

    socket.user = {
      email: String(user.email).trim().toLowerCase(),
      role: String(user.role || "student").trim().toLowerCase()
    };

    return next();
  } catch (error) {
    console.error("Socket authentication error:", error.message);
    return next(new Error("invalid_token"));
  }
});

io.on("connection", (socket) => {
  const { email, role } = socket.user;

  socket.join(email);

  if (role === "admin") {
    socket.join("admins");
  }

  console.log(`Socket connected: ${socket.id} (${email}, ${role})`);

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
});

async function sendRealtimeNotification(target, data) {
  try {
    const cleanTarget = String(target || "").trim().toLowerCase();
    if (!cleanTarget) return [];

    let recipients = [];

    if (cleanTarget === "admins") {
      recipients = await User.find({ role: "admin" }).distinct("email");
    } else {
      recipients = [cleanTarget];
    }

    const cleanRecipients = [
      ...new Set(
        recipients
          .map((email) => String(email || "").trim().toLowerCase())
          .filter(Boolean)
      )
    ];

    if (!cleanRecipients.length) return [];

    const documents = cleanRecipients.map((recipientEmail) => ({
      recipientEmail,
      title: String(data?.title || "Notification").trim().slice(0, 160),
      message: String(data?.message || "").trim().slice(0, 1000),
      type: String(data?.type || "general").trim().slice(0, 50),
      claimId: mongoose.Types.ObjectId.isValid(data?.claimId) ? data.claimId : null,
      itemId: mongoose.Types.ObjectId.isValid(data?.itemId) ? data.itemId : null,
      isRead: false
    }));

    const savedNotifications = await Notification.insertMany(documents);

    savedNotifications.forEach((notification) => {
      io.to(notification.recipientEmail).emit(
        "campusNotification",
        notification.toJSON()
      );
    });

    return savedNotifications;
  } catch (error) {
    // A notification failure must not undo an already completed report/claim action.
    console.error("Notification delivery error:", error);
    return [];
  }
}

app.use(
  cors({
    origin: allowClientOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "..")));

// ================= AUTH HELPERS =================

function getBearerToken(req) {
  const rawAuthorization = req.headers.authorization || "";
  const match = String(rawAuthorization).match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

async function requireAuth(req, res) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      res.status(401).json({
        error: "not_logged_in"
      });

      return null;
    }

    const payload = verifyAuthToken(token);

    if (!payload?.email) {
      res.status(401).json({
        error: "invalid_token"
      });

      return null;
    }

    const user = await User.findOne({
      email: String(payload.email).trim().toLowerCase()
    });

    if (!user) {
      res.status(401).json({
        error: "invalid_user"
      });

      return null;
    }

    return user;
  } catch (error) {
    console.error("Authentication error:", error);

    if (!res.headersSent) {
      res.status(401).json({
        error: "invalid_token"
      });
    }

    return null;
  }
}
function isAdmin(user) {
  return (
    String(user?.role || "")
      .trim()
      .toLowerCase() === "admin"
  );
}

function safeUser(user) {
  return user.toJSON();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.#_-])[A-Za-z\d@$!%*?&.#_-]{8,}$/.test(
    password
  );
}

// ================= NOTIFICATIONS =================

app.get("/api/notifications", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    const recipientEmail = String(authUser.email).trim().toLowerCase();
    const notifications = await Notification.find({ recipientEmail })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ notifications });
  } catch (error) {
    console.error("Load notifications error:", error);
    return res.status(500).json({ error: "failed_to_load_notifications" });
  }
});

app.patch("/api/notifications/read-all", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;
    const recipientEmail = String(authUser.email).trim().toLowerCase();
    await Notification.updateMany({ recipientEmail, isRead: false }, { $set: { isRead: true } });
    return res.json({ success: true });
  } catch (error) {
    console.error("Read notifications error:", error);
    return res.status(500).json({ error: "failed_to_mark_notifications_read" });
  }
});

app.delete("/api/notifications/:id", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "bad_notification_id" });
    const recipientEmail = String(authUser.email).trim().toLowerCase();
    const deleted = await Notification.findOneAndDelete({ _id: req.params.id, recipientEmail });
    if (!deleted) return res.status(404).json({ error: "notification_not_found" });
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete notification error:", error);
    return res.status(500).json({ error: "failed_to_delete_notification" });
  }
});

app.delete("/api/notifications", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;
    const recipientEmail = String(authUser.email).trim().toLowerCase();
    await Notification.deleteMany({ recipientEmail });
    return res.json({ success: true });
  } catch (error) {
    console.error("Clear notifications error:", error);
    return res.status(500).json({ error: "failed_to_clear_notifications" });
  }
});

// ================= HEALTH =================

app.get("/api/health", (_req, res) => {
  return res.json({
    ok: true,
    message: "Server is working"
  });
});

// ================= AI CHATBOT =================

app.post("/api/ai/chat", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    const userMessage = String(req.body?.message || "").trim();

    if (!userMessage) {
      return res.status(400).json({
        error: "message_required"
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "missing_groq_api_key"
      });
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.4,
          max_tokens: 220,
          messages: [
            {
              role: "system",
              content:
                "You are an AI assistant for AI-Powered Smart Campus Recovery System. Answer only about lost/found reports, claim requests, admin approval, AI smart match, email notifications, profile, and project usage. Keep answers short, simple, friendly, and useful for students. Use simple Hinglish if user asks in Hinglish."
            },
            {
              role: "user",
              content: userMessage
            }
          ]
        })
      }
    );

    const data = await groqResponse.json().catch(() => ({}));

    if (!groqResponse.ok) {
      console.error("Groq chatbot error:", data);

      return res.status(502).json({
        error: "groq_chatbot_failed"
      });
    }

    const reply = String(
      data?.choices?.[0]?.message?.content ||
        "Sorry, I could not generate a reply right now."
    ).trim();

    return res.json({
      reply
    });
  } catch (error) {
    console.error("Chatbot API error:", error);

    return res.status(500).json({
      error: "chatbot_failed"
    });
  }
});

// ================= USERS =================

// ================= REGISTER =================

app.post("/api/users/register", async (req, res) => {
  try {
    const cleanName = String(req.body?.name || "").trim();

    const cleanEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const cleanPassword = String(req.body?.password || "").trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      return res.status(400).json({
        error: "missing_fields",
        message: "Name, email and password are required"
      });
    }

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({
        error: "invalid_email",
        message: "Please enter a valid email address"
      });
    }

    if (!isStrongPassword(cleanPassword)) {
      return res.status(400).json({
        error: "weak_password",
        message:
          "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one special character"
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail
    });

    if (existingUser) {
      return res.status(409).json({
        error: "user_exists",
        message: "An account with this email already exists"
      });
    }

    const createdUser = await User.create({
      name: cleanName,
      email: cleanEmail,
      password: cleanPassword,
      role: "student",
      studentName: "",
      studentPhone: "",
      studentBranch: "",
      studentRollNo: ""
    });

    const token = signAuthToken(createdUser);
    const user = safeUser(createdUser);

    return res.status(201).json({
      ...user,
      token,
      user
    });
  } catch (error) {
    console.error("Register error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        error: "user_exists",
        message: "An account with this email already exists"
      });
    }

    return res.status(500).json({
      error: "failed_to_register",
      message: "Unable to register user"
    });
  }
});
// ================= LOGIN =================

app.post("/api/users/login", async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const cleanPassword = String(req.body?.password || "").trim();

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({
        error: "missing_fields",
        message: "Email and password are required"
      });
    }

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({
        error: "invalid_email",
        message: "Please enter a valid email address"
      });
    }

    const userDoc = await User.findOne({
      email: cleanEmail
    });

    if (!userDoc) {
      return res.status(401).json({
        error: "invalid_login",
        message: "Invalid email or password"
      });
    }

    const passwordOk = await userDoc.comparePassword(cleanPassword);

    if (!passwordOk) {
      return res.status(401).json({
        error: "invalid_login",
        message: "Invalid email or password"
      });
    }

    const token = signAuthToken(userDoc);
    const user = safeUser(userDoc);

    return res.json({
      ...user,
      token,
      user
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: "failed_to_login",
      message: "Unable to login"
    });
  }
});

// ================= FORGOT PASSWORD HELPERS =================

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ================= SEND PASSWORD RESET OTP =================

app.post("/api/forgot-password/send-otp", async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        error: "email_required",
        message: "Email is required"
      });
    }

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({
        error: "invalid_email",
        message: "Please enter a valid email address"
      });
    }

    const user = await User.findOne({
      email: cleanEmail
    });

    if (!user) {
      return res.status(404).json({
        error: "user_not_found",
        message: "No account found with this email"
      });
    }

    const lastSentTime = user.resetPasswordLastSentAt
      ? new Date(user.resetPasswordLastSentAt).getTime()
      : 0;

    const timeSinceLastOtp = Date.now() - lastSentTime;

    if (lastSentTime && timeSinceLastOtp < 60 * 1000) {
      const remainingSeconds = Math.ceil(
        (60 * 1000 - timeSinceLastOtp) / 1000
      );

      return res.status(429).json({
        error: "otp_request_too_soon",
        message: `Please wait ${remainingSeconds} seconds before requesting another OTP`
      });
    }

    const otp = generateOtp();

    user.resetPasswordToken = otp;
    user.resetPasswordExpires = new Date(Date.now() + 5 * 60 * 1000);
    user.resetPasswordVerified = false;
    user.resetPasswordLastSentAt = new Date();

    await user.save();

    const emailResult = await sendMail({
      to: cleanEmail,
      subject: "Password Reset OTP",
      html: passwordResetOtpEmail({
        otp
      })
    });

    if (!emailResult?.success) {
      user.resetPasswordToken = "";
      user.resetPasswordExpires = null;
      user.resetPasswordVerified = false;

      await user.save();

      return res.status(500).json({
        error: "otp_email_failed",
        message: "Unable to send OTP email"
      });
    }

    return res.json({
      success: true,
      message: "OTP sent successfully"
    });
  } catch (error) {
    console.error("Send password reset OTP error:", error);

    return res.status(500).json({
      error: "failed_to_send_otp",
      message: "Unable to send OTP"
    });
  }
});
// ================= VERIFY PASSWORD RESET OTP =================

app.post("/api/forgot-password/verify-otp", async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const cleanOtp = String(req.body?.otp || "").trim();

    if (!cleanEmail || !cleanOtp) {
      return res.status(400).json({
        error: "missing_fields",
        message: "Email and OTP are required"
      });
    }

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({
        error: "invalid_email",
        message: "Please enter a valid email address"
      });
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        error: "invalid_otp_format",
        message: "OTP must contain exactly 6 digits"
      });
    }

    const user = await User.findOne({
      email: cleanEmail
    });

    if (!user) {
      return res.status(404).json({
        error: "user_not_found",
        message: "No account found with this email"
      });
    }

    if (
      !user.resetPasswordToken ||
      !user.resetPasswordExpires
    ) {
      return res.status(400).json({
        error: "otp_not_requested",
        message: "Please request a new OTP"
      });
    }

    const otpExpired =
      new Date(user.resetPasswordExpires).getTime() < Date.now();

    if (otpExpired) {
      user.resetPasswordToken = "";
      user.resetPasswordExpires = null;
      user.resetPasswordVerified = false;

      await user.save();

      return res.status(400).json({
        error: "otp_expired",
        message: "OTP has expired. Please request a new OTP"
      });
    }

    if (String(user.resetPasswordToken) !== cleanOtp) {
      return res.status(400).json({
        error: "invalid_otp",
        message: "Incorrect OTP"
      });
    }

    user.resetPasswordVerified = true;
    user.resetPasswordToken = "";

    await user.save();

    return res.json({
      success: true,
      message: "OTP verified successfully"
    });
  } catch (error) {
    console.error("Verify password reset OTP error:", error);

    return res.status(500).json({
      error: "failed_to_verify_otp",
      message: "Unable to verify OTP"
    });
  }
});

// ================= RESET PASSWORD =================

app.post("/api/forgot-password/reset", async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const cleanPassword = String(req.body?.newPassword || "").trim();

    const cleanConfirmPassword = String(
      req.body?.confirmPassword || ""
    ).trim();

    if (
      !cleanEmail ||
      !cleanPassword ||
      !cleanConfirmPassword
    ) {
      return res.status(400).json({
        error: "missing_fields",
        message:
          "Email, new password and confirm password are required"
      });
    }

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({
        error: "invalid_email",
        message: "Please enter a valid email address"
      });
    }

    if (cleanPassword !== cleanConfirmPassword) {
      return res.status(400).json({
        error: "passwords_do_not_match",
        message: "New password and confirm password do not match"
      });
    }

    if (!isStrongPassword(cleanPassword)) {
      return res.status(400).json({
        error: "weak_password",
        message:
          "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one special character"
      });
    }

    const user = await User.findOne({
      email: cleanEmail
    });

    if (!user) {
      return res.status(404).json({
        error: "user_not_found",
        message: "No account found with this email"
      });
    }

    if (!user.resetPasswordVerified) {
      return res.status(403).json({
        error: "otp_not_verified",
        message: "Please verify your OTP before resetting password"
      });
    }

    const verificationExpired =
      !user.resetPasswordExpires ||
      new Date(user.resetPasswordExpires).getTime() < Date.now();

    if (verificationExpired) {
      user.resetPasswordToken = "";
      user.resetPasswordExpires = null;
      user.resetPasswordVerified = false;

      await user.save();

      return res.status(400).json({
        error: "verification_expired",
        message: "OTP verification has expired. Please request a new OTP"
      });
    }

    const samePassword = await user.comparePassword(cleanPassword);

    if (samePassword) {
      return res.status(400).json({
        error: "same_password",
        message: "New password must be different from old password"
      });
    }

    user.password = cleanPassword;
    user.resetPasswordToken = "";
    user.resetPasswordExpires = null;
    user.resetPasswordVerified = false;
    user.resetPasswordLastSentAt = null;

    await user.save();

    return res.json({
      success: true,
      message: "Password reset successfully"
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      error: "failed_to_reset_password",
      message: "Unable to reset password"
    });
  }
});
// ================= CURRENT AUTHENTICATED USER =================

app.get("/api/users/me", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    return res.json({
      success: true,
      user: safeUser(authUser)
    });
  } catch (error) {
    console.error("Load current user error:", error);

    return res.status(500).json({
      error: "failed_to_load_current_user",
      message: "Unable to load current user profile"
    });
  }
});

// ================= UPDATE PROFILE =================

app.put("/api/users/:email/profile", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    const email = String(req.params.email || "")
      .trim()
      .toLowerCase();

    if (
      String(authUser.email).toLowerCase() !== email &&
      !isAdmin(authUser)
    ) {
      return res.status(403).json({
        error: "forbidden"
      });
    }

    const user = await User.findOne({
      email
    });

    if (!user) {
      return res.status(404).json({
        error: "user_not_found"
      });
    }

    const studentName = String(req.body?.studentName || "").trim();
    const studentPhone = String(req.body?.studentPhone || "").trim();
    const studentBranch = String(req.body?.studentBranch || "").trim();
    const studentRollNo = String(req.body?.studentRollNo || "").trim();

    if (studentPhone && !/^[6-9]\d{9}$/.test(studentPhone)) {
      return res.status(400).json({
        error: "invalid_phone",
        message: "Enter a valid 10 digit mobile number"
      });
    }

    if (studentName.length > 100) {
      return res.status(400).json({
        error: "invalid_name"
      });
    }

    user.studentName = studentName;
    user.studentPhone = studentPhone;
    user.studentBranch = studentBranch;
    user.studentRollNo = studentRollNo;

    await user.save();

    return res.json({
      success: true,
      user: safeUser(user)
    });
  } catch (error) {
    console.error("Profile update error:", error);

    return res.status(500).json({
      error: "failed_to_update_profile"
    });
  }
});

// ================= SECURE CLAIM VERIFICATION HELPERS =================

function cleanClaimText(value, maxLength = 1000) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeWords(value) {
  return cleanClaimText(value, 1000)
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

function textSimilarity(first, second) {
  const firstWords = new Set(normalizeWords(first));
  const secondWords = new Set(normalizeWords(second));

  if (!firstWords.size || !secondWords.size) return 0;

  let matches = 0;

  for (const word of firstWords) {
    if (secondWords.has(word)) matches++;
  }

  return Math.round(
    (matches / Math.max(firstWords.size, secondWords.size)) * 100
  );
}

function daysDifference(firstDate, secondDate) {
  const first = new Date(firstDate);
  const second = new Date(secondDate);

  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) {
    return null;
  }

  return Math.abs(first.getTime() - second.getTime()) / (1000 * 60 * 60 * 24);
}

function buildRuleBasedTrustScore(item, claimData, authUser) {
  let score = 20;
  const reasons = [];

  const locationScore = textSimilarity(item.location, claimData.lostLocation);
  const detailScore = textSimilarity(
    `${item.title} ${item.category} ${item.description}`,
    `${claimData.brand} ${claimData.color} ${claimData.uniqueMarks} ${claimData.reason} ${claimData.additionalInfo}`
  );

  const dateGap = daysDifference(item.date, claimData.lostDate);

  if (locationScore >= 60) {
    score += 20;
    reasons.push("Claimed loss location strongly matches the found-item location.");
  } else if (locationScore >= 25) {
    score += 10;
    reasons.push("Claimed loss location partially matches the report.");
  } else {
    reasons.push("Loss location has a weak match and needs manual verification.");
  }

  if (dateGap !== null && dateGap <= 2) {
    score += 18;
    reasons.push("Claimed loss date is close to the reported found date.");
  } else if (dateGap !== null && dateGap <= 7) {
    score += 10;
    reasons.push("Claimed date is within one week of the report.");
  } else {
    reasons.push("Claimed date is distant from the reported date.");
  }

  if (claimData.uniqueMarks.length >= 40) {
    score += 15;
    reasons.push("Detailed private identification marks were provided.");
  } else {
    score += 7;
    reasons.push("Identification marks were provided but are limited.");
  }

  if (detailScore >= 45) {
    score += 12;
    reasons.push("Ownership details have a good textual match with item data.");
  } else if (detailScore >= 20) {
    score += 6;
    reasons.push("Ownership details have a partial textual match.");
  }

  if (claimData.brand) score += 4;
  if (claimData.color) score += 4;
  if (claimData.additionalInfo.length >= 20) score += 4;

  if (
    authUser.studentName &&
    authUser.studentPhone &&
    authUser.studentBranch &&
    authUser.studentRollNo
  ) {
    score += 3;
    reasons.push("Requester has a completed student profile.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    reasons,
    riskLevel: score >= 75 ? "low" : score >= 50 ? "medium" : "high",
    recommendation:
      score >= 75
        ? "Strong claim; verify private details before approval."
        : score >= 50
          ? "Possible owner; admin should perform manual verification."
          : "Weak claim; do not approve without additional evidence."
  };
}

async function getGroqClaimAssessment(item, claimData, ruleResult) {
  if (!process.env.GROQ_API_KEY) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.1,
          max_tokens: 350,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a cautious lost-and-found claim verifier. Return strict JSON only with keys score (0-100 integer), riskLevel (low|medium|high), recommendation (short string), reasons (array of 2-5 short strings). Never treat the score as proof of ownership. Penalize vague, copied, inconsistent, or publicly visible details. Reward private identifying details and reasonable date/location consistency."
            },
            {
              role: "user",
              content: JSON.stringify({
                foundItem: {
                  title: item.title,
                  category: item.category,
                  location: item.location,
                  date: item.date,
                  description: item.description
                },
                claimantDetails: claimData,
                ruleBasedScore: ruleResult.score
              })
            }
          ]
        })
      }
    );

    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Groq claim verification error:", data);
      return null;
    }

    const content = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(String(content || "{}"));

    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    const riskLevel = ["low", "medium", "high"].includes(parsed.riskLevel)
      ? parsed.riskLevel
      : score >= 75
        ? "low"
        : score >= 50
          ? "medium"
          : "high";

    return {
      score: Math.round(score),
      riskLevel,
      recommendation: cleanClaimText(parsed.recommendation, 240),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons
            .map((reason) => cleanClaimText(reason, 180))
            .filter(Boolean)
            .slice(0, 5)
        : []
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      console.warn("AI claim assessment timed out; using rule-based fallback.");
    } else {
      console.error("AI claim assessment failed:", error);
    }

    return null;
  }
}

async function calculateClaimTrust(item, claimData, authUser) {
  const ruleResult = buildRuleBasedTrustScore(item, claimData, authUser);
  const aiResult = await getGroqClaimAssessment(item, claimData, ruleResult);

  if (!aiResult) {
    return {
      ...ruleResult,
      source: "rule_based_fallback"
    };
  }

  const blendedScore = Math.round(ruleResult.score * 0.6 + aiResult.score * 0.4);
  const riskLevel =
    blendedScore >= 75 ? "low" : blendedScore >= 50 ? "medium" : "high";

  return {
    score: blendedScore,
    riskLevel,
    recommendation:
      aiResult.recommendation || ruleResult.recommendation,
    reasons: [...new Set([...ruleResult.reasons, ...aiResult.reasons])].slice(0, 6),
    source: "groq_plus_rules"
  };
}

// ================= CLAIM REQUESTS =================

// ================= CREATE CLAIM =================

app.post("/api/claims", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    console.log(
      `[CLAIM REQUEST RECEIVED] student=${String(authUser.email || "").toLowerCase()} ` +
      `item=${String(req.body?.itemId || "")}`
    );

    if (
      String(authUser.role || "")
        .trim()
        .toLowerCase() !== "student"
    ) {
      return res.status(403).json({
        error: "student_only",
        message: "Only student accounts can submit claim requests"
      });
    }

    const itemId = cleanClaimText(req.body?.itemId, 50);
    const claimData = {
      lostDate: cleanClaimText(req.body?.lostDate, 20),
      lostLocation: cleanClaimText(req.body?.lostLocation, 160),
      brand: cleanClaimText(req.body?.brand, 100),
      color: cleanClaimText(req.body?.color, 60),
      approximateValue:
        req.body?.approximateValue === "" ||
        req.body?.approximateValue === undefined
          ? null
          : Number(req.body.approximateValue),
      lastUsedLocation: cleanClaimText(req.body?.lastUsedLocation, 160),
      uniqueMarks: cleanClaimText(req.body?.uniqueMarks, 600),
      reason: cleanClaimText(req.body?.reason, 1200),
      additionalInfo: cleanClaimText(req.body?.additionalInfo, 600),
      declarationAccepted: req.body?.declarationAccepted === true
    };

    if (
      !itemId ||
      !claimData.lostDate ||
      !claimData.lostLocation ||
      !claimData.uniqueMarks ||
      !claimData.reason
    ) {
      return res.status(400).json({
        error: "missing_fields",
        message:
          "Item, loss date, loss location, identification marks and ownership explanation are required"
      });
    }

    if (!claimData.declarationAccepted) {
      return res.status(400).json({
        error: "declaration_required",
        message: "You must accept the truthful-information declaration"
      });
    }

    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({
        error: "bad_item_id",
        message: "Invalid item ID"
      });
    }

    if (claimData.lostLocation.length < 3) {
      return res.status(400).json({
        error: "invalid_lost_location",
        message: "Loss location must contain at least 3 characters"
      });
    }

    if (claimData.uniqueMarks.length < 10) {
      return res.status(400).json({
        error: "unique_marks_too_short",
        message: "Identification marks must contain at least 10 characters"
      });
    }

    if (claimData.reason.length < 30) {
      return res.status(400).json({
        error: "reason_too_short",
        message: "Ownership explanation must contain at least 30 characters"
      });
    }

    const parsedLostDate = new Date(claimData.lostDate);

    if (Number.isNaN(parsedLostDate.getTime())) {
      return res.status(400).json({
        error: "invalid_lost_date",
        message: "Please provide a valid loss date"
      });
    }

    if (parsedLostDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({
        error: "future_lost_date",
        message: "Loss date cannot be in the future"
      });
    }

    if (
      claimData.approximateValue !== null &&
      (!Number.isFinite(claimData.approximateValue) ||
        claimData.approximateValue < 0 ||
        claimData.approximateValue > 10000000)
    ) {
      return res.status(400).json({
        error: "invalid_approximate_value",
        message: "Approximate value must be between ₹0 and ₹1,00,00,000"
      });
    }

    const item = await Item.findById(itemId);

    if (!item) {
      return res.status(404).json({
        error: "item_not_found",
        message: "Item not found"
      });
    }

    if (item.approvalStatus !== "approved") {
      return res.status(400).json({
        error: "item_not_approved",
        message: "This item has not been approved by admin"
      });
    }

    if (item.status !== "active") {
      return res.status(409).json({
        error: "item_not_available",
        message: "This item is no longer available for claim"
      });
    }

    const requesterEmail = String(authUser.email || "")
      .trim()
      .toLowerCase();

    const existingClaim = await ClaimRequest.findOne({
      itemId: item._id,
      requesterEmail,
      status: { $in: ["pending", "approved"] }
    });

    if (existingClaim) {
      return res.status(409).json({
        error: "claim_already_exists",
        message:
          existingClaim.status === "approved"
            ? "Your claim for this item is already approved"
            : "You already have a pending claim for this item"
      });
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentClaimCount = await ClaimRequest.countDocuments({
      requesterEmail,
      createdAt: { $gte: oneHourAgo }
    });

    if (recentClaimCount >= 3) {
      return res.status(429).json({
        error: "claim_rate_limit",
        message: "Too many claim requests. Please try again after one hour"
      });
    }

    const trustResult = await calculateClaimTrust(item, claimData, authUser);

    const claimFingerprint = [
      String(item._id),
      requesterEmail,
      claimData.lostDate,
      claimData.lostLocation.toLowerCase(),
      claimData.uniqueMarks.toLowerCase()
    ].join("|");

    const claim = await ClaimRequest.create({
      itemId: item._id,
      itemTitle: item.title || "-",
      itemCategory: item.category || "-",
      reason: claimData.reason,
      lostDate: claimData.lostDate,
      lostLocation: claimData.lostLocation,
      brand: claimData.brand,
      color: claimData.color,
      approximateValue: claimData.approximateValue,
      lastUsedLocation: claimData.lastUsedLocation,
      uniqueMarks: claimData.uniqueMarks,
      additionalInfo: claimData.additionalInfo,
      declarationAccepted: claimData.declarationAccepted,
      requesterName:
        authUser.studentName || authUser.name || "Student",
      requesterEmail,
      requesterPhone: authUser.studentPhone || "-",
      requesterRollNo: authUser.studentRollNo || "-",
      requesterBranch: authUser.studentBranch || "-",
      trustScore: trustResult.score,
      riskLevel: trustResult.riskLevel,
      aiRecommendation: trustResult.recommendation,
      aiReasons: trustResult.reasons,
      aiVerificationSource: trustResult.source,
      claimFingerprint
    });

    console.log(
      `[CLAIM CREATED] id=${claim._id} student=${requesterEmail} item=${item._id} status=${claim.status}`
    );

    const adminNotifications = await sendRealtimeNotification("admins", {
      title: "New Secure Claim Request",
      message: `${claim.requesterName} requested "${claim.itemTitle}" with an AI trust score of ${claim.trustScore}%.`,
      type: "claim",
      claimId: String(claim._id),
      itemId: String(item._id)
    });

    console.log(
      `[CLAIM ADMIN NOTIFICATION] claim=${claim._id} recipients=${adminNotifications.length}`
    );

    // Never expose AI verification data to students.
    // The complete claim remains stored in MongoDB and is available to admins.
    return res.status(201).json({
      success: true,
      message:
        "Claim submitted successfully. Admin will review your verification details.",
      claimId: String(claim._id),
      status: claim.status
    });
  } catch (error) {
    console.error("Create secure claim error:", error);

    if (error?.code === 11000) {
      return res.status(409).json({
        error: "duplicate_claim",
        message: "A duplicate claim request already exists"
      });
    }

    return res.status(500).json({
      error: "failed_to_create_claim",
      message: "Unable to submit claim request"
    });
  }
});

// ================= GET CLAIMS =================

app.get("/api/claims", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    const query = isAdmin(authUser)
      ? {}
      : {
          requesterEmail: String(authUser.email || "")
            .trim()
            .toLowerCase()
        };

    const claims = await ClaimRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();

    console.log(
      `[CLAIMS FETCH] user=${String(authUser.email).toLowerCase()} role=${String(authUser.role)} count=${claims.length}`
    );

    return res.json({
      success: true,
      count: claims.length,
      claims
    });
  } catch (error) {
    console.error("Claims list error:", error);

    return res.status(500).json({
      error: "failed_to_list_claims",
      message: "Unable to load claim requests"
    });
  }
});
// ================= APPROVE CLAIM =================

app.patch("/api/claims/:id/approve", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    if (!isAdmin(authUser)) {
      return res.status(403).json({
        error: "admin_only",
        message: "Only admin can approve claim requests"
      });
    }

    const claimId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(claimId)) {
      return res.status(400).json({
        error: "bad_claim_id",
        message: "Invalid claim ID"
      });
    }

    const claim = await ClaimRequest.findById(claimId);

    if (!claim) {
      return res.status(404).json({
        error: "claim_not_found",
        message: "Claim request not found"
      });
    }

    if (claim.status === "approved") {
      return res.status(409).json({
        error: "claim_already_approved",
        message: "This claim request is already approved"
      });
    }

    if (claim.status === "rejected") {
      return res.status(409).json({
        error: "claim_already_rejected",
        message: "A rejected claim cannot be approved"
      });
    }

    const item = await Item.findById(claim.itemId);

    if (!item) {
      return res.status(404).json({
        error: "item_not_found",
        message: "The related item no longer exists"
      });
    }

    if (item.status === "claimed") {
      return res.status(409).json({
        error: "item_already_claimed",
        message: "This item has already been claimed"
      });
    }

    claim.status = "approved";
    await claim.save();

    item.status = "claimed";
    await item.save();

    await ClaimRequest.updateMany(
      {
        itemId: claim.itemId,
        _id: {
          $ne: claim._id
        },
        status: "pending"
      },
      {
        $set: {
          status: "rejected"
        }
      }
    );

    const ownerEmail = String(
      item.contactEmail || item.createdBy || ""
    )
      .trim()
      .toLowerCase();

    const claimerEmail = String(claim.requesterEmail || "")
      .trim()
      .toLowerCase();

    if (ownerEmail) {
      await sendRealtimeNotification(ownerEmail, {
        title: "Item Claimed",
        message: `Your reported item "${item.title}" has been claimed.`,
        type: "approved",
        claimId: String(claim._id),
        itemId: String(item._id)
      });
    }

    await sendRealtimeNotification("admins", {
      title: "Claim Completed",
      message: `The item "${item.title}" was successfully claimed and removed from the active reports list.`,
      type: "claim_completed",
      claimId: String(claim._id),
      itemId: String(item._id)
    });

    if (claimerEmail) {
      await sendRealtimeNotification(claimerEmail, {
        title: "Claim Approved",
        message: `Your claim for "${item.title}" has been approved.`,
        type: "approved",
        claimId: String(claim._id),
        itemId: String(item._id)
      });
    }

    // Email background me send hongi.
    // API response email send hone ka wait nahi karega.
    setTimeout(() => {
      if (ownerEmail) {
        sendMailSafe({
          to: ownerEmail,
          subject: "Your reported item has been claimed",
          html: claimApprovedOwnerEmail({
            item,
            claim
          })
        });
      }

      if (claimerEmail) {
        sendMailSafe({
          to: claimerEmail,
          subject: "Your claim request has been approved",
          html: claimApprovedClaimerEmail({
            item,
            claim
          })
        });
      }
    }, 0);

    return res.json({
      success: true,
      message: "Claim approved successfully",
      claim: claim.toJSON(),
      itemStatus: item.status,
      emailQueued: Boolean(ownerEmail || claimerEmail)
    });
  } catch (error) {
    console.error("Approve claim error:", error);

    return res.status(500).json({
      error: "failed_to_approve_claim",
      message: "Unable to approve claim request"
    });
  }
});

// ================= REJECT CLAIM =================

app.patch("/api/claims/:id/reject", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    if (!isAdmin(authUser)) {
      return res.status(403).json({
        error: "admin_only",
        message: "Only admin can reject claim requests"
      });
    }

    const claimId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(claimId)) {
      return res.status(400).json({
        error: "bad_claim_id",
        message: "Invalid claim ID"
      });
    }

    const claim = await ClaimRequest.findById(claimId);

    if (!claim) {
      return res.status(404).json({
        error: "claim_not_found",
        message: "Claim request not found"
      });
    }

    if (claim.status === "approved") {
      return res.status(409).json({
        error: "approved_claim_cannot_be_rejected",
        message: "An approved claim cannot be rejected"
      });
    }

    if (claim.status === "rejected") {
      return res.status(409).json({
        error: "claim_already_rejected",
        message: "This claim request is already rejected"
      });
    }

    claim.status = "rejected";
    await claim.save();

    const claimerEmail = String(claim.requesterEmail || "")
      .trim()
      .toLowerCase();

    if (claimerEmail) {
      await sendRealtimeNotification(claimerEmail, {
        title: "Claim Rejected",
        message: `Your claim for "${claim.itemTitle}" has been rejected.`,
        type: "rejected",
        claimId: String(claim._id),
        itemId: String(claim.itemId)
      });
    }

    return res.json({
      success: true,
      message: "Claim rejected successfully",
      claim
    });
  } catch (error) {
    console.error("Reject claim error:", error);

    return res.status(500).json({
      error: "failed_to_reject_claim",
      message: "Unable to reject claim request"
    });
  }
});

// ================= DELETE CLAIM =================

async function deleteClaimRequestById(req, res) {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) return;

    const claimId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(claimId)) {
      return res.status(400).json({
        error: "bad_claim_id",
        message: "Invalid claim request ID"
      });
    }

    const claim = await ClaimRequest.findById(claimId);

    if (!claim) {
      return res.status(404).json({
        error: "claim_not_found",
        message: "Claim request was not found or was already deleted"
      });
    }

    const admin = isAdmin(authUser);
    const requester =
      String(claim.requesterEmail || "").trim().toLowerCase() ===
      String(authUser.email || "").trim().toLowerCase();

    if (!admin && !requester) {
      return res.status(403).json({
        error: "forbidden",
        message: "You can delete only your own claim request"
      });
    }

    await ClaimRequest.deleteOne({ _id: claim._id });

    return res.json({
      success: true,
      message: "Claim request deleted successfully",
      deletedClaimId: claimId,
      itemId: String(claim.itemId || "")
    });
  } catch (error) {
    console.error("Delete claim error:", error);
    return res.status(500).json({
      error: "failed_to_delete_claim",
      message: error?.message || "Unable to delete claim request"
    });
  }
}

// Primary REST endpoint.
app.delete("/api/claims/:id", deleteClaimRequestById);

// Compatibility fallback for environments/proxies that interfere with DELETE.
app.post("/api/claims/:id/delete", deleteClaimRequestById);

// ================= ITEMS =================

// ================= GET ALL ITEMS =================

app.get("/api/items", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

    const filter = {};

    const type = String(req.query?.type || "")
      .trim()
      .toLowerCase();

    const status = String(req.query?.status || "")
      .trim()
      .toLowerCase();

    const approvalStatus = String(req.query?.approvalStatus || "")
      .trim()
      .toLowerCase();

    if (["lost", "found"].includes(type)) {
      filter.type = type;
    }

    if (["active", "claimed"].includes(status)) {
      filter.status = status;
    }

    if (["pending", "approved", "rejected"].includes(approvalStatus)) {
      filter.approvalStatus = approvalStatus;
    }

    const items = await Item.find(filter).sort({
      createdAt: -1
    });

    return res.json(items.map((item) => item.toJSON()));
  } catch (error) {
    console.error("Items list error:", error);

    return res.status(500).json({
      error: "failed_to_list_items",
      message: "Unable to load items"
    });
  }
});

// ================= CREATE ITEM =================

app.post("/api/items", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    const body = req.body || {};

    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const location = String(body.location || "").trim();
    const date = String(body.date || "").trim();

    const type =
      String(body.type || "").trim().toLowerCase() === "found"
        ? "found"
        : "lost";

    const category = String(body.category || "").trim();
    const contactName = String(body.contactName || "").trim();
    const contactPhone = String(body.contactPhone || "").trim();

    const contactEmail = String(body.contactEmail || "")
      .trim()
      .toLowerCase();

    const image = String(body.image || "").trim();

    if (
      !title ||
      !description ||
      !location ||
      !date ||
      !category
    ) {
      return res.status(400).json({
        error: "missing_fields",
        message:
          "Title, description, location, date and category are required"
      });
    }

    if (title.length < 3 || title.length > 150) {
      return res.status(400).json({
        error: "invalid_title",
        message: "Title must contain between 3 and 150 characters"
      });
    }

    if (description.length < 10 || description.length > 2000) {
      return res.status(400).json({
        error: "invalid_description",
        message:
          "Description must contain between 10 and 2000 characters"
      });
    }

    if (contactEmail && !isValidEmail(contactEmail)) {
      return res.status(400).json({
        error: "invalid_contact_email",
        message: "Please enter a valid contact email"
      });
    }

    if (contactPhone && !/^[6-9]\d{9}$/.test(contactPhone)) {
      return res.status(400).json({
        error: "invalid_contact_phone",
        message: "Please enter a valid 10 digit mobile number"
      });
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        error: "invalid_date",
        message: "Please enter a valid date"
      });
    }

    let aiMatch = null;

    if (type === "lost") {
      try {
        const foundItems = await Item.find({
          type: "found",
          approvalStatus: "approved",
          status: "active"
        }).sort({
          createdAt: -1
        });

        aiMatch = await findBestMatch(
          {
            title,
            description,
            category,
            location
          },
          foundItems
        );
      } catch (aiError) {
        console.error("AI matching error:", aiError);

        // AI fail hone par bhi report submit hogi.
        aiMatch = null;
      }
    }

    const createdItem = await Item.create({
      title,
      description,
      location,
      date,
      type,
      category,
      contactName:
        contactName ||
        authUser.studentName ||
        authUser.name ||
        "Student",
      contactPhone:
        contactPhone || authUser.studentPhone || "",
      contactEmail:
        contactEmail ||
        String(authUser.email || "").trim().toLowerCase(),
      image,
      approvalStatus: isAdmin(authUser)
        ? "approved"
        : "pending",
      status: "active",
      createdBy: String(authUser.email || "")
        .trim()
        .toLowerCase(),
      createdAt: new Date()
    });

    if (!isAdmin(authUser)) {
      await sendRealtimeNotification("admins", {
        title: "New Report Submitted",
        message: `${
          authUser.name || authUser.email
        } submitted a ${createdItem.type} item report.`,
        type: "report",
        itemId: String(createdItem._id)
      });
    }

    return res.status(201).json({
      ...createdItem.toJSON(),
      aiMatch
    });
  } catch (error) {
    console.error("Create item error:", error);

    return res.status(500).json({
      error: "failed_to_create_item",
      message: "Unable to submit item report"
    });
  }
});
// ================= UPDATE ITEM =================

app.patch("/api/items/:id", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) {
      return;
    }

    const itemId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({
        error: "bad_item_id",
        message: "Invalid item ID"
      });
    }

    const item = await Item.findById(itemId);

    if (!item) {
      return res.status(404).json({
        error: "item_not_found",
        message: "Item not found"
      });
    }

    const admin = isAdmin(authUser);

    const owner =
      String(item.createdBy || "")
        .trim()
        .toLowerCase() ===
      String(authUser.email || "")
        .trim()
        .toLowerCase();

    if (!admin && !owner) {
      return res.status(403).json({
        error: "forbidden",
        message: "You cannot update this item"
      });
    }

    const body = req.body || {};
    const previousApprovalStatus = String(item.approvalStatus || "pending")
      .trim()
      .toLowerCase();

    const allowedFields = [
      "title",
      "description",
      "location",
      "date",
      "type",
      "category",
      "contactName",
      "contactPhone",
      "contactEmail",
      "image"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        item[field] = String(body[field] || "").trim();
      }
    }

    if (body.type !== undefined) {
      const newType = String(body.type)
        .trim()
        .toLowerCase();

      if (!["lost", "found"].includes(newType)) {
        return res.status(400).json({
          error: "invalid_item_type",
          message: "Item type must be lost or found"
        });
      }

      item.type = newType;
    }

    if (
      body.contactEmail !== undefined &&
      item.contactEmail &&
      !isValidEmail(item.contactEmail.toLowerCase())
    ) {
      return res.status(400).json({
        error: "invalid_contact_email",
        message: "Please enter a valid contact email"
      });
    }

    if (
      body.contactPhone !== undefined &&
      item.contactPhone &&
      !/^[6-9]\d{9}$/.test(item.contactPhone)
    ) {
      return res.status(400).json({
        error: "invalid_contact_phone",
        message: "Please enter a valid 10 digit mobile number"
      });
    }

    if (
      body.date !== undefined &&
      Number.isNaN(new Date(item.date).getTime())
    ) {
      return res.status(400).json({
        error: "invalid_date",
        message: "Please enter a valid date"
      });
    }

    if (admin) {
      if (body.approvalStatus !== undefined) {
        const newApprovalStatus = String(body.approvalStatus)
          .trim()
          .toLowerCase();

        if (
          !["pending", "approved", "rejected"].includes(
            newApprovalStatus
          )
        ) {
          return res.status(400).json({
            error: "invalid_approval_status"
          });
        }

        item.approvalStatus = newApprovalStatus;
      }

      if (body.status !== undefined) {
        const newStatus = String(body.status)
          .trim()
          .toLowerCase();

        if (!["active", "claimed"].includes(newStatus)) {
          return res.status(400).json({
            error: "invalid_item_status"
          });
        }

        item.status = newStatus;
      }
    } else {
      const requestedStatus =
        body.status !== undefined
          ? String(body.status || "").trim().toLowerCase()
          : "";

      const ownerEditedReportDetails = allowedFields.some(
        (field) => body[field] !== undefined
      );

      if (requestedStatus) {
        if (requestedStatus !== "claimed") {
          return res.status(400).json({
            error: "invalid_owner_status",
            message: "Students can only mark an approved report as resolved"
          });
        }

        if (item.approvalStatus !== "approved") {
          return res.status(409).json({
            error: "report_not_approved",
            message: "Only an approved report can be marked as resolved"
          });
        }

        item.status = "claimed";
      }

      if (ownerEditedReportDetails) {
        // Only editing actual report details sends it back for admin review.
        item.approvalStatus = "pending";

        await sendRealtimeNotification("admins", {
          title: "Report Updated",
          message: `${
            authUser.name || authUser.email
          } updated an item report.`,
          type: "report",
          itemId: String(item._id)
        });
      }

      if (!requestedStatus && !ownerEditedReportDetails) {
        return res.status(400).json({
          error: "no_valid_update",
          message: "No valid item update was provided"
        });
      }
    }

    await item.save();

    const persistedItem = await Item.findById(item._id);

    if (!persistedItem) {
      return res.status(500).json({
        error: "item_update_not_persisted",
        message: "Item update could not be verified"
      });
    }

    console.log(
      `[ITEM UPDATED] id=${persistedItem._id} by=${String(authUser.email).toLowerCase()} ` +
      `approvalStatus=${persistedItem.approvalStatus} status=${persistedItem.status}`
    );

    if (
      admin &&
      body.approvalStatus !== undefined &&
      previousApprovalStatus !== persistedItem.approvalStatus
    ) {
      const studentEmail = String(item.createdBy || item.contactEmail || "")
        .trim()
        .toLowerCase();

      if (studentEmail) {
        const approved = persistedItem.approvalStatus === "approved";
        const rejected = persistedItem.approvalStatus === "rejected";

        if (approved || rejected) {
          const notificationResult = await sendRealtimeNotification(studentEmail, {
            title: approved ? "Report Approved" : "Report Rejected",
            message: approved
              ? `Admin approved your report "${persistedItem.title}".`
              : `Admin rejected your report "${persistedItem.title}".`,
            type: approved ? "approved" : "rejected",
            itemId: String(item._id)
          });

          console.log(
            `[REPORT STATUS NOTIFICATION] item=${persistedItem._id} status=${persistedItem.approvalStatus} student=${studentEmail} saved=${notificationResult.length}`
          );
        }
      }
    }

    return res.json(persistedItem.toJSON());
  } catch (error) {
    console.error("Update item error:", error);

    return res.status(500).json({
      error: "failed_to_patch_item",
      message: "Unable to update item"
    });
  }
});

// ================= DELETE ITEM =================

async function deleteItemById(req, res) {
  try {
    const authUser = await requireAuth(req, res);

    if (!authUser || res.headersSent) return;

    const itemId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({
        error: "bad_item_id",
        message: "Invalid item ID"
      });
    }

    const item = await Item.findById(itemId);

    if (!item) {
      return res.status(404).json({
        error: "item_not_found",
        message: "Item not found"
      });
    }

    const admin = isAdmin(authUser);
    const owner =
      String(item.createdBy || "").trim().toLowerCase() ===
      String(authUser.email || "").trim().toLowerCase();

    if (!admin && !owner) {
      return res.status(403).json({
        error: "forbidden",
        message: "You cannot delete this item"
      });
    }

    if (!admin) {
      item.hiddenByOwner = true;
      await item.save();

      return res.json({
        success: true,
        softDeleted: true,
        message: "Report removed from My Reports. Admin record is preserved."
      });
    }

    await ClaimRequest.deleteMany({ itemId: item._id });
    await Item.deleteOne({ _id: item._id });

    return res.json({
      success: true,
      softDeleted: false,
      message: "Item permanently deleted by admin"
    });
  } catch (error) {
    console.error("Delete item error:", error);
    return res.status(500).json({
      error: "failed_to_delete_item",
      message: error?.message || "Unable to delete item"
    });
  }
}

app.delete("/api/items/:id", deleteItemById);
app.post("/api/items/:id/delete", deleteItemById);

// ================= 404 HANDLER =================

app.use((req, res) => {
  return res.status(404).json({
    error: "route_not_found",
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ================= GLOBAL ERROR HANDLER =================

app.use((error, _req, res, _next) => {
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    return;
  }

  return res.status(500).json({
    error: "internal_server_error",
    message: "Something went wrong on the server"
  });
});

// ================= SERVER START =================

async function main() {
  const mongoUri = String(process.env.MONGODB_URI || "").trim();

  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI in .env file");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("Missing JWT_SECRET in .env file");
  }

  await mongoose.connect(mongoUri);

  console.log(
    `MongoDB connected successfully (database: ${mongoose.connection.name})`
  );

  const port = Number(process.env.PORT || 5000);

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

main().catch((error) => {
  console.error("Fatal server startup error:", error);
  process.exit(1);
});

// ================= GRACEFUL SHUTDOWN =================

async function shutdown(signal) {
  console.log(`${signal} received. Closing server...`);

  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});