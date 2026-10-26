const normalizeLocation = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export const getShippingRegion = ({ city, state } = {}) => {
  const normalizedState = normalizeLocation(state);

  if (
    normalizedState === "tn" ||
    normalizedState.startsWith("tamilnadu")
  ) {
    const normalizedCity = normalizeLocation(city);
    return /^(chennai|madras)/.test(normalizedCity) ? "chennai" : "tamil_nadu";
  }

  return "rest_of_india";
};

export const getShippingRegionLabel = (region) => {
  switch (region) {
    case "chennai":
      return "Chennai";
    case "tamil_nadu":
      return "Rest of Tamil Nadu";
    case "rest_of_india":
      return "Rest of India";
    default:
      throw new Error("Unknown shipping region");
  }
};

export const calculateShippingFee = ({
  address,
  paymentMethod,
  subtotal,
  pricing,
}) => {
  const region = getShippingRegion(address);
  const rateSuffix = paymentMethod === "cod" ? "COD" : "";
  const rateKey = {
    chennai: `shippingChargeforChennai${rateSuffix}`,
    tamil_nadu: `shippingChargeforTamilNadu${rateSuffix}`,
    rest_of_india: `shippingChargeforRestofIndia${rateSuffix}`,
  }[region];
  const shippingFee =
    subtotal > 0 && subtotal < pricing.freeShippingLimit
      ? pricing[rateKey]
      : 0;

  return { region, shippingFee };
};
