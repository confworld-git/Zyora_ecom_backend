import mongoose from "mongoose";
import Cart from "../schemas/Cart.js";
import Product from "../schemas/Product.js";
import { PRODUCT_FIELDS, cleanItems } from "../utils/itemHelpers.js";

// Reads the saved cart and returns it in the shape the frontend uses.
const loadCart = async (customerObjectId, customerId) => {
  const cart = await Cart.findOne({ customer: customerObjectId })
    .populate("items.product", PRODUCT_FIELDS)
    .lean();

  const cartItems = cart?.items || [];
  const legacyIds = cartItems
    .filter((item) => !item.product && item.productId)
    .map((item) => String(item.productId));
  const legacyObjectIds = legacyIds.filter(mongoose.isValidObjectId);
  const legacyProducts = legacyIds.length
    ? await Product.find({
        $or: [
          { _id: { $in: legacyObjectIds } },
          { id: { $in: legacyIds } },
        ],
      })
        .select(PRODUCT_FIELDS)
        .lean()
    : [];
  const legacyProductsById = new Map();

  legacyProducts.forEach((product) => {
    legacyProductsById.set(String(product._id), product);
    legacyProductsById.set(String(product.id), product);
  });

  const items = cartItems
    .map((item) => {
      const product =
        item.product || legacyProductsById.get(String(item.productId));
      if (!product) return null;

      return {
        productId: String(product.id),
        quantity: item.quantity,
        color: item.color,
        size: item.size,
        product,
      };
    })
    .filter(Boolean);

  const needsMigration =
    cart &&
    (cart.customerId !== customerId ||
      cartItems.some(
        (item) => !item.product || typeof item.productId !== "string",
      ));

  if (needsMigration) {
    await saveCart(customerObjectId, customerId, items);
  }

  return items;
};

const saveCart = async (customerObjectId, customerId, items) => {
  const products = await Product.find({
    id: { $in: items.map((item) => item.productId) },
  })
    .select("_id id")
    .lean();
  const productsById = new Map(
    products.map((product) => [String(product.id), product]),
  );
  const validItems = items.filter((item) =>
    productsById.has(item.productId),
  );

  await Cart.findOneAndUpdate(
    { customer: customerObjectId },
    {
      customerId,
      items: validItems.map((item) => ({
        product: productsById.get(item.productId)._id,
        productId: item.productId,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
      })),
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    },
  );
};

// GET /api/cart
export const getCart = async (req, res) => {
  try {
    const items = await loadCart(req.customer.id, req.customer.customerId);

    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("Get Cart Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// PUT /api/cart   body: { items: [{ productId, quantity, color, size }] }
export const updateCart = async (req, res) => {
  try {
    await saveCart(
      req.customer.id,
      req.customer.customerId,
      cleanItems(req.body?.items),
    );

    const items = await loadCart(req.customer.id, req.customer.customerId);

    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("Update Cart Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// POST /api/cart/merge   body: { items: [{ productId, quantity, color, size }] }
export const mergeCart = async (req, res) => {
  try {
    const savedItems = (
      await loadCart(req.customer.id, req.customer.customerId)
    ).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      color: item.color,
      size: item.size,
    }));

    // cleanItems adds quantities for matching variants and caps each at the limit.
    const merged = cleanItems([
      ...savedItems,
      ...(Array.isArray(req.body?.items) ? req.body.items : []),
    ]);

    await saveCart(req.customer.id, req.customer.customerId, merged);

    const items = await loadCart(req.customer.id, req.customer.customerId);

    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("Merge Cart Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};
