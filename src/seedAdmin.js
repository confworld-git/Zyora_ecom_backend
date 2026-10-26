import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import connectDB from "./config/db.js";
import Admin from "./schemas/Admin.js";

dotenv.config();

const seedAdmin = async () => {
  try {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD before seeding");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("ADMIN_EMAIL must be a valid email address");
    }
    // if (password.length < 12) {
    //   throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    // }

    await connectDB();
    const existingAdmin = await Admin.findOne({ email });

    if (existingAdmin) {
      console.log("Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await Admin.create({
      email,
      password: hashedPassword,
      role: "admin",
    });

    console.log(`Admin created successfully for ${email}`);
  } finally {
    await mongoose.disconnect();
  }
};

seedAdmin().catch((error) => {
  console.error("Admin seed error:", error.message);
  process.exitCode = 1;
});
