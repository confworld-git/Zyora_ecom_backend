import jwt from "jsonwebtoken";
import Customer from "../schemas/Customer.js";
import { isTrustedOrigin } from "./requireTrustedOrigin.js";

const customerAuthMiddleware = async (req, res, next) => {
  if (!isTrustedOrigin(req)) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed",
    });
  }

  const token = req.cookies?.zyora_customer_token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Customer authentication required",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      audience: "zyora-customer",
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired customer session",
    });
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    decoded.role !== "customer" ||
    typeof decoded.id !== "string" ||
    typeof decoded.customerId !== "string"
  ) {
    return res.status(403).json({
      success: false,
      message: "Customer access required",
    });
  }

  const customer = await Customer.findById(decoded.id)
    .select("_id customerId")
    .lean();
  if (
    !customer ||
    decoded.customerId !== customer.customerId
  ) {
    return res.status(401).json({
      success: false,
      message: "Customer session is no longer valid",
    });
  }

  req.customer = decoded;
  return next();
};

export default customerAuthMiddleware;