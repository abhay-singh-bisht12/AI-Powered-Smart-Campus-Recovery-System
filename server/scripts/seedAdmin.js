import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/User.js";

async function main() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI in .env file");
  }

  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "").trim();
  const name = String(process.env.ADMIN_NAME || "Admin").trim();

  if (!email || !password) {
    throw new Error("Missing ADMIN_EMAIL or ADMIN_PASSWORD in .env file");
  }

  await mongoose.connect(mongoUri);

  const existing = await User.findOne({ email });

  if (existing) {
    existing.name = name || existing.name;
    existing.role = "admin";
    existing.password = password; // User model hook password hash karega
    await existing.save();

    console.log(`Updated existing user to admin: ${email}`);
  } else {
    await User.create({
      name,
      email,
      password,
      role: "admin",
      studentName: "",
      studentPhone: "",
      studentBranch: "",
      studentRollNo: ""
    });

    console.log(`Created admin user: ${email}`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});