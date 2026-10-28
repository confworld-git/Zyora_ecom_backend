import express from "express";
import {
  deleteAdminOrder,
  getAdminOrders,
  markShiprocketShipmentDeleted,
  updateAdminOrder,
} from "../controllers/orderController.js";
import {
  getAdminOrderInvoice,
  getAdminShippingLabel,
} from "../controllers/orderDocumentController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/", getAdminOrders);
router.get("/:id/invoice.html", getAdminOrderInvoice);
router.get("/:id/shipping-label.html", getAdminShippingLabel);
router.post("/:id/shiprocket-deleted", markShiprocketShipmentDeleted);
router.patch("/:id", updateAdminOrder);
router.delete("/:id", deleteAdminOrder);

export default router;
