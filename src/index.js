import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import contactRoutes from "./routes/contactRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import sitemapRoutes from "./routes/sitemap.js";
import { initCloudinary } from "./config/cloudinary.js";
import couponRoutes from "./routes/couponRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import configRoutes from "./routes/configRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { expirePendingOnlinePayments } from "./controllers/orderController.js";
import couriers from "./routes/couriers.js";
import { backfillAllProducts } from "./utils/Googlesheets.js";
import seedAdmin from "./seedAdmin.js";
import seedProducts from "./seedProducts.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.set("trust proxy", 1);
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      if (req.originalUrl.startsWith("/api/payments/razorpay/webhook")) {
        req.rawBody = Buffer.from(buffer);
      }
    },
  }),
);
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({
    message: "Zyora server is running",
  });
});

app.use("/api/contact", contactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/products", productRoutes);
app.use("/sitemap.xml", sitemapRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/config", configRoutes);
app.use("/api", couriers);

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  await connectDB();

  if (process.env.npm_lifecycle_event === "dev") {
    await seedAdmin();
    await seedProducts();
  }

  initCloudinary();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    backfillAllProducts()
      .then((r) => {
        console.log(
          `Google Sheets backup: scanned ${r.scanned}, added ${r.added}, updated ${r.updated}, unchanged ${r.unchanged}, missing IDs ${r.missingId}`,
        );
        console.log(
          "Google Sheets products by category:",
          JSON.stringify(r.categories),
        );
      })
      .catch((err) =>
        console.error("Google Sheets backup failed:", err.message),
      );
  });

  const pendingPaymentCleanup = setInterval(
    () => {
      expirePendingOnlinePayments().catch((error) => {
        console.error("Pending payment cleanup failed:", error);
      });
    },
    5 * 60 * 1000,
  );
  pendingPaymentCleanup.unref();
};

startServer().catch(async (error) => {
  console.error("Server startup failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error("MongoDB disconnect failed:", disconnectError.message);
  }
  process.exitCode = 1;
});
