import express from "express";
import {
  getPricingSettings,
  getShippingQuote,
  updatePricingSettings,
} from "../controllers/settingsController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/pricing", getPricingSettings);
router.post("/shipping-quote", getShippingQuote);
router.put("/pricing", authMiddleware, updatePricingSettings);

export default router;
