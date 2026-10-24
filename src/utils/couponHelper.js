import Coupon from "../schemas/Coupon.js";

// Same rules as POST /api/coupons/apply, so checkout charges exactly what the cart showed.
// Returns { code, discountAmount } or throws an Error with a customer-friendly message.
export const getCouponDiscount = async (code, subtotal) => {
  const couponCode = String(code || "").trim().toUpperCase();

  if (!couponCode) throw new Error("Invalid coupon code");

  const total = Number(subtotal);

  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Invalid cart total");
  }

  const coupon = await Coupon.findOne({ code: couponCode });

  if (!coupon) throw new Error("Invalid coupon code");

  if (coupon.status !== "active") throw new Error("This coupon is inactive");

  if (new Date() > coupon.expiryDate) throw new Error("This coupon has expired");

  if (coupon.usedCount >= coupon.usageLimit) {
    throw new Error("This coupon has reached its usage limit");
  }

  if (total < coupon.minimumOrderValue) {
    throw new Error(`Minimum order value is ₹${coupon.minimumOrderValue}`);
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
  } else if (coupon.discountType === "fixed") {
    discountAmount = coupon.discountValue;
  }

  if (discountAmount > total) discountAmount = total;

  return {
    code: coupon.code,
    discountAmount: Number(discountAmount.toFixed(2)),
  };
};