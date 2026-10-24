// utils/whatsappAlert.js  (ES module, Node 18+ because it uses the built-in fetch)
// Sends a WhatsApp template message to the admin when an order is placed.

const GRAPH_VERSION = () => process.env.WA_GRAPH_VERSION || "v21.0"; // use the latest version shown in Meta's docs
const TEMPLATE_NAME = () => process.env.WA_TEMPLATE_NAME || "new_order_alert";

// Template variables must not contain newlines, tabs, or 4+ spaces in a row
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim() || "-";

const titleCase = (s = "") =>
  String(s).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

let warned = false;

export async function sendAdminWhatsApp(orderInput, attempt = 1) {
  const { WA_TOKEN, WA_PHONE_NUMBER_ID, ADMIN_WHATSAPP } = process.env;

  // Not configured yet: skip quietly so email alerts keep working on their own
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID || !ADMIN_WHATSAPP) {
    if (!warned) {
      console.warn("WhatsApp alert skipped: set WA_TOKEN, WA_PHONE_NUMBER_ID and ADMIN_WHATSAPP in .env");
      warned = true;
    }
    return;
  }

  try {
    const o = typeof orderInput.toObject === "function" ? orderInput.toObject() : orderInput;
    const a = o.shippingAddress || {};
    const payment = o.paymentMethod === "cod" ? "COD" : "Prepaid";

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION()}/${WA_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: String(ADMIN_WHATSAPP).replace(/\D/g, ""), // digits only, with country code
          type: "template",
          template: {
            name: TEMPLATE_NAME(),
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: clean(o.orderId) }, // {{1}}
                  { type: "text", text: clean(inr(o.total)) }, // {{2}}
                  { type: "text", text: payment }, // {{3}}
                  { type: "text", text: clean(`${titleCase(a.name)}, ${titleCase(a.city)}`) }, // {{4}}
                ],
              },
            ],
          },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("WhatsApp API error:", JSON.stringify(err.error || err));
      // Retry only temporary failures (server errors / rate limit)
      if ((res.status >= 500 || res.status === 429) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        return sendAdminWhatsApp(orderInput, attempt + 1);
      }
    }
  } catch (err) {
    console.error("WhatsApp send failed:", err.message); // never break the order flow
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return sendAdminWhatsApp(orderInput, attempt + 1);
    }
  }
}