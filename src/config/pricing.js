// Fallback values, used until the admin saves their own in the dashboard
// (or if the database has no pricing document yet).
const getAmount = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback;
};

const shippingCharge = getAmount("SHIPPING_CHARGE", 250);

export const DEFAULT_PRICING = {
  freeShippingLimit: getAmount("FREE_SHIPPING_LIMIT", 1999),
  shippingCharge,
  shippingChargeforCOD: getAmount(
    "SHIPPING_CHARGE_FOR_COD",
    shippingCharge,
  ),
  platformFee: getAmount("PLATFORM_FEE", 23),
};
