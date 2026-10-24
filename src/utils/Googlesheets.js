import "dotenv/config";

import { google } from "googleapis";

import Product from "../schemas/Product.js";

// --------------------------------------------------
// Google Sheets backup helper
// Used by the controller (real-time) and the sync script (backfill).
// --------------------------------------------------

const SHEET_NAME = process.env.SHEET_NAME || "Sheet1";
const QUOTED_SHEET = `'${SHEET_NAME.replace(/'/g, "''")}'`;

let sheetsClient = null;

function getSheets() {
  if (!process.env.SPREADSHEET_ID) {
    throw new Error("SPREADSHEET_ID is missing in .env");
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is missing in .env");
  }

  if (!sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsClient = google.sheets({ version: "v4", auth });
  }

  return sheetsClient;
}

const DEFAULT_HEADERS = [
  "Product ID",
  "Name",
  "Category",
  "Subcategory",
  "Title",
  "Brand",
  "Currency",
  "MRP",
  "Selling Price",
  "Discount",
  "Rating",
  "Review Count",
  "Stock",
  "In Stock",
  "Best Seller",
  "Colours",
  "Sizes",
  "Image URLs",
  "Product URL",
  "Created At",
  "Updated At",
  "Video",
  "About This Item",
  "Product Information",
  "Variants",
  "Image Details",
  "Product Data",
];

const HEADER_ALIASES = {
  "product id": ["id", "product id", "product_id", "sku"],
  name: ["name", "product name"],
  category: ["category"],
  subcategory: ["subcategory", "sub category", "sub-category"],
  title: ["title", "description", "product title"],
  brand: ["brand"],
  currency: ["currency"],
  mrp: ["mrp", "maximum retail price"],
  "selling price": ["selling price", "selling_price", "price"],
  discount: ["discount", "discount percent", "discount_percent"],
  rating: ["rating", "average rating"],
  "review count": ["review count", "rating count"],
  stock: ["stock", "quantity", "stock quantity"],
  "in stock": ["in stock", "in_stock", "available"],
  "best seller": ["best seller", "is_best_seller"],
  colours: ["colours", "colors", "colours available", "colors available"],
  sizes: ["sizes", "size"],
  "image urls": ["image urls", "images", "image url", "product images"],
  "product url": ["product url", "url"],
  "created at": ["created at", "createdat", "created", "date added"],
  "updated at": ["updated at", "updatedat", "updated", "last updated"],
  video: ["video", "video url", "product video"],
  "about this item": ["about this item", "about", "features", "highlights"],
  "product information": [
    "product information",
    "product details",
    "specifications",
  ],
  variants: ["variants", "product variants"],
  images: ["images json", "image details", "product images json"],
  "product data": ["product data", "full product data", "product json"],
};

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function canonicalFromHeader(header) {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return canonical;
    }
  }

  return null;
}

function getValue(object, keys, fallback = "") {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

function toCellString(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    return value.text !== undefined
      ? String(value.text)
      : JSON.stringify(value);
  }
  return String(value);
}

// MongoDB ObjectId stores its creation time in the first 4 bytes
function objectIdDate(id) {
  const hex = String(id ?? "");
  return /^[0-9a-f]{24}$/i.test(hex)
    ? new Date(parseInt(hex.slice(0, 8), 16) * 1000)
    : "";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function getImageUrls(product) {
  const possibleImages =
    product.images ??
    product.product_images ??
    product.productImages ??
    product.image_urls ??
    product.imageUrls ??
    product.image ??
    [];

  const images = Array.isArray(possibleImages)
    ? possibleImages
    : possibleImages
      ? [possibleImages]
      : [];

  return images
    .map((image) => {
      if (typeof image === "string") return image;
      if (image && typeof image === "object") {
        return (
          image.url || image.secure_url || image.imageUrl || image.src || ""
        );
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function columnLetter(index) {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// --------------------------------------------------
// Normalize a product from the backend API
// Adjust these mappings if your MongoDB schema differs.
// --------------------------------------------------

function normalizeProduct(product) {
  const obj = (v) => (v && typeof v === "object" ? v : {});

  const price = obj(product.price);
  const rating = obj(product.rating);
  const stock = obj(product.stock);
  const variants = obj(product.variants);
  const information = obj(product.product_information);
  const aboutThisItem = getValue(
    product,
    ["about_this_item", "aboutThisItem"],
    [],
  );
  const images = getValue(product, ["images", "product_images"], []);
  const video = getValue(product, ["video", "video_url", "videoUrl"], "");

  const colours = getValue(
    variants,
    ["colours", "colors"],
    getValue(product, ["colours", "colors"], []),
  );

  const sizes = getValue(
    variants,
    ["sizes", "size"],
    getValue(product, ["sizes", "size"], []),
  );

  return {
    "product id": getValue(
      product,
      ["id", "productId", "product_id", "sku", "_id"],
      "",
    ),
    name: getValue(product, ["name", "productName", "product_name"], ""),
    category: getValue(product, ["category", "productCategory"], ""),
    subcategory: getValue(
      product,
      ["subcategory", "sub_category", "subCategory"],
      "",
    ),
    title: getValue(
      product,
      ["title", "description", "product_title"],
      getValue(information, ["title", "description"], ""),
    ),
    brand: getValue(product, ["brand", "brandName"], ""),
    currency: getValue(
      price,
      ["currency"],
      getValue(product, ["currency"], "INR"),
    ),
    mrp: getValue(
      price,
      ["mrp", "MRP", "maximum_retail_price"],
      getValue(product, ["mrp", "MRP"], ""),
    ),
    "selling price": getValue(
      price,
      ["selling_price", "sellingPrice", "sale_price"],
      getValue(
        product,
        ["selling_price", "sellingPrice", "price_value", "price"],
        "",
      ),
    ),
    discount: getValue(
      price,
      ["discount_percent", "discountPercent", "discount"],
      getValue(
        product,
        ["discount_percent", "discountPercent", "discount"],
        "",
      ),
    ),
    rating: getValue(
      rating,
      ["average", "rating", "value"],
      getValue(product, ["ratingAverage", "averageRating"], ""),
    ),
    "review count": getValue(
      rating,
      ["count", "reviewCount"],
      getValue(product, ["ratingCount", "reviewCount"], ""),
    ),
    stock: getValue(
      stock,
      ["quantity", "qty", "count"],
      getValue(
        product,
        ["quantity", "stock_quantity", "stockQuantity"],
        typeof product.stock === "number" ? product.stock : "",
      ),
    ),
    "in stock": getValue(
      stock,
      ["in_stock", "inStock", "available"],
      getValue(product, ["in_stock", "inStock", "available"], ""),
    ),
    "best seller": getValue(
      product,
      ["is_best_seller", "isBestSeller", "bestSeller"],
      "",
    ),
    colours: Array.isArray(colours) ? colours.join(", ") : colours,
    sizes: Array.isArray(sizes) ? sizes.join(", ") : sizes,
    "image urls": getImageUrls(product),
    "product url": getValue(product, ["product_url", "productUrl", "url"], ""),
    "created at": formatDate(
      getValue(product, ["createdAt", "created_at"], objectIdDate(product._id)),
    ),
    "updated at": formatDate(
      getValue(product, ["updatedAt", "updated_at"], ""),
    ),
    video: toCellString(video),
    "about this item": Array.isArray(aboutThisItem)
      ? aboutThisItem.join("\n")
      : toCellString(aboutThisItem),
    "product information": JSON.stringify(information),
    variants: JSON.stringify(variants),
    images: JSON.stringify(images),
    "product data": JSON.stringify(product),
  };
}

// --------------------------------------------------
// Core sync: upsert products into the sheet by Product ID
// --------------------------------------------------

async function doSync(products) {
  const sheets = getSheets();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const read = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: QUOTED_SHEET,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rows = read.data.values || [];
  let headers = rows[0] || [];

  if (headers.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${QUOTED_SHEET}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [DEFAULT_HEADERS] },
    });
    headers = DEFAULT_HEADERS;
  } else {
    const existingCanonical = new Set(
      headers.map(canonicalFromHeader).filter(Boolean),
    );
    const missingHeaders = DEFAULT_HEADERS.filter(
      (header) => !existingCanonical.has(canonicalFromHeader(header)),
    );
    if (missingHeaders.length > 0) {
      const firstColumn = headers.length;
      const lastColumn = firstColumn + missingHeaders.length - 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${QUOTED_SHEET}!${columnLetter(firstColumn)}1:${columnLetter(lastColumn)}1`,
        valueInputOption: "RAW",
        requestBody: { values: [missingHeaders] },
      });
      headers = [...headers, ...missingHeaders];
    }
  }

  const columnMap = headers.map(canonicalFromHeader);
  const idIndex = columnMap.indexOf("product id");

  if (idIndex === -1) {
    throw new Error(
      'Row 1 of the sheet needs a "Product ID" column (or an alias like ID or SKU).',
    );
  }

  const existing = new Map();

  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i]?.[idIndex] ?? "").trim();
    if (id && !existing.has(id)) {
      existing.set(id, { rowNumber: i + 1, values: rows[i] });
    }
  }

  const updates = [];
  const appends = [];
  const seen = new Set();
  let unchanged = 0;
  let missingId = 0;

  for (const original of products) {
    if (!original || typeof original !== "object") continue;

    // Accept Mongoose documents as well as plain objects
    const plain =
      typeof original.toObject === "function"
        ? original.toObject({ flattenMaps: true })
        : original;

    const product = normalizeProduct(plain);
    const id = toCellString(product["product id"]).trim();

    if (!id) {
      missingId++;
      continue;
    }

    if (seen.has(id)) continue;
    seen.add(id);

    const current = existing.get(id);

    const newRow = headers.map((_, i) => {
      const canonical = columnMap[i];
      if (canonical) return toCellString(product[canonical]);
      return current?.values?.[i] ?? "";
    });

    if (!current) {
      appends.push(newRow);
      continue;
    }

    const changed = newRow.some(
      (value, i) => String(current.values[i] ?? "") !== value,
    );

    if (changed) {
      updates.push({
        range: `${QUOTED_SHEET}!A${current.rowNumber}:${columnLetter(
          headers.length - 1,
        )}${current.rowNumber}`,
        values: [newRow],
      });
    } else {
      unchanged++;
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  }

  if (appends.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${QUOTED_SHEET}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
  }

  return {
    added: appends.length,
    updated: updates.length,
    unchanged,
    missingId,
  };
}

// Run one sync at a time so two quick product saves can't create duplicate rows
let queue = Promise.resolve();

export function syncProductsToSheet(products) {
  const job = queue.then(() => doSync(products));
  queue = job.catch(() => {});
  return job;
}

export function upsertProductToSheet(product) {
  return syncProductsToSheet([product]);
}

// Copies every product in the database into the sheet.
// Call this once when the server starts; unchanged rows are skipped.
export async function backfillAllProducts() {
  const products = await Product.find().sort({ createdAt: 1 }).lean();
  return syncProductsToSheet(products);
}
