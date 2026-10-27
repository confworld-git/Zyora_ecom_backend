import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";

dotenv.config();

const { EJSON } = mongoose.mongo.BSON;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "zyora.products.json");

const seedProducts = async () => {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const products = EJSON.parse(raw);

    if (!Array.isArray(products) || products.length === 0) {
      throw new Error("File must contain a JSON array of products");
    }

    await connectDB();

    // Use the raw collection so _id, createdAt and updatedAt stay exactly as exported
    const collection = mongoose.connection.collection("products");

    const existing = await collection.countDocuments();
    if (existing > 0) {
      console.log(`products already has ${existing} documents. Skipping.`);
      console.log("To replace them, uncomment the deleteMany line below.");
      return;
      // await collection.deleteMany({});
    }

    const result = await collection.insertMany(products, { ordered: false });
    console.log(
      `Imported ${result.insertedCount} products into ${mongoose.connection.name}`
    );
  } finally {
    await mongoose.disconnect();
  }
};

seedProducts().catch((error) => {
  console.error("Product seed error:", error.message);
  process.exitCode = 1;
});
