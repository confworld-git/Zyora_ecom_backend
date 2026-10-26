// Fallback values, used until the admin saves their own in the dashboard
// (or if the database has no pricing document yet).
const getAmount = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback;
};

const shippingCharge = getAmount("SHIPPING_CHARGE", 179);

export const DEFAULT_PRICING = {
  freeShippingLimit: getAmount("FREE_SHIPPING_LIMIT", 999),
  shippingCharge,
  shippingChargeforCOD: getAmount(
    "SHIPPING_CHARGE_FOR_COD",
    shippingCharge,
  ),
  platformFee: getAmount("PLATFORM_FEE", 0),
  shippingChargeforChennai: getAmount("SHIPPING_CHARGE_CHENNAI", 49),
  shippingChargeforChennaiCOD: getAmount("SHIPPING_CHARGE_CHENNAI_COD", 59),
  shippingChargeforTamilNadu: getAmount("SHIPPING_CHARGE_TAMIL_NADU", 79),
  shippingChargeforTamilNaduCOD: getAmount(
    "SHIPPING_CHARGE_TAMIL_NADU_COD",
    89,
  ),
  shippingChargeforRestofIndia: getAmount(
    "SHIPPING_CHARGE_REST_OF_INDIA",
    169,
  ),
  shippingChargeforRestofIndiaCOD: getAmount(
    "SHIPPING_CHARGE_REST_OF_INDIA_COD",
    179,
  ),
};
