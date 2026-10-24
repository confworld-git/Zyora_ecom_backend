import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
    },
    customerId: {
      type: String,
      required: true,
      trim: true,
    },

    items: [
      {
        _id: false,
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productId: { type: String, required: true, trim: true },
        size: { type: String, default: "" },
        color: { type: String, default: "" },
        quantity: { type: Number, default: 1, min: 1, max: 10 },
      },
    ],
  },
  { timestamps: true },
);

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
