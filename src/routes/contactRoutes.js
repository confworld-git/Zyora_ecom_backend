import express from "express";

import {
  createContact,
  deleteContact,
  getContacts,
} from "../controllers/contactController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();
router.post("/Submit-Contact", createContact);
router.get("/Contact_data", authMiddleware, getContacts);
router.delete("/:id", authMiddleware, deleteContact);

export default router;
