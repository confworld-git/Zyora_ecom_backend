import mongoose from "mongoose";

const markettingMailSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
  },
  {
    timestamps: true,
    collection: "marketting_mails",
  },
);

const MarkettingMail = mongoose.model(
  "MarkettingMail",
  markettingMailSchema,
  "marketting_mails",
);

export default MarkettingMail;
