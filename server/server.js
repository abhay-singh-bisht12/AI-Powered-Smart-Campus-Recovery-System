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
import { signAuthToken, verifyAuthToken } from "./auth.js";

import {
  sendMail,
  claimApprovedOwnerEmail,
  claimApprovedClaimerEmail
} from "./utils/sendMail.js";

import { findBestMatch } from "./utils/aiMatcher.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientOrigin = process.env.CLIENT_ORIGIN || "*";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    credentials: true
  }
});

io.on("connection", (socket) => {
  console.log("Socket connected");

  socket.on("joinUser", (user) => {
    const email = String(user?.email || "").toLowerCase();
    const role = String(user?.role || "");

    if (email) socket.join(email);
    if (role === "admin") socket.join("admins");
  });
});

function sendRealtimeNotification(target, data) {
  io.to(target).emit("campusNotification", data);
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "..")));

// ================= AUTH HELPERS =================

function getBearerToken(req) {
  const raw = req.headers.authorization || "";
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function requireAuth(req, res) {
  const token = getBearerToken(req);

  if (!token) {
    res.status(401).json({ error: "not_logged_in" });
    return null;
  }

  const payload = verifyAuthToken(token);

  if (!payload || !payload.email) {
    res.status(401).json({ error: "invalid_token" });
    return null;
  }

  const user = await User.findOne({
    email: String(payload.email).toLowerCase()
  });

  if (!user) {
    res.status(401).json({ error: "invalid_user" });
    return null;
  }

  return user;
}

function isAdmin(user) {
  return user && user.role === "admin";
}

function safeUser(user) {
  return user.toJSON();
}

// ================= HEALTH =================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    message: "Server is working"
  });
});
// ================= AI CHATBOT =================

app.post("/api/ai/chat", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    const { message } = req.body || {};
    const userMessage = String(message || "").trim();

    if (!userMessage) {
      return res.status(400).json({ error: "message_required" });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "missing_groq_api_key" });
    }

    const groqRes = await fetch(
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

    const data = await groqRes.json();

    if (!groqRes.ok) {
      console.error("Groq chatbot error:", data);
      return res.status(500).json({ error: "groq_chatbot_failed" });
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Sorry, I could not generate a reply right now.";

    res.json({ reply });
  } catch (error) {
    console.error("Chatbot API error:", error);
    res.status(500).json({ error: "chatbot_failed" });
  }
});

// ================= USERS =================

app.post("/api/users/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const existing = await User.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(409).json({ error: "user_exists" });
    }

    const created = await User.create({
      name: cleanName,
      email: cleanEmail,
      password: cleanPassword,
      role: "student",
      studentName: "",
      studentPhone: "",
      studentBranch: "",
      studentRollNo: ""
    });

    const token = signAuthToken(created);
    const user = safeUser(created);

    res.json({
      ...user,
      token,
      user
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "failed_to_register" });
  }
});

app.post("/api/users/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();

    const userDoc = await User.findOne({ email: cleanEmail });

    if (!userDoc) {
      return res.status(401).json({ error: "invalid_login" });
    }

    const passwordOk = await userDoc.comparePassword(cleanPassword);

    if (!passwordOk) {
      return res.status(401).json({ error: "invalid_login" });
    }

    const token = signAuthToken(userDoc);
    const user = safeUser(userDoc);

    res.json({
      ...user,
      token,
      user
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "failed_to_login" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(newPassword || "").trim();

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({
        message: "Email and new password are required"
      });
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    user.password = cleanPassword;
    await user.save();

    res.json({
      message: "Password updated successfully"
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      message: "Server error"
    });
  }
});

app.put("/api/users/:email/profile", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    const email = String(req.params.email || "").trim().toLowerCase();

    if (String(authUser.email).toLowerCase() !== email && !isAdmin(authUser)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const { studentName, studentPhone, studentBranch, studentRollNo } =
      req.body || {};

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }

    user.studentName = String(studentName || "").trim();
    user.studentPhone = String(studentPhone || "").trim();
    user.studentBranch = String(studentBranch || "").trim();
    user.studentRollNo = String(studentRollNo || "").trim();

    await user.save();

    res.json(safeUser(user));
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "failed_to_update_profile" });
  }
});

// ================= CLAIM REQUESTS =================

app.post("/api/claims", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    const { itemId, reason } = req.body || {};

    if (!itemId || !reason) {
      return res.status(400).json({ error: "missing_fields" });
    }

    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({ error: "bad_item_id" });
    }

    const item = await Item.findById(itemId);

    if (!item) {
      return res.status(404).json({ error: "item_not_found" });
    }

    const requesterEmail = String(authUser.email || "").toLowerCase();

    const alreadyRequested = await ClaimRequest.findOne({
      itemId,
      requesterEmail,
      status: "pending"
    });

    if (alreadyRequested) {
      return res.status(400).json({
        error: "You already submitted a pending claim request for this item."
      });
    }

    const claim = await ClaimRequest.create({
      itemId,
      itemTitle: item.title || "-",
      itemCategory: item.category || "-",
      reason: String(reason).trim(),
      requesterName: authUser.studentName || authUser.name || "Student",
      requesterEmail,
      requesterPhone: authUser.studentPhone || "-"
    });

    sendRealtimeNotification("admins", {
      title: "New Claim Request",
      message: `${claim.requesterName} requested claim for ${claim.itemTitle}`,
      type: "claim"
    });

    res.status(201).json(claim);
  } catch (error) {
    console.error("Create claim error:", error);
    res.status(500).json({ error: "failed_to_create_claim" });
  }
});

app.get("/api/claims", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    let claims;

    if (isAdmin(authUser)) {
      claims = await ClaimRequest.find({}).sort({ createdAt: -1 });
    } else {
      claims = await ClaimRequest.find({
        requesterEmail: String(authUser.email || "").toLowerCase()
      }).sort({ createdAt: -1 });
    }

    res.json(claims);
  } catch (error) {
    console.error("Claims list error:", error);
    res.status(500).json({ error: "failed_to_list_claims" });
  }
});

app.patch("/api/claims/:id/approve", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    if (!isAdmin(authUser)) {
      return res.status(403).json({ error: "admin_only" });
    }

    const claimId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(claimId)) {
      return res.status(400).json({ error: "bad_claim_id" });
    }

    const claim = await ClaimRequest.findById(claimId);

    if (!claim) {
      return res.status(404).json({ error: "claim_not_found" });
    }

    const item = await Item.findById(claim.itemId);

    if (!item) {
      return res.status(404).json({ error: "item_not_found" });
    }

    claim.status = "approved";
    await claim.save();

    item.status = "claimed";
    await item.save();

    await ClaimRequest.updateMany(
      {
        itemId: claim.itemId,
        _id: { $ne: claim._id },
        status: "pending"
      },
      { status: "rejected" }
    );

    const ownerEmail = String(item.contactEmail || item.createdBy || "").trim().toLowerCase();
    const claimerEmail = String(claim.requesterEmail || "").trim().toLowerCase();

    try {
      if (ownerEmail) {
        await sendMail({
          to: ownerEmail,
          subject: "Your reported item has been claimed",
          html: claimApprovedOwnerEmail({ item, claim })
        });

        sendRealtimeNotification(ownerEmail, {
          title: "Item Claimed",
          message: `Your item "${item.title}" has been claimed.`,
          type: "approved"
        });
      }

      if (claimerEmail) {
        await sendMail({
          to: claimerEmail,
          subject: "Your claim request has been approved",
          html: claimApprovedClaimerEmail({ item, claim })
        });

        sendRealtimeNotification(claimerEmail, {
          title: "Claim Approved",
          message: `Your claim for "${item.title}" has been approved.`,
          type: "approved"
        });
      }
    } catch (mailError) {
      console.error("Email sending failed:", mailError);
    }

    res.json({
      ...claim.toJSON(),
      emailSent: true
    });
  } catch (error) {
    console.error("Approve claim error:", error);
    res.status(500).json({ error: "failed_to_approve_claim" });
  }
});

app.patch("/api/claims/:id/reject", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    if (!isAdmin(authUser)) {
      return res.status(403).json({ error: "admin_only" });
    }

    const claimId = String(req.params.id || "").trim();

    const claim = await ClaimRequest.findByIdAndUpdate(
      claimId,
      { status: "rejected" },
      { new: true }
    );

    if (!claim) {
      return res.status(404).json({ error: "claim_not_found" });
    }

    res.json(claim);
  } catch (error) {
    console.error("Reject claim error:", error);
    res.status(500).json({ error: "failed_to_reject_claim" });
  }
});

app.delete("/api/claims/:id", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    if (!isAdmin(authUser)) {
      return res.status(403).json({ error: "admin_only" });
    }

    const claim = await ClaimRequest.findByIdAndDelete(req.params.id);

    if (!claim) {
      return res.status(404).json({ error: "claim_not_found" });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete claim error:", error);
    res.status(500).json({ error: "failed_to_delete_claim" });
  }
});

// ================= ITEMS =================

app.get("/api/items", async (_req, res) => {
  try {
    const items = await Item.find({}).sort({ createdAt: -1 });
    res.json(items.map((item) => item.toJSON()));
  } catch (error) {
    console.error("Items list error:", error);
    res.status(500).json({ error: "failed_to_list_items" });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    const body = req.body || {};

    let aiMatch = null;

    if (body.type === "lost") {
      const foundItems = await Item.find({
        type: "found",
        approvalStatus: "approved",
        status: "active"
      }).sort({ createdAt: -1 });

      aiMatch = await findBestMatch(
        {
          title: body.title,
          description: body.description,
          category: body.category,
          location: body.location
        },
        foundItems
      );
    }

    const created = await Item.create({
      title: String(body.title).trim(),
      description: String(body.description).trim(),
      location: String(body.location).trim(),
      date: String(body.date).trim(),
      type: body.type === "found" ? "found" : "lost",
      category: String(body.category).trim(),
      contactName: String(body.contactName || "").trim(),
      contactPhone: String(body.contactPhone || "").trim(),
      contactEmail: String(body.contactEmail || "").trim(),
      image: String(body.image || "").trim(),
      approvalStatus: "pending",
      status: "active",
      createdBy: String(authUser.email).toLowerCase(),
      createdAt: new Date()
    });

    sendRealtimeNotification("admins", {
      title: "New Report Submitted",
      message: `${authUser.name || authUser.email} submitted a ${created.type} item report.`,
      type: "report"
    });

    res.json({
      ...created.toJSON(),
      aiMatch
    });
  } catch (error) {
    console.error("Create item error:", error);
    res.status(500).json({ error: "failed_to_create_item" });
  }
});

app.patch("/api/items/:id", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ error: "item_not_found" });
    }

    const admin = isAdmin(authUser);
    const owner =
      String(item.createdBy).toLowerCase() ===
      String(authUser.email).toLowerCase();

    if (!admin && !owner) {
      return res.status(403).json({ error: "forbidden" });
    }

    Object.assign(item, req.body || {});

    if (!admin) {
      item.approvalStatus = "pending";
    }

    await item.save();

    res.json(item.toJSON());
  } catch (error) {
    console.error("Update item error:", error);
    res.status(500).json({ error: "failed_to_patch_item" });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    const authUser = await requireAuth(req, res);
    if (!authUser || res.headersSent) return;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.json({ ok: true });
    }

    const admin = isAdmin(authUser);
    const owner =
      String(item.createdBy).toLowerCase() ===
      String(authUser.email).toLowerCase();

    if (!admin && !owner) {
      return res.status(403).json({ error: "forbidden" });
    }

    await Item.deleteOne({ _id: req.params.id });
    await ClaimRequest.deleteMany({ itemId: req.params.id });

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete item error:", error);
    res.status(500).json({ error: "failed_to_delete_item" });
  }
});

// ================= SERVER START =================

async function main() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI in .env file");
  }

  await mongoose.connect(mongoUri);

  const port = Number(process.env.PORT || 5000);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});