type DeliveryChallanDocumentLine = {
  productname: string;
  assetreference?: string | null;
  deliveryquantity: number;
  unit?: string | null;
  hsnsaccode?: string | null;
  unitrate?: number | null;
  lineamount?: number | null;
  taxableamount?: number | null;
  gstrate?: number | null;
  gstamount?: number | null;
  totalamount?: number | null;
};

export type DeliveryChallanDocumentData = {
  logoDataUrl?: string | null;
  challannumber: string;
  challanmode: "invoice" | "manual";
  challandate: string | Date;
  invoicenumber?: string | null;
  referencenumber?: string | null;
  purpose?: string | null;
  recipientname?: string | null;
  recipientphone?: string | null;
  recipientemail?: string | null;
  recipientaddress?: string | null;
  billingaddress?: string | null;
  notes?: string | null;
  showamounts: boolean;
  lines: DeliveryChallanDocumentLine[];
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const formatAddress = (value: unknown, fallback: string) => String(value || fallback)
  .split(/\r?\n|,\s*/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map(escapeHtml)
  .join(",<br>");
const formatDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
};
const formatQuantity = (value: unknown) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(Number(value || 0));
const formatMoney = (value: unknown) => `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}`;

export const getDeliveryChallanDocumentHtml = (document: DeliveryChallanDocumentData) => {
  const reference = document.invoicenumber || document.referencenumber || "—";
  const totalQuantity = document.lines.reduce((sum, line) => sum + Number(line.deliveryquantity || 0), 0);
  const taxableTotal = document.lines.reduce((sum, line) => sum + Number(line.taxableamount || 0), 0);
  const gstTotal = document.lines.reduce((sum, line) => sum + Number(line.gstamount || 0), 0);
  const grandTotal = document.lines.reduce((sum, line) => sum + Number(line.totalamount ?? line.lineamount ?? 0), 0);
  const amountHeaders = document.showamounts ? '<th class="number">Taxable</th><th class="number">GST</th><th class="number">Total</th>' : "";
  const rows = document.lines.map((line, index) => `<tr>
    <td class="center">${index + 1}</td>
    <td><strong>${escapeHtml(line.productname)}</strong>${line.assetreference ? `<small>Asset / Serial: ${escapeHtml(line.assetreference)}</small>` : ""}</td>
    <td class="center">${escapeHtml(line.hsnsaccode || "—")}</td>
    <td class="center strong">${formatQuantity(line.deliveryquantity)}</td>
    <td class="center">${escapeHtml(line.unit || "Nos")}</td>
    ${document.showamounts ? `<td class="number">${formatMoney(line.taxableamount)}</td><td class="number">${formatMoney(line.gstamount)}${line.gstrate != null ? `<small>${formatQuantity(line.gstrate)}%</small>` : ""}</td><td class="number strong">${formatMoney(line.totalamount ?? line.lineamount)}</td>` : ""}
  </tr>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; } * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #123b7a; padding-bottom:14px; }
    .logo { width:84px; height:42px; object-fit:cover; } h1 { margin:0; text-align:right; font-size:21px; }
    .number-label { margin-top:6px; text-align:right; color:#536079; }
    .meta { display:grid; grid-template-columns:repeat(3,1fr); margin-top:16px; border:1px solid #dce3ed; border-radius:6px; overflow:hidden; }
    .meta>div { min-height:58px; padding:11px 13px; border-right:1px solid #dce3ed; } .meta>div:last-child { border-right:0; }
    .label,.section-title { color:#66748c; font-size:9px; font-weight:700; letter-spacing:.45px; text-transform:uppercase; }
    .value { margin-top:5px; font-size:12px; font-weight:700; } .section { margin-top:16px; } .section-title { margin-bottom:8px; }
    .address-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .recipient { min-width:0; min-height:92px; padding:13px; border:1px solid #dce3ed; border-radius:6px; line-height:1.55; overflow-wrap:anywhere; word-break:break-word; }
    .recipient-address { margin-top:8px; color:#46536a; white-space:normal; overflow-wrap:anywhere; word-break:break-word; } table { width:100%; border-collapse:collapse; border:1px solid #dce3ed; }
    th { padding:8px 6px; background:#f3f6fa; color:#536079; font-size:8px; text-align:left; text-transform:uppercase; }
    td { padding:9px 6px; border-top:1px solid #e7ebf1; vertical-align:top; } small { display:block; margin-top:3px; color:#738096; font-size:8px; font-weight:400; }
    .center{text-align:center}.number{text-align:right}.strong{font-weight:700}.totals{display:flex;justify-content:flex-end;flex-wrap:wrap;border:1px solid #dce3ed;border-top:0}
    .totals>div{min-width:145px;padding:9px 12px;display:flex;justify-content:space-between}.notes{padding:12px 13px;border-radius:6px;background:#f7f9fc;color:#46536a;line-height:1.55;white-space:pre-wrap}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:58px}.signature{padding-top:9px;border-top:1px solid #536079;text-align:center;font-weight:700}
    .footer{margin-top:24px;padding-top:10px;border-top:1px solid #dce3ed;color:#7a879b;font-size:9px;text-align:center}
  </style></head><body>
    <div class="header"><div>${document.logoDataUrl ? `<img class="logo" src="${escapeHtml(document.logoDataUrl)}" alt="TeqIT">` : ""}</div><div><h1>DELIVERY CHALLAN</h1><div class="number-label">${escapeHtml(document.challannumber)}</div></div></div>
    <div class="meta"><div><div class="label">Challan Date</div><div class="value">${formatDate(document.challandate)}</div></div><div><div class="label">Mode</div><div class="value">${document.challanmode === "invoice" ? "From Invoice" : "Manual / General"}</div></div><div><div class="label">Invoice / Reference</div><div class="value">${escapeHtml(reference)}</div></div></div>
    <div class="section address-grid"><div><div class="section-title">Billing Address</div><div class="recipient">${formatAddress(document.billingaddress, "No billing address recorded.")}</div></div><div><div class="section-title">Deliver To</div><div class="recipient"><div class="value">${escapeHtml(document.recipientname || "—")}</div>${document.recipientphone ? `<div>${escapeHtml(document.recipientphone)}</div>` : ""}${document.recipientemail ? `<div>${escapeHtml(document.recipientemail)}</div>` : ""}<div class="recipient-address">${formatAddress(document.recipientaddress, "No delivery address recorded.")}</div></div></div></div>
    <div class="section"><div class="section-title">Purpose</div><div class="notes">${escapeHtml(document.purpose || "—")}</div></div>
    <div class="section"><div class="section-title">Delivered Items</div><table><thead><tr><th class="center">S.No</th><th>Item Description</th><th class="center">HSN/SAC</th><th class="center">Delivery Qty</th><th class="center">Unit</th>${amountHeaders}</tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Total Quantity</span><strong>${formatQuantity(totalQuantity)}</strong></div>${document.showamounts ? `<div><span>Taxable</span><strong>${formatMoney(taxableTotal)}</strong></div><div><span>GST</span><strong>${formatMoney(gstTotal)}</strong></div><div><span>Total</span><strong>${formatMoney(grandTotal)}</strong></div>` : ""}</div></div>
    ${document.notes ? `<div class="section"><div class="section-title">Notes</div><div class="notes">${escapeHtml(document.notes)}</div></div>` : ""}
    <div class="signatures"><div class="signature">Recipient's Signature</div><div class="signature">For TEQIT — Authorised Signatory</div></div>
    <div class="footer">This Delivery Challan records physical movement only and does not create an accounting or stock posting.</div>
  </body></html>`;
};
