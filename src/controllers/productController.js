import Product from "../schemas/Product.js";
import cloudinary from "../config/cloudinary.js";
import { upsertProductToSheet } from "../utils/Googlesheets.js";
import {
  hasColorStock,
  normalizeColor,
  withStockSummary,
} from "../utils/productStock.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

const stockError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const makeColorStock = (
  colours,
  submitted,
  existing = [],
  fallbackQuantity = 0,
  fallbackEnabled = true,
) => {
  const names = colours.map((color) => color.trim()).filter(Boolean);
  const normalizedNames = names.map(normalizeColor);
  if (new Set(normalizedNames).size !== names.length) {
    throw stockError("Colour variants must be unique");
  }
  const retainedNames = new Set(normalizedNames);
  if (
    (Array.isArray(existing) ? existing : []).some(
      (item) =>
        !retainedNames.has(normalizeColor(item.color)) &&
        Number(item.quantity) > 0,
    )
  ) {
    throw stockError(
      "Set removed colour stock to zero before removing that colour",
    );
  }
  if (!names.length) return [];

  let entries = submitted;
  if (entries === undefined) {
    const hasExistingStock = Array.isArray(existing) && existing.length > 0;
    const previous = new Map(
      (Array.isArray(existing) ? existing : []).map((item) => [
        normalizeColor(item.color),
        item,
      ]),
    );
    entries = names.map((color, index) => {
      const item = previous.get(normalizeColor(color));
      return (
        item || {
          color,
          quantity: !hasExistingStock && index === 0 ? fallbackQuantity : 0,
          enabled: fallbackEnabled,
        }
      );
    });
  }
  if (!Array.isArray(entries)) {
    throw stockError("Color stock must be a list");
  }

  const byColor = new Map();
  for (const item of entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw stockError("Each colour needs a stock entry");
    }
    const key = normalizeColor(item?.color);
    if (!key || byColor.has(key)) {
      throw stockError("Each colour must have one stock quantity");
    }
    const quantity = Number(item.quantity);
    if (
      item.quantity === "" ||
      item.quantity === null ||
      item.quantity === undefined ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      throw stockError("Colour stock must be a non-negative whole number");
    }
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") {
      throw stockError("Colour availability must be true or false");
    }
    byColor.set(key, {
      quantity,
      enabled: item.enabled !== false,
    });
  }

  if (
    byColor.size !== names.length ||
    names.some((color) => !byColor.has(normalizeColor(color)))
  ) {
    throw stockError("Add a stock quantity for every colour variant");
  }

  return names.map((color) => ({
    color,
    ...byColor.get(normalizeColor(color)),
  }));
};

const summarizeColorStock = (colorStock) => ({
  quantity: colorStock.reduce((total, item) => total + item.quantity, 0),
  in_stock: colorStock.some((item) => item.enabled && item.quantity > 0),
});

const parseProductRating = (value) => {
  if (value === undefined) return { average: 0, count: 0 };

  let rating = value;
  if (typeof rating === "string") {
    try {
      rating = JSON.parse(rating);
    } catch {
      const error = new Error("Invalid rating data");
      error.statusCode = 400;
      throw error;
    }
  }

  if (!rating || typeof rating !== "object" || Array.isArray(rating)) {
    const error = new Error("Rating must be an object");
    error.statusCode = 400;
    throw error;
  }

  const average = rating.average;
  const count = rating.count;
  if (
    typeof average !== "number" ||
    !Number.isFinite(average) ||
    average < 0 ||
    average > 5 ||
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 0 ||
    (count === 0) !== (average === 0)
  ) {
    const error = new Error(
      "Rating must have an average from 0 to 5 and a non-negative whole-number count; use 0 for both when there are no reviews",
    );
    error.statusCode = 400;
    throw error;
  }

  return { average, count };
};

const uploadToCloudinary = (fileBuffer, resourceType = "image") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "zyora/products",
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );

    uploadStream.end(fileBuffer);
  });
};

export const addProduct = async (req, res) => {
  try {
    const {
      id,
      name,
      category,
      subcategory,
      title,
      brand,
      price,
      about_this_item,
      product_information,
      variants,
      stock,
      rating: rawRating,
      is_best_seller,
      image_metadata,
    } = req.body;
    const imageFiles = req.files?.images || [];
    const videoFile = req.files?.video?.[0];

    if (!id || !name || !category || !title || !brand) {
      return res.status(400).json({
        success: false,
        message: "Product ID, name, category, title and brand are required",
      });
    }
    if (subcategory !== undefined && typeof subcategory !== "string") {
      return res.status(400).json({
        success: false,
        message: "Subcategory must be text",
      });
    }

    if (imageFiles.length === 0 || imageFiles.length > 4) {
      return res.status(400).json({
        success: false,
        message: "Upload between one and four product images",
      });
    }

    if (imageFiles.some((file) => file.size > MAX_IMAGE_SIZE)) {
      return res.status(400).json({
        success: false,
        message: "Each product image must be 10 MB or smaller",
      });
    }

    if (videoFile && videoFile.size > MAX_VIDEO_SIZE) {
      return res.status(400).json({
        success: false,
        message: "The product video must be 100 MB or smaller",
      });
    }

    if (!price) {
      return res.status(400).json({
        success: false,
        message: "Price information is required",
      });
    }

    const parsedPrice = typeof price === "string" ? JSON.parse(price) : price;

    const parsedAbout =
      typeof about_this_item === "string"
        ? JSON.parse(about_this_item)
        : about_this_item || [];

    const parsedProductInformation =
      typeof product_information === "string"
        ? JSON.parse(product_information)
        : product_information || {};

    const parsedVariants =
      typeof variants === "string" ? JSON.parse(variants) : variants || {};

    const parsedStock =
      typeof stock === "string" ? JSON.parse(stock) : stock || {};
    const rating = parseProductRating(rawRating);
    const stockQuantity = Number(parsedStock.quantity ?? 0);

    if (
      !parsedVariants ||
      typeof parsedVariants !== "object" ||
      Array.isArray(parsedVariants)
    ) {
      return res.status(400).json({
        success: false,
        message: "Variants must be an object",
      });
    }
    for (const key of ["colours", "sizes"]) {
      const values = parsedVariants[key] ?? [];
      if (
        !Array.isArray(values) ||
        values.some((value) => typeof value !== "string")
      ) {
        return res.status(400).json({
          success: false,
          message: `Product ${key} must be a list of text values`,
        });
      }
    }
    const colours = (parsedVariants.colours || [])
      .map((color) => color.trim())
      .filter(Boolean);
    if (colours.length > imageFiles.length) {
      return res.status(400).json({
        success: false,
        message: "Upload one image for every colour variant",
      });
    }

    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Stock quantity must be a non-negative whole number",
      });
    }
    if (
      parsedStock.in_stock !== undefined &&
      typeof parsedStock.in_stock !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "Select whether this product is available for sale",
      });
    }
    const colorStock = makeColorStock(
      colours,
      parsedVariants.colorStock,
      [],
      stockQuantity,
      parsedStock.in_stock !== false,
    );
    const stockSummary = colorStock.length
      ? summarizeColorStock(colorStock)
      : {
          quantity: stockQuantity,
          in_stock: parsedStock.in_stock !== false && stockQuantity > 0,
        };

    // Parse image metadata sent from frontend
    const parsedImageMetadata =
      typeof image_metadata === "string"
        ? JSON.parse(image_metadata)
        : image_metadata || [];

    if (!parsedPrice.mrp || !parsedPrice.selling_price) {
      return res.status(400).json({
        success: false,
        message: "MRP and selling price are required",
      });
    }

    if (Number(parsedPrice.selling_price) >= Number(parsedPrice.mrp)) {
      return res.status(400).json({
        success: false,
        message: "Selling price must be less than MRP",
      });
    }

    const existingProduct = await Product.findOne({ id });

    if (existingProduct) {
      return res.status(409).json({
        success: false,
        message: "Product ID already exists",
      });
    }

    // =========================
    // UPLOAD IMAGES
    // =========================

    const images = [];

    if (imageFiles.length > 0) {
      for (let index = 0; index < imageFiles.length; index++) {
        const file = imageFiles[index];

        const result = await uploadToCloudinary(file.buffer);
        const metadata = parsedImageMetadata[index] || {};
        images.push({
          id: metadata.id || `img-${index + 1}`,
          url: result.secure_url,
          color: metadata.color || null,
          alt: metadata.alt || `${name.trim()} image ${index + 1}`,
        });
      }
    }
    const videoUrl = videoFile
      ? (await uploadToCloudinary(videoFile.buffer, "video")).secure_url
      : "";

    // =========================
    // CREATE PRODUCT
    // =========================

    const product = await Product.create({
      id: id.trim(),
      name: name.trim(),
      category: category.trim(),
      subcategory: subcategory?.trim() || "",
      title: title.trim(),
      brand: brand.trim(),

      price: {
        currency: parsedPrice.currency || "INR",
        mrp: Number(parsedPrice.mrp),
        selling_price: Number(parsedPrice.selling_price),
        discount_percent: Number(parsedPrice.discount_percent || 0),
      },

      images,
      video: videoUrl,

      about_this_item: parsedAbout,

      product_information: {
        features_specs: parsedProductInformation.features_specs || {},

        style: parsedProductInformation.style || {},

        measurements: parsedProductInformation.measurements || {},

        materials_care: parsedProductInformation.materials_care || {},

        item_details: parsedProductInformation.item_details || {},
      },

      variants: {
        colours,
        sizes: parsedVariants.sizes.map((size) => size.trim()).filter(Boolean),
        colorStock,
      },

      stock: stockSummary,

      rating,
      is_best_seller: String(is_best_seller).toLowerCase() === "true",
    });

    upsertProductToSheet(product).catch((err) =>
      console.error("Google Sheets backup failed:", err.message),
    );

    return res.status(201).json({
      success: true,
      message: "Product added successfully",
      product,
    });
  } catch (error) {
    console.error("Add product error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to add product",
      error: error.message,
    });
  }
};

export const getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    res.status(200).json(products.map(withStockSummary));
  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      message: "Failed to fetch products",
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ id: req.params.id });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const parseField = (value, fieldName) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        const error = new Error(`Invalid ${fieldName} data`);
        error.statusCode = 400;
        throw error;
      }
    };
    const {
      id,
      name,
      category,
      subcategory,
      title,
      brand,
      price: rawPrice,
      stock: rawStock,
      rating: rawRating,
      is_best_seller: rawBestSeller,
      about_this_item: rawAboutThisItem,
      product_information: rawProductInformation,
      variants: rawVariants,
      existing_images: rawExistingImages,
      image_metadata: rawImageMetadata,
      remove_video: rawRemoveVideo,
    } = req.body;
    const updates = {};
    const imageFiles = req.files?.images || [];
    const videoFile = req.files?.video?.[0];

    if (imageFiles.some((file) => file.size > MAX_IMAGE_SIZE)) {
      return res.status(400).json({
        success: false,
        message: "Each product image must be 10 MB or smaller",
      });
    }
    if (videoFile && videoFile.size > MAX_VIDEO_SIZE) {
      return res.status(400).json({
        success: false,
        message: "The product video must be 100 MB or smaller",
      });
    }

    if (id !== undefined) {
      if (typeof id !== "string" || !id.trim()) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
      }
      const normalizedId = id.trim();
      const duplicate = await Product.findOne({
        id: normalizedId,
        _id: { $ne: product._id },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Product ID already exists",
        });
      }
      updates.id = normalizedId;
    }

    for (const [field, value] of Object.entries({
      name,
      category,
      title,
      brand,
    })) {
      if (value !== undefined) {
        if (typeof value !== "string" || !value.trim()) {
          return res.status(400).json({
            success: false,
            message: `${field} is required`,
          });
        }
        updates[field] = value.trim();
      }
    }

    if (subcategory !== undefined) {
      if (typeof subcategory !== "string") {
        return res.status(400).json({
          success: false,
          message: "Subcategory must be text",
        });
      }
      updates.subcategory = subcategory.trim();
    }

    const price =
      rawPrice === undefined ? undefined : parseField(rawPrice, "price");
    if (price !== undefined) {
      if (!price || typeof price !== "object") {
        return res.status(400).json({
          success: false,
          message: "Price information is required",
        });
      }
      const mrp = Number(price.mrp);
      const sellingPrice = Number(price.selling_price);
      if (
        !Number.isFinite(mrp) ||
        !Number.isFinite(sellingPrice) ||
        mrp <= 0 ||
        sellingPrice <= 0 ||
        sellingPrice >= mrp
      ) {
        return res.status(400).json({
          success: false,
          message: "Selling price must be positive and less than MRP",
        });
      }

      updates.price = {
        currency: product.price.currency || "INR",
        mrp,
        selling_price: sellingPrice,
        discount_percent: Math.round(((mrp - sellingPrice) / mrp) * 100),
      };
    }

    const stock =
      rawStock === undefined ? undefined : parseField(rawStock, "stock");
    if (stock !== undefined) {
      if (!stock || typeof stock !== "object") {
        return res.status(400).json({
          success: false,
          message: "Stock information is required",
        });
      }
      const quantity = Number(stock.quantity);
      if (!Number.isInteger(quantity) || quantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Stock quantity must be a non-negative whole number",
        });
      }
      if (typeof stock.in_stock !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Select whether this product is available for sale",
        });
      }

      if (hasColorStock(product) && rawVariants === undefined) {
        return res.status(400).json({
          success: false,
          message: "Update each colour quantity instead of the aggregate stock",
        });
      }

      updates.stock = {
        quantity,
        in_stock: stock.in_stock && quantity > 0,
      };
    }

    if (rawRating !== undefined) {
      updates.rating = parseProductRating(rawRating);
    }

    if (rawBestSeller !== undefined) {
      const isBestSeller =
        typeof rawBestSeller === "boolean"
          ? rawBestSeller
          : rawBestSeller === "true"
            ? true
            : rawBestSeller === "false"
              ? false
              : null;
      if (isBestSeller === null) {
        return res.status(400).json({
          success: false,
          message: "Best seller status must be true or false",
        });
      }
      updates.is_best_seller = isBestSeller;
    }

    if (rawAboutThisItem !== undefined) {
      const aboutThisItem = parseField(rawAboutThisItem, "about this item");
      if (
        !Array.isArray(aboutThisItem) ||
        aboutThisItem.some((item) => typeof item !== "string")
      ) {
        return res.status(400).json({
          success: false,
          message: "About this item must be a list of text values",
        });
      }
      updates.about_this_item = aboutThisItem
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (rawProductInformation !== undefined) {
      const productInformation = parseField(
        rawProductInformation,
        "product information",
      );
      if (
        !productInformation ||
        typeof productInformation !== "object" ||
        Array.isArray(productInformation)
      ) {
        return res.status(400).json({
          success: false,
          message: "Product information must be an object",
        });
      }

      const sections = [
        "features_specs",
        "style",
        "measurements",
        "materials_care",
        "item_details",
      ];
      updates.product_information = {};
      for (const section of sections) {
        const values = productInformation[section] ?? {};
        if (!values || typeof values !== "object" || Array.isArray(values)) {
          return res.status(400).json({
            success: false,
            message: `Invalid ${section} information`,
          });
        }
        const entries = Object.entries(values);
        if (
          entries.some(
            ([key, value]) =>
              typeof key !== "string" || typeof value !== "string",
          )
        ) {
          return res.status(400).json({
            success: false,
            message: `Invalid ${section} information`,
          });
        }
        updates.product_information[section] = Object.fromEntries(
          entries
            .map(([key, value]) => [key.trim(), value.trim()])
            .filter(([key]) => key),
        );
      }
    }

    if (rawVariants !== undefined) {
      const variants = parseField(rawVariants, "variants");
      if (
        !variants ||
        typeof variants !== "object" ||
        Array.isArray(variants)
      ) {
        return res.status(400).json({
          success: false,
          message: "Variants must be an object",
        });
      }
      for (const variantName of ["colours", "sizes"]) {
        const values = variants[variantName] ?? [];
        if (
          !Array.isArray(values) ||
          values.some((value) => typeof value !== "string")
        ) {
          return res.status(400).json({
            success: false,
            message: `Product ${variantName} must be a list of text values`,
          });
        }
      }
      const colours = variants.colours
        .map((value) => value.trim())
        .filter(Boolean);
      const colorStock = makeColorStock(
        colours,
        variants.colorStock,
        product.variants?.colorStock,
        Number(stock?.quantity ?? product.stock?.quantity) || 0,
        stock?.in_stock ?? product.stock?.in_stock ?? true,
      );
      updates.variants = {
        colours,
        sizes: variants.sizes.map((value) => value.trim()).filter(Boolean),
        colorStock,
      };
      if (colorStock.length) {
        updates.stock = summarizeColorStock(colorStock);
      }
    }

    if (rawExistingImages !== undefined || imageFiles.length) {
      const existingImages = parseField(
        rawExistingImages ?? "[]",
        "existing images",
      );
      const imageMetadata = parseField(
        rawImageMetadata ?? "[]",
        "image metadata",
      );
      if (
        !Array.isArray(existingImages) ||
        existingImages.some(
          (image) =>
            !image ||
            typeof image !== "object" ||
            typeof image.url !== "string",
        ) ||
        !Array.isArray(imageMetadata) ||
        imageMetadata.length !== imageFiles.length
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product image data",
        });
      }

      const originalImages = product.images.map((image) =>
        typeof image.toObject === "function" ? image.toObject() : image,
      );
      const retainedUrls = new Set();
      const retainedImages = [];
      for (const image of existingImages) {
        const original = originalImages.find(
          (candidate) => candidate.url === image.url,
        );
        if (!original || retainedUrls.has(original.url)) {
          return res.status(400).json({
            success: false,
            message: "An existing product image is invalid",
          });
        }
        retainedUrls.add(original.url);
        retainedImages.push({
          id: original.id,
          url: original.url,
          color:
            typeof image.color === "string" ? image.color.trim() || null : null,
          alt:
            typeof image.alt === "string" && image.alt.trim()
              ? image.alt.trim()
              : original.alt,
        });
      }

      if (retainedImages.length + imageFiles.length > 4) {
        return res.status(400).json({
          success: false,
          message: "A product can have up to four images",
        });
      }
      if (retainedImages.length + imageFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: "A product must have at least one image",
        });
      }

      const uploadedImages = [];
      for (let index = 0; index < imageFiles.length; index++) {
        const file = imageFiles[index];
        const metadata = imageMetadata[index] || {};
        const result = await uploadToCloudinary(file.buffer);
        uploadedImages.push({
          id:
            typeof metadata.id === "string" && metadata.id.trim()
              ? metadata.id.trim()
              : `img-${retainedImages.length + index + 1}`,
          url: result.secure_url,
          color:
            typeof metadata.color === "string"
              ? metadata.color.trim() || null
              : null,
          alt:
            typeof metadata.alt === "string" && metadata.alt.trim()
              ? metadata.alt.trim()
              : `${(name || product.name).trim()} image ${
                  retainedImages.length + index + 1
                }`,
        });
      }
      updates.images = [...retainedImages, ...uploadedImages];
    }

    const updatedColors =
      updates.variants?.colours || product.variants?.colours || [];
    const updatedImages = updates.images || product.images;
    if (updatedColors.length > updatedImages.length) {
      return res.status(400).json({
        success: false,
        message: "Keep one image for every colour variant",
      });
    }

    if (
      rawRemoveVideo !== undefined &&
      !["true", "false"].includes(rawRemoveVideo)
    ) {
      return res.status(400).json({
        success: false,
        message: "Video removal must be true or false",
      });
    }
    if (videoFile) {
      const video = await uploadToCloudinary(videoFile.buffer, "video");
      updates.video = video.secure_url;
    } else if (rawRemoveVideo === "true") {
      updates.video = "";
    }

    Object.assign(product, updates);
    await product.save();

    upsertProductToSheet(product).catch((err) =>
      console.error("Google Sheets backup failed:", err.message),
    );

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Update product error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to update product",
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ id: req.params.id });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    Product.findOne({ id: req.params.id })
      .then((full) => full && upsertProductToSheet(full))
      .catch((err) =>
        console.error("Google Sheets backup failed:", err.message),
      );

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};

export const getAdminInventory = async (_req, res) => {
  try {
    const products = await Product.find()
      .select("id name category brand images variants stock updatedAt")
      .sort({ name: 1 })
      .lean();
    return res.status(200).json({
      success: true,
      products: products.map(withStockSummary),
    });
  } catch (error) {
    console.error("Get inventory error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch inventory",
    });
  }
};

export const updateProductStock = async (req, res) => {
  try {
    const { quantity, in_stock, colorStock } = req.body;

    if (colorStock !== undefined) {
      const product = await Product.findOne({ id: req.params.id });
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });
      }
      if (!product.variants?.colours?.length) {
        return res.status(400).json({
          success: false,
          message: "This product does not have colour variants",
        });
      }

      product.variants.colorStock = makeColorStock(
        product.variants.colours,
        colorStock,
        product.variants.colorStock,
      );
      product.stock = summarizeColorStock(product.variants.colorStock);
      await product.save();

      return res.status(200).json({
        success: true,
        product: await Product.findById(product._id)
          .select("id name category brand images variants stock updatedAt")
          .lean(),
      });
    }

    const parsedQuantity = Number(quantity);

    if (
      quantity === "" ||
      quantity === null ||
      quantity === undefined ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Stock quantity must be a non-negative whole number",
      });
    }
    if (typeof in_stock !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Select whether this product is available for sale",
      });
    }

    const product = await Product.findOneAndUpdate(
      { id: req.params.id },
      {
        $set: {
          "stock.quantity": parsedQuantity,
          "stock.in_stock": in_stock && parsedQuantity > 0,
        },
      },
      { returnDocument: "after", runValidators: true },
    )
      .select("id name category brand images variants stock updatedAt")
      .lean();

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({ success: true, product });
  } catch (error) {
    console.error("Update inventory error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Failed to update product stock",
    });
  }
};
