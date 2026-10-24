import Wishlist from "../schemas/Wishlist.js";
import Product from "../schemas/Product.js";

const PRODUCT_FIELDS =
  "id name title brand price image images variants slug stock";

const cleanItems = (items) => {
  if (!Array.isArray(items)) return [];

  const unique = new Map();

  for (const item of items) {
    const productId = String(item?.productId ?? item?.id ?? "").trim();
    if (!productId || productId.length > 128 || unique.has(productId)) {
      continue;
    }

    unique.set(productId, {
      productId,
      selectedImage:
        typeof item?.selectedImage === "string"
          ? item.selectedImage.slice(0, 2048)
          : "",
    });
  }

  return [...unique.values()];
};

const saveWishlist = async (customerObjectId, customerId, items) => {
  const products = await Product.find({
    id: { $in: items.map((item) => item.productId) },
  })
    .select(`_id id images ${PRODUCT_FIELDS}`)
    .lean();
  const productsById = new Map(
    products.map((product) => [String(product.id), product]),
  );
  const validItems = items.filter((item) =>
    productsById.has(item.productId),
  );

  await Wishlist.findOneAndUpdate(
    { customer: customerObjectId },
    {
      customerId,
      items: validItems.map((item) => {
        const product = productsById.get(item.productId);
        const imageExists = product.images?.some(
          (image) => image.url === item.selectedImage,
        );

        return {
          product: product._id,
          productId: item.productId,
          selectedImage: imageExists ? item.selectedImage : "",
        };
      }),
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    },
  );
};

const loadWishlist = async (customerObjectId, customerId) => {
  const wishlist = await Wishlist.findOne({ customer: customerObjectId })
    .populate("items.product", PRODUCT_FIELDS)
    .lean();

  const items = (wishlist?.items || [])
    .filter((item) => item.product)
    .map((item) => ({
      productId: String(item.product.id),
      selectedImage: item.selectedImage || "",
      product: item.product,
    }));

  if (wishlist && wishlist.customerId !== customerId) {
    await saveWishlist(customerObjectId, customerId, items);
  }

  return items;
};

// GET /api/wishlist
export const getWishlist = async (req, res) => {
  try {
    const items = await loadWishlist(req.customer.id, req.customer.customerId);
    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("Get wishlist error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// PUT /api/wishlist replaces the customer's wishlist.
export const updateWishlist = async (req, res) => {
  try {
    await saveWishlist(
      req.customer.id,
      req.customer.customerId,
      cleanItems(req.body?.items),
    );

    const items = await loadWishlist(req.customer.id, req.customer.customerId);
    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("Update wishlist error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// POST /api/wishlist/merge merges guest items without duplicating products.
export const mergeWishlist = async (req, res) => {
  try {
    const savedItems = await loadWishlist(
      req.customer.id,
      req.customer.customerId,
    );
    const merged = cleanItems([
      ...savedItems.map((item) => ({
        productId: item.productId,
        selectedImage: item.selectedImage,
      })),
      ...(Array.isArray(req.body?.items) ? req.body.items : []),
    ]);

    await saveWishlist(
      req.customer.id,
      req.customer.customerId,
      merged,
    );

    const items = await loadWishlist(req.customer.id, req.customer.customerId);
    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error("Merge wishlist error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
