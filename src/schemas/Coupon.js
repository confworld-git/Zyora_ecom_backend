import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },

    discountType: {
      type: String,
      required: true,
      enum: ["percentage", "fixed"],
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    minimumOrderValue: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    maximumDiscount: {
      type: Number,
      default: null,
      min: 0,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    usageLimit: {
      type: Number,
      required: true,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

const Coupon = mongoose.model("Coupon", couponSchema);

export default Coupon;