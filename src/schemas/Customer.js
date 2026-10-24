import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    mobile: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },

    googleId: { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },

    profileImage: { type: String, default: "" },
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date },
  },
  { timestamps: true },
);

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;
