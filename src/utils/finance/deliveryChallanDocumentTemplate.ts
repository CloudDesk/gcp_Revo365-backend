type DeliveryChallanDocumentLine = {
  productname: string;
  assetreference?: string | null;
  invoicequantity?: number | null;
  deliveryquantity: number;
  unit?: string | null;
  unitrate?: number | null;
  lineamount?: number | null;
};

export type DeliveryChallanDocumentData = {
  challannumber: string;
  challanmode: "invoice" | "manual";
  challandate: string | Date;
  invoicenumber?: string | null;
  referencenumber?: string | null;
  purpose?: string | null;
  recipientname?: string | null;
  recipientphone?: string | null;
  recipientaddress?: string | null;
  notes?: string | null;
  showamounts: boolean;
  lines: DeliveryChallanDocumentLine[];
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? escapeHtml(value)
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
};

const formatQuantity = (value: unknown) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(Number(value || 0));
const formatMoney = (value: unknown) => `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}`;

export const getDeliveryChallanDocumentHtml = (document: DeliveryChallanDocumentData) => {
  const reference = document.invoicenumber || document.referencenumber || "—";
  const totalQuantity = document.lines.reduce((sum, line) => sum + Number(line.deliveryquantity || 0), 0);
  const totalAmount = document.lines.reduce((sum, line) => sum + Number(line.lineamount || 0), 0);
  const amountHeaders = document.showamounts ? '<th class="number">Rate</th><th class="number">Amount</th>' : "";
  const rows = document.lines.map((line, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td><strong>${escapeHtml(line.productname)}</strong>${line.assetreference ? `<small>Asset / Serial: ${escapeHtml(line.assetreference)}</small>` : ""}</td>
      ${document.challanmode === "invoice" ? `<td class="center">${formatQuantity(line.invoicequantity)}</td>` : ""}
      <td class="center strong">${formatQuantity(line.deliveryquantity)}</td>
      <td class="center">${escapeHtml(line.unit || "Nos")}</td>
      ${document.showamounts ? `<td class="number">${formatMoney(line.unitrate)}</td><td class="number strong">${formatMoney(line.lineamount)}</td>` : ""}
    </tr>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #123b7a; padding-bottom: 14px; }
    .brand { color: #123b7a; font-size: 21px; font-weight: 800; letter-spacing: .5px; }
    .company { margin-top: 5px; color: #536079; line-height: 1.5; }
    h1 { margin: 0; text-align: right; color: #172033; font-size: 21px; }
    .number-label { margin-top: 6px; text-align: right; color: #536079; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 16px; border: 1px solid #dce3ed; border-radius: 6px; overflow: hidden; }
    .meta > div { min-height: 58px; padding: 11px 13px; border-right: 1px solid #dce3ed; }
    .meta > div:last-child { border-right: 0; }
    .label { color: #66748c; font-size: 9px; font-weight: 700; letter-spacing: .45px; text-transform: uppercase; }
    .value { margin-top: 5px; color: #172033; font-size: 12px; font-weight: 700; }
    .section { margin-top: 16px; }
    .section-title { margin-bottom: 8px; color: #536079; font-size: 9px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .recipient { display: grid; grid-template-columns: 1fr 1.5fr; gap: 18px; padding: 13px; border: 1px solid #dce3ed; border-radius: 6px; line-height: 1.55; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #dce3ed; }
    th { padding: 9px; background: #f3f6fa; color: #536079; font-size: 9px; text-align: left; text-transform: uppercase; }
    td { padding: 10px 9px; border-top: 1px solid #e7ebf1; vertical-align: top; }
    small { display: block; margin-top: 3px; color: #738096; font-size: 9px; font-weight: 400; }
    .center { text-align: center; } .number { text-align: right; } .strong { font-weight: 700; }
    .totals { display: flex; justify-content: flex-end; border: 1px solid #dce3ed; border-top: 0; }
    .totals > div { min-width: 220px; padding: 9px 12px; display: flex; justify-content: space-between; }
    .notes { padding: 12px 13px; border-radius: 6px; background: #f7f9fc; color: #46536a; line-height: 1.55; white-space: pre-wrap; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #dce3ed; color: #7a879b; font-size: 9px; text-align: center; }
  </style></head><body>
    <div class="header"><div><div class="brand">TeqIT</div><div class="company">Rev0365Global Private Limited<br>Chennai, Tamil Nadu, India</div></div><div><h1>DELIVERY CHALLAN</h1><div class="number-label">${escapeHtml(document.challannumber)}</div></div></div>
    <div class="meta"><div><div class="label">Challan Date</div><div class="value">${formatDate(document.challandate)}</div></div><div><div class="label">Mode</div><div class="value">${document.challanmode === "invoice" ? "From Invoice" : "Manual / General"}</div></div><div><div class="label">Invoice / Reference</div><div class="value">${escapeHtml(reference)}</div></div></div>
    <div class="section"><div class="section-title">Deliver To</div><div class="recipient"><div><div class="value">${escapeHtml(document.recipientname || "—")}</div>${document.recipientphone ? `<div>${escapeHtml(document.recipientphone)}</div>` : ""}</div><div>${escapeHtml(document.recipientaddress || "No delivery address recorded.")}</div></div></div>
    ${document.purpose ? `<div class="section"><div class="section-title">Purpose</div><div class="notes">${escapeHtml(document.purpose)}</div></div>` : ""}
    <div class="section"><div class="section-title">Delivered Items</div><table><thead><tr><th class="center">#</th><th>Item Description</th>${document.challanmode === "invoice" ? '<th class="center">Invoice Qty</th>' : ""}<th class="center">Delivery Qty</th><th class="center">Unit</th>${amountHeaders}</tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Total Quantity</span><strong>${formatQuantity(totalQuantity)}</strong></div>${document.showamounts ? `<div><span>Total Amount</span><strong>${formatMoney(totalAmount)}</strong></div>` : ""}</div></div>
    ${document.notes ? `<div class="section"><div class="section-title">Notes</div><div class="notes">${escapeHtml(document.notes)}</div></div>` : ""}
    <div class="footer">This Delivery Challan records physical movement only and does not create an accounting or stock posting.</div>
  </body></html>`;
};

