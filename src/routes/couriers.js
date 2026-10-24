import { Router } from "express";
import {
  ShiprocketApiError,
  ShiprocketConfigurationError,
  srFetch,
} from "../config/shiprocket.js";
import authMiddleware from "../middleware/authMiddleware.js";
import Order from "../schemas/Order.js";

const router = Router();
const PIN = /^\d{6}$/;
const MAX_PACKAGE_DIMENSION_CM = 500;
const MAX_PACKAGE_WEIGHT_KG = 100;
const DEFAULT_PACKAGE = {
  length: 10,
  breadth: 10,
  height: 10,
  weight: 0.5,
};
const REQUEST_LOCK_MS = 10 * 60 * 1000;

const readText = (value, maxLength) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const positiveDecimal = (raw) => {
  if (typeof raw !== "number" && typeof raw !== "string") return Number.NaN;
  const value = String(raw).trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return Number.NaN;
  return Number(value);
};

const getDefaultPackage = () => {
  const packageValues = [
    ["SHIPROCKET_DEFAULT_PACKAGE_LENGTH_CM", DEFAULT_PACKAGE.length],
    ["SHIPROCKET_DEFAULT_PACKAGE_BREADTH_CM", DEFAULT_PACKAGE.breadth],
    ["SHIPROCKET_DEFAULT_PACKAGE_HEIGHT_CM", DEFAULT_PACKAGE.height],
    ["SHIPROCKET_DEFAULT_PACKAGE_WEIGHT_KG", DEFAULT_PACKAGE.weight],
  ].map(([key, defaultValue]) => {
    const configuredValue = process.env[key];
    return positiveDecimal(
      configuredValue == null || configuredValue.trim() === ""
        ? defaultValue
        : configuredValue,
    );
  });
  const [length, breadth, height, weight] = packageValues;

  if (
    [length, breadth, height, weight].some(
      (value) => !Number.isFinite(value) || value <= 0,
    ) ||
    [length, breadth, height].some(
      (value) => value > MAX_PACKAGE_DIMENSION_CM,
    ) ||
    weight > MAX_PACKAGE_WEIGHT_KG
  ) {
    throw new ShiprocketConfigurationError(
      "Set valid default Shiprocket package dimensions (up to 500 cm) and weight (up to 100 kg).",
    );
  }
  return { length, breadth, height, weight };
};

const getPickupSettings = () => {
  const pincode = process.env.SHIPROCKET_PICKUP_PINCODE;
  const location = process.env.SHIPROCKET_PICKUP_LOCATION;
  if (!PIN.test(pincode || "") || !location?.trim()) {
    throw new ShiprocketConfigurationError(
      "Shiprocket pickup location and a valid pickup PIN code must be configured.",
    );
  }
  return { pincode, location: location.trim() };
};

const assertSuccessfulResponse = (data) => {
  const statusCode = Number(data?.status_code);
  const responseStatus =
    typeof data?.status === "string" ? data.status.toLowerCase() : data?.status;
  if (
    !data ||
    responseStatus === false ||
    responseStatus === "error" ||
    (statusCode >= 400 && statusCode < 600)
  ) {
    throw new ShiprocketApiError(
      "Shiprocket rejected the requested operation.",
      statusCode >= 400 && statusCode < 600 ? statusCode : 422,
    );
  }
};

const sendShiprocketError = (res, operation, error) => {
  console.error(
    `Shiprocket ${operation} failed:`,
    error.name,
    error.status || "",
  );
  const status =
    error instanceof ShiprocketConfigurationError
      ? 503
      : error instanceof ShiprocketApiError
        ? 502
        : 500;
  return res.status(status).json({
    success: false,
    error:
      error instanceof ShiprocketConfigurationError ||
      error instanceof ShiprocketApiError
        ? error.message
        : "Unable to complete the Shiprocket request.",
  });
};

router.use("/admin", authMiddleware);

router.get("/admin/couriers", async (_req, res) => {
  try {
    const data = await srFetch("/courier/courierListWithCounts?type=active");
    assertSuccessfulResponse(data);
    const couriers = data?.courier_data;
    if (!Array.isArray(couriers)) {
      throw new ShiprocketApiError(
        "Shiprocket returned an invalid courier list response.",
      );
    }
    return res.json({
      couriers: couriers
        .filter(
          (courier) =>
            courier &&
            typeof courier === "object" &&
            Number.isSafeInteger(Number(courier.id)) &&
            Number(courier.id) > 0,
        )
        .map((courier) => ({
          id: Number(courier.id),
          name: readText(courier.name, 120),
          company: readText(courier.master_company, 120),
          tracking: readText(courier.realtime_tracking, 80),
          pod: readText(courier.pod_available, 80),
          callBefore: readText(courier.call_before_delivery, 80),
        })),
    });
  } catch (error) {
    return sendShiprocketError(res, "courier list", error);
  }
});

router.post("/admin/orders/:id/send", async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, error: "Invalid order ID." });
  }

  let order;
  let createRequestStarted = false;
  let submissionPersisted = false;
  let submissionRejected = false;
  try {
    const packageDetails = getDefaultPackage();
    const staleLockBefore = new Date(Date.now() - REQUEST_LOCK_MS);
    order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        orderStatus: {
          $nin: ["cancelled", "refunded", "shipped", "delivered"],
        },
        "shipment.shipmentId": { $in: [null] },
        "shipment.shiprocketOrderId": { $in: [null] },
        $or: [
          { "shipment.locked": { $ne: true } },
          {
            $and: [
              { "shipment.lockedAt": { $lt: staleLockBefore } },
              {
                "shipment.submissionState": {
                  $nin: ["submitting", "unknown"],
                },
              },
            ],
          },
        ],
      },
      {
        $set: {
          "shipment.locked": true,
          "shipment.lockedAt": new Date(),
        },
      },
      { new: true },
    ).populate("customer", "email");

    if (!order) {
      const existing = await Order.findById(req.params.id)
        .select(
          "shipment.shipmentId shipment.shiprocketOrderId shipment.submissionState",
        )
        .lean();
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, error: "Order not found." });
      }
      if (
        existing.shipment?.shipmentId ||
        existing.shipment?.shiprocketOrderId
      ) {
        return res.status(409).json({
          success: false,
          error: "This order has already been sent to Shiprocket.",
        });
      }
      if (
        ["submitting", "unknown"].includes(existing.shipment?.submissionState)
      ) {
        return res.status(409).json({
          success: false,
          error:
            "A previous Shiprocket submission could not be confirmed. Verify the order in Shiprocket before retrying.",
        });
      }
      return res.status(409).json({
        success: false,
        error:
          "This order cannot be sent right now; another request may be processing it or its status is not eligible.",
      });
    }

    if (order.paymentMethod === "online" && order.paymentStatus !== "paid") {
      return res.status(409).json({
        success: false,
        error: "Online payment must be confirmed before sending the order.",
      });
    }
    if (order.paymentMethod === "cod" && order.paymentStatus !== "pending") {
      return res.status(409).json({
        success: false,
        error: "This COD order is not in a sendable payment state.",
      });
    }
    if (!["cod", "online"].includes(order.paymentMethod)) {
      return res.status(409).json({
        success: false,
        error: "This order has an unsupported payment method.",
      });
    }
    if (!order.customer?.email) {
      return res.status(409).json({
        success: false,
        error: "A customer email is required before sending this order.",
      });
    }

    const address = order.shippingAddress;
    if (!PIN.test(address?.pinCode || "")) {
      return res.status(400).json({
        success: false,
        error: "The order has an invalid delivery PIN code.",
      });
    }
    const { pincode: pickupPincode, location: pickupLocation } =
      getPickupSettings();

    order.shipment.submissionState = "submitting";
    await order.save();

    createRequestStarted = true;
    const created = await srFetch("/orders/create/adhoc", {
      method: "POST",
      body: {
        order_id: order.orderId,
        order_date: new Date(order.createdAt)
          .toISOString()
          .slice(0, 16)
          .replace("T", " "),
        pickup_location: pickupLocation,
        billing_customer_name: address.name,
        billing_last_name: "",
        billing_address: [
          address.houseNumber,
          address.address,
          address.locality,
        ]
          .filter(Boolean)
          .join(", "),
        billing_city: address.city,
        billing_pincode: address.pinCode,
        billing_state: address.state,
        billing_country: "India",
        billing_email: order.customer.email,
        billing_phone: address.mobile,
        shipping_is_billing: true,
        order_items: order.items.map((item) => ({
          name: item.name,
          sku: String(item.productId),
          units: item.quantity,
          selling_price: item.price,
        })),
        payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
        sub_total: order.subtotal,
        ...packageDetails,
      },
    });
    assertSuccessfulResponse(created);

    const shiprocketOrderId = Number(created.order_id);
    const shipmentId = Number(created.shipment_id);
    if (
      !Number.isSafeInteger(shiprocketOrderId) ||
      shiprocketOrderId <= 0 ||
      !Number.isSafeInteger(shipmentId) ||
      shipmentId <= 0
    ) {
      throw new ShiprocketApiError(
        "Shiprocket did not return valid order and shipment IDs.",
      );
    }

    order.shipment.shiprocketOrderId = shiprocketOrderId;
    order.shipment.shipmentId = shipmentId;
    order.shipment.submissionState = "sent";
    order.shipment.package = packageDetails;
    order.shipment.status = "Sent to Shiprocket; courier assignment pending";
    order.orderStatus = "confirmed";
    order.shipment.locked = false;
    order.shipment.lockedAt = null;
    await order.save();
    submissionPersisted = true;

    const savedOrder = await Order.findById(order._id)
      .populate("customer", "name email mobile")
      .lean();
    if (!savedOrder) {
      throw new Error(
        "Order was sent to Shiprocket but could not be reloaded.",
      );
    }
    if (savedOrder?.shipment) {
      savedOrder.shipment.locked = false;
      savedOrder.shipment.lockedAt = null;
    }
    return res.status(201).json({
      success: true,
      order: savedOrder,
      message:
        "Order sent to Shiprocket. Tracking will be available after a courier is assigned and an AWB is issued.",
    });
  } catch (error) {
    submissionRejected =
      createRequestStarted &&
      error instanceof ShiprocketApiError &&
      error.status >= 400 &&
      error.status < 500;
    if (createRequestStarted && !submissionPersisted) {
      if (submissionRejected) {
        return sendShiprocketError(res, "order submission", error);
      }
      return res.status(502).json({
        success: false,
        error:
          "Shiprocket's response could not be confirmed. Verify the order in Shiprocket before retrying; automatic resubmission is blocked to prevent duplicates.",
      });
    }
    return sendShiprocketError(res, "order submission", error);
  } finally {
    if (order?._id && !createRequestStarted) {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            "shipment.locked": false,
            "shipment.lockedAt": null,
            "shipment.submissionState": "not_sent",
          },
        },
      ).catch((error) => {
        console.error(
          "Unable to release Shiprocket submission lock:",
          error.name,
        );
      });
    } else if (order?._id && createRequestStarted && !submissionPersisted) {
      const shipmentUpdate = submissionRejected
        ? {
            "shipment.locked": false,
            "shipment.lockedAt": null,
            "shipment.submissionState": "not_sent",
          }
        : {
            "shipment.locked": true,
            "shipment.lockedAt": new Date(),
            "shipment.submissionState": "unknown",
          };
      await Order.updateOne({ _id: order._id }, { $set: shipmentUpdate }).catch(
        (error) => {
          console.error(
            "Unable to update Shiprocket submission state:",
            error.name,
          );
        },
      );
    }
  }
});

export default router;
