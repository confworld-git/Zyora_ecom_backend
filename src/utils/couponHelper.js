import Coupon from "../schemas/Coupon.js";

const normalizeCategory = (category) =>
  String(category || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const couponError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Same rules as POST /api/coupons/apply, so checkout charges exactly what the cart showed.
// Returns { code, discountAmount } or throws an Error with a customer-friendly message.
export const getCouponDiscount = async (code, items) => {
  const couponCode = String(code || "").trim().toUpperCase();

  if (!couponCode) throw couponError("Invalid coupon code");
  if (!Array.isArray(items) || items.length === 0)
    throw couponError("Coupon cart items are required");

  const coupon = await Coupon.findOne({ code: couponCode });

  if (!coupon) throw couponError("Invalid coupon code", 404);

  if (coupon.status !== "active")
    throw couponError("This coupon is inactive");

  if (new Date() > coupon.expiryDate)
    throw couponError("This coupon has expired");

  if (coupon.usedCount >= coupon.usageLimit) {
    throw couponError("This coupon has reached its usage limit");
  }

  const isCategoryCoupon = coupon.applicability === "categories";
  const isSubcategoryCoupon = coupon.applicability === "subcategories";
  const eligibleValues = new Set(
    (isCategoryCoupon
      ? coupon.categories || []
      : coupon.subcategories || []
    )
      .map(normalizeCategory)
      .filter(Boolean),
  );
  const eligibleItems =
    isCategoryCoupon || isSubcategoryCoupon
      ? items.filter((item) =>
        eligibleValues.has(
          normalizeCategory(
            isCategoryCoupon ? item.category : item.subcategory,
          ),
        ),
      )
      : items;
  const total = eligibleItems.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0,
  );

  if (total <= 0) {
    throw couponError(
      isCategoryCoupon || isSubcategoryCoupon
        ? "This coupon is not valid for the items in your cart"
        : "Invalid cart total",
    );
  }

  if (total < coupon.minimumOrderValue) {
    const minimumLabel = isCategoryCoupon || isSubcategoryCoupon
      ? "Minimum eligible order value"
      : "Minimum order value";
    throw couponError(`${minimumLabel} is ₹${coupon.minimumOrderValue}`);
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
    eligibleSubtotal: Number(total.toFixed(2)),
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minimumOrderValue: coupon.minimumOrderValue,
      maximumDiscount: coupon.maximumDiscount,
      applicability: coupon.applicability || "all",
      categories: coupon.categories || [],
      subcategories: coupon.subcategories || [],
    },
  };
};