import Settings from "../schemas/Settings.js";
import { getPricing } from "../utils/getPricing.js";
import {
  calculateShippingFee,
  getShippingRegionLabel,
} from "../utils/shippingPricing.js";

const FIELDS = [
  "freeShippingLimit",
  "platformFee",
  "shippingChargeforChennai",
  "shippingChargeforChennaiCOD",
  "shippingChargeforTamilNadu",
  "shippingChargeforTamilNaduCOD",
  "shippingChargeforRestofIndia",
  "shippingChargeforRestofIndiaCOD",
];
const MAX_VALUE = 100000;

// GET /api/config/pricing  (public: shoppers see these numbers in the cart)
export const getPricingSettings = async (req, res) => {
  try {
    const pricing = await getPricing();

    return res.status(200).json({ success: true, pricing });
  } catch (error) {
    console.error("Get Pricing Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getShippingQuote = async (req, res) => {
  const { shippingAddress, paymentMethod, subtotal: rawSubtotal } =
    req.body || {};
  const subtotal = Number(rawSubtotal);

  if (
    typeof shippingAddress?.city !== "string" ||
    !shippingAddress.city.trim() ||
    typeof shippingAddress?.state !== "string" ||
    !shippingAddress.state.trim() ||
    !/^\d{6}$/.test(String(shippingAddress?.pinCode || "").trim())
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid delivery city, state, and 6-digit PIN code are required",
    });
  }
  if (!["cod", "online"].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment method",
    });
  }
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid cart subtotal",
    });
  }

  try {
    const pricing = await getPricing();
    const { region, shippingFee } = calculateShippingFee({
      address: shippingAddress,
      paymentMethod,
      subtotal,
      pricing,
    });

    return res.status(200).json({
      success: true,
      shippingQuote: {
        region,
        regionLabel: getShippingRegionLabel(region),
        shippingFee,
      },
    });
  } catch (error) {
    console.error("Get Shipping Quote Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to calculate shipping",
    });
  }
};

// PUT /api/config/pricing (admin only)
export const updatePricingSettings = async (req, res) => {
  try {
    const update = {};

    for (const field of FIELDS) {
      if (req.body[field] === undefined) continue;

      const value = Number(req.body[field]);

      if (!Number.isFinite(value) || value < 0 || value > MAX_VALUE) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a number between 0 and ${MAX_VALUE}`,
        });
      }

      update[field] = value;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({
        success: false,
        message: "Nothing to update",
      });
    }

    await Settings.findOneAndUpdate(
      { key: "pricing" },
      { $set: update },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    const pricing = await getPricing();

    return res.status(200).json({
      success: true,
      message: "Pricing updated",
      pricing,
    });
  } catch (error) {
    console.error("Update Pricing Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};
