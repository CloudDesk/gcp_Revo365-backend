import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool, { query } from "../database/postgres.js";
import { admin } from "../firebase/firebaseAdmin.js";
import { renderHtmlToPdf } from "../utils/pdf/renderHtmlToPdf.js";
import {
  getConsolidatedInvoiceHtml,
  getConsolidatedSupportingDocumentHtml,
  ConsolidatedInvoiceTemplateData,
} from "../utils/invoice/consolidatedInvoiceTemplate.js";

const CONSOLIDATED_INVOICE_BUCKET =
  process.env.CONSOLIDATED_INVOICE_BUCKET ||
  process.env.RENTAL_INVOICE_BUCKET ||
  "revo_product_invoice-dev";
const CONSOLIDATED_INVOICE_FOLDER =
  process.env.CONSOLIDATED_INVOICE_FOLDER || "consolidated-invoices";
const CONSOLIDATED_INVOICE_CALCULATION_VERSION = 3;
const BILLING_TIMEZONE = "Asia/Kolkata";
const DEFAULT_INVOICE_FOR = ["rental"];
const DAY_IN_MS = 24 * 60 * 60 * 1000;
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

const toPaise = (value: unknown) => Math.round(toNumber(value) * 100);
const fromPaise = (value: number) => value / 100;
const roundToNearestRupeePaise = (value: unknown) =>
  Math.round(toPaise(value) / 100) * 100;

const prorateAmount = (value: unknown, billableDays: number, cycleDays: number) => {
  if (!Number.isFinite(billableDays) || !Number.isFinite(cycleDays) || cycleDays <= 0) {
    return 0;
  }

  return fromPaise(Math.round((toPaise(value) * billableDays) / cycleDays));
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

const formatProductSubcategoryLabel = (value: unknown) => {
  const normalized = normalizeComparable(value);
  const labels: Record<string, string> = {
    laptop: "Laptop",
    mobile: "Mobile",
    mobile_phone: "Mobile",
    accessories: "Accessory",
    accessory: "Accessory",
    computer: "Computer",
    spares: "Spares",
  };
  if (labels[normalized]) return labels[normalized];

  const text = normalizeText(value).replace(/[_-]+/g, " ");
  if (!text) return "Rental";
  return text.replace(/\b\w/g, (match) => match.toUpperCase());
};

const inferProductSubcategoryFromText = (value: unknown) => {
  const text = normalizeComparable(value).replace(/[_-]+/g, " ");
  if (!text) return "";
  if (/\blaptops?\b/.test(text)) return "laptop";
  if (/\b(mobiles?|phones?|mobile phone)\b/.test(text)) return "mobile_phone";
  if (/\b(accessories|accessory)\b/.test(text)) return "accessories";
  if (/\bcomputers?\b/.test(text)) return "computer";
  if (/\bspares?\b/.test(text)) return "spares";
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

const dateKeyToUtcDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const normalizeDate = (date: Date) => dateKeyToUtcDate(formatDateKey(date));

const addDays = (date: Date, days: number) => {
  const shiftedDate = normalizeDate(date);
  shiftedDate.setUTCDate(shiftedDate.getUTCDate() + days);
  return shiftedDate;
};

const shiftDateByMonths = (baseDate: Date, months: number) => {
  const shiftedDate = normalizeDate(baseDate);
  const originalDay = shiftedDate.getUTCDate();
  shiftedDate.setUTCMonth(shiftedDate.getUTCMonth() + months);
  if (shiftedDate.getUTCDate() < originalDay) shiftedDate.setUTCDate(0);
  return shiftedDate;
};

const getDefaultBillingPeriodEnd = (billingPeriodStart: Date) =>
  addDays(shiftDateByMonths(billingPeriodStart, 1), -1);

const compareDateKeys = (left: Date, right: Date) =>
  formatDateKey(left).localeCompare(formatDateKey(right));

const maxDate = (...dates: Date[]) =>
  dates.reduce((latest, date) => (compareDateKeys(date, latest) > 0 ? date : latest));

const minDate = (...dates: Date[]) =>
  dates.reduce((earliest, date) => (compareDateKeys(date, earliest) < 0 ? date : earliest));

const daysBetweenInclusive = (startDate: Date, endDate: Date) => {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  return Math.floor((end.getTime() - start.getTime()) / DAY_IN_MS) + 1;
};

const isAfterDate = (left: Date, right: Date) => compareDateKeys(left, right) > 0;

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

const getBillingThroughDate = (requestBody: any) => {
  const rawBillingThroughDate =
    normalizeText(requestBody?.billingthroughdate) ||
    normalizeText(requestBody?.billingThroughDate) ||
    normalizeText(requestBody?.billingthrough);
  const parsedBillingThroughDate = rawBillingThroughDate
    ? parseDateValue(rawBillingThroughDate)
    : new Date();

  if (!parsedBillingThroughDate) {
    throw new Error("A valid billing through date is required.");
  }

  return {
    date: normalizeDate(parsedBillingThroughDate),
    key: formatDateKey(parsedBillingThroughDate),
    display: formatDisplayDate(parsedBillingThroughDate),
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

const getRentalBillingPeriod = (invoice: any) => {
  const summaryInvoiceData = parseJsonValue<any>(invoice?.summaryinvoicedata, {});
  const startDate =
    parseDateValue(invoice?.billingperiodstart) ||
    parseDateValue(summaryInvoiceData?.billingperiodstart) ||
    getEffectiveInvoiceDate(invoice, "rental");

  if (!startDate) {
    return null;
  }

  const endDate =
    parseDateValue(invoice?.billingperiodend) ||
    parseDateValue(summaryInvoiceData?.billingperiodend) ||
    getDefaultBillingPeriodEnd(startDate);

  return {
    startDate: normalizeDate(startDate),
    endDate: normalizeDate(endDate),
    startKey: formatDateKey(startDate),
    endKey: formatDateKey(endDate),
    label:
      normalizeText(invoice?.billingperiodlabel) ||
      normalizeText(summaryInvoiceData?.billingperiodlabel) ||
      `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`,
  };
};

const getCustomerName = (customer: any, fallbackName = "") => {
  const fullName = [customer?.firstname, customer?.lastname]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");
  return fullName || normalizeText(customer?.useremail) || fallbackName || "-";
};

const getInvoiceItemOrderLineIds = (invoice: any): number[] => {
  const invoiceData = parseJsonValue<any>(invoice?.invoicedata, {});
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];

  return Array.from(
    new Set(
      items
        .map((item: any) => Number(item?.orderlineid ?? item?.orderLineId))
        .filter((id: number) => Number.isFinite(id) && id > 0)
        .map((id: number) => Math.trunc(id))
    )
  );
};

const getRentalProductSubcategory = (invoice: any) => {
  const invoiceData = parseJsonValue<any>(invoice?.invoicedata, {});
  const summaryInvoiceData = parseJsonValue<any>(invoice?.summaryinvoicedata, {});
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
  const firstItem = items[0] || {};

  return firstPresentText(
    invoice?.productsubcategory,
    invoice?.productsubcategories,
    summaryInvoiceData?.productsubcategory,
    summaryInvoiceData?.productsubcategories,
    summaryInvoiceData?.subcategory,
    firstItem?.productsubcategory,
    firstItem?.productSubcategory,
    firstItem?.subcategory,
    inferProductSubcategoryFromText(summaryInvoiceData?.summarydescription),
    inferProductSubcategoryFromText(firstItem?.name || firstItem?.productname),
    inferProductSubcategoryFromText(invoice?.productname)
  );
};

const getRentalProductSubcategoryLabel = (invoice: any) =>
  firstPresentText(
    invoice?.productsubcategorylabel,
    invoice?.productSubcategoryLabel,
    formatProductSubcategoryLabel(getRentalProductSubcategory(invoice))
  );

const getRentalItemLabel = (invoice: any) => {
  const subcategoryLabel = getRentalProductSubcategoryLabel(invoice);
  return subcategoryLabel === "Rental" ? "Rental" : `${subcategoryLabel} Rental`;
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
      `${getRentalItemLabel(invoice)}(${deviceCount} ${deviceLabel} for ${normalizeText(invoice?.billingperiodlabel) || periodLabel})`
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

const enrichRentalInvoiceProductMetadata = async (invoiceRows: any[]) => {
  const rentalInvoices = invoiceRows.filter(
    (invoice: any) => normalizeComparable(invoice?.invoicefor) === "rental"
  );
  const orderIds = Array.from(
    new Set(
      rentalInvoices
        .map((invoice: any) => normalizeText(invoice?.orderid))
        .filter(Boolean)
    )
  );

  if (rentalInvoices.length === 0 || orderIds.length === 0) {
    return invoiceRows;
  }

  const result = await query(
    `
    SELECT
      ol.id AS orderlineid,
      ol.uniqueorderid,
      ol.productname,
      ol.saccode,
      ol.hsncode,
      p.subcategory AS productsubcategory
    FROM orderline ol
    LEFT JOIN product_revo p
      ON p.id = ol.productid
    WHERE ol.uniqueorderid = ANY($1::text[])
      AND LOWER(COALESCE(ol.ordername, '')) = 'rental'
    ORDER BY ol.uniqueorderid, ol.id
    `,
    [orderIds]
  );

  const linesByOrderId = new Map<string, any[]>();
  result.rows.forEach((line: any) => {
    const orderId = normalizeText(line?.uniqueorderid);
    if (!orderId) return;
    const lines = linesByOrderId.get(orderId) || [];
    lines.push(line);
    linesByOrderId.set(orderId, lines);
  });

  return invoiceRows.map((invoice: any) => {
    if (normalizeComparable(invoice?.invoicefor) !== "rental") return invoice;

    const orderLines = linesByOrderId.get(normalizeText(invoice?.orderid)) || [];
    const selectedOrderLineIds = getInvoiceItemOrderLineIds(invoice);
    const selectedOrderLineIdSet = new Set(selectedOrderLineIds);
    const matchingLines =
      selectedOrderLineIds.length > 0
        ? orderLines.filter((line: any) => selectedOrderLineIdSet.has(Number(line?.orderlineid)))
        : orderLines;
    const subcategoryValues = Array.from(
      new Set(
        matchingLines
          .map((line: any) => normalizeComparable(line?.productsubcategory))
          .filter(Boolean)
      )
    ).sort();
    const productSubcategory =
      subcategoryValues.length === 1
        ? subcategoryValues[0]
        : subcategoryValues.length > 1
          ? subcategoryValues.join("+")
          : getRentalProductSubcategory(invoice);

    return {
      ...invoice,
      productsubcategory: productSubcategory,
      productsubcategorylabel:
        subcategoryValues.length > 1
          ? "Mixed Rental"
          : formatProductSubcategoryLabel(productSubcategory),
    };
  });
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
      AND (
        -- Rental rows are internal month-end source records. They intentionally
        -- have no customer PDF URL and must be explicitly marked as such.
        (
          LOWER(COALESCE(invoicefor, '')) = 'rental'
          AND LOWER(COALESCE(invoicedocumenttype, '')) = 'rental_intermediate_record'
        )
        OR (
          LOWER(COALESCE(invoicefor, '')) <> 'rental'
          AND COALESCE(NULLIF(TRIM(invoiceurl), ''), '') <> ''
        )
      )
    ORDER BY
      billingperiodstart ASC NULLS LAST,
      createddate ASC NULLS LAST,
      id ASC
    `,
    [customerId, invoiceForValues]
  );
  return enrichRentalInvoiceProductMetadata(result.rows);
};

const fetchPreviousBillingProgress = async (
  customerId: number,
  period: ReturnType<typeof getPeriodFromInput>,
  invoiceForValues: string[]
) => {
  const result = await query(
    `
    SELECT
      cis.revoinvoiceid,
      MAX(COALESCE(cis.billingthroughdate, ci.billingthroughdate, ri.billingperiodend)) AS lastbilledthroughdate
    FROM consolidated_invoice_sources cis
    INNER JOIN consolidated_invoices ci
      ON ci.id = cis.consolidatedinvoiceid
    LEFT JOIN revoinvoice ri
      ON ri.id = cis.revoinvoiceid
    WHERE ci.customerid = $1
      AND ci.status = 'generated'
      AND COALESCE(ci.iscurrent, TRUE) = TRUE
      AND ci.periodstart < $2
      AND LOWER(COALESCE(cis.invoicefor, '')) = ANY($3::text[])
    GROUP BY cis.revoinvoiceid
    `,
    [customerId, period.periodstart, invoiceForValues]
  );

  const entries = result.rows
    .map((row: any): [number, Date | null] => [
      Number(row.revoinvoiceid),
      parseDateValue(row.lastbilledthroughdate),
    ])
    .filter((entry: [number, Date | null]): entry is [number, Date] =>
      Number.isFinite(entry[0]) && Boolean(entry[1])
    );

  return new Map<number, Date>(entries);
};

const buildProratedRentalRow = (
  invoice: any,
  period: ReturnType<typeof getPeriodFromInput>,
  billingThroughDate: ReturnType<typeof getBillingThroughDate>,
  previousBillingProgress: Map<number, Date>
) => {
  const billingPeriod = getRentalBillingPeriod(invoice);
  if (!billingPeriod) {
    return null;
  }

  const sourceInvoiceId = Number(invoice?.id);
  const previousBilledThrough = previousBillingProgress.get(sourceInvoiceId) || null;
  const nextUnbilledStart = previousBilledThrough
    ? addDays(previousBilledThrough, 1)
    : billingPeriod.startDate;
  const requestedPeriodStart = dateKeyToUtcDate(period.periodstart);
  const requestedPeriodEnd = dateKeyToUtcDate(period.periodend);
  if (
    isAfterDate(billingPeriod.startDate, requestedPeriodEnd) ||
    isAfterDate(requestedPeriodStart, billingPeriod.endDate)
  ) {
    return null;
  }

  const billingStartDate = maxDate(
    billingPeriod.startDate,
    requestedPeriodStart,
    nextUnbilledStart
  );
  const billingEndDate = minDate(billingPeriod.endDate, billingThroughDate.date);

  if (isAfterDate(billingStartDate, billingEndDate)) {
    return null;
  }

  const cycleDays = daysBetweenInclusive(billingPeriod.startDate, billingPeriod.endDate);
  const billableDays = daysBetweenInclusive(billingStartDate, billingEndDate);
  if (cycleDays <= 0 || billableDays <= 0) {
    return null;
  }

  const amounts = getInvoiceAmounts(invoice);
  const taxableAmount = prorateAmount(amounts.taxableAmount, billableDays, cycleDays);
  const taxAmount = prorateAmount(amounts.taxAmount, billableDays, cycleDays);
  const cgstAmount = prorateAmount(amounts.cgstAmount, billableDays, cycleDays);
  const sgstAmount = prorateAmount(amounts.sgstAmount, billableDays, cycleDays);
  const igstAmount = prorateAmount(amounts.igstAmount, billableDays, cycleDays);
  const totalAmount = fromPaise(toPaise(taxableAmount) + toPaise(taxAmount));
  const billingStartKey = formatDateKey(billingStartDate);
  const billingThroughKey = formatDateKey(billingEndDate);
  const billingRangeLabel = `${formatDisplayDate(billingStartDate)} - ${formatDisplayDate(billingEndDate)}`;
  const cycleRangeLabel = `${formatDisplayDate(billingPeriod.startDate)} - ${formatDisplayDate(billingPeriod.endDate)}`;
  const billingDaysLabel = `${billableDays}/${cycleDays} days`;

  return {
    sourceinvoiceid: sourceInvoiceId,
    invoicenumber: normalizeText(invoice.invoicenumber) || `Invoice #${invoice.id}`,
    invoicefor: "rental",
    invoiceTypeLabel: getInvoiceTypeLabel("rental"),
    invoicedate: formatDisplayDate(
      parseDateValue(invoice?.invoicedate) ||
        getEffectiveInvoiceDate(invoice, "rental")
    ),
    billingperiodlabel: billingPeriod.label,
    billingperiodstart: billingPeriod.startKey,
    billingperiodend: billingPeriod.endKey,
    billingstartdate: billingStartKey,
    billingthroughdate: billingThroughKey,
    billingRangeLabel,
    cycleRangeLabel,
    billingDaysLabel,
    billabledays: billableDays,
    cycledays: cycleDays,
    prorationfactor: billableDays / cycleDays,
    description: getDescription(invoice, "rental", period.periodlabel),
    quantityLabel: getQuantityLabel(invoice, "rental"),
    productsubcategory: getRentalProductSubcategory(invoice),
    productsubcategorylabel: getRentalProductSubcategoryLabel(invoice),
    monthlytaxableamount: amounts.taxableAmount,
    monthlytaxamount: amounts.taxAmount,
    monthlytotalamount: amounts.totalAmount,
    dailytaxableamount: fromPaise(Math.round(toPaise(amounts.taxableAmount) / cycleDays)),
    taxableamount: taxableAmount,
    taxamount: taxAmount,
    totalamount: totalAmount,
    cgstamount: cgstAmount,
    sgstamount: sgstAmount,
    igstamount: igstAmount,
    taxmode: amounts.taxMode,
    cgstrate: amounts.cgstRate,
    sgstrate: amounts.sgstRate,
    igstrate: amounts.igstRate,
    saccode: getSacCode(invoice),
    invoiceurl: normalizeText(invoice.invoiceurl) || null,
    supportingdocumenturl: normalizeText(invoice.supportingdocumenturl) || null,
    hasSupportingDocument: Boolean(normalizeText(invoice.supportingdocumenturl)),
  };
};

const extractSourceInvoiceEntry = (row: any) => {
  const { sourceinvoices, sourceinvoiceids, ...sourceRow } = row;
  return sourceRow;
};

const getRowQuantity = (row: any) => {
  const match = normalizeText(row?.quantityLabel).match(/(\d+(?:\.\d+)?)/);
  if (match) return toNumber(match[1]);
  return Math.max(toNumber(row?.rentaldevicecount), 1);
};

const buildGroupedRentalDescription = (
  row: any,
  quantity: number,
  periodLabel: string
) => {
  const subcategoryLabel = firstPresentText(row?.productsubcategorylabel, "Rental");
  const itemLabel = /rental$/i.test(subcategoryLabel)
    ? subcategoryLabel
    : `${subcategoryLabel} Rental`;
  const deviceLabel = quantity === 1 ? "Device" : "Devices";
  return `${itemLabel}(${quantity} ${deviceLabel} for ${periodLabel})`;
};

const getGroupDateBoundary = (
  left: unknown,
  right: unknown,
  picker: (...dates: Date[]) => Date
) => {
  const dates = [parseDateValue(left), parseDateValue(right)].filter(Boolean) as Date[];
  return dates.length ? formatDateKey(picker(...dates)) : firstPresentText(left, right);
};

const refreshGroupedRentalLabels = (row: any, periodLabel: string) => {
  const sourceRows = Array.isArray(row.sourceinvoices) && row.sourceinvoices.length
    ? row.sourceinvoices
    : [row];
  const quantity = Math.max(
    sourceRows.reduce((total: number, sourceRow: any) => total + getRowQuantity(sourceRow), 0),
    1
  );
  const uniqueBillingDays = Array.from(
    new Set(sourceRows.map((sourceRow: any) => normalizeText(sourceRow.billingDaysLabel)).filter(Boolean))
  );
  const uniqueBillingRanges = Array.from(
    new Set(sourceRows.map((sourceRow: any) => normalizeText(sourceRow.billingRangeLabel)).filter(Boolean))
  );
  const uniqueCycleRanges = Array.from(
    new Set(sourceRows.map((sourceRow: any) => normalizeText(sourceRow.cycleRangeLabel)).filter(Boolean))
  );

  row.quantityLabel = `${quantity} ${quantity === 1 ? "Device" : "Devices"}`;
  row.description = buildGroupedRentalDescription(row, quantity, periodLabel);
  row.invoicenumber =
    sourceRows.length === 1
      ? sourceRows[0].invoicenumber
      : sourceRows.map((sourceRow: any) => sourceRow.invoicenumber).join(", ");
  row.invoicedate = sourceRows.length === 1 ? sourceRows[0].invoicedate : "";
  row.billingRangeLabel =
    uniqueBillingRanges.length === 1
      ? uniqueBillingRanges[0]
      : getRowsBillingRangeLabel(sourceRows, periodLabel);
  row.billingDaysLabel =
    uniqueBillingDays.length === 1 ? uniqueBillingDays[0] : "Multiple billing windows";
  row.cycleRangeLabel =
    uniqueCycleRanges.length === 1 ? uniqueCycleRanges[0] : periodLabel;
  row.billabledays =
    sourceRows.length === 1 ? sourceRows[0].billabledays : null;
  row.cycledays =
    sourceRows.length === 1 ? sourceRows[0].cycledays : null;
  row.prorationfactor =
    sourceRows.length === 1 ? sourceRows[0].prorationfactor : null;
  row.invoiceurl = sourceRows.length === 1 ? sourceRows[0].invoiceurl : null;
  row.supportingdocumenturl =
    sourceRows.length === 1 ? sourceRows[0].supportingdocumenturl : null;
  row.hasSupportingDocument = sourceRows.some((sourceRow: any) => sourceRow.hasSupportingDocument);

  return row;
};

const mergeRentalRows = (target: any, source: any, periodLabel: string) => {
  const sumFields = [
    "taxableamount",
    "taxamount",
    "totalamount",
    "cgstamount",
    "sgstamount",
    "igstamount",
    "monthlytaxableamount",
    "monthlytaxamount",
    "monthlytotalamount",
    "dailytaxableamount",
  ];

  sumFields.forEach((fieldName) => {
    target[fieldName] = fromPaise(toPaise(target[fieldName]) + toPaise(source[fieldName]));
  });

  target.billingstartdate = getGroupDateBoundary(
    target.billingstartdate,
    source.billingstartdate,
    minDate
  );
  target.billingthroughdate = getGroupDateBoundary(
    target.billingthroughdate,
    source.billingthroughdate,
    maxDate
  );
  target.billingperiodstart = getGroupDateBoundary(
    target.billingperiodstart,
    source.billingperiodstart,
    minDate
  );
  target.billingperiodend = getGroupDateBoundary(
    target.billingperiodend,
    source.billingperiodend,
    maxDate
  );
  target.sourceinvoices.push(extractSourceInvoiceEntry(source));
  target.sourceinvoiceids = Array.from(
    new Set([
      ...(target.sourceinvoiceids || []),
      Number(source.sourceinvoiceid),
    ].filter((id: number) => Number.isFinite(id) && id > 0))
  );

  return refreshGroupedRentalLabels(target, periodLabel);
};

const consolidatePreviewRows = (
  rows: any[],
  period: ReturnType<typeof getPeriodFromInput>
) => {
  const groupedRows: any[] = [];
  const rentalGroups = new Map<string, any>();

  rows.forEach((row: any) => {
    if (row?.invoicefor !== "rental") {
      groupedRows.push(row);
      return;
    }

    const productSubcategory =
      normalizeComparable(row.productsubcategory) ||
      inferProductSubcategoryFromText(row.description) ||
      "rental";
    const groupKey = [
      row.invoicefor,
      period.period,
      productSubcategory,
      normalizeComparable(row.saccode),
      normalizeComparable(row.taxmode),
      normalizeComparable(row.cgstrate),
      normalizeComparable(row.sgstrate),
      normalizeComparable(row.igstrate),
    ].join("|");
    const existingRow = rentalGroups.get(groupKey);

    if (!existingRow) {
      const groupedRow = {
        ...row,
        sourceinvoices: [extractSourceInvoiceEntry(row)],
        sourceinvoiceids: [Number(row.sourceinvoiceid)].filter(
          (id: number) => Number.isFinite(id) && id > 0
        ),
      };
      rentalGroups.set(groupKey, refreshGroupedRentalLabels(groupedRow, period.periodlabel));
      groupedRows.push(groupedRow);
      return;
    }

    mergeRentalRows(existingRow, row, period.periodlabel);
  });

  return groupedRows;
};

const buildPreviewRows = (
  invoiceRows: any[],
  period: ReturnType<typeof getPeriodFromInput>,
  billingThroughDate: ReturnType<typeof getBillingThroughDate>,
  previousBillingProgress: Map<number, Date>,
  sourceInvoiceIds?: number[]
) => {
  const sourceIdSet =
    sourceInvoiceIds && sourceInvoiceIds.length > 0
      ? new Set(sourceInvoiceIds)
      : null;
  const warnings: string[] = [];

  const rawRows = invoiceRows
    .map((invoice: any) => {
      const invoiceFor = normalizeComparable(invoice?.invoicefor);
      const documentType = normalizeComparable(invoice?.invoicedocumenttype);
      if (sourceIdSet && !sourceIdSet.has(Number(invoice?.id))) {
        return null;
      }

      if (invoiceFor === "rental") {
        const rentalRow = buildProratedRentalRow(
          invoice,
          period,
          billingThroughDate,
          previousBillingProgress
        );
        if (!rentalRow) return null;
        return rentalRow;
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
  const rows = consolidatePreviewRows(rawRows, period);

  return { rows, warnings };
};

const sumRowAmounts = (rows: any[], fieldName: string) =>
  fromPaise(rows.reduce((total, row) => total + toPaise(row?.[fieldName]), 0));

const buildTotals = (rows: any[]) => {
  const taxableAmount = sumRowAmounts(rows, "taxableamount");
  const taxAmount = sumRowAmounts(rows, "taxamount");
  const totalBeforeRoundOff = sumRowAmounts(rows, "totalamount");
  const payablePaise = roundToNearestRupeePaise(totalBeforeRoundOff);
  const roundOffAmount = fromPaise(payablePaise - toPaise(totalBeforeRoundOff));

  return {
    taxableamount: taxableAmount,
    taxamount: taxAmount,
    totalbeforeroundoff: totalBeforeRoundOff,
    roundoffamount: roundOffAmount,
    payableamount: fromPaise(payablePaise),
    totalamount: fromPaise(payablePaise),
    cgstamount: sumRowAmounts(rows, "cgstamount"),
    sgstamount: sumRowAmounts(rows, "sgstamount"),
    igstamount: sumRowAmounts(rows, "igstamount"),
  };
};

const getRowsBillingRangeLabel = (rows: any[], fallbackLabel: string) => {
  const rangeLabels = Array.from(
    new Set(rows.map((row) => normalizeText(row.billingRangeLabel)).filter(Boolean))
  );
  if (rangeLabels.length === 1) return rangeLabels[0];

  const startDates = rows
    .map((row) => parseDateValue(row.billingstartdate))
    .filter(Boolean) as Date[];
  const throughDates = rows
    .map((row) => parseDateValue(row.billingthroughdate))
    .filter(Boolean) as Date[];

  if (startDates.length > 0 && throughDates.length > 0) {
    return `${formatDisplayDate(minDate(...startDates))} - ${formatDisplayDate(maxDate(...throughDates))}`;
  }

  return fallbackLabel;
};

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

  return `${itemLabel} – ${deviceCount} ${deviceLabel} – ${periodLabel}`;
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

const getSourceInvoiceRows = (rows: any[]) =>
  rows.flatMap((row) =>
    Array.isArray(row?.sourceinvoices) && row.sourceinvoices.length > 0
      ? row.sourceinvoices
      : [row]
  );

const getSourceInvoiceIds = (rows: any[]) =>
  Array.from(
    new Set(
      getSourceInvoiceRows(rows)
        .map((row: any) => Number(row.sourceinvoiceid))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    )
  );

const getSourceInvoiceKey = (rows: any[]) =>
  getSourceInvoiceRows(rows)
    .map((row) => {
      const sourceInvoiceId = Number(row.sourceinvoiceid);
      if (!Number.isFinite(sourceInvoiceId) || sourceInvoiceId <= 0) return "";
      return [
        sourceInvoiceId,
        normalizeText(row.billingstartdate),
        normalizeText(row.billingthroughdate),
        normalizeText(row.billabledays),
        normalizeText(row.cycledays),
      ].join(":");
    })
    .filter(Boolean)
    .sort()
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

const isRoundOffReadyConsolidatedInvoice = (record: any) => {
  const metadata = parseJsonValue<any>(record?.metadatajson, {});
  return (
    toNumber(metadata?.calculationVersion) >= CONSOLIDATED_INVOICE_CALCULATION_VERSION ||
    metadata?.templateData?.roundOffAmount != null ||
    metadata?.preview?.totals?.payableamount != null
  );
};

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
  const billingThroughDates = rows
    .map((row) => parseDateValue(row.billingthroughdate))
    .filter(Boolean) as Date[];

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
    billingRangeLabel: getRowsBillingRangeLabel(rows, period.periodlabel),
    billingThroughDate: billingThroughDates.length
      ? formatDisplayDate(maxDate(...billingThroughDates))
      : undefined,
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
      sourceDocuments: (Array.isArray(row.sourceinvoices) && row.sourceinvoices.length > 0
        ? row.sourceinvoices
        : [row]
      ).map((sourceRow: any) => ({
        sourceInvoiceId: sourceRow.sourceinvoiceid,
        invoiceNumber: sourceRow.invoicenumber,
        invoiceDate: sourceRow.invoicedate,
        invoiceUrl: sourceRow.invoiceurl,
        supportingDocumentUrl: sourceRow.supportingdocumenturl,
      })),
      invoiceNumber: row.invoicenumber,
      invoiceDate: row.invoicedate,
      invoiceTypeLabel: row.invoiceTypeLabel,
      description: row.description,
      quantityLabel: row.quantityLabel,
      billingRangeLabel: row.billingRangeLabel,
      billingDaysLabel: row.billingDaysLabel,
      monthlyTaxableAmount: row.monthlytaxableamount != null
        ? formatAmount(row.monthlytaxableamount)
        : undefined,
      dailyTaxableAmount: row.dailytaxableamount != null
        ? formatAmount(row.dailytaxableamount)
        : undefined,
      sacCode: row.saccode,
      taxableAmount: formatAmount(row.taxableamount),
      taxAmount: formatAmount(row.taxamount),
      totalAmount: formatAmount(row.totalamount),
      invoiceUrl: row.invoiceurl,
      supportingDocumentUrl: row.supportingdocumenturl,
    })),
    subtotalAmount: formatAmount(totals.taxableamount),
    taxAmount: formatAmount(totals.taxamount),
    roundOffAmount: formatAmount(Math.abs(totals.roundoffamount)),
    roundOffSign: totals.roundoffamount >= 0 ? "+" : "-",
    totalAmount: formatAmount(totals.payableamount),
    logoUrl: await getDefaultLogoDataUrl(),
  };
};

const buildPreview = async (requestBody: any) => {
  const customerId = Number(requestBody?.customerid);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    throw new Error("A valid customer id is required.");
  }

  const period = getPeriodFromInput(requestBody);
  const billingThroughDate = getBillingThroughDate(requestBody);
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
  const previousBillingProgress = await fetchPreviousBillingProgress(
    customerId,
    period,
    invoiceForValues
  );
  const { rows, warnings } = buildPreviewRows(
    invoiceRows,
    period,
    billingThroughDate,
    previousBillingProgress,
    sourceInvoiceIds
  );
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
      (record: any) =>
        normalizeText(record?.sourceinvoicekey) === sourceInvoiceKey &&
        isRoundOffReadyConsolidatedInvoice(record)
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
    warnings.push("No unbilled generated invoice days were found for the selected customer, period, billing-through date, and invoice type.");
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
      billingthroughdate: billingThroughDate.key,
      billingthroughdisplay: billingThroughDate.display,
    },
    invoicefor: invoiceForValues,
    invoiceforkey: invoiceForKey,
    sourceinvoicekey: sourceInvoiceKey,
    rows,
    totals,
    totalsformatted: {
      taxableamount: formatAmount(totals.taxableamount),
      taxamount: formatAmount(totals.taxamount),
      totalbeforeroundoff: formatAmount(totals.totalbeforeroundoff),
      roundoffamount: formatAmount(Math.abs(totals.roundoffamount)),
      roundoffsign: totals.roundoffamount >= 0 ? "+" : "-",
      payableamount: formatAmount(totals.payableamount),
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
        ci.billingthroughdate,
        TO_CHAR(ci.periodstart, 'YYYY-MM') AS periodvalue,
        ci.periodlabel,
        ci.includedinvoicefor,
        ci.invoiceforkey,
        ci.sourceinvoiceids,
        ci.sourceinvoicekey,
        ci.documentnumber,
        ci.documenturl,
        ci.supportingdocumentnumber,
        ci.supportingdocumenturl,
        ci.status,
        ci.subtotal,
        ci.taxamount,
        COALESCE(ci.totalbeforeroundoff, ci.totalamount, 0) AS totalbeforeroundoff,
        COALESCE(ci.roundoffamount, ROUND(COALESCE(ci.totalamount, 0)) - COALESCE(ci.totalamount, 0), 0) AS roundoffamount,
        COALESCE(ci.payableamount, ROUND(COALESCE(ci.totalamount, 0)), COALESCE(ci.totalamount, 0)) AS payableamount,
        COALESCE(ci.payableamount, ROUND(COALESCE(ci.totalamount, 0)), COALESCE(ci.totalamount, 0)) AS totalamount,
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

    const shouldRegenerateLegacyRoundOff = Boolean(
      exactExisting && !isRoundOffReadyConsolidatedInvoice(exactExisting)
    );

    if (exactExisting && !forceRegenerate && !shouldRegenerateLegacyRoundOff) {
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
        ? "Source invoices or billing window changed for this billing period."
        : forceRegenerate
          ? "Regenerated by admin."
          : shouldRegenerateLegacyRoundOff
            ? "Regenerated with round-off calculation."
            : "Initial consolidated invoice.");

    const insertResult = await query(
      `
      INSERT INTO consolidated_invoices (
        customerid,
        periodstart,
        periodend,
        billingthroughdate,
        periodlabel,
        includedinvoicefor,
        invoiceforkey,
        sourceinvoiceids,
        sourceinvoicekey,
        status,
        subtotal,
        taxamount,
        totalbeforeroundoff,
        roundoffamount,
        payableamount,
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
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18::jsonb,
        $19, FALSE, $20, $21,
        EXTRACT(EPOCH FROM NOW())::BIGINT,
        EXTRACT(EPOCH FROM NOW())::BIGINT
      )
      RETURNING *
      `,
      [
        customerId,
        preview.period.start,
        preview.period.end,
        preview.period.billingthroughdate,
        preview.period.label,
        JSON.stringify(preview.invoicefor),
        preview.invoiceforkey,
        JSON.stringify(getSourceInvoiceIds(preview.rows)),
        preview.sourceinvoicekey,
        "generating",
        preview.totals.taxableamount,
        preview.totals.taxamount,
        preview.totals.totalbeforeroundoff,
        preview.totals.roundoffamount,
        preview.totals.payableamount,
        preview.totals.totalamount,
        request?.session?.id || null,
        JSON.stringify({
          calculationVersion: CONSOLIDATED_INVOICE_CALCULATION_VERSION,
          preview,
        }),
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
    const supportingDocumentNumber = `${documentNumber}-SD`;
    const supportingDocumentHtml = getConsolidatedSupportingDocumentHtml({
      ...templateData,
      documentNumber: supportingDocumentNumber,
    });
    const supportingDocumentBuffer = await renderHtmlToPdf(supportingDocumentHtml);
    const supportingDocumentFileName = `${sanitizeFileName(supportingDocumentNumber)}.pdf`;
    const supportingDocumentUrl = await uploadPdf(
      supportingDocumentBuffer,
      `${CONSOLIDATED_INVOICE_FOLDER}/supporting-documents/${supportingDocumentFileName}`,
      supportingDocumentFileName
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
          supportingdocumentnumber = $3,
          supportingdocumenturl = $4,
          status = 'generated',
          iscurrent = TRUE,
          metadatajson = $5::jsonb,
          modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = $6
        RETURNING *
        `,
        [
          documentNumber,
          documentUrl,
          supportingDocumentNumber,
          supportingDocumentUrl,
          JSON.stringify({
            calculationVersion: CONSOLIDATED_INVOICE_CALCULATION_VERSION,
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

      for (const row of getSourceInvoiceRows(preview.rows as any[])) {
        await client.query(
          `
          INSERT INTO consolidated_invoice_sources (
            consolidatedinvoiceid,
            revoinvoiceid,
            invoicefor,
            invoicenumber,
            invoiceamount,
            billingperiodlabel,
            billingperiodstart,
            billingperiodend,
            billingstartdate,
            billingthroughdate,
            billabledays,
            cycledays,
            prorationfactor,
            monthlyinvoiceamount,
            proratedtaxableamount,
            proratedtaxamount,
            proratedtotalamount
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          `,
          [
            consolidatedRecord.id,
            row.sourceinvoiceid,
            row.invoicefor,
            row.invoicenumber,
            row.totalamount,
            row.billingperiodlabel,
            row.billingperiodstart ?? null,
            row.billingperiodend ?? null,
            row.billingstartdate ?? null,
            row.billingthroughdate ?? null,
            row.billabledays ?? null,
            row.cycledays ?? null,
            row.prorationfactor ?? null,
            row.monthlytotalamount ?? null,
            row.taxableamount ?? null,
            row.taxamount ?? null,
            row.totalamount ?? null,
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
      supportingdocumenturl: supportingDocumentUrl,
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
