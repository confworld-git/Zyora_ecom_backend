const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const inr = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

const formatIST = (date) =>
  new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const orderConfirmationEmail = (orderInput) => {
  const order =
    typeof orderInput.toObject === "function"
      ? orderInput.toObject()
      : orderInput;
  const address = order.shippingAddress || {};
  const isCod = order.paymentMethod === "cod";
  const orderId = escapeHtml(order.orderId);
  const title = `Order ${order.orderId} confirmed – ZYORA`;
  const siteUrl = (
    process.env.FRONTEND_URL || "https://zyora-ecom.vercel.app"
  ).replace(/\/+$/, "");
  const trackingUrl = `${siteUrl}/Profile`;
  const itemCount = order.items.reduce((count, item) => count + item.quantity, 0);
  const mrpTotal = order.items.reduce(
    (total, item) => total + (item.mrp || item.price) * item.quantity,
    0,
  );
  const savings = Math.max(
    0,
    mrpTotal - order.subtotal + (order.couponDiscount || 0),
  );

  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td width="84" style="padding:14px 0;vertical-align:top;border-bottom:1px solid #ece8e1;">
            ${
              item.image
                ? `<img src="${escapeHtml(item.image)}" width="72" height="72" alt="${escapeHtml(item.name)}" style="display:block;border-radius:12px;object-fit:cover;background:#f5f2ed;">`
                : ""
            }
          </td>
          <td style="padding:14px 0 14px 8px;vertical-align:top;border-bottom:1px solid #ece8e1;">
            <div style="font-size:15px;font-weight:bold;color:#0a0a5c;">${escapeHtml(item.name)}</div>
            <div style="font-size:12px;color:#8a8aa8;margin-top:3px;">${escapeHtml(item.brand || "ZYORA")}${item.color ? ` · ${escapeHtml(item.color)}` : ""} · Qty ${item.quantity}</div>
            ${item.productId ? `<div style="font-size:12px;color:#8a8aa8;margin-top:3px;">${escapeHtml(item.productId)}</div>` : ""}
            ${item.size ? `<div style="font-size:12px;color:#8a8aa8;margin-top:3px;">Size: ${escapeHtml(item.size)}</div>` : ""}
          </td>
          <td align="right" style="padding:14px 0;vertical-align:top;border-bottom:1px solid #ece8e1;white-space:nowrap;">
            <div style="font-size:15px;font-weight:bold;color:#0a0a5c;">${inr(item.price * item.quantity)}</div>
            ${item.mrp > item.price ? `<div style="font-size:12px;color:#8a8aa8;text-decoration:line-through;">${inr(item.mrp * item.quantity)}</div>` : ""}
          </td>
        </tr>`,
    )
    .join("");

  const addressLines = [
    [address.houseNumber, address.address].filter(Boolean).join(", "),
    address.locality,
    [address.city, address.state].filter(Boolean).join(", "),
    address.pinCode,
  ]
    .filter(Boolean)
    .map(escapeHtml);

  const totalRow = (label, value, strong = false) => `
    <tr>
      <td style="padding:5px 0;font-size:${strong ? 17 : 14}px;color:${strong ? "#0a0a5c" : "#3d3d6b"};${strong ? "font-weight:bold;" : ""}">${label}</td>
      <td align="right" style="padding:5px 0;font-size:${strong ? 17 : 14}px;color:#0a0a5c;${strong ? "font-weight:bold;" : ""}">${value}</td>
    </tr>`;

  const intro = isCod
    ? `Your order has been placed successfully and is being prepared. Please keep <strong>${inr(order.total)}</strong> ready to pay at delivery.`
    : `Your order has been placed successfully and your payment of <strong>${inr(order.total)}</strong> has been received.`;
  const paymentMethod = isCod ? "Cash on Delivery" : "Paid online";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1eee9;font-family:Arial,Helvetica,sans-serif;color:#0a0a5c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eee9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;">
<tr><td style="background:#0a0a5c;padding:26px 32px;">
<table role="presentation" width="100%"><tr>
<td style="font-size:28px;font-weight:900;letter-spacing:2px;color:#ffffff;">Z<span style="color:#ff4a12;">Y</span>ORA</td>
<td align="right" style="font-size:11px;letter-spacing:1px;color:#c9cffc;">DESTINATION FOR E-COMMERCE</td>
</tr></table>
</td></tr>
<tr><td style="height:5px;background:#ff4a12;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:36px 32px 8px;">
<div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#ff4a12;">ORDER CONFIRMED</div>
<h1 style="margin:8px 0 0;font-size:30px;line-height:1.2;color:#0a0a5c;">Thank you, <span style="color:#ff4a12;">${escapeHtml(address.name)}</span>! 🎉</h1>
<p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#3d3d6b;">${intro}</p>
</td></tr>
<tr><td style="padding:20px 32px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ed;border-radius:14px;">
<tr><td style="padding:16px 22px;font-size:13px;color:#3d3d6b;line-height:1.9;">
<span style="color:#8a8aa8;">Order ID</span> &nbsp;<strong style="color:#0a0a5c;">${orderId}</strong><br>
<span style="color:#8a8aa8;">Placed on</span> &nbsp;<strong style="color:#0a0a5c;">${escapeHtml(formatIST(order.createdAt))}</strong><br>
<span style="color:#8a8aa8;">Payment</span> &nbsp;<strong style="color:#0a0a5c;">${paymentMethod}</strong>
</td></tr></table>
</td></tr>
<tr><td style="padding:18px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="center" style="font-size:11px;font-weight:bold;letter-spacing:.5px;padding:0 4px;"><div style="height:6px;border-radius:3px;background:#ff4a12;margin-bottom:8px;"></div><span style="color:#0a0a5c;">CONFIRMED</span></td>
<td align="center" style="font-size:11px;font-weight:bold;letter-spacing:.5px;padding:0 4px;"><div style="height:6px;border-radius:3px;background:#ddd8ff;margin-bottom:8px;"></div><span style="color:#8a8aa8;">SHIPPED</span></td>
<td align="center" style="font-size:11px;font-weight:bold;letter-spacing:.5px;padding:0 4px;"><div style="height:6px;border-radius:3px;background:#ddd8ff;margin-bottom:8px;"></div><span style="color:#8a8aa8;">DELIVERED</span></td>
</tr></table>
<div style="margin-top:12px;"><p style="margin:0;font-size:13px;color:#3d3d6b;">We'll email you the tracking details as soon as your order ships.</p></div>
</td></tr>
<tr><td style="padding:24px 32px 0;">
<div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#0a0a5c;">ITEMS IN YOUR ORDER (${itemCount})</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
</td></tr>
<tr><td style="padding:14px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${totalRow("Subtotal", inr(order.subtotal))}
${order.couponDiscount > 0 ? totalRow(`Coupon discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ""}`, `− ${inr(order.couponDiscount)}`) : ""}
${totalRow("Shipping fee", order.shippingFee ? inr(order.shippingFee) : "Free")}
${totalRow("Platform fee", inr(order.platformFee))}
<tr><td colspan="2" style="border-top:2px solid #0a0a5c;font-size:0;height:8px;">&nbsp;</td></tr>
${totalRow("Total to pay", inr(order.total), true)}
</table>
${savings > 0 ? `<div style="margin-top:12px;background:#e9f9ee;color:#17693a;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:bold;">You saved ${inr(savings)} on this order 🎁</div>` : ""}
</td></tr>
<tr><td style="padding:24px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#c9cffc;border-radius:14px;">
<tr><td style="padding:18px 22px;font-size:14px;line-height:1.7;color:#0a0a5c;">
<div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#4a4a7a;margin-bottom:6px;">DELIVERING TO</div>
<strong>${escapeHtml(address.name)}</strong><br>
${addressLines.join("<br>")}<br>
📞 ${escapeHtml(address.mobile)}
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:30px 32px 6px;">
<a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:#ff4a12;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:15px 38px;border-radius:30px;">Track My Order →</a>
</td></tr>
<tr><td style="padding:22px 32px 0;font-size:13px;line-height:1.7;color:#3d3d6b;">
Questions about your order? Email <a href="mailto:support@zyoraecom.in" style="color:#ff4a12;font-weight:bold;text-decoration:none;">support@zyoraecom.in</a>
or call / WhatsApp <a href="tel:+917010423318" style="color:#ff4a12;font-weight:bold;text-decoration:none;">+91 7010423318</a> (Mon–Sat, 10 AM – 7 PM).
</td></tr>
<tr><td style="padding:20px 32px 34px;font-size:14px;line-height:1.7;color:#3d3d6b;">Happy shopping,<br><strong style="color:#0a0a5c;">Team ZYORA</strong></td></tr>
<tr><td style="background:#0a0a5c;padding:20px 32px;text-align:center;font-size:12px;line-height:1.7;color:#c9cffc;">
You received this email because you placed an order on ZYORA.<br>
© ${new Date().getFullYear()} ZYORA · Destination for E-commerce
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `ORDER CONFIRMED — ${order.orderId}`,
    `Thank you, ${address.name}!`,
    isCod
      ? `Your order has been placed successfully. Please keep ${inr(order.total)} ready to pay at delivery.`
      : `Your order has been placed successfully and your payment of ${inr(order.total)} has been received.`,
    "",
    `Placed on: ${formatIST(order.createdAt)}`,
    `Payment: ${paymentMethod}`,
    "",
    "ITEMS",
    ...order.items.map(
      (item) =>
        `- ${item.name} · Qty ${item.quantity} · ${inr(item.price * item.quantity)}`,
    ),
    "",
    `Subtotal: ${inr(order.subtotal)}`,
    order.couponDiscount > 0
      ? `Coupon discount: -${inr(order.couponDiscount)}`
      : null,
    `Shipping: ${order.shippingFee ? inr(order.shippingFee) : "Free"}`,
    `Platform fee: ${inr(order.platformFee)}`,
    `Total to pay: ${inr(order.total)}`,
    "",
    `Delivering to: ${address.name}, ${address.address}, ${address.city}, ${address.state} ${address.pinCode}`,
    `Phone: ${address.mobile}`,
    "",
    `Track your order: ${trackingUrl}`,
    "Questions? Email support@zyoraecom.in or call / WhatsApp +91 7010423318.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject: title, html, text };
};

export default orderConfirmationEmail;
