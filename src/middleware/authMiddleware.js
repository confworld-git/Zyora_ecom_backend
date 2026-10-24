import jwt from "jsonwebtoken";
import Admin from "../schemas/Admin.js";
import { isTrustedOrigin } from "./requireTrustedOrigin.js";

const authMiddleware = async (req, res, next) => {
  if (!isTrustedOrigin(req)) {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed",
    });
  }

  const token = req.cookies?.zyora_token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      audience: "zyora-admin",
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    decoded.role !== "admin" ||
    typeof decoded.id !== "string"
  ) {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  const admin = await Admin.findById(decoded.id).select("_id role").lean();
  if (!admin || admin.role !== "admin") {
    return res.status(401).json({
      success: false,
      message: "Admin session is no longer valid",
    });
  }

  req.admin = decoded;
  return next();
};

export default authMiddleware;
