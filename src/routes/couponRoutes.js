import express from "express";

import {
  createCoupon,
  getCoupons,
  getAdminCoupons,
  getCouponByCode,
  applyCoupon,
  updateCoupon,
  updateCouponStatus,
  deleteCoupon,
} from "../controllers/couponController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authMiddleware, createCoupon);
router.get("/", getCoupons);
router.get("/admin", authMiddleware, getAdminCoupons);
router.post("/apply", applyCoupon);
router.put("/:id", authMiddleware, updateCoupon);
router.patch("/:id/status", authMiddleware, updateCouponStatus);
router.delete("/:id", authMiddleware, deleteCoupon);

router.get("/:code", getCouponByCode);

export default router;
