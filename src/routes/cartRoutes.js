import express from "express";
import {
  getCart,
  updateCart,
  mergeCart,
} from "../controllers/cartController.js";
import customerAuthMiddleware from "../middleware/customerAuthMiddleware.js";

const router = express.Router();

// every cart route needs a logged-in customer
router.use(customerAuthMiddleware);

router.get("/", getCart);
router.put("/", updateCart);
router.post("/merge", mergeCart);

export default router;