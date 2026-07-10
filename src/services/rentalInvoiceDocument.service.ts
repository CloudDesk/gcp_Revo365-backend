import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../database/postgres.js";
import { admin } from "../firebase/firebaseAdmin.js";
import {
  getRentalSummaryInvoiceHtml,
  RentalSummaryInvoiceTemplateData,
} from "../utils/invoice/rentalSummaryInvoiceTemplate.js";
import { renderHtmlToPdf } from "../utils/pdf/renderHtmlToPdf.js";

const RENTAL_INVOICE_BUCKET =
  process.env.RENTAL_INVOICE_BUCKET || "revo_product_invoice-dev";
const RENTAL_SUMMARY_INVOICE_FOLDER =
  process.env.RENTAL_SUMMARY_INVOICE_FOLDER || "rental-summary-invoices";
const RENTAL_BILLING_TIMEZONE = "Asia/Kolkata";
const DOCUMENT_TYPE = "rental_summary_with_supporting_document";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_LOGO_PATH = path.resolve(__dirname, "../../assets/teqit_yellow.png");
let cachedDefaultLogoDataUrl: string | null | undefined;

const COMPANY_DETAILS = {
  companyName: "Rev0365Global Private Limited",
  companyAddressLine1: "1/54,OMR,PERUNGUDI,",
  companyAddressLine2: "Chennai-600096",
  gstin: "33AAMCR5393J1ZV",
  pan: "AAMCR5393J",
  bankName: "Rev0365 Global Private Limited",
  accountNumber: "00000044015545872",
  ifsc: "SBIN0013241",
};

type GenerateRentalInvoiceDocumentOptions = {
  supportingdocumenturl?: string | null;
  summaryitemlabel?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  placeOfSupply?: string | null;
};

const normalizeText = (value: any) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const parseJsonValue = <T>(value: any, fallback: T): T => {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "object") {
    return value as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const sanitizeFileName = (value: any) =>
  String(value ?? "rental-invoice")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "rental-invoice";

const toNumber = (value: any) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const numericValue = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const parseDateValue = (value: any): Date | null => {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(
      String(Math.trunc(numericValue)).length <= 10
        ? numericValue * 1000
        : numericValue
    );
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getDatePart = (date: Date, part: Intl.DateTimeFormatPartTypes) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: RENTAL_BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .find((entry) => entry.type === part)?.value || "";

const formatDateKey = (date: Date) => {
  const year = getDatePart(date, "year");
  const month = getDatePart(date, "month");
  const day = getDatePart(date, "day");
  return `${year}-${month}-${day}`;
};

const formatInvoiceDate = (date: Date) => {
  const day = getDatePart(date, "day");
  const month = getDatePart(date, "month");
  const year = getDatePart(date, "year");
  return `${day}-${month}-${year}`;
};

const formatBillingPeriodLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: RENTAL_BILLING_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(date);

const shiftDateByMonths = (baseDate: Date, months: number) => {
  const shiftedDate = new Date(baseDate);
  const originalDay = shiftedDate.getDate();
  shiftedDate.setMonth(shiftedDate.getMonth() + months);
  if (shiftedDate.getDate() < originalDay) {
    shiftedDate.setDate(0);
  }
  return shiftedDate;
};

const formatAmount = (value: any) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));

const firstPresentText = (...values: any[]) => {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
};

const sumQuantities = (items: any[]) =>
  items.reduce((total, item) => total + Math.max(toNumber(item?.quantity), 0), 0);

const buildCustomerAddress = (invoice: any) =>
  firstPresentText(invoice?.customeraddress, invoice?.address);

const getDefaultLogoDataUrl = async () => {
  if (cachedDefaultLogoDataUrl !== undefined) {
    return cachedDefaultLogoDataUrl;
  }

  try {
    const logoBuffer = await readFile(DEFAULT_LOGO_PATH);
    cachedDefaultLogoDataUrl = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  } catch (error: any) {
    cachedDefaultLogoDataUrl = null;
    console.warn(
      `Rental summary invoice logo not found at ${DEFAULT_LOGO_PATH}: ${error?.message || error}`
    );
  }

  return cachedDefaultLogoDataUrl;
};

const uploadPdf = async (
  pdfBuffer: Buffer,
  destination: string,
  fileName: string
) => {
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

const fetchInvoice = async (invoiceId: number) => {
  const result = await query(`SELECT * FROM revoinvoice WHERE id = $1`, [
    invoiceId,
  ]);
  return result.rows[0] || null;
};

const fetchRentalOrderLines = async (uniqueOrderId: string) => {
  if (!uniqueOrderId) {
    return [];
  }

  const result = await query(
    `
    SELECT
      id,
      productname,
      quantity,
      saccode,
      hsncode,
      customertaxstate,
      customertaxpincode,
      rentstartdate,
      rentenddate
    FROM orderline
    WHERE uniqueorderid = $1
      AND LOWER(COALESCE(ordername, '')) = 'rental'
      AND COALESCE(isactivebillingline, TRUE) = TRUE
    ORDER BY id
    `,
    [uniqueOrderId]
  );

  return result.rows;
};

const buildSummaryData = (
  invoice: any,
  orderLines: any[],
  options: GenerateRentalInvoiceDocumentOptions
) => {
  const invoiceData = parseJsonValue<any>(invoice?.invoicedata, {});
  const invoiceItems = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
  const itemsForQuantity = invoiceItems.length > 0 ? invoiceItems : orderLines;
  const rentalDeviceCount = Math.max(sumQuantities(itemsForQuantity), 1);
  const billingStart =
    parseDateValue(invoice?.invoicedate) ||
    parseDateValue(orderLines[0]?.rentstartdate) ||
    parseDateValue(invoice?.createddate);
  const invoiceCreatedDate =
    parseDateValue(invoice?.createddate) || parseDateValue(Date.now());
  const billingPeriodStart = billingStart || invoiceCreatedDate || new Date();
  const billingPeriodEnd = shiftDateByMonths(billingPeriodStart, 1);
  billingPeriodEnd.setDate(billingPeriodEnd.getDate() - 1);

  const billingPeriodLabel = formatBillingPeriodLabel(billingPeriodStart);
  const itemLabel = firstPresentText(options.summaryitemlabel, "Laptop Rental");
  const deviceLabel = rentalDeviceCount === 1 ? "Device" : "Devices";
  const summaryDescription = `${itemLabel}(${rentalDeviceCount} ${deviceLabel} for ${billingPeriodLabel})`;
  const firstInvoiceItem = invoiceItems[0] || {};
  const firstOrderLine = orderLines[0] || {};
  const sacCode = firstPresentText(
    firstInvoiceItem?.saccode,
    firstInvoiceItem?.hsncode,
    firstOrderLine?.saccode,
    firstOrderLine?.hsncode,
    "997315"
  );
  const cgstAmount = toNumber(invoiceData?.cgst);
  const sgstAmount = toNumber(invoiceData?.sgst);
  const igstAmount = toNumber(invoiceData?.igst);
  const taxableValue = toNumber(invoiceData?.subtotal);
  const totalAmount =
    toNumber(invoiceData?.total) ||
    taxableValue + cgstAmount + sgstAmount + igstAmount;
  const companyAccountNumber = firstPresentText(
    invoice?.odaccountnumber,
    COMPANY_DETAILS.accountNumber
  );
  const companyIfsc = firstPresentText(invoice?.ifsc, COMPANY_DETAILS.ifsc);
  const placeOfSupply = firstPresentText(options.placeOfSupply, "same as billing");

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
    invoicedate: formatInvoiceDate(invoiceCreatedDate || new Date()),
    summarydescription: summaryDescription,
    saccode: sacCode,
    taxablevalue: formatAmount(taxableValue),
    cgstamount: formatAmount(cgstAmount),
    sgstamount: formatAmount(sgstAmount),
    igstamount: formatAmount(igstAmount),
    totalamount: formatAmount(totalAmount),
    companypan: COMPANY_DETAILS.pan,
    companybankname: COMPANY_DETAILS.bankName,
    companyaccountnumber: companyAccountNumber,
    companyifsc: companyIfsc,
    billingperiodstart: formatDateKey(billingPeriodStart),
    billingperiodend: formatDateKey(billingPeriodEnd),
    billingperiodlabel: billingPeriodLabel,
    rentaldevicecount: rentalDeviceCount,
  };

  const templateData: RentalSummaryInvoiceTemplateData = {
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
    taxableValue: summaryInvoiceData.taxablevalue,
    cgstAmount: summaryInvoiceData.cgstamount,
    sgstAmount: summaryInvoiceData.sgstamount,
    igstAmount: summaryInvoiceData.igstamount,
    totalAmount: summaryInvoiceData.totalamount,
    companyPan: summaryInvoiceData.companypan,
    companyBankName: summaryInvoiceData.companybankname,
    companyAccountNumber: summaryInvoiceData.companyaccountnumber,
    companyIfsc: summaryInvoiceData.companyifsc,
    logoUrl: options.logoUrl,
    signatureUrl: options.signatureUrl,
  };

  return {
    summaryInvoiceData,
    supportingDocumentData: invoiceData,
    templateData,
  };
};

export module rentalInvoiceDocumentService {
  export const generateRentalInvoiceDocuments = async (
    invoiceId: number,
    options: GenerateRentalInvoiceDocumentOptions = {}
  ) => {
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
      throw new Error("A valid invoice id is required.");
    }

    const invoice = await fetchInvoice(invoiceId);
    if (!invoice) {
      throw new Error("Rental invoice record not found.");
    }

    if (String(invoice.invoicefor || "").toLowerCase() !== "rental") {
      throw new Error("Rental summary invoice can only be generated for rental invoices.");
    }

    const supportingDocumentUrl = firstPresentText(
      options.supportingdocumenturl,
      invoice.supportingdocumenturl,
      invoice.invoiceurl
    );

    if (!supportingDocumentUrl) {
      throw new Error("Supporting document URL is required before generating rental summary invoice.");
    }

    const orderLines = await fetchRentalOrderLines(String(invoice.orderid || ""));
    const logoUrl = firstPresentText(options.logoUrl, await getDefaultLogoDataUrl());
    const { summaryInvoiceData, supportingDocumentData, templateData } =
      buildSummaryData(invoice, orderLines, { ...options, logoUrl });
    const html = getRentalSummaryInvoiceHtml(templateData);
    const pdfBuffer = await renderHtmlToPdf(html);
    const safeInvoiceNumber = sanitizeFileName(
      invoice.invoicenumber || `rental-invoice-${invoice.id}`
    );
    const fileName = `${safeInvoiceNumber}-summary.pdf`;
    const destination = `${RENTAL_SUMMARY_INVOICE_FOLDER}/${fileName}`;
    const summaryInvoiceUrl = await uploadPdf(pdfBuffer, destination, fileName);

    const updateResult = await query(
      `
      UPDATE revoinvoice
      SET
        invoiceurl = $1,
        supportingdocumenturl = $2,
        summaryinvoicedata = $3,
        supportingdocumentdata = $4,
        billingperiodstart = $5,
        billingperiodend = $6,
        billingperiodlabel = $7,
        rentaldevicecount = $8,
        invoicedocumenttype = $9,
        modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE id = $10
      RETURNING *
      `,
      [
        summaryInvoiceUrl,
        supportingDocumentUrl,
        summaryInvoiceData,
        supportingDocumentData,
        summaryInvoiceData.billingperiodstart,
        summaryInvoiceData.billingperiodend,
        summaryInvoiceData.billingperiodlabel,
        summaryInvoiceData.rentaldevicecount,
        DOCUMENT_TYPE,
        invoiceId,
      ]
    );

    return {
      invoice: updateResult.rows[0],
      invoiceurl: summaryInvoiceUrl,
      supportingdocumenturl: supportingDocumentUrl,
      summaryinvoicedata: summaryInvoiceData,
    };
  };
}
