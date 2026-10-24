import mongoose from "mongoose";
import Product from "../schemas/Product.js";

export const MAX_QTY = 10;

// Fields sent back to the frontend when a product is populated
export const PRODUCT_FIELDS =
  "id name title brand price image images variants slug stock";

// Accepts [{ productId, quantity, color, size }], merging identical variants.
export const cleanItems = (items) => {
  if (!Array.isArray(items)) return [];

  const merged = new Map();

  for (const item of items) {
    const id = String(item?.id ?? item?.productId ?? "").trim();
    if (!id || id.length > 128) continue;

    const parsedQuantity = parseInt(item?.quantity, 10);
    if (Number.isFinite(parsedQuantity) && parsedQuantity <= 0) continue;

    const qty = Math.max(1, parsedQuantity || 1);
    const color = String(item?.color ?? "").trim();
    const size = String(item?.size ?? "").trim();
    const key = JSON.stringify([id, color, size]);
    const existing = merged.get(key);

    merged.set(key, {
      productId: id,
      quantity: Math.min(MAX_QTY, (existing?.quantity || 0) + qty),
      color,
      size,
    });
  }

  return [...merged.values()];
};

// Accepts ["id", "id"], removes invalid ids and duplicates
export const cleanIds = (ids) => {
  if (!Array.isArray(ids)) return [];

  const valid = ids
    .map((id) => String(id?.productId ?? id?.product ?? id ?? ""))
    .filter((id) => mongoose.isValidObjectId(id));

  return [...new Set(valid)];
};

// Drops ids that don't exist in the products collection
export const existingProductIds = async (ids) => {
  if (!ids.length) return new Set();

  const found = await Product.find({ _id: { $in: ids } })
    .select("_id")
    .lean();

  return new Set(found.map((p) => String(p._id)));
};

// Picks a usable image string from a product document
export const getProductImage = (product) => {
  if (product.image && typeof product.image === "string") return product.image;

  const first = Array.isArray(product.images) ? product.images[0] : null;
  if (typeof first === "string") return first;

  return first?.url || "";
};