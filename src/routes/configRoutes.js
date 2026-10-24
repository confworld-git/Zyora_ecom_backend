import express from "express";
import {
  getPricingSettings,
  updatePricingSettings,
} from "../controllers/settingsController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/pricing", getPricingSettings); 
router.put("/pricing", authMiddleware, updatePricingSettings); 

export default router;
