import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    // Snapshot of each line at purchase time (old orders stay correct if prices change)
    items: [
      {
        _id: false,
        productId: { type: String, required: true },
        name: { type: String, required: true },
        brand: { type: String, default: "" },
        image: { type: String, default: "" },
        size: { type: String, default: "" },
        color: { type: String, default: "" },
        stockVariant: { type: Boolean },
        price: { type: Number, required: true }, // selling price paid per unit
        mrp: { type: Number, default: 0 },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],

    // Same field names as the address form in the cart
    shippingAddress: {
      name: { type: String, required: true },
      mobile: { type: String, required: true },
      houseNumber: { type: String, default: "" },
      address: { type: String, required: true },
      locality: { type: String, default: "" },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: String, required: true },
    },

    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    couponDiscount: { type: Number, default: 0 },
    total: { type: Number, required: true },

    paymentMethod: { type: String, enum: ["cod", "online"], default: "cod" },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunding", "refunded"],
      default: "pending",
    },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
    stockReservationStatus: {
      type: String,
      enum: ["none", "reserved", "committed", "released"],
      default: "none",
    },
    couponRedeemed: { type: Boolean, default: false },
    orderStatus: {
      type: String,
      enum: [
        "placed",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "placed",
    },
    shipment: {
      shiprocketOrderId: { type: Number, default: null },
      shipmentId: { type: Number, default: null },
      submissionState: {
        type: String,
        enum: ["not_sent", "submitting", "sent", "unknown"],
        default: "not_sent",
      },
      courierId: { type: Number, default: null },
      courierName: { type: String, default: "" },
      awb: { type: String, default: "", index: true },
      status: { type: String, default: "" },
      package: {
        length: { type: Number, default: null },
        breadth: { type: Number, default: null },
        height: { type: Number, default: null },
        weight: { type: Number, default: null },
      },
      locked: { type: Boolean, default: false },
      lockedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
