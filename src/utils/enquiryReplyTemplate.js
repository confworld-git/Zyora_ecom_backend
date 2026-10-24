const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br>");

const introByType = {
  Complaint:
    "We're sorry to hear you've had a concern. Your complaint has been marked as a priority and our team will look into it right away.",
  Order: "Our team is checking the details of your order and will update you shortly.",
  "Order Status / Tracking":
    "Our team is checking the details of your order and will update you shortly.",
  "Order Cancellation":
    "Our team is checking the details of your order and will update you shortly.",
  "Return or Exchange":
    "Our team is checking the details of your order and will update you shortly.",
  "Refund Status":
    "Our team is checking the details of your order and will update you shortly.",
  "Payment Issue":
    "Our team is checking the details of your order and will update you shortly.",
  "Delivery / Shipping Issue":
    "Our team is checking the details of your order and will update you shortly.",
  "Damaged or Defective Product":
    "We're sorry to hear you've had a concern. Our team will look into it right away.",
  Product:
    "Thanks for your interest in our products. Our team will share the details you need shortly.",
  "Product Information":
    "Thanks for your interest in our products. Our team will share the details you need shortly.",
  "Product Availability":
    "Thanks for your interest in our products. Our team will share the details you need shortly.",
  "Bulk Order Enquiry":
    "Thanks for your interest in our products. Our team will share the details you need shortly.",
  "Business / Wholesale Enquiry":
    "Thanks for your interest in our products. Our team will share the details you need shortly.",
  default:
    "Our team has received your enquiry and will get back to you within 24 hours (Monday–Saturday).",
};

const enquiryReplyTemplate = (enquiry) => {
  const siteUrl = escapeHtml(
    (process.env.FRONTEND_URL || "https://zyora-ecom.vercel.app").replace(
      /\/+$/,
      "",
    ),
  );
  const name = escapeHtml(enquiry.name);
  const type = escapeHtml(enquiry.enquiryType);
  const message = escapeHtml(enquiry.message);
  const intro = introByType[enquiry.enquiryType] || introByType.default;
  const refId = enquiry._id
    ? `ZY-${String(enquiry._id).slice(-6).toUpperCase()}`
    : `ZY-${new Date(enquiry.createdAt).getTime().toString().slice(-6)}`;
  const date = new Date(enquiry.createdAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ZYORA – We received your enquiry</title>
  </head>
  <body style="margin:0;padding:0;background:#f1eee9;font-family:Arial,Helvetica,sans-serif;color:#0a0a5c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eee9;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="background:#0a0a5c;padding:26px 32px;">
              <table role="presentation" width="100%"><tr>
                <td style="font-size:28px;font-weight:900;letter-spacing:2px;color:#ffffff;">Z<span style="color:#ff4a12;">Y</span>ORA</td>
                <td align="right" style="font-size:11px;letter-spacing:1px;color:#c9cffc;">DESTINATION FOR E-COMMERCE</td>
              </tr></table>
            </td>
          </tr>
          <tr><td style="height:5px;background:#ff4a12;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:36px 32px 8px;">
              <div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#ff4a12;">WE GOT YOUR MESSAGE</div>
              <h1 style="margin:8px 0 0;font-size:30px;line-height:1.2;color:#0a0a5c;">Thanks for reaching out, <span style="color:#ff4a12;">${name}</span>!</h1>
              <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#3d3d6b;">Hi ${name}, ${intro}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ed;border-radius:14px;">
                <tr><td style="padding:18px 22px;">
                  <div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#0a0a5c;">YOUR ENQUIRY SUMMARY</div>
                  <table role="presentation" width="100%" style="margin-top:10px;font-size:14px;color:#3d3d6b;">
                    <tr><td width="120" style="padding:5px 0;color:#8a8aa8;">Reference ID</td><td style="padding:5px 0;font-weight:bold;color:#0a0a5c;">#${refId}</td></tr>
                    <tr><td style="padding:5px 0;color:#8a8aa8;">Enquiry type</td><td style="padding:5px 0;font-weight:bold;color:#0a0a5c;">${type}</td></tr>
                    <tr><td style="padding:5px 0;color:#8a8aa8;">Submitted on</td><td style="padding:5px 0;">${date}</td></tr>
                    <tr><td style="padding:5px 0;color:#8a8aa8;vertical-align:top;">Your message</td><td style="padding:5px 0;line-height:1.6;">${message}</td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 4px;">
              <div style="font-size:16px;font-weight:bold;color:#0a0a5c;">Need help sooner?</div>
              <p style="margin:6px 0 14px;font-size:14px;line-height:1.6;color:#3d3d6b;">Reach us directly using any of the options below.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="background:#0a0a5c;border-radius:12px;padding:14px 18px;"><div style="font-size:10px;letter-spacing:1.5px;color:#c9cffc;">EMAIL</div><a href="mailto:support@zyoraecom.in" style="font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">support@zyoraecom.in</a></td></tr>
                <tr><td style="height:8px;"></td></tr>
                <tr><td style="background:#e8cba3;border-radius:12px;padding:14px 18px;"><div style="font-size:10px;letter-spacing:1.5px;color:#5c4a2e;">PHONE / WHATSAPP</div><a href="tel:+917010423318" style="font-size:15px;font-weight:bold;color:#0a0a5c;text-decoration:none;">+91 7010423318</a></td></tr>
                <tr><td style="height:8px;"></td></tr>
                <tr><td style="background:#c9cffc;border-radius:12px;padding:14px 18px;"><div style="font-size:10px;letter-spacing:1.5px;color:#4a4a7a;">CUSTOMER SUPPORT</div><span style="font-size:15px;font-weight:bold;color:#0a0a5c;">Monday–Saturday, 10 AM – 7 PM</span></td></tr>
              </table>
            </td>
          </tr>
          <tr><td align="center" style="padding:30px 32px 10px;"><a href="${siteUrl}" style="display:inline-block;background:#ff4a12;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:15px 38px;border-radius:30px;">Continue Shopping →</a></td></tr>
          <tr><td style="padding:20px 32px 34px;font-size:14px;line-height:1.7;color:#3d3d6b;">Warm regards,<br><strong style="color:#0a0a5c;">Team ZYORA</strong></td></tr>
          <tr><td style="background:#0a0a5c;padding:20px 32px;text-align:center;font-size:12px;line-height:1.7;color:#c9cffc;">You received this email because you submitted an enquiry on our Contact Us page.<br>© ${new Date().getFullYear()} ZYORA · Destination for E-commerce</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

export default enquiryReplyTemplate;
