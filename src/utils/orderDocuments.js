const cleanText = (value) => String(value ?? "").trim();

const escapeHtml = (value) =>
  cleanText(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

const labelMoney = (value) =>
  (Number(value) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const invoiceMoney = (value) => `INR ${labelMoney(value)}`;

const invoiceDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "N/A";

const paymentMethodLabel = (method) =>
  method === "cod" ? "Cash on delivery" : "Online";

const paymentStatusLabel = (status) =>
  ({
    pending: "Pending",
    paid: "Paid",
    failed: "Failed",
    refunding: "Refunding",
    refunded: "Refunded",
  })[status] || "Pending";

const paymentDueLabel = (order) => {
  if (order.paymentStatus === "paid") {
    return order.paymentMethod === "cod"
      ? "Paid on delivery"
      : "No further payment";
  }
  if (order.paymentStatus === "refunded") return "Refunded";
  if (order.paymentStatus === "refunding") return "Refund in progress";
  if (order.paymentStatus === "failed") return "Payment failed";
  if (order.paymentMethod === "cod") return "On delivery";
  return "Payment pending";
};

const invoiceTotalLabel = (order) => {
  if (order.paymentStatus === "paid") return "Total amount paid";
  if (["refunding", "refunded"].includes(order.paymentStatus)) {
    return "Original order total";
  }
  return "Total amount due";
};

export const createOrderInvoiceHtml = (order) => {
  const address = order.shippingAddress || {};
  const recipientLines = [
    address.name,
    address.houseNumber,
    address.address,
    address.locality,
    [address.city, address.state, address.pinCode].filter(Boolean).join(" - "),
    address.mobile ? `Phone: ${address.mobile}` : "",
    order.customer?.email || "",
  ]
    .map(escapeHtml)
    .filter(Boolean);
  const items = (order.items || [])
    .map((item) => {
      const variants = [item.size, item.color]
        .map(escapeHtml)
        .filter(Boolean)
        .join(" / ");
      const name = `${escapeHtml(item.name)}${variants ? ` (${variants})` : ""}`;
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      return `<tr>
        <td class="desc">${name}</td>
        <td class="qty">${quantity}</td>
        <td class="num">${invoiceMoney(price)}</td>
        <td class="num">${invoiceMoney(price * quantity)}</td>
      </tr>`;
    })
    .join("");
  const subtotal = Number(order.subtotal) || 0;
  const shippingFee = Number(order.shippingFee) || 0;
  const platformFee = Number(order.platformFee) || 0;
  const couponDiscount = Number(order.couponDiscount) || 0;
  const additionalCharges = shippingFee + platformFee;
  const discountLine =
    couponDiscount > 0
      ? `<div class="line"><b>Discount</b><span>- ${invoiceMoney(couponDiscount)}</span></div>`
      : "";
  const clientText = recipientLines.join("<br />");
  const paymentReason =
    order.paymentMethod === "cod"
      ? `<strong>Cash on Delivery (COD):</strong> Please pay the total amount due to the delivery partner when the parcel arrives.`
      : order.paymentStatus === "paid"
        ? `<strong>Online payment:</strong> This order is marked as paid. No further payment is needed.`
        : `<strong>Online payment:</strong> Payment is ${paymentStatusLabel(order.paymentStatus).toLowerCase()}. Please check your order status before making another payment.`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoice ${escapeHtml(order.orderId)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      :root { --green: #1c3a35; --paper: #edecea; --band: #dcddd6; --muted: #6b6f6c; --ink: #222; }
      body { margin: 0; padding: 20px 0 40px; background: #c9c9c9; font-family: Poppins, Arial, Helvetica, sans-serif; font-size: 13px; color: var(--ink); }
      .toolbar { width: 210mm; max-width: 100%; margin: 0 auto 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 13px; }
      .toolbar button { font: inherit; padding: 7px 14px; border: 1px solid #333; background: #fff; cursor: pointer; }
      .toolbar .hint { flex-basis: 100%; color: #444; margin: 0; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm 17mm 16mm; background: white; color: var(--green); position: relative; }
      [contenteditable]:focus { outline: 1px dashed #888; background: #fffbe0; }
      .head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 2mm; border-bottom: 3px solid var(--green); }
      .head h1 { margin: 0; font-family: "Cormorant Garamond", Georgia, serif; font-weight: 600; font-size: 40px; letter-spacing: 0.1em; text-transform: uppercase; }
      .head img { width: 32mm; height: 32mm; object-fit: contain; }
      .info { display: flex; justify-content: space-between; margin-top: 9mm; gap: 10mm; }
      .bill { flex: 1; min-width: 0; }
      .bill h3 { font-size: 12.5px; font-weight: 700; margin: 0 0 3px; }
      .bill p { margin: 0; font-size: 13px; line-height: 1.65; color: var(--ink); overflow-wrap: anywhere; }
      .bill .from { margin-top: 8mm; }
      .meta { flex: 1; display: grid; grid-template-columns: auto auto; gap: 3px 10px; align-content: start; text-align: right; margin-top: 3px; }
      .meta .k { text-align: right; color: var(--muted); font-weight: 600; font-size: 12.5px; }
      .meta .v { min-width: 32mm; font-weight: 600; font-size: 12.5px; color: var(--ink); overflow-wrap: anywhere; }
      .reason { margin: 11mm 0 6mm; font-size: 12px; line-height: 1.6; color: var(--green); }
      table { width: 100%; border-collapse: collapse; margin-top: 12mm; }
      thead th { background: var(--green); color: #fff; font-size: 12.5px; font-weight: 600; text-align: right; padding: 12px 16px; }
      thead th:first-child { text-align: left; padding-left: 22px; }
      thead th.qty { text-align: center; }
      tbody td { height: 12.5mm; background: #fff; font-size: 12px; color: var(--ink); }
      tbody tr:nth-child(even) td { background: var(--band); }
      tbody td.desc { padding: 6px 16px 6px 22px; overflow-wrap: anywhere; }
      tbody td.num { text-align: right; padding: 6px 16px; white-space: nowrap; }
      tbody td.qty { text-align: center; }
      .totals { margin-top: 7mm; display: flex; justify-content: flex-end; }
      .totals .box { width: 118mm; }
      .totals .line { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4mm 16px 4mm 24mm; font-size: 12px; }
      .totals .line b { color: var(--green); font-weight: 700; }
      .totals .line span:last-child { color: var(--ink); text-align: right; }
      .totals .due { background: var(--green); color: #fff; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 5mm 16px; font-weight: 700; font-size: 14px; margin-top: 3mm; }
      .totals .due span:first-child { text-transform: uppercase; }
      .disclaimer { margin: 9mm 0 0; color: var(--muted); font-size: 10px; text-align: center; }
      @media print {
        body { background: #fff; padding: 0; }
        .toolbar { display: none !important; }
        .page { margin: 0; box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        [contenteditable]:focus { outline: 0; background: none; }
      }
      @media screen and (max-width: 800px) {
        body { padding: 12px 0; }
        .page { width: 100%; min-height: 0; padding: 24px; }
        .info { gap: 18px; }
        .meta { grid-template-columns: 1fr auto; }
        .meta .v { min-width: 0; }
        .head h1 { font-size: 32px; }
        .head img { width: 24mm; height: 24mm; }
        table { margin-top: 8mm; }
        thead th { padding: 8px 6px; font-size: 10px; }
        tbody td { font-size: 10px; }
      }
      @media screen and (max-width: 560px) {
        .page { padding: 18px 12px; }
        .info { flex-direction: column; }
        .meta { text-align: left; }
        .meta .k { text-align: left; }
        .totals .box { width: 100%; }
        .totals .line { padding-left: 12px; }
        .reason { margin-top: 8mm; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print / Save as PDF</button>
      <p class="hint">Order summary only; not a GST tax invoice. Use A4 paper and disable browser headers and footers in the print dialog.</p>
    </div>
    <main class="page">
      <header class="head">
        <h1 contenteditable="true">Invoice</h1>
        <img
          src="https://zyoraecom.in/assets/Zyora_logo-D4acAx0d.jpeg"
          alt="Zyora logo"
        />
      </header>
      <section class="info">
        <div class="bill">
          <div>
            <h3>To:</h3>
            <p contenteditable="true">${clientText || "Customer details unavailable"}</p>
          </div>
          <div class="from">
            <h3>From:</h3>
            <p contenteditable="true">
              Zyora<br />Old No.1A, New No.3, Second Floor, Ragavan Street,
              Perambur, Chennai - 600011, Tamil Nadu, India.<br />Phone: +91
              7010423318
            </p>
          </div>
        </div>
        <div class="meta">
          <span class="k">Invoice No:</span><span class="v" contenteditable="true">INV-${escapeHtml(order.orderId)}</span>
          <span class="k">Issue Date:</span><span class="v" contenteditable="true">${invoiceDate(order.createdAt)}</span>
          <span class="k">Payment Method:</span><span class="v" contenteditable="true">${paymentMethodLabel(order.paymentMethod)}</span>
          <span class="k">Payment Status:</span><span class="v" contenteditable="true">${paymentStatusLabel(order.paymentStatus)}</span>
          <span class="k">Payment Due:</span><span class="v" contenteditable="true">${paymentDueLabel(order)}</span>
        </div>
      </section>
      <table>
        <thead>
          <tr>
            <th>Description</th><th class="qty" style="width: 14%">Qty</th>
            <th style="width: 22%">Price</th><th style="width: 24%">Amount</th>
          </tr>
        </thead>
        <tbody>${items || '<tr><td class="desc" colspan="4">No items recorded</td></tr>'}</tbody>
      </table>
      <section class="totals">
        <div class="box">
          <div class="line"><b>Sub Total</b><span>${invoiceMoney(subtotal)}</span></div>
          <div class="line"><b>Shipping</b><span>${invoiceMoney(additionalCharges)}</span></div>
          ${discountLine}
          <div class="due"><span>${invoiceTotalLabel(order)}</span><span>${invoiceMoney(order.total)}</span></div>
        </div>
      </section>
      <p class="reason">${paymentReason}</p>
      <p class="disclaimer">This is an order summary, not a GST tax invoice.</p>
    </main>
  </body>
</html>`;
};

export const createShippingLabelHtml = (order, { amountInWords, weight }) => {
  const address = order.shippingAddress || {};
  const recipientAddress = [
    address.houseNumber,
    address.address,
    address.locality,
    [address.city, address.state, address.pinCode].filter(Boolean).join(" - "),
  ]
    .map(escapeHtml)
    .filter(Boolean)
    .join(", ");
  const orderItems = order.items || [];
  const itemSubtotals = orderItems.map(
    (item) => (Number(item.price) || 0) * (Number(item.quantity) || 0),
  );
  const totalItemsSubtotal = itemSubtotals.reduce(
    (total, subtotal) => total + subtotal,
    0,
  );
  const shippingFeeCents = Math.round((Number(order.shippingFee) || 0) * 100);
  let allocatedShippingCents = 0;
  const items = orderItems
    .map((item, index) => {
      const variants = [item.size, item.color]
        .map(escapeHtml)
        .filter(Boolean)
        .join(" / ");
      const name = `${escapeHtml(item.name)}${variants ? ` (${variants})` : ""}`;
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const shippingCents =
        index === orderItems.length - 1
          ? shippingFeeCents - allocatedShippingCents
          : totalItemsSubtotal > 0
            ? Math.round(
                (shippingFeeCents * itemSubtotals[index]) / totalItemsSubtotal,
              )
            : 0;
      allocatedShippingCents += shippingCents;
      const shippingCharge = shippingCents / 100;
      return `<tr>
        <td>${name}</td>
        <td>${quantity}</td>
        <td>${labelMoney(price)}</td>
        <td>${labelMoney(shippingCharge)}</td>
        <td>${labelMoney(price * quantity + shippingCharge)}</td>
      </tr>`;
    })
    .join("");
  const codDue =
    order.paymentMethod === "cod" && order.paymentStatus !== "paid";

  return `<!doctype html>
<html lang="en">
  <head>
    <style>
      @page {
        size: A4 portrait;
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      :root {
        --ink: #000000;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        font-family: "Times New Roman", Times, serif;
        color: var(--ink);
      }

      body {
        padding: 24px 0;
        background: #e9e9e9;
      }

      .label {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 10mm;
        background: #ffffff;
      }

      .sheet {
        display: flex;
        width: 100%;
        min-height: 277mm;
        flex-direction: column;
         border: 1.5px solid var(--ink);
      }

      .row {
        display: flex;
        width: 100%;
        justify-content: center;
        border-bottom: 1.5px solid var(--ink);
      }

      .row:last-child {
        border-bottom: 0;
      }

      .r1 {
        min-height: 38mm;
        align-items: center;
        flex-shrink: 0;
      }

      .r1 img {
        width: 28mm;
        height: 28mm;
        margin: 0 5mm 0 2mm;
        object-fit: contain;
      }

      .r1 .date {
        display: flex;
        min-width: 0;
        flex-direction: column;
        justify-content: center;
        padding-left: 4mm;
        font-size: 30px;
        font-weight: 700;
      }

      .r1 .date p {
        margin: 5px 0 0;
        font-size: 20px;
        font-weight: 400;
        line-height: 1.3;
      }

      .speedpost {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 10px 0;
        border-bottom: 1.5px solid var(--ink);
      }

      .speedpost > * {
        margin: 0;
        padding: 0;
      }

      .party {
        min-height: 45mm;
        align-items: flex-start;
        padding: 7mm 4mm;
        flex-shrink: 0;
      }

      .party .k {
        width: 35mm;
        flex: 0 0 35mm;
        font-size: 19px;
        font-weight: 700;
      }

      .party .v {
        min-width: 0;
        flex: 1;
      }

      .party .v .name {
        margin: 0 0 4mm;
        font-size: 22px;
        font-weight: 700;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      .party .v .addr {
        font-size: 18px;
        line-height: 1.6;
        overflow-wrap: anywhere;
        word-break: normal;
      }

      .products {
        min-height: 65mm;
        flex: 1 0 auto;
        align-items: flex-start;
        padding: 7mm 4mm;
      }

      .products .k {
        width: 35mm;
        flex: 0 0 35mm;
      }

      .products .v {
        min-width: 0;
        flex: 1;
      }

      .products table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 17px;
      }

      .products th,
      .products td {
        padding: 7px 4px;
        text-align: right;
        vertical-align: top;
        overflow-wrap: anywhere;
      }

      .products th {
        font-weight: 700;
      }

      .products th:first-child,
      .products td:first-child {
        width: 22%;
        text-align: left;
      }

      .products th:nth-child(2),
      .products td:nth-child(2) {
        width: 12%;
      }

      .products th:nth-child(3),
      .products td:nth-child(3) {
        width: 22%;
      }

      .products th:nth-child(4),
      .products td:nth-child(4) {
        width: 24%;
      }

      .products th:last-child,
      .products td:last-child {
        width: 20%;
        text-align: right;
      }

      .products thead {
        border-bottom: 1.5px solid var(--ink);
      }

      .products tbody tr {
        border-bottom: 1px solid #999999;
      }

      .r5 {
        min-height: 35mm;
        flex-shrink: 0;
      }

      .r5 .cell {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 5mm;
        box-sizing: border-box;
        border-right: 1.5px solid var(--ink);
        font-size: 18px;
        font-weight: 600;
        text-align: center;
        line-height: 1.8;
        overflow-wrap: anywhere;
      }

      .r5 .cell:last-child {
        border-right: 0;
      }

      [contenteditable="true"]:focus {
        outline: 1px dashed #888888;
        background: #fffbe0;
      }

      .toolbar {
        max-width: 460px;
        margin: 0 auto 16px;
        text-align: center;
        font-size: 16px;
        color: #222222;
      }

      .toolbar button {
        padding: 10px 20px;
        border: 1px solid #222222;
        background: #ffffff;
        font: inherit;
        cursor: pointer;
      }

      .toolbar p {
        margin: 8px auto 0;
        line-height: 1.5;
        color: #444444;
      }

      .speedpost {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 20px 0;
        border-bottom: 1.5px solid var(--ink);
      }

      .speedpost > p {
        font-size: 20px;
        font-weight: 600;
        margin-top: 5px;
        text-transform: uppercase;
      }

      .Customerid {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 10px;
        padding: 10px 4mm;
        border-bottom: 1.5px solid var(--ink);
      }

      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }

        html,
        body {
          width: 210mm;
          min-height: 297mm;
          margin: 0;
          padding: 0;
          background: #ffffff;
        }

        .toolbar {
          display: none !important;
        }

        .label {
          width: 210mm;
          min-height: 297mm;
          margin: 0;
          padding: 10mm;
          background: #ffffff;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .sheet {
          min-height: 277mm;
        }

        [contenteditable="true"]:focus {
          outline: none;
          background: transparent;
        }
      }

      @media screen and (max-width: 800px) {
        body {
          padding: 12px 0;
          overflow-x: auto;
        }

        .label {
          margin-left: 0;
          margin-right: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="label">
      <div class="sheet">
        <div class="row r1">
          <img
            width="80"
            height="80"
            src="https://res.cloudinary.com/yocetu59/image/upload/v1791965736/logo.jpg"
            alt="Zyora logo"
          />
          <div class="date">
            <span>ZYORA</span>
            <p>Destination for E-commerce</p>
          </div>
        </div>
        <div class="speedpost" style="text-align: center">
          <h1 style="text-align: center; width: 100%">
            INDIA SPEEDPOST PARCEL
          </h1>
          <h2>${codDue ? `COD - Rs. ${labelMoney(order.total)}` : "PREPAID"}</h2>
          <p>AMOUNT IN WORDS - ${escapeHtml(amountInWords)}</p>
        </div>
        <div class="Customerid">
        ${
          codDue
            ? `<h3>CUSTOMER ID: 1278831664</h3>
          |
          <h3>CONTRACT ID: 41107288</h3>`
            : `<h3>CUSTOMER ID: 1278831664</h3>
          |
          <h3>CONTRACT ID: 41141326</h3>`
        }
        </div>
        <div class="row party">
          <div class="k">Sender:</div>
          <div class="v">
            <div class="name" contenteditable="true">Zyora</div>
            <div class="addr" contenteditable="true">
              Old No.1A, New No.3, Second Floor, Ragavan Street, Perambur,<br/>
              Chennai - 600011, Tamil Nadu, India<br />Phone: +91 7010423318
            </div>
          </div>
        </div>
        <div class="row party">
          <div class="k">To:</div>
          <div class="v">
            <div class="name" contenteditable="true">
              ${escapeHtml(address.name) || "Recipient name"}
            </div>
            <div class="addr" contenteditable="true">
              ${recipientAddress || "Street address, city, state - PIN"}<br />Phone:
              ${escapeHtml(address.mobile) || "+91 00000 00000"}
            </div>
          </div>
        </div>
        <div class="row party products">
          <div class="v">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Shipping Charge</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${items || '<tr><td colspan="5">No product details</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="row r5">
          <div class="cell">
            <span>Order ID:</span
            ><span contenteditable="true"
              >${escapeHtml(order.orderId) || "N/A"}</span
            >
          </div>
          <div class="cell">
            <span>Shipping Date:</span
            ><span contenteditable="true"
              >${new Date().toLocaleDateString("en-IN")}</span
            >
          </div>
          <div class="cell">
            <span>Weight:</span
            ><span contenteditable="true">${escapeHtml(weight)} KG</span>
          </div>
        </div>
      </div>
    </main>
  </body>
</html>
`;
};
