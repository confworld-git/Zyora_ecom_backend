import express from "express";

import {
  // ADMIN
  loginAdmin,
  getCurrentAdmin,
  logoutAdmin,
  updateAdminCredentials,

  // CUSTOMER
  registerCustomer,
  loginCustomer,
  requestCustomerPasswordReset,
  resetCustomerPassword,
  getCurrentCustomer,
  logoutCustomer,

  //Google OAuth
  googleLogin,
  googleCallback,
} from "../controllers/authController.js";

import authMiddleware from "../middleware/authMiddleware.js";
import customerAuthMiddleware from "../middleware/customerAuthMiddleware.js";
import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";

const router = express.Router();

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

router.post("/login", requireTrustedOrigin, loginAdmin);

router.get("/me", authMiddleware, getCurrentAdmin);

router.post("/logout", authMiddleware, logoutAdmin);

router.put("/credentials", authMiddleware, updateAdminCredentials);

// ============================================================
// CUSTOMER AUTHENTICATION
// ============================================================

// Customer registration
router.post("/register", requireTrustedOrigin, registerCustomer);

// Customer login
router.post("/customer-login", requireTrustedOrigin, loginCustomer);

// Customer password recovery
router.post(
  "/customer-forgot-password",
  requireTrustedOrigin,
  requestCustomerPasswordReset,
);
router.post(
  "/customer-reset-password",
  requireTrustedOrigin,
  resetCustomerPassword,
);

// Get logged-in customer
router.get("/customer-me", customerAuthMiddleware, getCurrentCustomer);

// Customer logout
router.post("/customer-logout", customerAuthMiddleware, logoutCustomer);

//Google OAuth routes
router.get("/google", googleLogin);
router.get("/google/callback", googleCallback);

export default router;
