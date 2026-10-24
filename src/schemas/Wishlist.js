import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema(
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
        selectedImage: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true },
);

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

export default Wishlist;
