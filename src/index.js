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
import console from "console";

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

  if (
    process.env.npm_lifecycle_event === "dev" ||
    process.env.SEED_ON_START === "true"
  ) {
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



// India Post login test route (UAT/sandbox). Requires Node 18+.

const BASE_URL = "https://test.cept.gov.in/beextcustomer";

app.get("/post", async (req, res) => {
  const { INDIA_POST_USERNAME, INDIA_POST_PASSWORD } = process.env;

  if (!INDIA_POST_USERNAME || !INDIA_POST_PASSWORD) {
    return res.status(500).json({
      success: false,
      message: "India Post credentials are not configured",
    });
  }

  try {
    const apiResponse = await fetch(`${BASE_URL}/v1/access/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        username: INDIA_POST_USERNAME,
        password: INDIA_POST_PASSWORD,
      }),
      signal: AbortSignal.timeout(30000),
    });

    // Read as text first so an HTML error page (502, WAF block) doesn't crash JSON parsing
    const raw = await apiResponse.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error(`India Post returned non-JSON (HTTP ${apiResponse.status})`);
      return res.status(502).json({
        success: false,
        message: "Unexpected response from India Post",
        upstreamStatus: apiResponse.status,
      });
    }

    console.log("India Post Status:", apiResponse.status);
    console.log("Login Success:", data.success);
    console.log("Login Message:", data.message);

    if (!apiResponse.ok || !data.success) {
      // If India Post replies HTTP 200 with success:false, still return 401
      const status = apiResponse.ok ? 401 : apiResponse.status;
      return res.status(status).json({
        success: false,
        message: data.message || "India Post login failed",
      });
    }

    // Never log or expose tokens. Only confirm they were received.
    return res.status(200).json({
      success: true,
      message: "India Post authentication successful",
      tokenReceived: !!data.data?.access_token,
      refreshTokenReceived: !!data.data?.refresh_token,
      expiresIn: data.data?.expires_in,
      refreshExpiresIn: data.data?.refresh_expires_in,
    });
  } catch (error) {
    // Keep details in server logs; don't return raw internal error text to the caller
    console.error("India Post Connection Error:", error.message);
    console.error("Error Code:", error.cause?.code);

    const timedOut = error.name === "TimeoutError";
    return res.status(timedOut ? 504 : 502).json({
      success: false,
      message: timedOut
        ? "India Post request timed out"
        : "Could not connect to India Post",
      code: error.cause?.code,
    });
  }
});

