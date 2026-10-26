import { sendEmail } from "../utils/emailService.js";
import Customer from "../schemas/Customer.js";

const BRAND = "ZYORA";
const getAdminUrl = () =>
  (process.env.FRONTEND_URL || "https://zyora-ecom.vercel.app").replace(
    /\/+$/,
    "",
  );

const esc = (v = "") =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const titleCase = (s = "") =>
  String(s).replace(
    /\w\S*/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );

const formatIST = (d) =>
  new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) + " IST";

export function buildAdminOrderEmail(orderInput, opts = {}) {
  const o =
    typeof orderInput.toObject === "function"
      ? orderInput.toObject()
      : orderInput;
  const customerId = opts.customerId || o.customerId || "";
  const a = o.shippingAddress || {};
  const isCod = o.paymentMethod === "cod";
  const itemCount = o.items.reduce((n, i) => n + i.quantity, 0);
  const mrpTotal = o.items.reduce(
    (n, i) => n + (i.mrp || i.price) * i.quantity,
    0,
  );
  const savings = Math.max(0, mrpTotal - o.subtotal);
  const adminLink = `${getAdminUrl()}/Dashboard?section=orders&orderId=${encodeURIComponent(o.orderId)}`;

  const addressLines = [
    [a.houseNumber, a.address].filter(Boolean).join(", "),
    a.locality,
    [titleCase(a.city), titleCase(a.state)].filter(Boolean).join(", "),
    a.pinCode,
  ].filter(Boolean);

  // Subject: the 3 things admin needs in the inbox preview
  const subject = `New order ${o.orderId} · ${inr(o.total)} · ${isCod ? "COD" : "Prepaid"}`;
  const preheader = `${itemCount} item${itemCount > 1 ? "s" : ""} for ${titleCase(a.name)} in ${titleCase(a.city)}. ${
    isCod ? `Collect ${inr(o.total)} on delivery.` : "Payment received."
  }`;

  // Payment banner colours
  const banner = isCod
    ? {
        bg: "#FFF7E6",
        border: "#F5A623",
        text: "#8A5A00",
        title: "CASH ON DELIVERY",
        note: `Collect ${inr(o.total)} at delivery`,
      }
    : {
        bg: "#E8F7EE",
        border: "#2E9E5B",
        text: "#176B3A",
        title: "PREPAID",
        note: `Payment status: ${esc(o.paymentStatus)}`,
      };

  const itemRows = o.items
    .map(
      (i) => `
      <tr>
        <td width="72" valign="top" style="padding:12px 12px 12px 0;border-bottom:1px solid #EEE;">
          <img src="${esc(i.image)}" width="64" height="64" alt="${esc(i.name)}"
               style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #EEE;background:#F4F4F4;">
        </td>
        <td valign="top" style="padding:12px 0;border-bottom:1px solid #EEE;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:11px;letter-spacing:.5px;color:#888;text-transform:uppercase;">${esc(i.brand)}</div>
          <div style="font-size:14px;font-weight:bold;color:#111;line-height:1.35;">${esc(i.name)}</div>
          <div style="font-size:12px;color:#666;margin-top:3px;">Size: <b>${esc(i.size)}</b> &nbsp;|&nbsp; Color: <b>${esc(i.color)}</b></div>
          <div style="font-size:11px;color:#999;margin-top:3px;">SKU: ${esc(i.productId)}</div>
        </td>
        <td valign="top" align="right" style="padding:12px 0 12px 8px;border-bottom:1px solid #EEE;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;">
          <div style="font-size:13px;color:#444;">${inr(i.price)} × <b>${i.quantity}</b></div>
          ${i.mrp > i.price ? `<div style="font-size:11px;color:#999;text-decoration:line-through;">${inr(i.mrp)}</div>` : ""}
          <div style="font-size:14px;font-weight:bold;color:#111;margin-top:2px;">${inr(i.price * i.quantity)}</div>
        </td>
      </tr>`,
    )
    .join("");

  const totalsRow = (label, value, strong = false, color = "#444") => `
      <tr>
        <td style="padding:4px 0;font-size:${strong ? 15 : 13}px;color:${color};${strong ? "font-weight:bold;" : ""}">${label}</td>
        <td align="right" style="padding:4px 0;font-size:${strong ? 15 : 13}px;color:${color};${strong ? "font-weight:bold;" : ""}">${value}</td>
      </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F2F3F5;">
<!-- preheader (hidden inbox preview text) -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#F2F3F5;">${esc(preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F3F5;">
<tr><td align="center" style="padding:20px 10px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0"
         style="width:100%;max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">

    <!-- header -->
    <tr><td style="background:#111827;padding:18px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:18px;font-weight:bold;letter-spacing:2px;color:#FFFFFF;">${BRAND}</td>
        <td align="right" style="font-size:12px;font-weight:bold;color:#9CA3AF;">Admin alert</td>
      </tr></table>
    </td></tr>

    <!-- title -->
    <tr><td style="padding:24px 24px 8px 24px;">
      <div style="font-size:22px;font-weight:bold;color:#111;">🛒 New order received</div>
      <div style="font-size:13px;color:#666;margin-top:6px;">
        <b style="color:#111;">${esc(o.orderId)}</b><br>
        ${esc(formatIST(o.createdAt))}
      </div>
    </td></tr>

    <!-- payment banner -->
    <tr><td style="padding:12px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:${banner.bg};border-left:4px solid ${banner.border};border-radius:6px;">
        <tr><td style="padding:12px 14px;">
          <div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:${banner.text};">${banner.title}</div>
          <div style="font-size:16px;font-weight:bold;color:${banner.text};margin-top:2px;">${banner.note}</div>
        </td></tr>
      </table>
    </td></tr>

    <!-- action button -->
    <tr><td align="center" style="padding:8px 24px 16px 24px;">
      <a href="${esc(adminLink)}"
         style="display:inline-block;background:#0F766E;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 28px;border-radius:8px;">
        Open order in admin panel
      </a>
    </td></tr>

    <!-- items -->
    <tr><td style="padding:8px 24px 0 24px;">
      <div style="font-size:13px;font-weight:bold;letter-spacing:1px;color:#6B7280;text-transform:uppercase;padding-bottom:4px;">
        Items (${itemCount})
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
    </td></tr>

    <!-- totals -->
    <tr><td style="padding:12px 24px 4px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;">
        ${totalsRow("Subtotal", inr(o.subtotal))}
        ${o.couponDiscount > 0 ? totalsRow(`Coupon (${esc(o.couponCode)})`, `− ${inr(o.couponDiscount)}`, false, "#176B3A") : ""}
        ${totalsRow("Shipping fee", o.shippingFee ? inr(o.shippingFee) : "Free")}
        ${totalsRow("Platform fee", inr(o.platformFee))}
        <tr><td colspan="2" style="border-top:2px solid #111;padding-top:6px;"></td></tr>
        ${totalsRow(isCod ? "Total to collect" : "Order total", inr(o.total), true, "#111")}
        ${savings > 0 ? `<tr><td colspan="2" style="padding-top:4px;font-size:12px;color:#176B3A;">Customer saved ${inr(savings)}</td></tr>` : ""}
      </table>
    </td></tr>

    <!-- ship to -->
    <tr><td style="padding:20px 24px 8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;">
        <tr><td style="padding:14px 16px;">
          <div style="font-size:13px;font-weight:bold;letter-spacing:1px;color:#6B7280;text-transform:uppercase;">Ship to</div>
          <div style="font-size:15px;font-weight:bold;color:#111;margin-top:6px;">${esc(titleCase(a.name))}</div>
          <div style="font-size:13px;color:#374151;line-height:1.55;margin-top:2px;">
            ${addressLines.map(esc).join("<br>")}
          </div>
          <div style="margin-top:10px;">
            <a href="tel:+91${esc(a.mobile)}"
               style="display:inline-block;font-size:13px;font-weight:bold;color:#0F766E;text-decoration:none;border:1px solid #0F766E;border-radius:6px;padding:6px 12px;">
              📞 ${esc(a.mobile)}
            </a>
          </div>
        </td></tr>
      </table>
    </td></tr>

    <!-- order meta -->
    <tr><td style="padding:12px 24px 20px 24px;font-size:12px;color:#6B7280;line-height:1.7;">
      Payment: <b style="color:#111;">${esc(String(o.paymentMethod).toUpperCase())}</b> (${esc(o.paymentStatus)})
      &nbsp;|&nbsp; Status: <b style="color:#111;">${esc(o.orderStatus)}</b><br>
      Customer ID: ${esc(customerId)}
    </td></tr>

    <!-- footer -->
    <tr><td style="background:#F9FAFB;padding:14px 24px;font-size:11px;color:#9CA3AF;text-align:center;border-top:1px solid #E5E7EB;">
      Automated alert from ${BRAND}. Process this order within your fulfilment SLA.
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

  // Plain-text fallback (also improves spam score)
  const text = [
    `NEW ORDER ${o.orderId}`,
    formatIST(o.createdAt),
    isCod
      ? `*** CASH ON DELIVERY: collect ${inr(o.total)} ***`
      : `PREPAID (${o.paymentStatus})`,
    "",
    "ITEMS",
    ...o.items.map(
      (i) =>
        `- ${i.name} (${i.brand}) | Size ${i.size} | ${i.color} | ${i.quantity} x ${inr(i.price)} = ${inr(i.price * i.quantity)}`,
    ),
    "",
    `Subtotal: ${inr(o.subtotal)}`,
    o.couponDiscount > 0
      ? `Coupon (${o.couponCode}): -${inr(o.couponDiscount)}`
      : null,
    `Shipping: ${inr(o.shippingFee)}`,
    `Platform fee: ${inr(o.platformFee)}`,
    `TOTAL: ${inr(o.total)}`,
    `Customer ID: ${customerId}`,
    "",
    "SHIP TO",
    titleCase(a.name),
    ...addressLines,
    `Phone: ${a.mobile}`,
    "",
    `Open in admin: ${adminLink}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject, html, text };
}

// ---------- sender ----------
export async function sendAdminOrderEmail(order) {
  try {
    if (!process.env.ADMIN_EMAIL) throw new Error("ADMIN_EMAIL is not set");
    const customerId =
      order.customerId ||
      order.customer?.customerId ||
      (
        await Customer.findById(order.customer?._id || order.customer)
          .select("customerId")
          .lean()
      )?.customerId;
    const { subject, html, text } = buildAdminOrderEmail(order, {
      customerId,
    });
    await sendEmail({ to: process.env.ADMIN_EMAIL, subject, html, text });
  } catch (err) {
    console.error("Admin order email failed:", err.message); // never break the order flow
  }
}
