import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath, pathToFileURL } from "url";
import connectDB from "./config/db.js";

dotenv.config();

const { EJSON } = mongoose.mongo.BSON;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "zyora.products.json");

const seedProducts = async () => {
  const collection = mongoose.connection.collection("products");
  const raw = fs.readFileSync(FILE, "utf8");
  const products = EJSON.parse(raw);

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("File must contain a JSON array of products");
  }

  const productIds = new Set();
  for (const product of products) {
    if (typeof product.id !== "string" || !product.id.trim() || !product._id) {
      throw new Error("Every seeded product must have an id and _id");
    }
    if (productIds.has(product.id)) {
      throw new Error(`Duplicate product id in seed file: ${product.id}`);
    }
    productIds.add(product.id);
  }

  const result = await collection.bulkWrite(
    products.map((product) => ({
      updateOne: {
        filter: {
          $or: [{ id: product.id }, { _id: product._id }],
        },
        update: { $setOnInsert: product },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  if (result.upsertedCount > 0) {
    console.log(
      `Imported ${result.upsertedCount} missing products into ${mongoose.connection.name}`,
    );
  }
  return result.upsertedCount;
};

export default seedProducts;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await connectDB();
    await seedProducts();
  } catch (error) {
    console.error("Product seed error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
