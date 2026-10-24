import express from "express";
import { handleRazorpayWebhook } from "../controllers/orderController.js";

const router = express.Router();

router.post("/razorpay/webhook", handleRazorpayWebhook);

export default router;
