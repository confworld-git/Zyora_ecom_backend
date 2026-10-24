import Settings from "../schemas/Settings.js";
import { getPricing } from "../utils/getPricing.js";

const FIELDS = [
  "freeShippingLimit",
  "shippingCharge",
  "shippingChargeforCOD",
  "platformFee",
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

// PUT /api/config/pricing  (admin only)  body: { freeShippingLimit?, shippingCharge?, shippingChargeforCOD?, platformFee? }
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
