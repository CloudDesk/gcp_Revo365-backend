import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../database/postgres.js";
import { admin } from "../firebase/firebaseAdmin.js";
import { calculateRentalInvoiceSnapshot, } from "../utils/invoice/rentalInvoiceCalculation.js";
import { getRentalSummaryInvoiceHtml, } from "../utils/invoice/rentalSummaryInvoiceTemplate.js";
import { renderHtmlToPdf } from "../utils/pdf/renderHtmlToPdf.js";
const RENTAL_INVOICE_BUCKET = process.env.RENTAL_INVOICE_BUCKET || "revo_product_invoice-dev";
const RENTAL_SUMMARY_INVOICE_FOLDER = process.env.RENTAL_SUMMARY_INVOICE_FOLDER || "rental-summary-invoices";
const RENTAL_BILLING_TIMEZONE = "Asia/Kolkata";
const DOCUMENT_TYPE = "rental_summary_with_supporting_document";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_LOGO_PATH = path.resolve(__dirname, "../../assets/teqit_logo.jpeg");
let cachedDefaultLogoDataUrl;
const COMPANY_DETAILS = {
    companyName: "Rev0365Global Private Limited",
    companyAddressLine1: "1/54,OMR,PERUNGUDI,",
    companyAddressLine2: "Chennai-600096",
    gstin: "33AAMCR5393J1ZV",
    pan: "AAMCR5393J",
    phoneNumber: "+91 7567386365",
    bankName: "Rev0365 Global Private Limited",
    accountNumber: "00000044015545872",
    ifsc: "SBIN0013241",
    branch: "SBI Egmore",
};
const normalizeText = (value) => {
    const text = String(value ?? "").trim();
    return text || null;
};
const parseJsonValue = (value, fallback) => {
    if (value == null)
        return fallback;
    if (typeof value === "object")
        return value;
    try {
        return JSON.parse(String(value));
    }
    catch {
        return fallback;
    }
};
const sanitizeFileName = (value) => String(value ?? "rental-invoice")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "rental-invoice";
const toNumber = (value) => {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    const numericValue = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numericValue) ? numericValue : 0;
};
const parseDateValue = (value) => {
    if (value == null || value === "")
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
        return new Date(String(Math.trunc(numericValue)).length <= 10
            ? numericValue * 1000
            : numericValue);
    }
    const parsedDate = new Date(String(value));
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};
const getDatePart = (date, part) => new Intl.DateTimeFormat("en-GB", {
    timeZone: RENTAL_BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
})
    .formatToParts(date)
    .find((entry) => entry.type === part)?.value || "";
const formatDateKey = (date) => `${getDatePart(date, "year")}-${getDatePart(date, "month")}-${getDatePart(date, "day")}`;
const formatInvoiceDate = (date) => `${getDatePart(date, "day")}-${getDatePart(date, "month")}-${getDatePart(date, "year")}`;
const formatBillingPeriodLabel = (date) => new Intl.DateTimeFormat("en-GB", {
    timeZone: RENTAL_BILLING_TIMEZONE,
    month: "long",
    year: "numeric",
}).format(date);
const shiftDateByMonths = (baseDate, months) => {
    const shiftedDate = new Date(baseDate);
    const originalDay = shiftedDate.getDate();
    shiftedDate.setMonth(shiftedDate.getMonth() + months);
    if (shiftedDate.getDate() < originalDay)
        shiftedDate.setDate(0);
    return shiftedDate;
};
const formatAmount = (value) => new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(toNumber(value));
const formatTaxRate = (value) => new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
}).format(toNumber(value));
const firstPresentText = (...values) => {
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized)
            return normalized;
    }
    return "";
};
const formatAddressSnapshot = (value) => {
    const snapshot = parseJsonValue(value, null);
    if (!snapshot)
        return "";
    return [
        snapshot.doornumber,
        snapshot.address,
        snapshot.landmark,
        snapshot.city,
        snapshot.state,
        snapshot.pincode,
    ]
        .map((item) => normalizeText(item))
        .filter(Boolean)
        .join(", ");
};
const buildCustomerAddress = (invoice) => firstPresentText(formatAddressSnapshot(invoice?.billingaddresssnapshot), invoice?.customeraddress, invoice?.address);
const getDefaultLogoDataUrl = async () => {
    if (cachedDefaultLogoDataUrl !== undefined)
        return cachedDefaultLogoDataUrl;
    try {
        const logoBuffer = await readFile(DEFAULT_LOGO_PATH);
        cachedDefaultLogoDataUrl = `data:image/jpeg;base64,${logoBuffer.toString("base64")}`;
    }
    catch (error) {
        cachedDefaultLogoDataUrl = null;
        console.warn(`Rental invoice logo not found at ${DEFAULT_LOGO_PATH}: ${error?.message || error}`);
    }
    return cachedDefaultLogoDataUrl;
};
const uploadPdf = async (pdfBuffer, destination, fileName) => {
    const bucket = admin.storage().bucket(RENTAL_INVOICE_BUCKET);
    const uploadedFile = bucket.file(destination);
    await uploadedFile.save(pdfBuffer, {
        contentType: "application/pdf",
        resumable: false,
        metadata: {
            cacheControl: "no-store, max-age=0",
            contentDisposition: `inline; filename="${fileName}"`,
        },
    });
    return `https://storage.googleapis.com/${RENTAL_INVOICE_BUCKET}/${destination}?v=${Date.now()}`;
};
const fetchInvoice = async (invoiceId) => {
    const result = await query(`SELECT * FROM revoinvoice WHERE id = $1`, [invoiceId]);
    return result.rows[0] || null;
};
const getSelectedOrderLineIds = (invoice) => {
    const invoiceData = parseJsonValue(invoice?.invoicedata, {});
    const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
    return Array.from(new Set(items
        .map((item) => Number(item?.orderLineId ?? item?.orderlineid))
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((id) => Math.trunc(id))));
};
const fetchRentalOrderLines = async (uniqueOrderId, selectedOrderLineIds) => {
    if (!uniqueOrderId)
        return [];
    const queryParams = [uniqueOrderId];
    const selectedLineClause = selectedOrderLineIds.length
        ? `AND id = ANY($2::int[])`
        : "";
    if (selectedOrderLineIds.length)
        queryParams.push(selectedOrderLineIds);
    const result = await query(`
    SELECT
      id,
      orderlinenumber,
      productname,
      productamount,
      discountamount,
      orderamount,
      quantity,
      saccode,
      hsncode,
      cgst,
      sgst,
      igst,
      taxmode,
      taxcalculationmode,
      customertaxstate,
      customertaxpincode,
      rentstartdate,
      rentenddate
    FROM orderline
    WHERE uniqueorderid = $1
      AND LOWER(COALESCE(ordername, '')) = 'rental'
      AND COALESCE(isactivebillingline, TRUE) = TRUE
      ${selectedLineClause}
    ORDER BY id
    `, queryParams);
    if (selectedOrderLineIds.length && result.rows.length !== selectedOrderLineIds.length) {
        throw new Error("One or more selected rental order lines are unavailable for invoicing.");
    }
    return result.rows;
};
const buildCanonicalInvoiceData = (snapshot) => ({
    version: snapshot.version,
    currency: snapshot.currency,
    ordername: "rental",
    taxmode: snapshot.taxMode,
    taxcalculationmode: "exclusive",
    subtotalamount: snapshot.subtotalAmount,
    discountamount: snapshot.discountAmount,
    taxableamount: snapshot.taxableAmount,
    cgstrate: snapshot.cgstRate,
    sgstrate: snapshot.sgstRate,
    igstrate: snapshot.igstRate,
    cgstamount: snapshot.cgstAmount,
    sgstamount: snapshot.sgstAmount,
    igstamount: snapshot.igstAmount,
    taxamount: snapshot.taxAmount,
    totalbeforeroundoff: snapshot.totalBeforeRoundOff,
    roundoffamount: snapshot.roundOffAmount,
    payableamount: snapshot.payableAmount,
    items: snapshot.items.map((item, index) => ({
        id: index + 1,
        orderlineid: item.orderLineId,
        orderlinenumber: item.orderLineNumber,
        name: item.productName,
        quantity: item.quantity,
        unitrate: item.unitRate,
        grossamount: item.grossAmount,
        discountamount: item.discountAmount,
        taxableamount: item.taxableAmount,
        taxmode: item.taxMode,
        cgstrate: item.cgstRate,
        sgstrate: item.sgstRate,
        igstrate: item.igstRate,
        cgstamount: item.cgstAmount,
        sgstamount: item.sgstAmount,
        igstamount: item.igstAmount,
        taxamount: item.taxAmount,
        totalamount: item.totalAmount,
        saccode: item.sacCode,
        rentstartdate: item.rentStartDate,
        rentenddate: item.rentEndDate,
    })),
});
const buildDocumentData = (invoice, orderLines, snapshot, options) => {
    const rentalDeviceCount = Math.max(snapshot.items.reduce((total, item) => total + item.quantity, 0), 1);
    const billingStart = parseDateValue(invoice?.invoicedate) ||
        parseDateValue(orderLines[0]?.rentstartdate) ||
        parseDateValue(invoice?.createddate);
    const invoiceCreatedDate = parseDateValue(invoice?.createddate) || parseDateValue(Date.now()) || new Date();
    const billingPeriodStart = billingStart || invoiceCreatedDate;
    const billingPeriodEnd = shiftDateByMonths(billingPeriodStart, 1);
    billingPeriodEnd.setDate(billingPeriodEnd.getDate() - 1);
    const billingPeriodLabel = formatBillingPeriodLabel(billingPeriodStart);
    const itemLabel = firstPresentText(options.summaryitemlabel, "Laptop Rental");
    const deviceLabel = rentalDeviceCount === 1 ? "Device" : "Devices";
    const summaryDescription = `${itemLabel}(${rentalDeviceCount} ${deviceLabel} for ${billingPeriodLabel})`;
    const firstOrderLine = orderLines[0] || {};
    const firstItem = snapshot.items[0];
    const sacCode = firstPresentText(firstItem?.sacCode, "997315");
    const companyAccountNumber = firstPresentText(invoice?.odaccountnumber, COMPANY_DETAILS.accountNumber);
    const companyIfsc = firstPresentText(invoice?.ifsc, COMPANY_DETAILS.ifsc);
    const placeOfSupply = firstPresentText(options.placeOfSupply, firstOrderLine?.customertaxstate, firstOrderLine?.customertaxpincode, "same as billing");
    const roundOffSign = snapshot.roundOffAmount >= 0 ? "+" : "-";
    const summaryInvoiceData = {
        companyname: COMPANY_DETAILS.companyName,
        companyaddressline1: COMPANY_DETAILS.companyAddressLine1,
        companyaddressline2: COMPANY_DETAILS.companyAddressLine2,
        gstnumber: COMPANY_DETAILS.gstin,
        customername: firstPresentText(invoice?.customername),
        customeraddress: buildCustomerAddress(invoice),
        customergstnumber: firstPresentText(invoice?.customergstnumber, "-"),
        placeofsupply: placeOfSupply,
        invoicenumber: firstPresentText(invoice?.invoicenumber),
        invoicedate: formatInvoiceDate(invoiceCreatedDate),
        summarydescription: summaryDescription,
        saccode: sacCode,
        grossamount: formatAmount(snapshot.subtotalAmount),
        discountamount: formatAmount(snapshot.discountAmount),
        taxablevalue: formatAmount(snapshot.taxableAmount),
        taxmode: snapshot.taxMode,
        cgstrate: formatTaxRate(snapshot.cgstRate),
        sgstrate: formatTaxRate(snapshot.sgstRate),
        igstrate: formatTaxRate(snapshot.igstRate),
        cgstamount: formatAmount(snapshot.cgstAmount),
        sgstamount: formatAmount(snapshot.sgstAmount),
        igstamount: formatAmount(snapshot.igstAmount),
        roundoffamount: formatAmount(Math.abs(snapshot.roundOffAmount)),
        roundoffsign: roundOffSign,
        totalamount: formatAmount(snapshot.payableAmount),
        companypan: COMPANY_DETAILS.pan,
        companybankname: COMPANY_DETAILS.bankName,
        companyaccountnumber: companyAccountNumber,
        companyifsc: companyIfsc,
        billingperiodstart: formatDateKey(billingPeriodStart),
        billingperiodend: formatDateKey(billingPeriodEnd),
        billingperiodlabel: billingPeriodLabel,
        rentaldevicecount: rentalDeviceCount,
    };
    const summaryTemplateData = {
        companyName: summaryInvoiceData.companyname,
        companyAddressLine1: summaryInvoiceData.companyaddressline1,
        companyAddressLine2: summaryInvoiceData.companyaddressline2,
        companyGstin: summaryInvoiceData.gstnumber,
        customerName: summaryInvoiceData.customername,
        customerAddress: summaryInvoiceData.customeraddress,
        customerGstin: summaryInvoiceData.customergstnumber,
        placeOfSupply: summaryInvoiceData.placeofsupply,
        invoiceNumber: summaryInvoiceData.invoicenumber,
        invoiceDate: summaryInvoiceData.invoicedate,
        summaryDescription: summaryInvoiceData.summarydescription,
        sacCode: summaryInvoiceData.saccode,
        grossAmount: summaryInvoiceData.grossamount,
        discountAmount: summaryInvoiceData.discountamount,
        taxableValue: summaryInvoiceData.taxablevalue,
        taxMode: summaryInvoiceData.taxmode,
        cgstRate: summaryInvoiceData.cgstrate,
        sgstRate: summaryInvoiceData.sgstrate,
        igstRate: summaryInvoiceData.igstrate,
        cgstAmount: summaryInvoiceData.cgstamount,
        sgstAmount: summaryInvoiceData.sgstamount,
        igstAmount: summaryInvoiceData.igstamount,
        roundOffAmount: summaryInvoiceData.roundoffamount,
        roundOffSign: summaryInvoiceData.roundoffsign,
        totalAmount: summaryInvoiceData.totalamount,
        companyPan: summaryInvoiceData.companypan,
        companyBankName: summaryInvoiceData.companybankname,
        companyAccountNumber: summaryInvoiceData.companyaccountnumber,
        companyIfsc: summaryInvoiceData.companyifsc,
        logoUrl: options.logoUrl,
        signatureUrl: options.signatureUrl,
    };
    return { summaryInvoiceData, summaryTemplateData };
};
export var rentalInvoiceDocumentService;
(function (rentalInvoiceDocumentService) {
    rentalInvoiceDocumentService.generateRentalInvoiceDocuments = async (invoiceId, options = {}) => {
        if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
            throw new Error("A valid invoice id is required.");
        }
        const invoice = await fetchInvoice(invoiceId);
        if (!invoice)
            throw new Error("Rental invoice record not found.");
        if (String(invoice.invoicefor || "").toLowerCase() !== "rental") {
            throw new Error("Rental invoice documents can only be generated for rental invoices.");
        }
        const selectedOrderLineIds = getSelectedOrderLineIds(invoice);
        const orderLines = await fetchRentalOrderLines(String(invoice.orderid || ""), selectedOrderLineIds);
        const snapshot = calculateRentalInvoiceSnapshot(orderLines);
        const canonicalInvoiceData = buildCanonicalInvoiceData(snapshot);
        const logoUrl = firstPresentText(options.logoUrl, await getDefaultLogoDataUrl());
        const supportingDocumentUrl = firstPresentText(options.supportingdocumenturl, invoice.supportingdocumenturl, invoice.invoiceurl);
        if (!supportingDocumentUrl) {
            throw new Error("Supporting document URL is required before generating rental summary invoice.");
        }
        const { summaryInvoiceData, summaryTemplateData } = buildDocumentData(invoice, orderLines, snapshot, { ...options, logoUrl });
        const summaryHtml = getRentalSummaryInvoiceHtml(summaryTemplateData);
        const summaryPdfBuffer = await renderHtmlToPdf(summaryHtml);
        const safeInvoiceNumber = sanitizeFileName(invoice.invoicenumber || `rental-invoice-${invoice.id}`);
        const summaryFileName = `${safeInvoiceNumber}-summary.pdf`;
        const summaryInvoiceUrl = await uploadPdf(summaryPdfBuffer, `${RENTAL_SUMMARY_INVOICE_FOLDER}/${summaryFileName}`, summaryFileName);
        const updateResult = await query(`
      UPDATE revoinvoice
      SET
        invoiceurl = $1,
        supportingdocumenturl = $2,
        invoicedata = $3,
        summaryinvoicedata = $4,
        supportingdocumentdata = $3,
        billingperiodstart = $5,
        billingperiodend = $6,
        billingperiodlabel = $7,
        rentaldevicecount = $8,
        invoicedocumenttype = $9,
        taxamount = $10,
        discount = $11,
        totalorderamount = $12,
        modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = $13
      RETURNING *
      `, [
            summaryInvoiceUrl,
            supportingDocumentUrl,
            canonicalInvoiceData,
            summaryInvoiceData,
            summaryInvoiceData.billingperiodstart,
            summaryInvoiceData.billingperiodend,
            summaryInvoiceData.billingperiodlabel,
            summaryInvoiceData.rentaldevicecount,
            DOCUMENT_TYPE,
            snapshot.taxAmount,
            snapshot.discountAmount,
            snapshot.payableAmount,
            invoiceId,
        ]);
        return {
            invoice: updateResult.rows[0],
            invoiceurl: summaryInvoiceUrl,
            supportingdocumenturl: supportingDocumentUrl,
            invoicedata: canonicalInvoiceData,
            summaryinvoicedata: summaryInvoiceData,
        };
    };
})(rentalInvoiceDocumentService || (rentalInvoiceDocumentService = {}));
//# sourceMappingURL=rentalInvoiceDocument.service.js.map