export type ConsolidatedInvoiceTemplateRow = {
  sourceInvoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTypeLabel: string;
  description: string;
  quantityLabel: string;
  billingRangeLabel?: string;
  billingDaysLabel?: string;
  monthlyTaxableAmount?: string;
  dailyTaxableAmount?: string;
  sacCode?: string;
  taxableAmount: string;
  taxAmount: string;
  totalAmount: string;
  invoiceUrl?: string | null;
  supportingDocumentUrl?: string | null;
};

export type ConsolidatedInvoiceTemplateData = {
  companyName: string;
  companyAddress: string;
  companyAddressLine1?: string;
  companyAddressLine2?: string;
  companyGstin: string;
  companyPan?: string;
  companyBankName?: string;
  companyAccountNumber?: string;
  companyIfsc?: string;
  documentNumber: string;
  generatedDate: string;
  periodLabel: string;
  billingRangeLabel?: string;
  billingThroughDate?: string;
  versionLabel?: string;
  customerName: string;
  customerAddress: string;
  customerGstin: string;
  customerPhone: string;
  placeOfSupply?: string;
  summaryDescription?: string;
  sacCode?: string;
  taxMode?: "cgst_sgst" | "igst";
  cgstRate?: string;
  sgstRate?: string;
  igstRate?: string;
  cgstAmount?: string;
  sgstAmount?: string;
  igstAmount?: string;
  rows: ConsolidatedInvoiceTemplateRow[];
  subtotalAmount: string;
  taxAmount: string;
  roundOffAmount?: string;
  roundOffSign?: "+" | "-";
  totalAmount: string;
  logoUrl?: string | null;
  signatureUrl?: string | null;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const multiline = (value: unknown) =>
  escapeHtml(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br />");

const parseAmount = (value: unknown) => {
  const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatAmount = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseAmount(value));

const splitCompanyAddress = (data: ConsolidatedInvoiceTemplateData) => {
  const addressLines = String(data.companyAddress || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    line1: data.companyAddressLine1 || addressLines[0] || "",
    line2: data.companyAddressLine2 || addressLines.slice(1).join(", ") || "",
  };
};

const renderLogo = (data: ConsolidatedInvoiceTemplateData) => {
  if (data.logoUrl) {
    return `<img class="logo-img" src="${escapeHtml(data.logoUrl)}" alt="TEQIT logo" />`;
  }

  return `<div class="logo-slot">TEQIT!</div>`;
};

const renderSignature = (data: ConsolidatedInvoiceTemplateData) => {
  if (!data.signatureUrl) return `<div class="signature-placeholder"></div>`;
  return `<img class="signature-img" src="${escapeHtml(data.signatureUrl)}" alt="Authorised signature" />`;
};

const getTaxMode = (data: ConsolidatedInvoiceTemplateData) =>
  data.taxMode === "igst" ? "igst" : "cgst_sgst";

const getCgstAmount = (data: ConsolidatedInvoiceTemplateData) =>
  data.cgstAmount || formatAmount(parseAmount(data.taxAmount) / 2);

const getSgstAmount = (data: ConsolidatedInvoiceTemplateData) =>
  data.sgstAmount || formatAmount(parseAmount(data.taxAmount) / 2);

const getIgstAmount = (data: ConsolidatedInvoiceTemplateData) =>
  data.igstAmount || data.taxAmount;

const getRoundOffSign = (data: ConsolidatedInvoiceTemplateData) =>
  data.roundOffSign === "-" ? "-" : "+";

const getRoundOffAmount = (data: ConsolidatedInvoiceTemplateData) =>
  data.roundOffAmount || "0.00";

const getSignedRoundOffAmount = (data: ConsolidatedInvoiceTemplateData) =>
  `${getRoundOffSign(data)}${getRoundOffAmount(data)}`;

const renderTaxLabels = (data: ConsolidatedInvoiceTemplateData) =>
  getTaxMode(data) === "igst"
    ? `<div>ADD IGST ${escapeHtml(data.igstRate || "18")} %</div>
                <div>Round Off</div>`
    : `<div>ADD CGST ${escapeHtml(data.cgstRate || "9")} %</div>
                <div>ADD SGST ${escapeHtml(data.sgstRate || "9")} %</div>
                <div>Round Off</div>`;

const renderTaxAmounts = (data: ConsolidatedInvoiceTemplateData) =>
  getTaxMode(data) === "igst"
    ? `<div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(getIgstAmount(data))}</span>
                </div>
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(getSignedRoundOffAmount(data))}</span>
                </div>`
    : `<div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(getCgstAmount(data))}</span>
                </div>
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(getSgstAmount(data))}</span>
                </div>
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(getSignedRoundOffAmount(data))}</span>
                </div>`;

const renderDocumentReference = (
  url: string | null | undefined,
  label: string
) => {
  if (!url) return "";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
};

const renderLineItems = (data: ConsolidatedInvoiceTemplateData) => {
  const rows = data.rows.length > 0
    ? data.rows
    : [{
        sourceInvoiceId: 0,
        invoiceNumber: "",
        invoiceDate: "",
        invoiceTypeLabel: "Rental",
        description: data.summaryDescription || `Laptop Rental for ${data.periodLabel}`,
        quantityLabel: "",
        sacCode: data.sacCode || "997315",
        taxableAmount: data.subtotalAmount,
        taxAmount: data.taxAmount,
        totalAmount: data.totalAmount,
      }];

  const itemHeight = rows.length > 5 ? 10 : 13;
  const fillerHeight = Math.max(14, 72 - rows.length * itemHeight);
  const renderedRows = rows
    .map((row) => {
      const invoiceLink = renderDocumentReference(row.invoiceUrl, "Invoice");
      const supportingLink = renderDocumentReference(row.supportingDocumentUrl, "Supporting");
      const linkSeparator = invoiceLink && supportingLink ? " | " : "";
      const hasMeta = row.invoiceNumber || row.invoiceDate || invoiceLink || supportingLink;
      const billingMeta = [
        row.billingRangeLabel ? `Billing: ${row.billingRangeLabel}` : "",
        row.billingDaysLabel ? `Days: ${row.billingDaysLabel}` : "",
        row.monthlyTaxableAmount ? `Monthly taxable: Rs. ${row.monthlyTaxableAmount}` : "",
        row.dailyTaxableAmount ? `Daily taxable: Rs. ${row.dailyTaxableAmount}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      return `<tr class="line-item-row" style="height: ${itemHeight}mm;">
        <td class="line-item-description">
          <div class="line-item-title">${escapeHtml(row.description)}</div>
          ${billingMeta ? `<div class="line-item-meta">${escapeHtml(billingMeta)}</div>` : ""}
          ${hasMeta ? `<div class="line-item-meta">
            ${row.invoiceNumber ? `Ref: ${escapeHtml(row.invoiceNumber)}` : ""}
            ${row.invoiceDate ? ` ${escapeHtml(row.invoiceDate)}` : ""}
            ${(invoiceLink || supportingLink) ? `<span class="line-item-links">${invoiceLink}${linkSeparator}${supportingLink}</span>` : ""}
          </div>` : ""}
        </td>
        <td class="line-item-sac">${escapeHtml(row.sacCode || data.sacCode || "997315")}</td>
        <td class="line-item-amount" colspan="2">
          <div class="money-row">
            <span class="currency">&#8377;</span>
            <span class="money">${escapeHtml(row.taxableAmount)}</span>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `${renderedRows}
          <tr class="description-filler-row" style="height: ${fillerHeight}mm;">
            <td></td>
            <td></td>
            <td colspan="2"></td>
          </tr>`;
};

export const getConsolidatedInvoiceHtml = (
  data: ConsolidatedInvoiceTemplateData
) => {
  const companyAddress = splitCompanyAddress(data);
  const bankName = data.companyBankName || data.companyName;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(data.documentNumber || "Consolidated Invoice")}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ffffff;
        color: #000000;
        font-family: "Times New Roman", Times, serif;
      }
      .page {
        width: 186mm;
        min-height: 273mm;
        margin: 0 auto;
        display: flex;
        align-items: flex-start;
        justify-content: center;
      }
      .invoice {
        width: 176mm;
        margin-top: 4mm;
        border: 2px solid #111111;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      td, th {
        border: 2px solid #111111;
        padding: 0;
        vertical-align: top;
      }
      .title {
        height: 5.5mm;
        text-align: center;
        font-size: 15px;
        line-height: 5.5mm;
        font-weight: 700;
        text-decoration: underline;
      }
      .company {
        position: relative;
        height: 29mm;
        text-align: center;
        font-weight: 700;
        font-size: 15px;
        line-height: 1.12;
        padding-top: 1.5mm;
      }
      .company .address {
        font-weight: 400;
      }
      .logo-slot {
        position: absolute;
        left: 12mm;
        top: 7mm;
        width: 28mm;
        height: 15mm;
        background: #f6f6f6;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #f3c400;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 20px;
        font-weight: 900;
        letter-spacing: 0;
      }
      .logo-img {
        position: absolute;
        left: 12mm;
        top: 7mm;
        width: 28mm;
        height: 15mm;
        object-fit: contain;
      }
      .head-label {
        height: 12mm;
        text-align: center;
        font-size: 15px;
        line-height: 1.05;
        font-weight: 700;
        padding-top: 1mm;
      }
      .customer-cell {
        height: 40mm;
      }
      .customer-name {
        height: 7mm;
        padding: 1.2mm 1.4mm;
        font-size: 12px;
        font-weight: 700;
      }
      .customer-address {
        height: 24mm;
        padding: 1.2mm 1.4mm;
        font-size: 12px;
        line-height: 1.12;
      }
      .customer-gstin {
        height: 8mm;
        padding: 1.2mm 1.4mm;
        font-size: 12px;
        line-height: 1.1;
      }
      .center-value {
        text-align: center;
        vertical-align: middle;
        font-size: 14px;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .normal-center {
        text-align: center;
        vertical-align: middle;
        font-size: 15px;
        font-weight: 400;
      }
      .section-label {
        height: 9mm;
        font-size: 16px;
        font-weight: 700;
        text-decoration: underline;
        padding: 1.2mm 1.4mm;
      }
      .section-label.right {
        text-align: right;
        text-decoration: none;
        padding-right: 1.2mm;
      }
      .line-item-row td {
        font-size: 13px;
        line-height: 1.15;
      }
      .line-item-description {
        padding: 2mm 1.4mm;
      }
      .line-item-title {
        font-size: 13px;
      }
      .line-item-meta {
        margin-top: 1.2mm;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 8.5px;
        color: #374151;
        line-height: 1.25;
      }
      .line-item-links {
        display: inline-block;
        margin-left: 2mm;
      }
      .line-item-links a {
        color: #1d4ed8;
        text-decoration: underline;
      }
      .line-item-sac {
        padding: 2mm 1.4mm;
        text-align: right;
      }
      .line-item-amount,
      .amount-cell {
        padding: 2mm 1mm;
      }
      .description-filler-row td {
        border-top: 0;
      }
      .money-row {
        display: grid;
        grid-template-columns: 8mm 1fr;
        align-items: start;
      }
      .currency {
        font-family: "Noto Sans", "DejaVu Sans", "Arial Unicode MS", Arial, sans-serif;
        text-align: left;
      }
      .money {
        text-align: right;
        white-space: nowrap;
      }
      .tax-row td {
        height: 46mm;
        font-size: 15px;
      }
      .tax-labels {
        padding: 2mm 1.4mm;
      }
      .tax-label-inner {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 1.2mm;
      }
      .tax-amounts {
        padding: 2mm 1mm;
      }
      .tax-amount-inner {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 1.2mm;
      }
      .total-row td {
        height: 7mm;
        font-size: 15px;
        font-weight: 700;
        vertical-align: middle;
      }
      .total-label {
        text-align: center;
      }
      .footer td {
        height: 21mm;
        font-size: 12px;
        line-height: 1.34;
      }
      .bank {
        padding: 0.8mm 1.4mm;
      }
      .signature {
        position: relative;
        text-align: center;
        padding-top: 1mm;
      }
      .signature-placeholder,
      .signature-img {
        position: absolute;
        left: 34mm;
        right: 8mm;
        bottom: 1.5mm;
        height: 13mm;
      }
      .signature-img {
        width: calc(100% - 42mm);
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="invoice">
        <table>
          <colgroup>
            <col style="width: 43.5%" />
            <col style="width: 21.5%" />
            <col style="width: 17%" />
            <col style="width: 18%" />
          </colgroup>
          <tr>
            <td class="title" colspan="4">TAX INVOICE</td>
          </tr>
          <tr>
            <td class="company" colspan="4">
              ${renderLogo(data)}
              <div>${escapeHtml(data.companyName)}</div>
              <div class="address">${escapeHtml(companyAddress.line1)}</div>
              <div class="address">${escapeHtml(companyAddress.line2)}</div>
              <div>GSTIN No :${escapeHtml(data.companyGstin)}</div>
            </td>
          </tr>
          <tr>
            <td class="head-label">CUSTOMER NAME</td>
            <td class="head-label">PLACE OF<br />SUPPLY</td>
            <td class="head-label">INVOICE NO</td>
            <td class="head-label">DATE</td>
          </tr>
          <tr>
            <td class="customer-cell">
              <div class="customer-name">${escapeHtml(data.customerName)}</div>
              <div class="customer-address">${multiline(data.customerAddress)}</div>
              <div class="customer-gstin"><strong>GSTIN NO</strong> ${escapeHtml(data.customerGstin)}</div>
            </td>
            <td class="normal-center">${escapeHtml(data.placeOfSupply || "same as billing")}</td>
            <td class="center-value">${escapeHtml(data.documentNumber)}</td>
            <td class="center-value">${escapeHtml(data.generatedDate)}</td>
          </tr>
          <tr>
            <td class="section-label">DESCRIPTION</td>
            <td class="section-label right">SAC CODE</td>
            <td class="section-label right" colspan="2">AMOUNT</td>
          </tr>
          ${renderLineItems(data)}
          <tr class="tax-row">
            <td class="tax-labels">
              <div class="tax-label-inner">
                <div>Taxable Value</div>
                ${renderTaxLabels(data)}
              </div>
            </td>
            <td></td>
            <td class="tax-amounts" colspan="2">
              <div class="tax-amount-inner">
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(data.subtotalAmount)}</span>
                </div>
                ${renderTaxAmounts(data)}
              </div>
            </td>
          </tr>
          <tr class="total-row">
            <td class="total-label" colspan="2">Total</td>
            <td class="amount-cell" colspan="2">
              <div class="money-row">
                <span class="currency">&#8377;</span>
                <span class="money">${escapeHtml(data.totalAmount)}</span>
              </div>
            </td>
          </tr>
          <tr class="footer">
            <td class="bank" colspan="2">
              Company's PAN: ${escapeHtml(data.companyPan || "")}<br />
              ${escapeHtml(bankName)}<br />
              OD Acc:${escapeHtml(data.companyAccountNumber || "")}<br />
              IFSC Code:${escapeHtml(data.companyIfsc || "")}
            </td>
            <td class="signature" colspan="2">
              For ${escapeHtml(data.companyName)}
              ${renderSignature(data)}
            </td>
          </tr>
        </table>
      </div>
    </div>
  </body>
</html>`;
};
