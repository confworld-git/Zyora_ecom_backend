const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const enquiryAdminAlertTemplate = (enquiryInput) => {
  const enquiry =
    typeof enquiryInput.toObject === "function"
      ? enquiryInput.toObject()
      : enquiryInput;
  const name = escapeHtml(enquiry.name);
  const email = escapeHtml(enquiry.email);
  const phone = escapeHtml(enquiry.phone);
  const phoneDigits = String(enquiry.phone || "").replace(/\D/g, "");
  const type = escapeHtml(enquiry.enquiryType);
  const siteUrl = escapeHtml(
    (process.env.FRONTEND_URL || "https://zyora-ecom.vercel.app").replace(
      /\/+$/,
      "",
    ),
  );
  const receivedAt = formatIST(enquiry.createdAt);
  const receivedDate = escapeHtml(receivedAt);
  const message = escapeHtml(enquiry.message).replace(/\r?\n/g, "<br>");
  const replySubject = encodeURIComponent(
    `Re: Your ${enquiry.enquiryType} enquiry – ZYORA`,
  );
  const replyHref = `mailto:${encodeURIComponent(enquiry.email)}?subject=${replySubject}`;
  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}` : "";
  const title = `New enquiry from ${name}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1eee9;font-family:Arial,Helvetica,sans-serif;color:#0a0a5c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eee9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;">
<tr><td style="background:#0a0a5c;padding:24px 32px;">
<table role="presentation" width="100%"><tr>
<td style="font-size:26px;font-weight:900;letter-spacing:2px;color:#ffffff;">Z<span style="color:#ff4a12;">Y</span>ORA</td>
<td align="right" style="font-size:11px;letter-spacing:1px;color:#c9cffc;">ADMIN NOTIFICATION</td>
</tr></table>
</td></tr>
<tr><td style="height:5px;background:#ff4a12;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 6px;">
<span style="display:inline-block;background:#ddd8ff;color:#0a0a5c;font-size:11px;font-weight:bold;letter-spacing:1.5px;padding:6px 12px;border-radius:20px;">${type}</span>
<h1 style="margin:14px 0 0;font-size:26px;line-height:1.25;color:#0a0a5c;">New enquiry from <span style="color:#ff4a12;">${name}</span></h1>
<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#3d3d6b;">A new enquiry was submitted on the ZYORA Contact Us page on ${receivedDate}.</p>
</td></tr>
<tr><td style="padding:16px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td width="110" style="padding:10px 0;font-size:12px;font-weight:bold;letter-spacing:1px;color:#8a8aa8;border-bottom:1px solid #ece8e1;vertical-align:top;">NAME</td><td style="padding:10px 0;font-size:15px;color:#0a0a5c;border-bottom:1px solid #ece8e1;">${name}</td></tr>
<tr><td width="110" style="padding:10px 0;font-size:12px;font-weight:bold;letter-spacing:1px;color:#8a8aa8;border-bottom:1px solid #ece8e1;vertical-align:top;">EMAIL</td><td style="padding:10px 0;font-size:15px;color:#0a0a5c;border-bottom:1px solid #ece8e1;"><a href="mailto:${email}" style="color:#ff4a12;font-weight:bold;text-decoration:none;">${email}</a></td></tr>
<tr><td width="110" style="padding:10px 0;font-size:12px;font-weight:bold;letter-spacing:1px;color:#8a8aa8;border-bottom:1px solid #ece8e1;vertical-align:top;">PHONE</td><td style="padding:10px 0;font-size:15px;color:#0a0a5c;border-bottom:1px solid #ece8e1;"><a href="tel:${phoneDigits}" style="color:#0a0a5c;text-decoration:none;">${phone}</a></td></tr>
<tr><td width="110" style="padding:10px 0;font-size:12px;font-weight:bold;letter-spacing:1px;color:#8a8aa8;border-bottom:1px solid #ece8e1;vertical-align:top;">TYPE</td><td style="padding:10px 0;font-size:15px;color:#0a0a5c;border-bottom:1px solid #ece8e1;">${type}</td></tr>
<tr><td width="110" style="padding:10px 0;font-size:12px;font-weight:bold;letter-spacing:1px;color:#8a8aa8;border-bottom:1px solid #ece8e1;vertical-align:top;">RECEIVED</td><td style="padding:10px 0;font-size:15px;color:#0a0a5c;border-bottom:1px solid #ece8e1;">${receivedDate}</td></tr>
</table>
</td></tr>
<tr><td style="padding:22px 32px 0;">
<div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#8a8aa8;margin-bottom:8px;">MESSAGE</div>
<div style="background:#f5f2ed;border-left:4px solid #ff4a12;border-radius:10px;padding:16px 18px;font-size:15px;line-height:1.7;color:#0a0a5c;">${message}</div>
</td></tr>
<tr><td style="padding:26px 32px 12px;">
<a href="${replyHref}" style="display:inline-block;background:#ff4a12;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:26px;margin:0 6px 8px 0;">✉ Reply by Email</a>
${whatsappHref ? `<a href="${whatsappHref}" style="display:inline-block;background:#0a0a5c;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:26px;margin:0 6px 8px 0;">💬 WhatsApp</a>` : ""}
<a href="tel:${phoneDigits}" style="display:inline-block;background:#c9cffc;color:#0a0a5c;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:26px;margin:0 6px 8px 0;">📞 Call</a>
</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:12px;line-height:1.6;color:#8a8aa8;">Customer support hours: Monday–Saturday, 10 AM – 7 PM.</td></tr>
<tr><td style="background:#0a0a5c;padding:16px 32px;text-align:center;font-size:12px;color:#c9cffc;">Automated notification from <a href="${siteUrl}" style="color:#c9cffc;text-decoration:underline;">${siteUrl}</a> · © ${new Date().getFullYear()} ZYORA</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    "NEW ZYORA ENQUIRY",
    "",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Phone: ${enquiry.phone}`,
    `Type: ${enquiry.enquiryType}`,
    `Received: ${receivedAt}`,
    "",
    "Message:",
    enquiry.message,
    "",
    `Reply to: ${enquiry.email}`,
  ].join("\n");

  return { subject: `New ${enquiry.enquiryType} enquiry from ${enquiry.name}`, html, text };
};

export default enquiryAdminAlertTemplate;
