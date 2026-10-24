import Product from "../schemas/Product.js";

export const normalizeColor = (color) =>
  String(color ?? "")
    .trim()
    .toLowerCase();

export const hasColorStock = (product) =>
  Array.isArray(product?.variants?.colorStock) &&
  product.variants.colorStock.length > 0;

const stockAvailableExpression = {
  $anyElementTrue: [
    {
      $map: {
        input: "$variants.colorStock",
        as: "variant",
        in: {
          $and: [
            { $ne: ["$$variant.enabled", false] },
            { $gt: ["$$variant.quantity", 0] },
          ],
        },
      },
    },
  ],
};

const stockQuantityExpression = {
  $sum: {
    $map: {
      input: "$variants.colorStock",
      as: "variant",
      in: "$$variant.quantity",
    },
  },
};

export const getColorStock = (product, color) => {
  const inventory = product?.variants?.colorStock;
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return {
      quantity: Number(product?.stock?.quantity) || 0,
      in_stock: product?.stock?.in_stock === true,
      legacy: true,
    };
  }

  const entry = inventory.find(
    (item) => normalizeColor(item.color) === normalizeColor(color),
  );
  return {
    quantity: Number(entry?.quantity) || 0,
    in_stock: entry?.enabled !== false && Number(entry?.quantity) > 0,
    legacy: false,
  };
};

export const getStockSummary = (product) => {
  const inventory = product?.variants?.colorStock;
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return {
      quantity: Number(product?.stock?.quantity) || 0,
      in_stock:
        product?.stock?.in_stock === true &&
        Number(product?.stock?.quantity) > 0,
    };
  }

  return {
    quantity: inventory.reduce(
      (total, item) => total + (Number(item.quantity) || 0),
      0,
    ),
    in_stock: inventory.some(
      (item) => item.enabled !== false && Number(item.quantity) > 0,
    ),
  };
};

export const withStockSummary = (product) => {
  const value =
    typeof product?.toObject === "function"
      ? product.toObject({ flattenMaps: true })
      : { ...product };
  value.stock = getStockSummary(value);
  return value;
};

export const decrementProductStock = async (
  product,
  color,
  quantity,
  {
    useColorStock = hasColorStock(product),
    requireAvailable = true,
    inStockAfter,
  } = {},
) => {
  const inventory = useColorStock ? product?.variants?.colorStock : [];
  if (Array.isArray(inventory) && inventory.length > 0) {
    const exactColor = inventory.find(
      (item) => normalizeColor(item.color) === normalizeColor(color),
    )?.color;
    if (!exactColor) return false;

    const result = await Product.updateOne(
      {
        id: product.id,
        "variants.colorStock": {
          $elemMatch: {
            color: exactColor,
            ...(requireAvailable && { enabled: { $ne: false } }),
            quantity: { $gte: quantity },
          },
        },
      },
      [
        {
          $set: {
            "variants.colorStock": {
              $map: {
                input: "$variants.colorStock",
                as: "variant",
                in: {
                  $cond: [
                    {
                      $eq: ["$$variant.color", { $literal: exactColor }],
                    },
                    {
                      $mergeObjects: [
                        "$$variant",
                        {
                          quantity: {
                            $subtract: ["$$variant.quantity", quantity],
                          },
                        },
                      ],
                    },
                    "$$variant",
                  ],
                },
              },
            },
          },
        },
        {
          $set: {
            "stock.quantity": stockQuantityExpression,
            "stock.in_stock": stockAvailableExpression,
          },
        },
      ],
      { updatePipeline: true },
    );
    return result.modifiedCount === 1;
  }

  const inStockAfterExpression =
    inStockAfter === undefined
      ? { $gt: [{ $subtract: ["$stock.quantity", quantity] }, 0] }
      : { $literal: inStockAfter };
  const result = await Product.updateOne(
    {
      id: product.id,
      ...(requireAvailable && { "stock.in_stock": true }),
      "stock.quantity": { $gte: quantity },
    },
    [
      {
        $set: {
          "stock.quantity": { $subtract: ["$stock.quantity", quantity] },
          "stock.in_stock": inStockAfterExpression,
        },
      },
    ],
    { updatePipeline: true },
  );
  return result.modifiedCount === 1;
};

export const restoreProductStock = async (
  productId,
  color,
  quantity,
  { useColorStock = true } = {},
) => {
  const product = await Product.findOne({ id: productId })
    .select("id stock variants.colorStock")
    .lean();
  if (!product) return;

  const inventory = useColorStock ? product.variants?.colorStock : [];
  if (Array.isArray(inventory) && inventory.length > 0) {
    const exactColor = inventory.find(
      (item) => normalizeColor(item.color) === normalizeColor(color),
    )?.color;
    if (!exactColor) {
      throw new Error(
        `Stock variant "${color}" not found for product ${productId}`,
      );
    }
    const result = await Product.updateOne(
      {
        id: productId,
        "variants.colorStock.color": exactColor,
      },
      [
        {
          $set: {
            "variants.colorStock": {
              $map: {
                input: "$variants.colorStock",
                as: "variant",
                in: {
                  $cond: [
                    {
                      $eq: ["$$variant.color", { $literal: exactColor }],
                    },
                    {
                      $mergeObjects: [
                        "$$variant",
                        {
                          quantity: {
                            $add: ["$$variant.quantity", quantity],
                          },
                        },
                      ],
                    },
                    "$$variant",
                  ],
                },
              },
            },
          },
        },
        {
          $set: {
            "stock.quantity": stockQuantityExpression,
            "stock.in_stock": stockAvailableExpression,
          },
        },
      ],
      { updatePipeline: true },
    );
    if (result.modifiedCount !== 1) {
      throw new Error(`Unable to restore stock for ${productId} (${color})`);
    }
    return;
  }

  await Product.updateOne(
    { id: productId },
    {
      $inc: { "stock.quantity": quantity },
      $set: { "stock.in_stock": true },
    },
  );
};
