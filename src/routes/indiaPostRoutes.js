
import express from "express";

const router = express.Router();

const INDIA_POST_BASE_URL =
  "https://test.cept.gov.in/beextcustomer";

// BOOKING WEBHOOK
router.post("/webhook/booking", (req, res) => {
  console.log("India Post Booking Webhook Received!");
  console.log("Payload:", req.body);

  return res.status(200).json({
    success: true,
    message: "Booking webhook received successfully",
  });
});

// TRACKING WEBHOOK
router.post("/webhook/events", (req, res) => {
  console.log("India Post Tracking Event Received!");
  console.log("Payload:", req.body);

  return res.status(200).json({
    success: true,
    message: "Tracking webhook received successfully",
  });
});

// INDIA POST UAT LOGIN
router.post("/login", async (req, res) => {
  const {
    INDIA_POST_USERNAME,
    INDIA_POST_PASSWORD,
  } = process.env;

  if (!INDIA_POST_USERNAME || !INDIA_POST_PASSWORD) {
    return res.status(500).json({
      success: false,
      message: "India Post credentials missing in .env",
    });
  }

  try {
    console.log("Connecting to India Post UAT...");

    const response = await fetch(
      `${INDIA_POST_BASE_URL}/v1/access/login`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: INDIA_POST_USERNAME,
          password: INDIA_POST_PASSWORD,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        message: "Invalid response from India Post",
        upstreamStatus: response.status,
      });
    }

    console.log("India Post HTTP Status:", response.status);

    if (!response.ok || !data.success) {
      return res.status(response.ok ? 401 : response.status).json({
        success: false,
        message: data.message || "India Post login failed",
      });
    }

    const accessToken = data.data?.access_token;
    const refreshToken = data.data?.refresh_token;

    if (!accessToken) {
      return res.status(502).json({
        success: false,
        message: "Access token not received",
      });
    }

    console.log("India Post authentication successful!");

    return res.status(200).json({
      success: true,
      message: "India Post UAT authentication successful",
      tokenReceived: true,
      refreshTokenReceived: Boolean(refreshToken),
      expiresIn: data.data?.expires_in ?? null,
      refreshExpiresIn: data.data?.refresh_expires_in ?? null,
    });

  } catch (error) {
    console.error("India Post connection error:", error.message);
    console.error("Error code:", error.cause?.code);

    const timeout =
      error.name === "TimeoutError" ||
      error.name === "AbortError";

    return res.status(timeout ? 504 : 502).json({
      success: false,
      message: timeout
        ? "India Post request timed out"
        : "Could not connect to India Post",
      code: error.cause?.code || error.code || null,
    });
  }
});

export default router;
