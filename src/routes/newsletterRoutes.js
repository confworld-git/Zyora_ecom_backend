import express from "express";
import { joinNewsletter } from "../controllers/newsletterController.js";

const router = express.Router();

router.post("/join", joinNewsletter);

export default router;
