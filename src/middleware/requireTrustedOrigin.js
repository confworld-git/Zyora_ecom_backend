const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const isTrustedOrigin = (req) => {
  if (!unsafeMethods.has(req.method)) {
    return true;
  }

  const frontendUrl = process.env.FRONTEND_URL;
  let trustedOrigin;

  try {
    trustedOrigin = frontendUrl ? new URL(frontendUrl).origin : null;
  } catch {
    trustedOrigin = null;
  }

  const origin = req.get("origin");
  let requestOrigin = origin;
  if (!requestOrigin) {
    const referer = req.get("referer");
    if (referer) {
      try {
        requestOrigin = new URL(referer).origin;
      } catch {
        requestOrigin = null;
      }
    }
  }

  return Boolean(trustedOrigin && requestOrigin === trustedOrigin);
};

const requireTrustedOrigin = (req, res, next) => {
  if (isTrustedOrigin(req)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Request origin is not allowed",
  });
};

export default requireTrustedOrigin;
