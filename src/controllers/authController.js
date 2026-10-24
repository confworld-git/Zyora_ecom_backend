import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import Admin from "../schemas/Admin.js";
import Customer from "../schemas/Customer.js";
import { sendEmail } from "../utils/emailService.js";

const isProd = process.env.NODE_ENV === "production";

// ============================================================
// HELPERS
// ============================================================

// Created lazily so env vars are loaded (dotenv) before use
const getGoogleClient = () =>
  new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL,
  );

// Signs the customer JWT and sets the auth cookie (used by password + Google login)
const setCustomerCookie = (res, customer) => {
  const token = jwt.sign(
    {
      id: customer._id,
      customerId: customer.customerId,
      email: customer.email,
      role: "customer",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
      algorithm: "HS256",
      audience: "zyora-customer",
    },
  );

  res.cookie("zyora_customer_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const generateCustomerId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let randomPart = "";

  for (let i = 0; i < 6; i++) {
    randomPart += characters.charAt(
      Math.floor(Math.random() * characters.length),
    );
  }

  return `ZYR-CUS-${randomPart}`;
};

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const admin = await Admin.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (admin.role !== "admin") {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
        algorithm: "HS256",
        audience: "zyora-admin",
      },
    );

    res.cookie("zyora_token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const getCurrentAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    console.error("Current Admin Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const logoutAdmin = async (req, res) => {
  res.clearCookie("zyora_token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

export const updateAdminCredentials = async (req, res) => {
  try {
    const { currentPassword, newEmail, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is required",
      });
    }

    if (!newEmail && !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Enter a new email or new password",
      });
    }

    const admin = await Admin.findById(req.admin.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, admin.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    if (newEmail) {
      const email = newEmail.toLowerCase().trim();

      const existingAdmin = await Admin.findOne({
        email,
        _id: { $ne: admin._id },
      });

      if (existingAdmin) {
        return res.status(409).json({
          success: false,
          message: "Email already exists",
        });
      }

      admin.email = email;
    }

    if (newPassword) {
      if (newPassword.length < 12) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 12 characters",
        });
      }

      admin.password = await bcrypt.hash(newPassword, 12);
    }

    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Admin credentials updated successfully",
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Update Admin Credentials Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ============================================================
// CUSTOMER AUTHENTICATION
// ============================================================

export const registerCustomer = async (req, res) => {
  try {
    const { name, email, mobile, password, termsAccepted } = req.body;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (termsAccepted !== true) {
      return res.status(400).json({
        success: false,
        message: "Please accept the Terms & Conditions",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = mobile.trim();

    if (cleanName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must be at least 2 characters",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit mobile number",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const existingEmail = await Customer.findOne({
      email: cleanEmail,
    });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const existingMobile = await Customer.findOne({
      mobile: cleanMobile,
    });

    if (existingMobile) {
      return res.status(409).json({
        success: false,
        message: "An account with this mobile number already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const customerId = generateCustomerId();
    const customer = await Customer.create({
      customerId,
      name: cleanName,
      email: cleanEmail,
      mobile: cleanMobile,
      password: hashedPassword,
      authProvider: "local",

      termsAccepted: true,
      termsAcceptedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",

      customer: {
        id: customer._id,
        customerId: customer.customerId,
        name: customer.name,
        email: customer.email,
        mobile: customer.mobile,
      },
    });
  } catch (error) {
    console.error("Customer Registration Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const loginCustomer = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const customer = await Customer.findOne({
      email: cleanEmail,
    });

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Google-only accounts have no password
    if (!customer.password) {
      return res.status(401).json({
        success: false,
        message: "This account uses Google sign-in",
      });
    }

    const passwordMatch = await bcrypt.compare(password, customer.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    setCustomerCookie(res, customer);

    return res.status(200).json({ success: true, message: "Login successful" });
  } catch (error) {
    console.error("Customer Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const requestCustomerPasswordReset = async (req, res) => {
  try {
    const cleanEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    const customer = await Customer.findOne({ email: cleanEmail }).select(
      "+passwordResetTokenHash +passwordResetExpiresAt",
    );

    if (customer) {
      const token = crypto.randomBytes(32).toString("hex");
      const resetUrl = new URL(
        "/Login",
        (process.env.FRONTEND_URL || "http://localhost:5173").replace(
          /\/+$/,
          "",
        ),
      );
      resetUrl.searchParams.set("resetToken", token);
      const resetLink = resetUrl.toString();
      const resetLinkHtml = resetLink
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;");

      customer.passwordResetTokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      customer.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await customer.save();

      try {
        await sendEmail({
          to: cleanEmail,
          subject: "Reset your ZYORA password",
          text: `Use this link to reset your ZYORA password. It expires in 15 minutes:\n\n${resetLink}\n\nIf you did not request a password reset, you can ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717"><h1 style="color:#2926d9">Reset your ZYORA password</h1><p>We received a request to reset the password for your account.</p><p><a href="${resetLinkHtml}" style="display:inline-block;padding:12px 20px;background:#2926d9;color:#fff;text-decoration:none;border-radius:6px">Reset password</a></p><p>This link expires in 15 minutes and can only be used once.</p><p>If you did not request this, you can safely ignore this email.</p></div>`,
        });
      } catch (emailError) {
        customer.passwordResetTokenHash = undefined;
        customer.passwordResetExpiresAt = undefined;
        await customer.save();
        throw emailError;
      }
    }

    return res.status(200).json({
      success: true,
      message:
        "If an account exists for this email, a password reset link will be sent.",
    });
  } catch (error) {
    console.error("Request Customer Password Reset Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to send a password reset link right now",
    });
  }
};

export const resetCustomerPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};

    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({
        success: false,
        message: "This reset link is invalid or expired. Request a new one.",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const customer = await Customer.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: "This reset link is invalid or expired. Request a new one.",
      });
    }

    customer.password = await bcrypt.hash(password, 12);
    customer.passwordResetTokenHash = undefined;
    customer.passwordResetExpiresAt = undefined;
    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Reset Customer Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to reset your password right now",
    });
  }
};

export const getCurrentCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.id).select(
      "-password",
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (
      req.customer.customerId &&
      req.customer.customerId !== customer.customerId
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid customer session",
      });
    }

    return res.status(200).json({
      success: true,
      customer: {
        id: customer._id,
        customerId: customer.customerId,
        name: customer.name,
        email: customer.email,
        mobile: customer.mobile,
        profileImage: customer.profileImage,
      },
    });
  } catch (error) {
    console.error("Current Customer Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const logoutCustomer = async (req, res) => {
  res.clearCookie("zyora_customer_token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

// ============================================================
// GOOGLE OAUTH
// ============================================================

// Step 1: redirect the browser to Google's consent screen
export const googleLogin = (req, res) => {
  // Random state protects against CSRF on the callback
  const state = crypto.randomBytes(32).toString("hex");

  res.cookie("zyora_oauth_state", state, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax", // must be lax: Google redirects back via top-level navigation
    maxAge: 10 * 60 * 1000,
  });

  const url = getGoogleClient().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });

  res.redirect(url);
};

// Step 2: Google sends the user back here with ?code=...&state=...
export const googleCallback = async (req, res) => {
  const frontend = process.env.FRONTEND_URL;
  const fail = (reason) => res.redirect(`${frontend}/login?error=${reason}`);

  try {
    const { code, state, error } = req.query;

    if (error || !code) return fail("google_cancelled");

    if (!state || state !== req.cookies.zyora_oauth_state) {
      return fail("invalid_state");
    }

    res.clearCookie("zyora_oauth_state", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
    });

    const client = getGoogleClient();
    const { tokens } = await client.getToken(code);

    // Verifies signature, expiry, and audience
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const profile = ticket.getPayload();

    if (!profile.email_verified) return fail("email_not_verified");

    const email = profile.email.toLowerCase();

    let customer = await Customer.findOne({
      $or: [{ googleId: profile.sub }, { email }],
    });

    if (!customer) {
      customer = await Customer.create({
        customerId: generateCustomerId(),
        name: profile.name || email.split("@")[0],
        email,
        googleId: profile.sub,
        authProvider: "google",
        profileImage: profile.picture,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      });
    } else if (!customer.googleId) {
      // Existing email/password account: link it (safe because Google verified the email)
      customer.googleId = profile.sub;
      if (!customer.profileImage) customer.profileImage = profile.picture;
      await customer.save();
    }

    setCustomerCookie(res, customer);
    res.redirect(`${frontend}/`);
  } catch (err) {
    console.error("Google Callback Error:", err);
    fail("google_failed");
  }
};
