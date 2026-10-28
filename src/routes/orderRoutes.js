import express from "express";
import {
  getMyOrders,
  getMyOrder,
  getMyOrderTracking,
  createOrder,
  verifyOnlinePayment,
  cancelOnlinePayment,
  refreshOnlinePaymentStatus,
} from "../controllers/orderController.js";
import customerAuthMiddleware from "../middleware/customerAuthMiddleware.js";
import { getCustomerOrderInvoice } from "../controllers/orderDocumentController.js";

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/", getMyOrders);
router.post("/verify-payment", verifyOnlinePayment);
router.post("/:id/refresh-payment", refreshOnlinePaymentStatus);
router.post("/:id/cancel-payment", cancelOnlinePayment);
router.get("/:id/invoice.html", getCustomerOrderInvoice);
router.get("/:id/track", getMyOrderTracking);
router.get("/:id", getMyOrder);
router.post("/", createOrder);

export default router;