import Razorpay from "razorpay";

let client;

export const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  if (!client) {
    client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  return client;
};
