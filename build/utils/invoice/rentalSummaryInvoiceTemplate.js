const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const multiline = (value) => escapeHtml(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br />");
const renderImageOrLogoSlot = (data) => {
    if (data.logoUrl) {
        return `<img class="logo-img" src="${escapeHtml(data.logoUrl)}" alt="TEQIT logo" />`;
    }
    return `<div class="logo-slot">TEQIT!</div>`;
};
const renderSignature = (data) => {
    if (!data.signatureUrl) {
        return `<div class="signature-placeholder"></div>`;
    }
    return `<img class="signature-img" src="${escapeHtml(data.signatureUrl)}" alt="Authorised signature" />`;
};
const renderTaxLabels = (data) => data.taxMode === "igst"
    ? `<div>IGST ${escapeHtml(data.igstRate)}%</div>`
    : `<div>CGST ${escapeHtml(data.cgstRate)}%</div>
                <div>SGST ${escapeHtml(data.sgstRate)}%</div>`;
const renderTaxAmounts = (data) => data.taxMode === "igst"
    ? `<div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(data.igstAmount)}</span>
                </div>`
    : `<div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(data.cgstAmount)}</span>
                </div>
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(data.sgstAmount)}</span>
                </div>`;
const getSignedRoundOffAmount = (data) => `${data.roundOffSign}${data.roundOffAmount}`;
export const getRentalSummaryInvoiceHtml = (data) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(data.invoiceNumber || "Rental Invoice")}</title>
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
        font-size: 15px;
        font-weight: 700;
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
      .description-row td {
        height: 69mm;
        font-size: 15px;
        line-height: 1.1;
      }
      .description {
        padding: 2mm 1.4mm;
      }
      .sac {
        padding: 2mm 1.4mm;
        text-align: right;
      }
      .amount-cell {
        padding: 2mm 1mm;
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
              ${renderImageOrLogoSlot(data)}
              <div>${escapeHtml(data.companyName)}</div>
              <div class="address">${escapeHtml(data.companyAddressLine1)}</div>
              <div class="address">${escapeHtml(data.companyAddressLine2)}</div>
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
            <td class="normal-center">${escapeHtml(data.placeOfSupply)}</td>
            <td class="center-value">${escapeHtml(data.invoiceNumber)}</td>
            <td class="center-value">${escapeHtml(data.invoiceDate)}</td>
          </tr>
          <tr>
            <td class="section-label">DESCRIPTION</td>
            <td class="section-label right">SAC CODE</td>
            <td class="section-label right" colspan="2">AMOUNT</td>
          </tr>
          <tr class="description-row">
            <td class="description">${escapeHtml(data.summaryDescription)}</td>
            <td class="sac">${escapeHtml(data.sacCode)}</td>
            <td class="amount-cell" colspan="2">
              <div class="money-row">
                <span class="currency">&#8377;</span>
                <span class="money">${escapeHtml(data.grossAmount)}</span>
              </div>
            </td>
          </tr>
          <tr class="tax-row">
            <td class="tax-labels">
              <div class="tax-label-inner">
                <div>Gross Rental Charges</div>
                <div>Less: Discount</div>
                <div>Taxable Value</div>
                ${renderTaxLabels(data)}
                <div>Round Off</div>
              </div>
            </td>
            <td></td>
            <td class="tax-amounts" colspan="2">
              <div class="tax-amount-inner">
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(data.grossAmount)}</span>
                </div>
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">-${escapeHtml(data.discountAmount)}</span>
                </div>
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(data.taxableValue)}</span>
                </div>
                ${renderTaxAmounts(data)}
                <div class="money-row">
                  <span class="currency">&#8377;</span>
                  <span class="money">${escapeHtml(getSignedRoundOffAmount(data))}</span>
                </div>
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
              Company's PAN: ${escapeHtml(data.companyPan)}<br />
              ${escapeHtml(data.companyBankName)}<br />
              OD Acc:${escapeHtml(data.companyAccountNumber)}<br />
              IFSC Code:${escapeHtml(data.companyIfsc)}
            </td>
            <td class="signature" colspan="2">
              For ${escapeHtml(data.companyBankName)}
              ${renderSignature(data)}
            </td>
          </tr>
        </table>
      </div>
    </div>
  </body>
</html>`;
//# sourceMappingURL=rentalSummaryInvoiceTemplate.js.map