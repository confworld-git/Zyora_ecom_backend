import Coupon from "../schemas/Coupon.js";
import mongoose from "mongoose";

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
        "code discountType discountValue minimumOrderValue maximumDiscount expiryDate",
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
      "code discountType discountValue minimumOrderValue maximumDiscount expiryDate",
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
    const { code, cartTotal } = req.body;

    if (!code || cartTotal === undefined) {
      return res.status(400).json({
        success: false,
        message: "Coupon code and cart total are required",
      });
    }

    const total = Number(cartTotal);

    if (!Number.isFinite(total) || total < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart total",
      });
    }

    const couponCode = code.trim().toUpperCase();

    const coupon = await Coupon.findOne({
      code: couponCode,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    if (coupon.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "This coupon is inactive",
      });
    }

    if (new Date() > coupon.expiryDate) {
      return res.status(400).json({
        success: false,
        message: "This coupon has expired",
      });
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: "This coupon has reached its usage limit",
      });
    }

    if (total < coupon.minimumOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value is ₹${coupon.minimumOrderValue}`,
      });
    }

    let discountAmount = 0;

    if (coupon.discountType === "percentage") {
      discountAmount = (total * coupon.discountValue) / 100;
      if (
        coupon.maximumDiscount !== null &&
        discountAmount > coupon.maximumDiscount
      ) {
        discountAmount = coupon.maximumDiscount;
      }
    }

    if (coupon.discountType === "fixed") {
      discountAmount = coupon.discountValue;
    }

    if (discountAmount > total) {
      discountAmount = total;
    }

    discountAmount = Number(discountAmount.toFixed(2));

    const finalAmount = Number((total - discountAmount).toFixed(2));

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",

      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },

      cartTotal: total,
      discountAmount,
      finalAmount,
    });
  } catch (error) {
    console.error("Apply coupon error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to apply coupon",
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
    } = req.body;

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