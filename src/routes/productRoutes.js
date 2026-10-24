import express from "express";

import {
  addProduct,
  getProducts,
  getAdminInventory,
  updateProduct,
  updateProductStock,
  deleteProduct,
} from "../controllers/productController.js";

import uploadProductMedia from "../middleware/uploadProduct.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/admin/inventory", authMiddleware, getAdminInventory);
router.patch("/admin/inventory/:id", authMiddleware, updateProductStock);
const productMediaFields = uploadProductMedia.fields([
  { name: "images", maxCount: 4 },
  { name: "video", maxCount: 1 },
]);

router.patch("/:id", authMiddleware, productMediaFields, updateProduct);
router.delete("/:id", authMiddleware, deleteProduct);
router.post("/", authMiddleware, productMediaFields, addProduct);
router.get("/get_products", getProducts);

export default router;
