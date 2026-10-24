import express from "express";
import {
  getWishlist,
  mergeWishlist,
  updateWishlist,
} from "../controllers/wishlistController.js";
import customerAuthMiddleware from "../middleware/customerAuthMiddleware.js";

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/", getWishlist);
router.put("/", updateWishlist);
router.post("/merge", mergeWishlist);

export default router;
