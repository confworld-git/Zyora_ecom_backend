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
  if ((await collection.countDocuments()) > 0) {
    return false;
  }

  const raw = fs.readFileSync(FILE, "utf8");
  const products = EJSON.parse(raw);

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("File must contain a JSON array of products");
  }

  const result = await collection.insertMany(products, { ordered: false });
  console.log(
    `Imported ${result.insertedCount} products into ${mongoose.connection.name}`
  );
  return true;
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
