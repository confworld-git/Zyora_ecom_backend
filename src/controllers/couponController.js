import Coupon from "../schemas/Coupon.js";
import mongoose from "mongoose";
import Product from "../schemas/Product.js";
import { getCouponDiscount } from "../utils/couponHelper.js";

export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minimumOrderValue,
      maximumDiscount,
      expiryDate,
      usageLimit,
      status,
      applicability = "all",
      categories = [],
    } = req.body;

    if (
      !code ||
      !discountType ||
      discountValue === undefined ||
      minimumOrderValue === undefined ||
      !expiryDate ||
      !usageLimit ||
      !status
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required coupon fields",
      });
    }

    const couponCode = code.trim().toUpperCase();

    if (!["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid discount type",
      });
    }

    if (Number(discountValue) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Discount value must be greater than 0",
      });
    }

    if (discountType === "percentage" && Number(discountValue) > 100) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount cannot exceed 100%",
      });
    }

    if (Number(minimumOrderValue) < 0) {
      return res.status(400).json({
        success: false,
        message: "Minimum order value cannot be negative",
      });
    }

    if (
      discountType === "percentage" &&
      (maximumDiscount === undefined ||
        maximumDiscount === null ||
        Number(maximumDiscount) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Maximum discount amount is required",
      });
    }

    const finalMaximumDiscount =
      discountType === "percentage" ? Number(maximumDiscount) : null;

    const expiry = new Date(`${expiryDate}T23:59:59`);

    if (Number.isNaN(expiry.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid expiry date",
      });
    }

    if (expiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Expiry date cannot be in the past",
      });
    }

    if (Number(usageLimit) < 1) {
      return res.status(400).json({
        success: false,
        message: "Usage limit must be at least 1",
      });
    }

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon status",
      });
    }

    if (!["all", "categories"].includes(applicability)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon applicability",
      });
    }

    if (!Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        message: "Coupon categories must be a list",
      });
    }

    const couponCategories = [
      ...new Set(
        categories
          .filter((category) => typeof category === "string")
          .map((category) => category.trim())
          .filter(Boolean),
      ),
    ];

    if (applicability === "categories" && couponCategories.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one coupon category",
      });
    }

    const existingCoupon = await Coupon.findOne({
      code: couponCode,
    });

    if (existingCoupon) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    const coupon = await Coupon.create({
      code: couponCode,
      discountType,
      discountValue: Number(discountValue),
      minimumOrderValue: Number(minimumOrderValue),
      maximumDiscount: finalMaximumDiscount,
      applicability,
      categories: applicability === "categories" ? couponCategories : [],
      expiryDate: expiry,
      usageLimit: Number(usageLimit),
      usedCount: 0,
      status,
    });

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    console.error("Create coupon error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create coupon",
    });
  }
};

export const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({
      status: "active",
      expiryDate: { $gte: new Date() },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    })
      .select(
        "code discountType discountValue minimumOrderValue maximumDiscount expiryDate applicability categories",
      )
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ success: true, coupons });
  } catch (error) {
    console.error("Get available coupons error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch coupons" });
  }
};

export const getAdminCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, coupons });
  } catch (error) {
    console.error("Get admin coupons error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch coupons" });
  }
};

export const getCouponByCode = async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    const coupon = await Coupon.findOne({
      code,
      status: "active",
      expiryDate: { $gte: new Date() },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    }).select(
      "code discountType discountValue minimumOrderValue maximumDiscount expiryDate applicability categories",
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      coupon,
    });
  } catch (error) {
    console.error("Get coupon error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupon",
    });
  }
};

export const applyCoupon = async (req, res) => {
  try {
    const { code, items } = req.body;

    if (!code || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Coupon code and cart items are required",
      });
    }

    if (
      items.length > 100 ||
      items.some(
        (item) =>
          typeof item?.productId !== "string" ||
          !item.productId.trim() ||
          !Number.isInteger(Number(item.quantity)) ||
          Number(item.quantity) < 1 ||
          Number(item.quantity) > 10,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon cart items",
      });
    }

    const productIds = [...new Set(items.map((item) => item.productId.trim()))];
    const products = await Product.find({ id: { $in: productIds } })
      .select("id category price.selling_price")
      .lean();
    const productsById = new Map(products.map((product) => [product.id, product]));

    if (productsById.size !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: "Some cart items are no longer available",
      });
    }

    const couponItems = items.map((item) => {
      const product = productsById.get(item.productId.trim());
      const price = Number(product.price?.selling_price);
      return {
        category: product.category,
        price,
        quantity: Number(item.quantity),
      };
    });

    if (couponItems.some((item) => !Number.isFinite(item.price) || item.price < 0)) {
      return res.status(400).json({
        success: false,
        message: "Price unavailable for one or more cart items",
      });
    }

    const result = await getCouponDiscount(code, couponItems);
    const total = couponItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const finalAmount = Number((total - result.discountAmount).toFixed(2));
    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      coupon: result.coupon,
      cartTotal: total,
      discountAmount: result.discountAmount,
      finalAmount,
      eligibleSubtotal: result.eligibleSubtotal,
    });
  } catch (error) {
    console.error("Apply coupon error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to apply coupon",
    });
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon id" });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    const {
      discountValue,
      minimumOrderValue,
      maximumDiscount,
      expiryDate,
      usageLimit,
      applicability,
      categories,
    } = req.body;

    if (applicability !== undefined) {
      if (!["all", "categories"].includes(applicability)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid coupon applicability" });
      }

      coupon.applicability = applicability;
    }

    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        return res
          .status(400)
          .json({ success: false, message: "Coupon categories must be a list" });
      }

      coupon.categories = [
        ...new Set(
          categories
            .filter((category) => typeof category === "string")
            .map((category) => category.trim())
            .filter(Boolean),
        ),
      ];
    }

    if (coupon.applicability === "categories" && !coupon.categories.length) {
      return res.status(400).json({
        success: false,
        message: "Select at least one coupon category",
      });
    }

    if (coupon.applicability === "all") coupon.categories = [];

    if (discountValue !== undefined) {
      if (Number(discountValue) <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid discount value" });
      }
      if (coupon.discountType === "percentage" && Number(discountValue) > 100) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount cannot exceed 100%",
        });
      }
      coupon.discountValue = Number(discountValue);
    }

    if (minimumOrderValue !== undefined) {
      if (Number(minimumOrderValue) < 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid minimum order value" });
      }
      coupon.minimumOrderValue = Number(minimumOrderValue);
    }

    if (coupon.discountType === "percentage" && maximumDiscount !== undefined) {
      if (Number(maximumDiscount) <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid maximum discount" });
      }
      coupon.maximumDiscount = Number(maximumDiscount);
    }

    if (expiryDate !== undefined) {
      const date = new Date(`${expiryDate}T23:59:59`);
      if (isNaN(date.getTime())) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid expiry date" });
      }
      coupon.expiryDate = date;
    }

    if (usageLimit !== undefined) {
      if (Number(usageLimit) < coupon.usedCount) {
        return res.status(400).json({
          success: false,
          message: `Usage limit can't be below the ${coupon.usedCount} already used`,
        });
      }
      coupon.usageLimit = Number(usageLimit);
    }

    await coupon.save(); // also refreshes updatedAt
    res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to update coupon" });
  }
};

// PATCH /api/coupons/:id/status  -- activate / pause
export const updateCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon id" });
    }
    if (!["active", "inactive"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      { status },
      { returnDocument: "after" },
    );
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    res.status(200).json({ success: true, message: "Status updated", coupon });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to update status" });
  }
};

// DELETE /api/coupons/:id
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid coupon id" });
    }

    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete coupon" });
  }
};

export const redeemCoupon = async (code) => {
  const coupon = await Coupon.findOneAndUpdate(
    {
      code: code.trim().toUpperCase(),
      status: "active",
      expiryDate: { $gte: new Date() },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    },
    { $inc: { usedCount: 1 } },
    { returnDocument: "after" },
  );

  return coupon;
};