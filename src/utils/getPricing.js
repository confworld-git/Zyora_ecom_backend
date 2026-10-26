import Settings from "../schemas/Settings.js";
import { DEFAULT_PRICING } from "../config/pricing.js";

// The single function everything uses to read the current fees.
export const getPricing = async () => {
  const saved = await Settings.findOne({ key: "pricing" }).lean();

  return {
    freeShippingLimit:
      saved?.freeShippingLimit ?? DEFAULT_PRICING.freeShippingLimit,
    shippingCharge: saved?.shippingCharge ?? DEFAULT_PRICING.shippingCharge,
    shippingChargeforCOD:
      saved?.shippingChargeforCOD ??
      saved?.shippingCharge ??
      DEFAULT_PRICING.shippingChargeforCOD,
    platformFee: saved?.platformFee ?? DEFAULT_PRICING.platformFee,
    shippingChargeforChennai:
      saved?.shippingChargeforChennai ??
      DEFAULT_PRICING.shippingChargeforChennai,
    shippingChargeforChennaiCOD:
      saved?.shippingChargeforChennaiCOD ??
      DEFAULT_PRICING.shippingChargeforChennaiCOD,
    shippingChargeforTamilNadu:
      saved?.shippingChargeforTamilNadu ??
      DEFAULT_PRICING.shippingChargeforTamilNadu,
    shippingChargeforTamilNaduCOD:
      saved?.shippingChargeforTamilNaduCOD ??
      DEFAULT_PRICING.shippingChargeforTamilNaduCOD,
    shippingChargeforRestofIndia:
      saved?.shippingChargeforRestofIndia ??
      DEFAULT_PRICING.shippingChargeforRestofIndia,
    shippingChargeforRestofIndiaCOD:
      saved?.shippingChargeforRestofIndiaCOD ??
      DEFAULT_PRICING.shippingChargeforRestofIndiaCOD,
  };
};
