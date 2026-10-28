import mongoose from "mongoose";
import Order from "../schemas/Order.js";
import {
  createOrderInvoiceHtml,
  createShippingLabelHtml,
} from "../utils/orderDocuments.js";

const safeFilename = (orderId, suffix, extension = "html") =>
  `${String(orderId || "order").replace(/[^a-zA-Z0-9_-]/g, "-")}-${suffix}.${extension}`;

const sendHtml = (res, order, suffix, createHtml) => {
  res.set({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `inline; filename="${safeFilename(order.orderId, suffix, "html")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  return res.send(createHtml(order));
};

const findOrder = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Order.findById(id).populate("customer", "name email mobile").lean();
};

export const getAdminOrderInvoice = async (req, res) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    return sendHtml(res, order, "invoice", createOrderInvoiceHtml);
  } catch (error) {
    console.error("Admin order invoice rendering failed:", error);
    return res
      .status(500)
      .json({ success: false, message: "Unable to render order invoice" });
  }
};

export const getAdminShippingLabel = async (req, res) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    return sendHtml(res, order, "address-label", createShippingLabelHtml);
  } catch (error) {
    console.error("Admin shipping label rendering failed:", error);
    return res
      .status(500)
      .json({ success: false, message: "Unable to render shipping label" });
  }
};

export const getCustomerOrderInvoice = async (req, res) => {
  try {
    const filter = mongoose.isValidObjectId(req.params.id)
      ? { _id: req.params.id, customer: req.customer.id }
      : { orderId: req.params.id, customer: req.customer.id };
    const order = await Order.findOne(filter)
      .populate("customer", "name email mobile")
      .lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    return sendHtml(res, order, "invoice", createOrderInvoiceHtml);
  } catch (error) {
    console.error("Customer order invoice rendering failed:", error);
    return res
      .status(500)
      .json({ success: false, message: "Unable to render order invoice" });
  }
};
