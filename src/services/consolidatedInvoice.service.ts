import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool, { query } from "../database/postgres.js";
import { admin } from "../firebase/firebaseAdmin.js";
import { renderHtmlToPdf } from "../utils/pdf/renderHtmlToPdf.js";
import {
  getConsolidatedInvoiceHtml,
  ConsolidatedInvoiceTemplateData,
} from "../utils/invoice/consolidatedInvoiceTemplate.js";

const CONSOLIDATED_INVOICE_BUCKET =
  process.env.CONSOLIDATED_INVOICE_BUCKET ||
  process.env.RENTAL_INVOICE_BUCKET ||
  "revo_product_invoice-dev";
const CONSOLIDATED_INVOICE_FOLDER =
  process.env.CONSOLIDATED_INVOICE_FOLDER || "consolidated-invoices";
const BILLING_TIMEZONE = "Asia/Kolkata";
const DEFAULT_INVOICE_FOR = ["rental"];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_LOGO_PATH = path.resolve(__dirname, "../../assets/teqit_logo.jpeg");
let cachedDefaultLogoDataUrl: string | null | undefined;

const COMPANY_DETAILS = {
  companyName: "Rev0365Global Private Limited",
  companyAddressLine1: "1/54,OMR,PERUNGUDI,",
  companyAddressLine2: "Chennai-600096",
  companyAddress: "1/54,OMR,PERUNGUDI,\nChennai-600096",
  gstin: "33AAMCR5393J1ZV",
  pan: "AAMCR5393J",
  bankName: "Rev0365 Global Private Limited",
  accountNumber: "00000044015545872",
  ifsc: "SBIN0013241",
};

const normalizeText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "";
};

const normalizeComparable = (value: unknown) => normalizeText(value).toLowerCase();

const parseJsonValue = <T>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;

  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const numericValue = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const formatAmount = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));

const formatTaxRate = (value: unknown) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toNumber(value));

const firstPresentText = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
};

const getDatePart = (date: Date, part: Intl.DateTimeFormatPartTypes) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .find((entry) => entry.type === part)?.value || "";

const formatDateKey = (date: Date) =>
  `${getDatePart(date, "year")}-${getDatePart(date, "month")}-${getDatePart(date, "day")}`;

const formatDisplayDate = (date: Date | null) => {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BILLING_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatInvoiceDate = (date: Date | null) => {
  if (!date) return "-";
  return `${getDatePart(date, "day")}-${getDatePart(date, "month")}-${getDatePart(date, "year")}`;
};

const formatPeriodLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: BILLING_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(date);

const parseDateValue = (value: unknown): Date | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(
      String(Math.trunc(numericValue)).length <= 10
        ? numericValue * 1000
        : numericValue
    );
  }

  const text = normalizeText(value);
  const slashDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]);
    const year = Number(slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsedDate = new Date(text);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getPeriodFromInput = (requestBody: any) => {
  const rawPeriod =
    normalizeText(requestBody?.period) ||
    normalizeText(requestBody?.month) ||
    (requestBody?.year && requestBody?.monthnumber
      ? `${requestBody.year}-${String(requestBody.monthnumber).padStart(2, "0")}`
      : "");

  const match = rawPeriod.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error("A valid period in YYYY-MM format is required.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("A valid period in YYYY-MM format is required.");
  }

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const nextMonthStart = new Date(Date.UTC(year, month, 1));
  const periodEnd = new Date(nextMonthStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);

  return {
    period: `${year}-${String(month).padStart(2, "0")}`,
    periodstart: formatDateKey(periodStart),
    periodend: formatDateKey(periodEnd),
    periodlabel: formatPeriodLabel(periodStart),
    startDate: periodStart,
    endDate: periodEnd,
  };
};

const normalizeInvoiceForValues = (value: unknown) => {
  const rawValues = Array.isArray(value)
    ? value
    : value == null || value === ""
      ? DEFAULT_INVOICE_FOR
      : [value];

  const normalized = Array.from(
    new Set(
      rawValues
        .map((item) => normalizeComparable(item))
        .filter(Boolean)
    )
  );

  return normalized.length > 0 ? normalized : DEFAULT_INVOICE_FOR;
};

const getInvoiceForKey = (invoiceForValues: string[]) =>
  [...invoiceForValues].sort().join(",");

const isDateWithinPeriod = (date: Date | null, startDate: Date, endDate: Date) => {
  if (!date) return false;
  const key = formatDateKey(date);
  return key >= formatDateKey(startDate) && key <= formatDateKey(endDate);
};

const getEffectiveInvoiceDate = (invoice: any, invoiceFor: string) => {
  if (invoiceFor === "rental") {
    return (
      parseDateValue(invoice?.billingperiodstart) ||
      parseDateValue(invoice?.invoicedate) ||
      parseDateValue(invoice?.createddate)
    );
  }

  return parseDateValue(invoice?.invoicedate) || parseDateValue(invoice?.createddate);
};

const getCustomerName = (customer: any, fallbackName = "") => {
  const fullName = [customer?.firstname, customer?.lastname]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
  return fullName || normalizeText(customer?.useremail) || fallbackName || "-";
};

const getDescription = (invoice: any, invoiceFor: string, periodLabel: string) => {
  const invoiceData = parseJsonValue<any>(invoice?.invoicedata, {});
  const summaryInvoiceData = parseJsonValue<any>(invoice?.summaryinvoicedata, {});
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];

  if (invoiceFor === "rental") {
    const deviceCount = Math.max(
      toNumber(invoice?.rentaldevicecount) ||
        items.reduce((total: number, item: any) => total + Math.max(toNumber(item?.quantity), 1), 0),
      1
    );
    const deviceLabel = deviceCount === 1 ? "Device" : "Devices";
    return (
      normalizeText(summaryInvoiceData?.summarydescription) ||
      `Laptop Rental(${deviceCount} ${deviceLabel} for ${normalizeText(invoice?.billingperiodlabel) || periodLabel})`
    );
  }

  if (invoiceFor === "service") {
    const firstServiceItem = items[0]?.name || items[0]?.description || "";
    return normalizeText(firstServiceItem)
      ? `Service Invoice - ${normalizeText(firstServiceItem)}`
      : `Service Invoice${invoice?.ticketnumber ? ` - ${invoice.ticketnumber}` : ""}`;
  }

  if (invoiceFor === "penalty") {
    return normalizeText(items[0]?.name) || "Rental Penalty";
  }

  if (invoiceFor === "product") {
    return normalizeText(items[0]?.name) || "Product Purchase";
  }

  return normalizeText(items[0]?.name) || `${invoiceFor || "Invoice"} charges`;
};

const getQuantityLabel = (invoice: any, invoiceFor: string) => {
  const invoiceData = parseJsonValue<any>(invoice?.invoicedata, {});
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];

  if (invoiceFor === "rental") {
    const deviceCount = Math.max(
      toNumber(invoice?.rentaldevicecount) ||
        items.reduce((total: number, item: any) => total + Math.max(toNumber(item?.quantity), 1), 0),
      1
    );
    return `${deviceCount} ${deviceCount === 1 ? "Device" : "Devices"}`;
  }

  const quantity = Math.max(
    items.reduce((total: number, item: any) => total + Math.max(toNumber(item?.quantity), 1), 0),
    1
  );
  return String(quantity);
};

const getInvoiceAmounts = (invoice: any) => {
  const invoiceData = parseJsonValue<any>(invoice?.invoicedata, {});
  const summaryInvoiceData = parseJsonValue<any>(invoice?.summaryinvoicedata, {});
  const taxMode = normalizeComparable(
    summaryInvoiceData?.taxmode || invoiceData?.taxmode || invoice?.taxmode
  );
  const totalAmount =
    toNumber(invoice?.totalorderamount) ||
    toNumber(invoiceData?.payableamount) ||
    toNumber(invoiceData?.total) ||
    toNumber(summaryInvoiceData?.totalamount);
  const taxAmount =
    toNumber(invoice?.taxamount) ||
    toNumber(invoiceData?.taxamount) ||
    toNumber(summaryInvoiceData?.taxamount);
  const explicitTaxableAmount =
    toNumber(invoiceData?.taxableamount) ||
    toNumber(invoiceData?.taxablevalue) ||
    toNumber(summaryInvoiceData?.taxablevalue);
  const payableTaxableAmount =
    totalAmount > 0 ? Math.max(totalAmount - taxAmount, 0) : 0;
  const taxableAmount = payableTaxableAmount || explicitTaxableAmount || 0;
  const explicitIgstAmount =
    toNumber(summaryInvoiceData?.igstamount) || toNumber(invoiceData?.igstamount);
  const explicitCgstAmount =
    toNumber(summaryInvoiceData?.cgstamount) || toNumber(invoiceData?.cgstamount);
  const explicitSgstAmount =
    toNumber(summaryInvoiceData?.sgstamount) || toNumber(invoiceData?.sgstamount);
  const isIgst = taxMode === "igst" || explicitIgstAmount > 0;
  const cgstAmount = isIgst ? 0 : explicitCgstAmount || taxAmount / 2;
  const sgstAmount = isIgst ? 0 : explicitSgstAmount || taxAmount / 2;
  const igstAmount = isIgst ? explicitIgstAmount || taxAmount : 0;

  return {
    taxableAmount,
    taxAmount,
    totalAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxMode: isIgst ? "igst" : "cgst_sgst",
    cgstRate: firstPresentText(summaryInvoiceData?.cgstrate, invoiceData?.cgstrate, "9"),
    sgstRate: firstPresentText(summaryInvoiceData?.sgstrate, invoiceData?.sgstrate, "9"),
    igstRate: firstPresentText(summaryInvoiceData?.igstrate, invoiceData?.igstrate, "18"),
  };
};

const getSacCode = (invoice: any) => {
  const invoiceData = parseJsonValue<any>(invoice?.invoicedata, {});
  const summaryInvoiceData = parseJsonValue<any>(invoice?.summaryinvoicedata, {});
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
  const firstItem = items[0] || {};

  return firstPresentText(
    summaryInvoiceData?.saccode,
    firstItem?.sacCode,
    firstItem?.saccode,
    firstItem?.hsncode,
    invoice?.saccode,
    invoice?.hsncode,
    "997315"
  );
};

const getInvoiceTypeLabel = (invoiceFor: string) => {
  const labels: Record<string, string> = {
    rental: "Rental",
    service: "Service",
    penalty: "Penalty",
    product: "Product",
  };
  return labels[invoiceFor] || invoiceFor;
};

const fetchCustomer = async (customerId: number) => {
  const result = await query(
    `
    SELECT
      u.id,
      u.firstname,
      u.lastname,
      u.useremail,
      u.usermobilenumber,
      u.gstnumber,
      a.name AS addressname,
      a.doornumber,
      a.landmark,
      a.address,
      a.city,
      a.state,
      a.pincode,
      a.mobilenumber AS addressmobilenumber
    FROM users u
    LEFT JOIN LATERAL (
      SELECT *
      FROM address addr
      WHERE addr.userid = u.id
      ORDER BY addr.modifieddate DESC NULLS LAST, addr.id DESC
      LIMIT 1
    ) a ON TRUE
    WHERE u.id = $1
    LIMIT 1
    `,
    [customerId]
  );
  return result.rows[0] || null;
};

const buildCustomerAddress = (customer: any, invoiceRows: any[]) => {
  const addressParts = [
    customer?.doornumber,
    customer?.landmark,
    customer?.address,
    customer?.city,
    customer?.state,
    customer?.pincode,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (addressParts.length > 0) return addressParts.join(", ");

  return normalizeText(invoiceRows[0]?.customeraddress) || "-";
};

const fetchCandidateInvoices = async (
  customerId: number,
  invoiceForValues: string[]
) => {
  const result = await query(
    `
    SELECT *
    FROM revoinvoice
    WHERE customerid = $1
      AND LOWER(COALESCE(invoicefor, '')) = ANY($2::text[])
      AND COALESCE(NULLIF(TRIM(invoiceurl), ''), '') <> ''
    ORDER BY
      billingperiodstart ASC NULLS LAST,
      createddate ASC NULLS LAST,
      id ASC
    `,
    [customerId, invoiceForValues]
  );
  return result.rows;
};

const buildPreviewRows = (
  invoiceRows: any[],
  period: ReturnType<typeof getPeriodFromInput>,
  sourceInvoiceIds?: number[]
) => {
  const sourceIdSet =
    sourceInvoiceIds && sourceInvoiceIds.length > 0
      ? new Set(sourceInvoiceIds)
      : null;
  const warnings: string[] = [];

  const rows = invoiceRows
    .map((invoice: any) => {
      const invoiceFor = normalizeComparable(invoice?.invoicefor);
      const documentType = normalizeComparable(invoice?.invoicedocumenttype);
      if (invoiceFor === "rental" && documentType === "rental_supporting_document_pending") {
        warnings.push(
          `${invoice?.invoicenumber || `Invoice #${invoice?.id}`} is pending rental summary generation.`
        );
        return null;
      }

      if (sourceIdSet && !sourceIdSet.has(Number(invoice?.id))) {
        return null;
      }

      const effectiveDate = getEffectiveInvoiceDate(invoice, invoiceFor);
      if (!isDateWithinPeriod(effectiveDate, period.startDate, period.endDate)) {
        return null;
      }

      const amounts = getInvoiceAmounts(invoice);
      const billingPeriodLabel =
        normalizeText(invoice?.billingperiodlabel) || period.periodlabel;

      return {
        sourceinvoiceid: Number(invoice.id),
        invoicenumber: normalizeText(invoice.invoicenumber) || `Invoice #${invoice.id}`,
        invoicefor: invoiceFor,
        invoiceTypeLabel: getInvoiceTypeLabel(invoiceFor),
        invoicedate: formatDisplayDate(parseDateValue(invoice?.invoicedate) || effectiveDate),
        billingperiodlabel: billingPeriodLabel,
        description: getDescription(invoice, invoiceFor, period.periodlabel),
        quantityLabel: getQuantityLabel(invoice, invoiceFor),
        taxableamount: amounts.taxableAmount,
        taxamount: amounts.taxAmount,
        totalamount: amounts.totalAmount,
        cgstamount: amounts.cgstAmount,
        sgstamount: amounts.sgstAmount,
        igstamount: amounts.igstAmount,
        taxmode: amounts.taxMode,
        cgstrate: amounts.cgstRate,
        sgstrate: amounts.sgstRate,
        igstrate: amounts.igstRate,
        saccode: getSacCode(invoice),
        invoiceurl: normalizeText(invoice.invoiceurl) || null,
        supportingdocumenturl: normalizeText(invoice.supportingdocumenturl) || null,
        hasSupportingDocument: Boolean(normalizeText(invoice.supportingdocumenturl)),
      };
    })
    .filter(Boolean);

  return { rows, warnings };
};

const buildTotals = (rows: any[]) => ({
  taxableamount: rows.reduce((total, row) => total + toNumber(row.taxableamount), 0),
  taxamount: rows.reduce((total, row) => total + toNumber(row.taxamount), 0),
  totalamount: rows.reduce((total, row) => total + toNumber(row.totalamount), 0),
  cgstamount: rows.reduce((total, row) => total + toNumber(row.cgstamount), 0),
  sgstamount: rows.reduce((total, row) => total + toNumber(row.sgstamount), 0),
  igstamount: rows.reduce((total, row) => total + toNumber(row.igstamount), 0),
});

const getConsolidatedSummaryDescription = (rows: any[], periodLabel: string) => {
  const firstRentalRow = rows.find((row) => row.invoicefor === "rental") || rows[0];
  const description = normalizeText(firstRentalRow?.description);
  const itemLabel = description.includes("(")
    ? description.slice(0, description.indexOf("(")).trim()
    : description || "Laptop Rental";
  const deviceCount = Math.max(
    rows.reduce((total, row) => {
      const match = normalizeText(row.quantityLabel).match(/(\d+(?:\.\d+)?)/);
      return total + (match ? toNumber(match[1]) : 0);
    }, 0),
    rows.length || 1
  );
  const deviceLabel = deviceCount === 1 ? "Device" : "Devices";

  return `${itemLabel}(${deviceCount} ${deviceLabel} for ${periodLabel})`;
};

const getFirstSacCode = (rows: any[]) =>
  firstPresentText(...rows.map((row) => row.saccode), "997315");

const getTemplateTaxMode = (
  rows: any[],
  totals: ReturnType<typeof buildTotals>
): "cgst_sgst" | "igst" =>
  totals.igstamount > 0 || rows.some((row) => row.taxmode === "igst")
    ? "igst"
    : "cgst_sgst";

const getSourceInvoiceKey = (rows: any[]) =>
  rows
    .map((row) => Number(row.sourceinvoiceid))
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b)
    .join(",");

const toVersionNumber = (record: any) => {
  const versionNumber = Number(record?.versionnumber);
  return Number.isFinite(versionNumber) && versionNumber > 0 ? versionNumber : 1;
};

const getCurrentConsolidatedInvoice = (records: any[]) =>
  records.find((record) => record?.iscurrent === true || record?.iscurrent === "true") ||
  records[0] ||
  null;

const getNextVersionNumber = (records: any[]) =>
  Math.max(0, ...records.map((record) => toVersionNumber(record))) + 1;

const fetchExistingConsolidatedInvoices = async (
  customerId: number,
  period: ReturnType<typeof getPeriodFromInput>,
  invoiceForKey: string
) => {
  const result = await query(
    `
    SELECT *
    FROM consolidated_invoices
    WHERE customerid = $1
      AND periodstart = $2
      AND periodend = $3
      AND invoiceforkey = $4
      AND status = 'generated'
    ORDER BY
      iscurrent DESC,
      versionnumber DESC NULLS LAST,
      createddate DESC NULLS LAST,
      id DESC
    `,
    [customerId, period.periodstart, period.periodend, invoiceForKey]
  );
  return result.rows;
};

const fetchExactExistingConsolidatedInvoice = async (
  customerId: number,
  period: ReturnType<typeof getPeriodFromInput>,
  invoiceForKey: string,
  sourceInvoiceKey: string
) => {
  const result = await query(
    `
    SELECT *
    FROM consolidated_invoices
    WHERE customerid = $1
      AND periodstart = $2
      AND periodend = $3
      AND invoiceforkey = $4
      AND sourceinvoicekey = $5
      AND status = 'generated'
    ORDER BY
      iscurrent DESC,
      versionnumber DESC NULLS LAST,
      createddate DESC NULLS LAST,
      id DESC
    LIMIT 1
    `,
    [customerId, period.periodstart, period.periodend, invoiceForKey, sourceInvoiceKey]
  );
  return result.rows[0] || null;
};

const getDefaultLogoDataUrl = async () => {
  if (cachedDefaultLogoDataUrl !== undefined) return cachedDefaultLogoDataUrl;

  try {
    const logoBuffer = await readFile(DEFAULT_LOGO_PATH);
    cachedDefaultLogoDataUrl = `data:image/jpeg;base64,${logoBuffer.toString("base64")}`;
  } catch (error: any) {
    cachedDefaultLogoDataUrl = null;
    console.warn(
      `Consolidated invoice logo not found at ${DEFAULT_LOGO_PATH}: ${error?.message || error}`
    );
  }

  return cachedDefaultLogoDataUrl;
};

const uploadPdf = async (pdfBuffer: Buffer, destination: string, fileName: string) => {
  const bucket = admin.storage().bucket(CONSOLIDATED_INVOICE_BUCKET);
  const uploadedFile = bucket.file(destination);

  await uploadedFile.save(pdfBuffer, {
    contentType: "application/pdf",
    resumable: false,
    metadata: {
      cacheControl: "no-store, max-age=0",
      contentDisposition: `inline; filename="${fileName}"`,
    },
  });

  return `https://storage.googleapis.com/${CONSOLIDATED_INVOICE_BUCKET}/${destination}?v=${Date.now()}`;
};

const sanitizeFileName = (value: unknown) =>
  normalizeText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "consolidated-invoice";

const buildTemplateData = async (
  documentNumber: string,
  versionNumber: number,
  customer: any,
  customerAddress: string,
  period: ReturnType<typeof getPeriodFromInput>,
  rows: any[],
  totals: ReturnType<typeof buildTotals>
): Promise<ConsolidatedInvoiceTemplateData> => {
  const taxMode = getTemplateTaxMode(rows, totals);
  const firstTaxRow = rows.find((row) => row.taxmode === taxMode) || rows[0] || {};

  return {
    companyName: COMPANY_DETAILS.companyName,
    companyAddress: COMPANY_DETAILS.companyAddress,
    companyAddressLine1: COMPANY_DETAILS.companyAddressLine1,
    companyAddressLine2: COMPANY_DETAILS.companyAddressLine2,
    companyGstin: COMPANY_DETAILS.gstin,
    companyPan: COMPANY_DETAILS.pan,
    companyBankName: COMPANY_DETAILS.bankName,
    companyAccountNumber: COMPANY_DETAILS.accountNumber,
    companyIfsc: COMPANY_DETAILS.ifsc,
    documentNumber,
    generatedDate: formatInvoiceDate(new Date()),
    periodLabel: period.periodlabel,
    versionLabel: `Version ${versionNumber}`,
    customerName: normalizeText(customer?.name) || getCustomerName(customer),
    customerAddress,
    customerGstin: normalizeText(customer?.gstnumber) || "-",
    customerPhone:
      normalizeText(customer?.phone) ||
      normalizeText(customer?.usermobilenumber) ||
      normalizeText(customer?.addressmobilenumber) ||
      "-",
    placeOfSupply: "same as billing",
    summaryDescription: getConsolidatedSummaryDescription(rows, period.periodlabel),
    sacCode: getFirstSacCode(rows),
    taxMode,
    cgstRate: formatTaxRate(firstTaxRow?.cgstrate || 9),
    sgstRate: formatTaxRate(firstTaxRow?.sgstrate || 9),
    igstRate: formatTaxRate(firstTaxRow?.igstrate || 18),
    cgstAmount: formatAmount(totals.cgstamount || totals.taxamount / 2),
    sgstAmount: formatAmount(totals.sgstamount || totals.taxamount / 2),
    igstAmount: formatAmount(totals.igstamount || totals.taxamount),
    rows: rows.map((row) => ({
      sourceInvoiceId: row.sourceinvoiceid,
      invoiceNumber: row.invoicenumber,
      invoiceDate: row.invoicedate,
      invoiceTypeLabel: row.invoiceTypeLabel,
      description: row.description,
      quantityLabel: row.quantityLabel,
      sacCode: row.saccode,
      taxableAmount: formatAmount(row.taxableamount),
      taxAmount: formatAmount(row.taxamount),
      totalAmount: formatAmount(row.totalamount),
      invoiceUrl: row.invoiceurl,
      supportingDocumentUrl: row.supportingdocumenturl,
    })),
    subtotalAmount: formatAmount(totals.taxableamount),
    taxAmount: formatAmount(totals.taxamount),
    totalAmount: formatAmount(totals.totalamount),
    logoUrl: await getDefaultLogoDataUrl(),
  };
};

const buildPreview = async (requestBody: any) => {
  const customerId = Number(requestBody?.customerid);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    throw new Error("A valid customer id is required.");
  }

  const period = getPeriodFromInput(requestBody);
  const invoiceForValues = normalizeInvoiceForValues(requestBody?.invoicefor);
  const invoiceForKey = getInvoiceForKey(invoiceForValues);
  const sourceInvoiceIds = Array.isArray(requestBody?.sourceinvoiceids)
    ? requestBody.sourceinvoiceids
        .map((id: any) => Number(id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    : undefined;

  const customer = await fetchCustomer(customerId);
  if (!customer) {
    throw new Error("Customer not found.");
  }

  const invoiceRows = await fetchCandidateInvoices(customerId, invoiceForValues);
  const { rows, warnings } = buildPreviewRows(invoiceRows, period, sourceInvoiceIds);
  const totals = buildTotals(rows);
  const sourceInvoiceKey = getSourceInvoiceKey(rows);
  const existingConsolidatedInvoices = await fetchExistingConsolidatedInvoices(
    customerId,
    period,
    invoiceForKey
  );
  const currentConsolidatedInvoice = getCurrentConsolidatedInvoice(
    existingConsolidatedInvoices
  );
  const matchingConsolidatedInvoice =
    existingConsolidatedInvoices.find(
      (record: any) => normalizeText(record?.sourceinvoicekey) === sourceInvoiceKey
    ) || null;
  const hasCurrentDifferentSources = Boolean(
    rows.length > 0 &&
      sourceInvoiceKey &&
      currentConsolidatedInvoice &&
      normalizeText(currentConsolidatedInvoice.sourceinvoicekey) !== sourceInvoiceKey
  );
  const nextVersionNumber = getNextVersionNumber(existingConsolidatedInvoices);
  const customerAddress = buildCustomerAddress(customer, invoiceRows);

  if (rows.length === 0) {
    warnings.push("No generated invoices were found for the selected customer, period, and invoice type.");
  }

  return {
    customer: {
      id: customer.id,
      name: getCustomerName(customer),
      email: normalizeText(customer.useremail),
      phone:
        normalizeText(customer.usermobilenumber) ||
        normalizeText(customer.addressmobilenumber),
      gstnumber: normalizeText(customer.gstnumber),
      address: customerAddress,
    },
    period: {
      value: period.period,
      start: period.periodstart,
      end: period.periodend,
      label: period.periodlabel,
    },
    invoicefor: invoiceForValues,
    invoiceforkey: invoiceForKey,
    sourceinvoicekey: sourceInvoiceKey,
    rows,
    totals,
    totalsformatted: {
      taxableamount: formatAmount(totals.taxableamount),
      taxamount: formatAmount(totals.taxamount),
      totalamount: formatAmount(totals.totalamount),
    },
    existingConsolidatedInvoices,
    currentConsolidatedInvoice,
    matchingConsolidatedInvoice,
    hasCurrentDifferentSources,
    nextVersionNumber,
    warnings,
    canGenerate: rows.length > 0,
  };
};

export module consolidatedInvoiceService {
  export const listConsolidatedInvoices = async (requestBody: any) => {
    const customerId = Number(requestBody?.customerid);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      throw new Error("A valid customer id is required.");
    }

    const params: any[] = [customerId];
    const whereClauses = [
      "ci.customerid = $1",
      "ci.status = 'generated'",
    ];

    if (requestBody?.invoicefor != null && requestBody.invoicefor !== "") {
      const invoiceForValues = normalizeInvoiceForValues(requestBody.invoicefor);
      params.push(getInvoiceForKey(invoiceForValues));
      whereClauses.push(`ci.invoiceforkey = $${params.length}`);
    }

    const result = await query(
      `
      SELECT
        ci.id,
        ci.customerid,
        ci.periodstart,
        ci.periodend,
        TO_CHAR(ci.periodstart, 'YYYY-MM') AS periodvalue,
        ci.periodlabel,
        ci.includedinvoicefor,
        ci.invoiceforkey,
        ci.sourceinvoiceids,
        ci.sourceinvoicekey,
        ci.documentnumber,
        ci.documenturl,
        ci.status,
        ci.subtotal,
        ci.taxamount,
        ci.totalamount,
        ci.generatedby,
        ci.versionnumber,
        ci.iscurrent,
        ci.supersedesid,
        ci.revisionreason,
        ci.createddate,
        ci.modifieddate,
        COALESCE(source_counts.sourcecount, 0)::INTEGER AS sourceinvoicecount
      FROM consolidated_invoices ci
      LEFT JOIN (
        SELECT consolidatedinvoiceid, COUNT(*)::INTEGER AS sourcecount
        FROM consolidated_invoice_sources
        GROUP BY consolidatedinvoiceid
      ) source_counts
        ON source_counts.consolidatedinvoiceid = ci.id
      WHERE ${whereClauses.join("\n        AND ")}
      ORDER BY
        ci.periodstart DESC,
        ci.iscurrent DESC,
        ci.versionnumber DESC NULLS LAST,
        ci.createddate DESC NULLS LAST,
        ci.id DESC
      `,
      params
    );

    return {
      customerid: customerId,
      rows: result.rows,
      count: result.rowCount,
    };
  };

  export const previewConsolidatedInvoice = async (requestBody: any) => {
    return buildPreview(requestBody);
  };

  export const generateConsolidatedInvoice = async (request: any) => {
    const preview = await buildPreview(request.body || {});
    if (!preview.canGenerate || preview.rows.length === 0) {
      throw new Error("No generated invoices are available for consolidation.");
    }

    const customerId = Number(preview.customer.id);
    const period = getPeriodFromInput(request.body || {});
    const forceRegenerate = Boolean(request.body?.forceRegenerate);
    const confirmNewVersion = Boolean(request.body?.confirmNewVersion);
    const exactExisting = await fetchExactExistingConsolidatedInvoice(
      customerId,
      period,
      preview.invoiceforkey,
      preview.sourceinvoicekey
    );

    if (exactExisting && !forceRegenerate) {
      return {
        reusedExisting: true,
        consolidatedInvoice: exactExisting,
        documenturl: exactExisting.documenturl,
        preview: {
          ...preview,
          matchingConsolidatedInvoice: exactExisting,
        },
      };
    }

    const currentConsolidatedInvoice = preview.currentConsolidatedInvoice;
    const hasCurrentDifferentSources = Boolean(
      currentConsolidatedInvoice &&
        normalizeText(currentConsolidatedInvoice.sourceinvoicekey) !==
          preview.sourceinvoicekey
    );
    const nextVersionNumber = preview.nextVersionNumber || 1;

    if (hasCurrentDifferentSources && !confirmNewVersion && !forceRegenerate) {
      return {
        requiresConfirmation: true,
        reason: "new_version_required",
        currentConsolidatedInvoice,
        nextVersionNumber,
        preview,
      };
    }

    const versionNumber = nextVersionNumber;
    const supersedesId = currentConsolidatedInvoice?.id || null;
    const revisionReason =
      normalizeText(request.body?.revisionreason) ||
      (hasCurrentDifferentSources
        ? "Source invoices changed for this billing period."
        : forceRegenerate
          ? "Regenerated by admin."
          : "Initial consolidated invoice.");

    const insertResult = await query(
      `
      INSERT INTO consolidated_invoices (
        customerid,
        periodstart,
        periodend,
        periodlabel,
        includedinvoicefor,
        invoiceforkey,
        sourceinvoiceids,
        sourceinvoicekey,
        status,
        subtotal,
        taxamount,
        totalamount,
        generatedby,
        metadatajson,
        versionnumber,
        iscurrent,
        supersedesid,
        revisionreason,
        createddate,
        modifieddate
      )
      VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9,
        $10, $11, $12, $13, $14::jsonb,
        $15, FALSE, $16, $17,
        EXTRACT(EPOCH FROM NOW())::BIGINT,
        EXTRACT(EPOCH FROM NOW())::BIGINT
      )
      RETURNING *
      `,
      [
        customerId,
        preview.period.start,
        preview.period.end,
        preview.period.label,
        JSON.stringify(preview.invoicefor),
        preview.invoiceforkey,
        JSON.stringify(preview.rows.map((row: any) => row.sourceinvoiceid)),
        preview.sourceinvoicekey,
        "generating",
        preview.totals.taxableamount,
        preview.totals.taxamount,
        preview.totals.totalamount,
        request?.session?.id || null,
        JSON.stringify({ preview }),
        versionNumber,
        supersedesId,
        revisionReason,
      ]
    );

    const consolidatedRecord = insertResult.rows[0];
    const documentNumber = `TEQIT-CINV-${period.period.replace("-", "")}-V${versionNumber}-${consolidatedRecord.id}`;
    const templateData = await buildTemplateData(
      documentNumber,
      versionNumber,
      preview.customer,
      preview.customer.address,
      period,
      preview.rows,
      preview.totals
    );
    const html = getConsolidatedInvoiceHtml(templateData);
    const pdfBuffer = await renderHtmlToPdf(html);
    const fileName = `${sanitizeFileName(documentNumber)}.pdf`;
    const documentUrl = await uploadPdf(
      pdfBuffer,
      `${CONSOLIDATED_INVOICE_FOLDER}/${fileName}`,
      fileName
    );

    const client = await pool.connect();
    let generatedRecord: any = null;
    try {
      await client.query("BEGIN");
      await client.query(
        `
        UPDATE consolidated_invoices
        SET
          iscurrent = FALSE,
          modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE customerid = $1
          AND periodstart = $2
          AND periodend = $3
          AND invoiceforkey = $4
          AND status = 'generated'
          AND iscurrent = TRUE
        `,
        [customerId, preview.period.start, preview.period.end, preview.invoiceforkey]
      );

      const updateResult = await client.query(
        `
        UPDATE consolidated_invoices
        SET
          documentnumber = $1,
          documenturl = $2,
          status = 'generated',
          iscurrent = TRUE,
          metadatajson = $3::jsonb,
          modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = $4
        RETURNING *
        `,
        [
          documentNumber,
          documentUrl,
          JSON.stringify({
            preview,
            templateData,
            version: {
              versionnumber: versionNumber,
              supersedesid: supersedesId,
              revisionreason: revisionReason,
            },
          }),
          consolidatedRecord.id,
        ]
      );
      generatedRecord = updateResult.rows[0];

      for (const row of preview.rows) {
        await client.query(
          `
          INSERT INTO consolidated_invoice_sources (
            consolidatedinvoiceid,
            revoinvoiceid,
            invoicefor,
            invoicenumber,
            invoiceamount,
            billingperiodlabel
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            consolidatedRecord.id,
            row.sourceinvoiceid,
            row.invoicefor,
            row.invoicenumber,
            row.totalamount,
            row.billingperiodlabel,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const updatedExistingConsolidatedInvoices = [
      generatedRecord,
      ...preview.existingConsolidatedInvoices.map((record: any) =>
        record?.iscurrent === true || record?.iscurrent === "true"
          ? { ...record, iscurrent: false }
          : record
      ),
    ];

    return {
      reusedExisting: false,
      consolidatedInvoice: generatedRecord,
      previousConsolidatedInvoice: currentConsolidatedInvoice,
      documenturl: documentUrl,
      preview: {
        ...preview,
        existingConsolidatedInvoices: updatedExistingConsolidatedInvoices,
        currentConsolidatedInvoice: generatedRecord,
        matchingConsolidatedInvoice: generatedRecord,
        hasCurrentDifferentSources: false,
        nextVersionNumber: versionNumber + 1,
      },
    };
  };
}
