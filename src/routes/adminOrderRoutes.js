import express from "express";
import {
  deleteAdminOrder,
  getAdminOrders,
  updateAdminOrder,
} from "../controllers/orderController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/", getAdminOrders);
router.patch("/:id", updateAdminOrder);
router.delete("/:id", deleteAdminOrder);

export default router;
