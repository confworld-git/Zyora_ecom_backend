import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../schemas/Order.js";
import Customer from "../schemas/Customer.js";
import Product from "../schemas/Product.js";
import { getPricing } from "../utils/getPricing.js";
import { calculateShippingFee } from "../utils/shippingPricing.js";
import Coupon from "../schemas/Coupon.js";
import { getCouponDiscount } from "../utils/couponHelper.js";
import { redeemCoupon } from "./couponController.js";
import { getRazorpayClient } from "../config/razorpay.js";
import { sendAdminOrderEmail } from "./Orderalertemail.js";
import { sendEmail } from "../utils/emailService.js";
import orderConfirmationEmail from "../utils/orderConfirmationEmail.js";
import { sendAdminWhatsApp } from "../utils/whatsappAlert.js";
import {
  decrementProductStock,
  getColorStock,
  hasColorStock,
  normalizeColor,
  restoreProductStock,
} from "../utils/productStock.js";
import {
  ShiprocketApiError,
  ShiprocketConfigurationError,
  srFetch,
} from "../config/shiprocket.js";

const MAX_QTY = 10;

const notifyAdmin = (order) => {
  sendAdminOrderEmail(order);
  // sendAdminWhatsApp(order);
};

const notifyCustomer = async (order) => {
  try {
    const customer = await Customer.findById(order.customer)
      .select("email")
      .lean();
    if (!customer?.email) {
      throw new Error(`Customer email not found for order ${order.orderId}`);
    }

    const { subject, html, text } = orderConfirmationEmail(order);
    await sendEmail({ to: customer.email, subject, html, text });
  } catch (error) {
    console.error(
      `Order confirmation email failed for ${order.orderId}:`,
      error,
    );
  }
};

const generateOrderId = () =>
  `ZYR-ORD-${Date.now().toString(36).toUpperCase()}${crypto
    .randomBytes(2)
    .toString("hex")
    .toUpperCase()}`;

const validateAddress = (a = {}) => {
  if (
    !a.name?.trim() ||
    !a.address?.trim() ||
    !a.city?.trim() ||
    !a.state?.trim()
  ) {
    return "Please fill in the full delivery address";
  }
  if (!/^[6-9]\d{9}$/.test(String(a.mobile || "").trim())) {
    return "Enter a valid 10-digit mobile number";
  }
  if (!/^\d{6}$/.test(String(a.pinCode || "").trim())) {
    return "Enter a valid 6-digit pincode";
  }
  return null;
};

// Same product + size + colour becomes one line; quantity is capped
const mergeLines = (items) => {
  if (!Array.isArray(items)) return [];

  const merged = new Map();

  for (const raw of items) {
    const productId = String(raw?.productId ?? "").trim();
    if (!productId) continue;

    const size = String(raw?.size ?? "").trim();
    const color = String(raw?.color ?? "").trim();
    const qty = Math.max(1, parseInt(raw?.quantity, 10) || 1);
    const key = `${productId}__${size}__${color}`;

    const current = merged.get(key);
    merged.set(key, {
      productId,
      size,
      color,
      quantity: Math.min(MAX_QTY, (current?.quantity || 0) + qty),
    });
  }

  return [...merged.values()];
};

const getImage = (product, color) => {
  const images = Array.isArray(product.images) ? product.images : [];
  const match =
    color &&
    images.find(
      (i) => i.color && i.color.toLowerCase() === color.toLowerCase(),
    );

  return (match || images[0])?.url || "";
};

const reservationKey = (productId, color) =>
  `${productId}\u0000${normalizeColor(color)}`;

const addReservation = (
  reservations,
  productId,
  color,
  quantity,
  useColorStock = true,
) => {
  const stockColor = useColorStock ? color : "";
  const key = reservationKey(productId, stockColor);
  const current = reservations.get(key);
  reservations.set(key, {
    id: productId,
    color: stockColor || "",
    quantity: (current?.quantity || 0) + quantity,
    useColorStock,
  });
};

const releaseStock = async (reserved) => {
  for (const item of reserved.values()) {
    await restoreProductStock(item.id, item.color, item.quantity, {
      useColorStock: item.useColorStock,
    });
  }
};

const getReservedQuantities = (items) => {
  const quantities = new Map();
  for (const item of items) {
    addReservation(
      quantities,
      item.productId,
      item.color,
      item.quantity,
      item.stockVariant === true ||
        (item.stockVariant === undefined && Boolean(item.color)),
    );
  }
  return quantities;
};

const releaseOnlineReservation = async (orderId) => {
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      paymentMethod: "online",
      paymentStatus: "pending",
      stockReservationStatus: "reserved",
    },
    {
      $set: {
        paymentStatus: "failed",
        orderStatus: "cancelled",
        stockReservationStatus: "released",
        couponRedeemed: false,
      },
    },
    { new: true },
  );

  if (!order) return null;

  await releaseStock(getReservedQuantities(order.items));
  if (order.couponCode) {
    await Coupon.updateOne(
      { code: order.couponCode, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
    );
  }
  return order;
};

const markOnlineOrderPaid = async (orderId, paymentId) =>
  Order.findOneAndUpdate(
    {
      _id: orderId,
      paymentMethod: "online",
      paymentStatus: "pending",
      stockReservationStatus: "reserved",
    },
    {
      $set: {
        paymentStatus: "paid",
        stockReservationStatus: "committed",
        razorpayPaymentId: paymentId,
      },
    },
    { new: true },
  );

const verifySignature = (value, expected) => {
  if (
    typeof value !== "string" ||
    typeof expected !== "string" ||
    !/^[a-f0-9]{64}$/i.test(value) ||
    value.length !== expected.length
  ) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(value, "hex"),
    Buffer.from(expected, "hex"),
  );
};

const findCapturedPayment = async (razorpayOrderId) => {
  const result =
    await getRazorpayClient().orders.fetchPayments(razorpayOrderId);
  return result.items?.find(
    (payment) =>
      payment.status === "captured" && payment.order_id === razorpayOrderId,
  );
};

const refundLatePayment = async (order, payment) => {
  const claim = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: "failed",
      stockReservationStatus: "released",
    },
    {
      $set: {
        paymentStatus: "refunding",
        razorpayPaymentId: payment.id,
      },
    },
    { new: true },
  );
  if (!claim) return Order.findById(order._id);

  try {
    const refund = await getRazorpayClient().payments.refund(payment.id, {
      amount: payment.amount,
      notes: { orderId: order.orderId, reason: "Stock reservation expired" },
    });
    if (refund.status === "processed") {
      const refundedOrder = await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: "refunding" },
        { $set: { paymentStatus: "refunded" } },
        { new: true },
      );
      if (refundedOrder) return refundedOrder;
    }
    return Order.findById(order._id);
  } catch (error) {
    console.error(`Unable to refund late payment for ${order.orderId}:`, error);
    throw error;
  }
};

const settleCapturedPayment = async (order, payment) => {
  if (
    payment.status !== "captured" ||
    payment.order_id !== order.razorpayOrderId
  ) {
    return Order.findById(order._id);
  }

  if (
    payment.amount !== Math.round(order.total * 100) ||
    payment.currency !== "INR"
  ) {
    const releasedOrder =
      (await failOnlineOrder(order)) || (await Order.findById(order._id));
    if (
      releasedOrder?.paymentStatus === "failed" &&
      releasedOrder.stockReservationStatus === "released"
    ) {
      return refundLatePayment(releasedOrder, payment);
    }
    return releasedOrder;
  }

  const paidOrder = await markOnlineOrderPaid(order._id, payment.id);
  if (paidOrder) {
    notifyAdmin(paidOrder);
    await notifyCustomer(paidOrder);
    return paidOrder;
  }

  const current = await Order.findById(order._id);
  if (current?.paymentStatus === "paid") return current;
  if (
    current?.paymentStatus === "failed" &&
    current.stockReservationStatus === "released"
  ) {
    return refundLatePayment(current, payment);
  }
  return current;
};

const failOnlineOrder = async (order) => releaseOnlineReservation(order._id);

// POST /api/orders
// body: { items: [{ productId, quantity, size, color }], shippingAddress, couponCode?, paymentMethod? }
// Prices, stock, shipping and totals are all calculated here, never taken from the browser.
export const createOrder = async (req, res) => {
  const reserved = new Map(); // productId -> quantity taken from stock
  let redeemedCode = null; // coupon use counted for this order
  let paymentMethod = req.body.paymentMethod || "cod";

  try {
    // Current fees, as set by the admin in the dashboard
    const pricing = await getPricing();
    const { platformFee: PLATFORM_FEE } = pricing;

    const { shippingAddress, couponCode } = req.body;

    const addressError = validateAddress(shippingAddress);
    if (addressError) {
      return res.status(400).json({ success: false, message: addressError });
    }

    if (!["cod", "online"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const lines = mergeLines(req.body.items);
    if (!lines.length) {
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty" });
    }

    const products = await Product.find({
      id: { $in: lines.map((l) => l.productId) },
    }).lean();

    const productMap = new Map(products.map((p) => [p.id, p]));

    const orderItems = [];
    const reservations = new Map();

    for (const line of lines) {
      const product = productMap.get(line.productId);

      if (!product) {
        return res.status(400).json({
          success: false,
          message: "Some items in your cart are no longer available",
        });
      }

      const sizes = product.variants?.sizes || [];
      const colours = product.variants?.colours || [];

      if (sizes.length && !sizes.includes(line.size)) {
        return res.status(400).json({
          success: false,
          message: `Please choose a valid size for ${product.name}`,
        });
      }

      if (colours.length && !colours.includes(line.color)) {
        return res.status(400).json({
          success: false,
          message: `Please choose a valid colour for ${product.name}`,
        });
      }

      const price = Number(product.price?.selling_price);

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: `Price unavailable for ${product.name}`,
        });
      }

      orderItems.push({
        productId: product.id,
        name: product.name,
        brand: product.brand || "",
        image: getImage(product, line.color),
        size: line.size,
        color: line.color,
        stockVariant: hasColorStock(product),
        price,
        mrp: Number(product.price?.mrp) || 0,
        quantity: line.quantity,
      });

      const colorInventory = hasColorStock(product);
      const stock = getColorStock(product, line.color);
      if (!stock.in_stock || stock.quantity < line.quantity) {
        return res.status(409).json({
          success: false,
          message: colorInventory
            ? `${product.name} (${line.color}) is out of stock or has fewer than ${line.quantity} left`
            : `${product.name} is out of stock or has fewer than ${line.quantity} left`,
        });
      }

      addReservation(
        reservations,
        product.id,
        colorInventory ? line.color : "",
        line.quantity,
        colorInventory,
      );
    }

    const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const { region: shippingRegion, shippingFee } = calculateShippingFee({
      address: shippingAddress,
      paymentMethod,
      subtotal,
      pricing,
    });

    let couponDiscount = 0;
    let appliedCode = null;

    if (couponCode) {
      try {
        const result = await getCouponDiscount(String(couponCode), subtotal);
        couponDiscount = Number(result.discountAmount) || 0;
        appliedCode = result.code;
      } catch (couponError) {
        return res.status(400).json({
          success: false,
          message: couponError.message || "Coupon could not be applied",
        });
      }
    }

    const total = Math.max(
      0,
      subtotal + shippingFee + PLATFORM_FEE - couponDiscount,
    );
    const orderId = generateOrderId();
    let razorpayOrder = null;

    if (paymentMethod === "online") {
      const amount = Math.round(total * 100);
      if (amount < 100) {
        return res.status(400).json({
          success: false,
          message: "Online payments must be at least ₹1",
        });
      }
      razorpayOrder = await getRazorpayClient().orders.create({
        amount,
        currency: "INR",
        receipt: orderId,
        notes: { orderId, customerId: String(req.customer.id) },
      });
    }

    // Take the stock; the filter makes sure two buyers can't both get the last item
    for (const [key, item] of reservations) {
      const product = productMap.get(item.id);
      const updated = await decrementProductStock(
        product,
        item.color,
        item.quantity,
        { useColorStock: item.useColorStock },
      );

      if (!updated) {
        await releaseStock(reserved);
        return res.status(409).json({
          success: false,
          message: "Some items just sold out. Please review your cart.",
        });
      }

      reserved.set(key, item);
    }

    // Count the coupon use atomically (checks status, expiry and usage limit again)
    if (appliedCode) {
      const redeemed = await redeemCoupon(appliedCode);

      if (!redeemed) {
        await releaseStock(reserved);
        reserved.clear();

        return res.status(400).json({
          success: false,
          message: "This coupon is no longer available",
        });
      }

      redeemedCode = appliedCode;
    }

    const a = shippingAddress;

    const order = await Order.create({
      orderId,
      customer: req.customer.id,
      items: orderItems,
      shippingAddress: {
        name: a.name.trim(),
        mobile: String(a.mobile).trim(),
        houseNumber: a.houseNumber?.trim() || "",
        address: a.address.trim(),
        locality: a.locality?.trim() || "",
        city: a.city.trim(),
        state: a.state.trim(),
        pinCode: String(a.pinCode).trim(),
      },
      subtotal,
      shippingRegion,
      shippingFee,
      platformFee: PLATFORM_FEE,
      couponCode: appliedCode,
      couponDiscount,
      total,
      paymentMethod,
      paymentStatus: "pending",
      razorpayOrderId: razorpayOrder?.id || null,
      stockReservationStatus:
        paymentMethod === "online" ? "reserved" : "committed",
      couponRedeemed: Boolean(appliedCode),
      orderStatus: "placed",
    });

    if (paymentMethod === "cod") {
      notifyAdmin(order);
      await notifyCustomer(order);
    }

    return res.status(201).json({
      success: true,
      message: paymentMethod === "cod" ? "Order placed" : "Payment initiated",
      order,
      ...(razorpayOrder && {
        razorpay: {
          keyId: process.env.RAZORPAY_KEY_ID,
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
        },
      }),
    });
  } catch (error) {
    const razorpayAuthenticationFailed =
      paymentMethod === "online" &&
      error.statusCode === 401 &&
      error.error?.code === "BAD_REQUEST_ERROR";
    if (razorpayAuthenticationFailed) {
      console.error(
        "Razorpay rejected the configured credentials. Confirm the backend key ID and key secret are a matching pair.",
      );
    } else {
      console.error("Create Order Error:", error);
    }

    try {
      await releaseStock(reserved); // give the stock back if saving failed

      if (redeemedCode) {
        await Coupon.updateOne(
          { code: redeemedCode },
          { $inc: { usedCount: -1 } },
        );
      }
    } catch (releaseError) {
      console.error("Rollback error:", releaseError);
    }

    return res.status(razorpayAuthenticationFailed ? 502 : 500).json({
      success: false,
      message: razorpayAuthenticationFailed
        ? "Razorpay rejected the backend credentials. Verify that the key ID and key secret are a matching pair in the backend environment."
        : "Server error",
    });
  }
};

export const verifyOnlinePayment = async (req, res) => {
  try {
    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: signature,
    } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are required",
      });
    }

    const order = await Order.findOne({
      razorpayOrderId,
      customer: req.customer.id,
      paymentMethod: "online",
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    getRazorpayClient();
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");
    if (!verifySignature(signature, expectedSignature)) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed",
      });
    }

    const payment = await getRazorpayClient().payments.fetch(razorpayPaymentId);
    if (payment.order_id !== razorpayOrderId || payment.status !== "captured") {
      return res.status(409).json({
        success: false,
        message: "Payment is not captured for this order",
      });
    }

    const updatedOrder = await settleCapturedPayment(order, payment);
    if (updatedOrder?.paymentStatus !== "paid") {
      return res.status(409).json({
        success: false,
        message:
          updatedOrder?.paymentStatus === "refunded"
            ? "The payment arrived after stock was released and has been refunded"
            : updatedOrder?.paymentStatus === "refunding"
              ? "The payment arrived after stock was released and its refund is processing"
              : updatedOrder?.paymentStatus === "failed"
                ? "The payment amount did not match and the order was cancelled"
                : "Payment could not be confirmed",
        order: updatedOrder,
      });
    }
    return res.status(200).json({
      success: true,
      message: "Payment verified",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Verify Razorpay payment error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
    });
  }
};

export const cancelOnlinePayment = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.id,
      customer: req.customer.id,
      paymentMethod: "online",
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.paymentStatus === "pending") {
      const capturedPayment = await findCapturedPayment(order.razorpayOrderId);
      if (capturedPayment) {
        const updatedOrder = await settleCapturedPayment(
          order,
          capturedPayment,
        );
        return res.status(200).json({
          success: updatedOrder?.paymentStatus === "paid",
          order: updatedOrder,
        });
      }
      const updatedOrder = await failOnlineOrder(order);
      const latestOrder = updatedOrder || (await Order.findById(order._id));
      return res.status(200).json({
        success: false,
        message: "Payment was cancelled",
        order: latestOrder,
      });
    }

    return res.status(200).json({
      success: order.paymentStatus === "paid",
      order,
    });
  } catch (error) {
    console.error("Cancel Razorpay payment error:", error);
    return res.status(502).json({
      success: false,
      message: "Unable to confirm payment status. Please check your orders.",
    });
  }
};

export const refreshOnlinePaymentStatus = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.id,
      customer: req.customer.id,
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (
      order.paymentMethod === "online" &&
      (order.paymentStatus === "pending" ||
        (order.paymentStatus === "failed" &&
          order.stockReservationStatus === "released"))
    ) {
      const payment = await findCapturedPayment(order.razorpayOrderId);
      if (payment) {
        const updatedOrder = await settleCapturedPayment(order, payment);
        return res.status(200).json({ success: true, order: updatedOrder });
      }
    }

    const latestOrder = await Order.findById(order._id).lean();
    return res.status(200).json({ success: true, order: latestOrder });
  } catch (error) {
    console.error("Refresh Razorpay payment status error:", error);
    return res.status(502).json({
      success: false,
      message: "Unable to confirm payment status. Please try again shortly.",
    });
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const suppliedSignature = req.get("x-razorpay-signature");
  if (!webhookSecret || !req.rawBody || !suppliedSignature) {
    return res.status(400).json({ success: false, message: "Invalid webhook" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(req.rawBody)
    .digest("hex");
  if (!verifySignature(suppliedSignature, expectedSignature)) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid signature" });
  }

  try {
    const event = req.body;
    if (event.event === "refund.processed") {
      const refund = event.payload?.refund?.entity;
      if (!refund?.payment_id) {
        return res.status(400).json({
          success: false,
          message: "Processed refund details are missing",
        });
      }
      await Order.updateOne(
        {
          razorpayPaymentId: refund.payment_id,
          paymentStatus: "refunding",
        },
        { $set: { paymentStatus: "refunded" } },
      );
      return res.status(200).json({ success: true });
    }

    if (event.event === "refund.failed") {
      const refund = event.payload?.refund?.entity;
      if (!refund?.payment_id) {
        return res.status(400).json({
          success: false,
          message: "Failed refund details are missing",
        });
      }
      console.error(`Razorpay refund failed for payment ${refund.payment_id}`);
      return res.status(200).json({ success: true });
    }

    if (event.event !== "payment.captured") {
      return res.status(200).json({ success: true, ignored: true });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id || payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Captured payment details are missing",
      });
    }
    const order = await Order.findOne({
      razorpayOrderId: payment.order_id,
      paymentMethod: "online",
    });
    if (!order) {
      return res.status(200).json({ success: true, ignored: true });
    }

    await settleCapturedPayment(order, payment);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Razorpay webhook processing error:", error);
    return res.status(500).json({ success: false, message: "Webhook failed" });
  }
};

export const expirePendingOnlinePayments = async () => {
  const expirationTime = new Date(Date.now() - 30 * 60 * 1000);
  const orders = await Order.find({
    paymentMethod: "online",
    paymentStatus: "pending",
    stockReservationStatus: "reserved",
    createdAt: { $lt: expirationTime },
  })
    .sort({ createdAt: 1 })
    .limit(100);

  for (const order of orders) {
    try {
      const capturedPayment = await findCapturedPayment(order.razorpayOrderId);
      if (capturedPayment) {
        await settleCapturedPayment(order, capturedPayment);
      } else {
        await failOnlineOrder(order);
      }
    } catch (error) {
      console.error(
        `Unable to expire pending payment for ${order.orderId}:`,
        error,
      );
    }
  }
};

// GET /api/orders  (only this customer's orders)
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.customer.id })
      .select(
        "-shipment.shiprocketOrderId -shipment.shipmentId -shipment.courierId -shipment.package -shipment.locked -shipment.lockedAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Get Orders Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/orders/:id  (_id or orderId, still limited to this customer)
export const getMyOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const filter = mongoose.isValidObjectId(id)
      ? { _id: id, customer: req.customer.id }
      : { orderId: id, customer: req.customer.id };

    const order = await Order.findOne(filter)
      .select(
        "-shipment.shiprocketOrderId -shipment.shipmentId -shipment.courierId -shipment.package -shipment.locked -shipment.lockedAt",
      )
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Get Order Error:", error);

    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getMyOrderTracking = async (req, res) => {
  let order;
  try {
    const { id } = req.params;
    const filter = mongoose.isValidObjectId(id)
      ? { _id: id, customer: req.customer.id }
      : { orderId: id, customer: req.customer.id };
    order = await Order.findOne(filter)
      .select(
        "orderId orderStatus paymentMethod paymentStatus shipment.shipmentId shipment.courierName shipment.awb shipment.status shipment.submissionState createdAt updatedAt",
      )
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const shipment = order.shipment || {};
    if (!shipment.shipmentId && !shipment.awb) {
      const submissionNeedsReview = ["submitting", "unknown"].includes(
        shipment.submissionState,
      );
      return res.status(200).json({
        success: true,
        tracking: {
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          courierName: "",
          awb: "",
          shipmentStatus: submissionNeedsReview
            ? "Shiprocket submission pending verification"
            : "Not sent to Shiprocket",
          timeline: [],
          trackingAvailable: false,
        },
      });
    }

    const endpoint = shipment.shipmentId
      ? `/courier/track/shipment/${shipment.shipmentId}`
      : `/courier/track/awb/${encodeURIComponent(shipment.awb)}`;
    const shiprocketResponse = await srFetch(endpoint);
    const trackingData =
      shiprocketResponse.tracking_data ??
      shiprocketResponse.data?.tracking_data ??
      shiprocketResponse.data ??
      shiprocketResponse;
    const shipmentTracks = Array.isArray(trackingData.shipment_track)
      ? trackingData.shipment_track
      : [];
    const latestTrack = shipmentTracks[0] || {};
    const awb =
      (typeof latestTrack.awb_code === "string" && latestTrack.awb_code) ||
      shipment.awb ||
      "";
    const courierName =
      (typeof latestTrack.courier_name === "string" &&
        latestTrack.courier_name) ||
      shipment.courierName ||
      "";
    const scans = Array.isArray(trackingData.shipment_track_activities)
      ? trackingData.shipment_track_activities
      : [];
    const timeline = scans
      .slice(0, 100)
      .map((scan) => {
        const timestamp = new Date(scan.date || scan.scan_date || "");
        return {
          status:
            (typeof scan.activity === "string" && scan.activity) ||
            (typeof scan.status === "string" && scan.status) ||
            "Shipment update",
          location: typeof scan.location === "string" ? scan.location : "",
          description:
            (typeof scan.activity === "string" && scan.activity) ||
            (typeof scan.status === "string" && scan.status) ||
            "",
          timestamp: Number.isNaN(timestamp.getTime())
            ? null
            : timestamp.toISOString(),
        };
      })
      .filter((scan) => scan.timestamp);
    const shipmentStatus =
      (typeof latestTrack.current_status === "string" &&
        latestTrack.current_status) ||
      (typeof trackingData.current_status === "string" &&
        trackingData.current_status) ||
      (awb
        ? shipment.status || "Tracking information not available yet"
        : "Courier assignment pending");
    const normalizedStatus = shipmentStatus
      .toLowerCase()
      .replace(/[_-]+/g, " ");
    let orderStatus = order.orderStatus;
    if (
      /\bdelivered\b/.test(normalizedStatus) &&
      !["cancelled", "refunded"].includes(orderStatus)
    ) {
      orderStatus = "delivered";
    } else if (
      /\b(out for delivery|picked up|pick up complete|shipped|in transit|dispatched)\b/.test(
        normalizedStatus,
      ) &&
      !["delivered", "cancelled", "refunded"].includes(orderStatus)
    ) {
      orderStatus = "shipped";
    }

    const update = {
      "shipment.status": shipmentStatus,
      orderStatus,
    };
    if (awb) update["shipment.awb"] = awb;
    if (courierName) update["shipment.courierName"] = courierName;
    if (
      orderStatus === "delivered" &&
      order.paymentMethod === "cod" &&
      order.paymentStatus === "pending"
    ) {
      update.paymentStatus = "paid";
    }
    await Order.updateOne({ _id: order._id }, { $set: update });

    return res.status(200).json({
      success: true,
      tracking: {
        orderId: order.orderId,
        orderStatus,
        paymentMethod: order.paymentMethod,
        paymentStatus: update.paymentStatus || order.paymentStatus,
        courierName,
        awb,
        shipmentStatus,
        timeline,
        trackingAvailable: Boolean(awb),
      },
    });
  } catch (error) {
    if (
      error instanceof ShiprocketApiError &&
      [400, 404].includes(error.status) &&
      order &&
      !order.shipment?.awb
    ) {
      return res.status(200).json({
        success: true,
        tracking: {
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          courierName: order.shipment?.courierName || "",
          awb: "",
          shipmentStatus: "Courier assignment pending",
          timeline: [],
          trackingAvailable: false,
        },
      });
    }
    console.error("Get order tracking error:", error.name, error.status || "");
    const status =
      error instanceof ShiprocketConfigurationError
        ? 503
        : error instanceof ShiprocketApiError
          ? 502
          : 500;
    return res.status(status).json({
      success: false,
      message:
        error instanceof ShiprocketConfigurationError ||
        error instanceof ShiprocketApiError
          ? error.message
          : "Unable to load order tracking",
    });
  }
};

const ORDER_STATUSES = [
  "placed",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunding", "refunded"];

export const getAdminOrders = async (_req, res) => {
  try {
    const orders = await Order.find()
      .populate("customer", "name email mobile")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Get admin orders error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch orders" });
  }
};

export const updateAdminOrder = async (req, res) => {
  const stockAdjustments = [];

  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    if (order.shipment?.locked) {
      return res.status(409).json({
        success: false,
        message: "Wait for the current shipment operation to finish.",
      });
    }

    const { orderStatus, paymentStatus, shippingAddress } = req.body;

    if (orderStatus !== undefined && !ORDER_STATUSES.includes(orderStatus)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order status" });
    }
    if (
      orderStatus !== undefined &&
      orderStatus !== order.orderStatus &&
      (order.shipment?.awb || order.shipment?.shipmentId)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Order status is controlled by the courier after an AWB is assigned.",
      });
    }
    if (
      shippingAddress !== undefined &&
      (order.shipment?.awb || order.shipment?.shipmentId)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Delivery details cannot be changed after a courier AWB has been assigned.",
      });
    }
    if (
      ["shipped", "delivered"].includes(orderStatus) &&
      orderStatus !== order.orderStatus
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Shipped and delivered statuses are updated by the courier webhook.",
      });
    }
    if (
      paymentStatus !== undefined &&
      !PAYMENT_STATUSES.includes(paymentStatus)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment status" });
    }
    if (
      paymentStatus !== undefined &&
      order.paymentMethod === "online" &&
      paymentStatus !== order.paymentStatus
    ) {
      return res.status(400).json({
        success: false,
        message: "Online payment status is managed by Razorpay verification",
      });
    }
    if (
      paymentStatus === "paid" &&
      order.paymentMethod === "cod" &&
      order.orderStatus !== "delivered"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Cash-on-delivery is marked paid when the courier confirms delivery.",
      });
    }
    if (
      paymentStatus !== undefined &&
      paymentStatus !== order.paymentStatus &&
      order.paymentMethod === "cod" &&
      order.orderStatus === "delivered"
    ) {
      return res.status(409).json({
        success: false,
        message: "Delivered COD payment status is confirmed by the courier.",
      });
    }
    if (
      order.paymentMethod === "online" &&
      order.paymentStatus === "pending" &&
      orderStatus !== undefined &&
      orderStatus !== order.orderStatus
    ) {
      return res.status(400).json({
        success: false,
        message: "Verify the online payment before changing the order status",
      });
    }
    if (
      order.paymentMethod === "online" &&
      order.stockReservationStatus === "released" &&
      orderStatus !== undefined &&
      orderStatus !== order.orderStatus
    ) {
      return res.status(400).json({
        success: false,
        message: "An online order with released stock cannot be reopened",
      });
    }
    if (
      order.paymentMethod === "online" &&
      order.paymentStatus === "paid" &&
      orderStatus === "cancelled"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Refund the online payment in Razorpay before cancelling this order",
      });
    }
    if (shippingAddress !== undefined) {
      const addressError = validateAddress(shippingAddress);
      if (addressError) {
        return res.status(400).json({ success: false, message: addressError });
      }
      order.shippingAddress = {
        name: shippingAddress.name.trim(),
        mobile: String(shippingAddress.mobile).trim(),
        houseNumber: shippingAddress.houseNumber?.trim() || "",
        address: shippingAddress.address.trim(),
        locality: shippingAddress.locality?.trim() || "",
        city: shippingAddress.city.trim(),
        state: shippingAddress.state.trim(),
        pinCode: String(shippingAddress.pinCode).trim(),
      };
    }

    const wasCancelled = order.orderStatus === "cancelled";
    const willBeCancelled =
      orderStatus === undefined ? wasCancelled : orderStatus === "cancelled";
    const reserved = [];

    if (!wasCancelled && willBeCancelled) {
      for (const item of getReservedQuantities(order.items).values()) {
        const productBeforeUpdate = await Product.findOne({ id: item.id })
          .select("stock")
          .lean();
        if (productBeforeUpdate) {
          await restoreProductStock(item.id, item.color, item.quantity, {
            useColorStock: item.useColorStock,
          });
          stockAdjustments.push({
            ...item,
            operation: "release",
            wasAvailable: productBeforeUpdate.stock?.in_stock,
          });
        }
      }
    } else if (wasCancelled && !willBeCancelled) {
      for (const item of getReservedQuantities(order.items).values()) {
        const product = await Product.findOne({ id: item.id })
          .select("id stock variants.colorStock")
          .lean();
        const updated =
          product &&
          (await decrementProductStock(product, item.color, item.quantity, {
            useColorStock: item.useColorStock,
          }));
        if (!updated) {
          for (const previous of reserved) {
            await restoreProductStock(
              previous.id,
              previous.color,
              previous.quantity,
              { useColorStock: previous.useColorStock },
            );
          }
          stockAdjustments.length = 0;
          return res.status(409).json({
            success: false,
            message:
              "This order cannot be reopened because there is not enough stock",
          });
        }
        reserved.push(item);
        stockAdjustments.push({ ...item, operation: "reserve" });
      }
    }

    if (orderStatus !== undefined) order.orderStatus = orderStatus;
    if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;
    await order.save();
    stockAdjustments.length = 0;

    const updated = await Order.findById(order._id)
      .populate("customer", "name email mobile")
      .lean();
    return res.status(200).json({ success: true, order: updated });
  } catch (error) {
    try {
      for (const adjustment of stockAdjustments.reverse()) {
        if (adjustment.operation === "release") {
          const product = {
            id: adjustment.id,
            variants: {
              colorStock: [{ color: adjustment.color }],
            },
          };
          await decrementProductStock(
            product,
            adjustment.color,
            adjustment.quantity,
            {
              useColorStock: adjustment.useColorStock,
              requireAvailable: false,
              inStockAfter: adjustment.wasAvailable ?? true,
            },
          );
        } else {
          await restoreProductStock(
            adjustment.id,
            adjustment.color,
            adjustment.quantity,
            { useColorStock: adjustment.useColorStock },
          );
        }
      }
    } catch (rollbackError) {
      console.error("Order stock rollback error:", rollbackError);
    }
    console.error("Update admin order error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update order" });
  }
};

export const deleteAdminOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    if (order.orderStatus !== "cancelled") {
      return res.status(409).json({
        success: false,
        message: "Cancel the order first so its stock reservation is released",
      });
    }
    if (
      order.shipment?.locked ||
      order.shipment?.awb ||
      order.shipment?.shipmentId
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Orders with an active shipment cannot be deleted because they are needed for shipment processing and tracking.",
      });
    }
    const deleted = await Order.findOneAndDelete({
      _id: order._id,
      "shipment.locked": { $ne: true },
      "shipment.awb": { $in: ["", null] },
      "shipment.shipmentId": { $in: [null] },
    });
    if (!deleted) {
      return res.status(409).json({
        success: false,
        message: "A shipment operation started; this order cannot be deleted.",
      });
    }
    return res.status(200).json({ success: true, message: "Order deleted" });
  } catch (error) {
    console.error("Delete admin order error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete order" });
  }
};
