import mongoose from "mongoose";

// One document per setting group (for now only key: "pricing").
// Fields have no defaults on purpose: anything unset falls back to config/pricing.js.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },

    freeShippingLimit: { type: Number, min: 0 },
    shippingCharge: { type: Number, min: 0 },
    shippingChargeforCOD: { type: Number, min: 0 },
    platformFee: { type: Number, min: 0 },
    shippingChargeforChennai: { type: Number, min: 0 },
    shippingChargeforChennaiCOD: { type: Number, min: 0 },
    shippingChargeforTamilNadu: { type: Number, min: 0 },
    shippingChargeforTamilNaduCOD: { type: Number, min: 0 },
    shippingChargeforRestofIndia: { type: Number, min: 0 },
    shippingChargeforRestofIndiaCOD: { type: Number, min: 0 },
  },
  { timestamps: true },
);

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
