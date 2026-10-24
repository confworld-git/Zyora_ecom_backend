import express from "express";
import {
  getProfile,
  updateProfile,
} from "../controllers/profileController.js";
import customerAuthMiddleware from "../middleware/customerAuthMiddleware.js";

const router = express.Router();

router.use(customerAuthMiddleware);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);

export default router;
