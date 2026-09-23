import { toMoney } from "./finance.utils.js";

export type GstSummary = {
  igst: number;
  cgst: number;
  sgst: number;
  total: number;
};

const emptyGstSummary = (): GstSummary => ({
  igst: 0,
  cgst: 0,
  sgst: 0,
  total: 0,
});

const parseJsonObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

/**
 * Reads the first monetary value only. Some legacy invoice snapshots append a
 * GST breakdown after the total, so removing every non-numeric character would
 * incorrectly concatenate several amounts.
 */
export const parseGstMoney = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? toMoney(value) : 0;
  }
  if (value == null || value === "") return 0;
  const match = String(value).match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? toMoney(parsed) : 0;
};

const firstAmount = (...values: unknown[]): number => {
  for (const value of values) {
    const amount = parseGstMoney(value);
    if (amount > 0) return amount;
  }
  return 0;
};

const normalizeTaxMode = (...values: unknown[]): string =>
  values
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean) || "";

export const resolveInvoiceGst = (invoice: any): GstSummary => {
  const invoiceFor = String(invoice?.invoicefor || "").trim().toLowerCase();
  if (!new Set(["product", "rental", "service"]).has(invoiceFor)) {
    return emptyGstSummary();
  }

  const invoiceData = parseJsonObject(invoice?.invoicedata);
  const summaryData = parseJsonObject(invoice?.summaryinvoicedata);
  const supportingData = parseJsonObject(invoice?.supportingdocumentdata);
  const total = firstAmount(
    invoice?.taxamount,
    invoiceData.taxamount,
    summaryData.taxamount,
    supportingData.taxamount
  );

  const explicitIgst = firstAmount(
    invoiceData.igstamount,
    summaryData.igstamount,
    supportingData.igstamount
  );
  const explicitCgst = firstAmount(
    invoiceData.cgstamount,
    summaryData.cgstamount,
    supportingData.cgstamount
  );
  const explicitSgst = firstAmount(
    invoiceData.sgstamount,
    summaryData.sgstamount,
    supportingData.sgstamount
  );
  const taxMode = normalizeTaxMode(
    invoiceData.taxmode,
    summaryData.taxmode,
    supportingData.taxmode,
    invoice?.taxmode
  );
  const taxType = normalizeTaxMode(
    invoiceData.taxtype,
    summaryData.taxtype,
    supportingData.taxtype
  );

  // Product and legacy Rental snapshots store these component fields as
  // amounts. Service snapshots store rates in the same fields, so they must not
  // be added as currency values.
  const legacyIgst =
    invoiceFor === "service" ? 0 : firstAmount(invoiceData.igst, summaryData.igst);
  const legacyCgst =
    invoiceFor === "service" ? 0 : firstAmount(invoiceData.cgst, summaryData.cgst);
  const legacySgst =
    invoiceFor === "service" ? 0 : firstAmount(invoiceData.sgst, summaryData.sgst);
  const serviceIgstRate =
    invoiceFor === "service"
      ? firstAmount(invoiceData.igst, summaryData.igst)
      : 0;
  const serviceCgstRate =
    invoiceFor === "service"
      ? firstAmount(invoiceData.cgst, summaryData.cgst)
      : 0;
  const serviceSgstRate =
    invoiceFor === "service"
      ? firstAmount(invoiceData.sgst, summaryData.sgst)
      : 0;

  const isIgst =
    taxMode === "igst" ||
    taxType.includes("inter") ||
    explicitIgst > 0 ||
    legacyIgst > 0 ||
    (serviceIgstRate > 0 && serviceCgstRate === 0 && serviceSgstRate === 0);

  if (total > 0) {
    if (isIgst) {
      return { igst: total, cgst: 0, sgst: 0, total };
    }
    const knownCgst = explicitCgst || legacyCgst;
    const knownSgst = explicitSgst || legacySgst;
    if (knownCgst > 0 && knownSgst > 0) {
      const componentTotal = toMoney(knownCgst + knownSgst);
      if (Math.abs(componentTotal - total) <= 0.02) {
        return { igst: 0, cgst: knownCgst, sgst: knownSgst, total };
      }
    }
    const cgst = toMoney(total / 2);
    return { igst: 0, cgst, sgst: toMoney(total - cgst), total };
  }

  const igst = explicitIgst || legacyIgst;
  const cgst = explicitCgst || legacyCgst;
  const sgst = explicitSgst || legacySgst;
  return { igst, cgst, sgst, total: toMoney(igst + cgst + sgst) };
};

export const resolveBillGst = (bill: any): GstSummary => {
  const total = firstAmount(bill?.payabletaxamount, bill?.taxamount);
  if (total <= 0) return emptyGstSummary();

  const igstRate = firstAmount(bill?.igst);
  const cgstRate = firstAmount(bill?.cgst);
  const sgstRate = firstAmount(bill?.sgst);
  if (igstRate > 0) return { igst: total, cgst: 0, sgst: 0, total };

  const combinedRate = cgstRate + sgstRate;
  if (combinedRate > 0) {
    const cgst = toMoney(total * (cgstRate / combinedRate));
    return { igst: 0, cgst, sgst: toMoney(total - cgst), total };
  }

  // Current supplier Bills use CGST + SGST when IGST is not present.
  const cgst = toMoney(total / 2);
  return { igst: 0, cgst, sgst: toMoney(total - cgst), total };
};

const sumGst = (
  rows: any[],
  resolver: (row: any) => GstSummary
): GstSummary => {
  const result = (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => {
      const value = resolver(row);
      sum.igst += value.igst;
      sum.cgst += value.cgst;
      sum.sgst += value.sgst;
      return sum;
    },
    emptyGstSummary()
  );
  result.igst = toMoney(result.igst);
  result.cgst = toMoney(result.cgst);
  result.sgst = toMoney(result.sgst);
  result.total = toMoney(result.igst + result.cgst + result.sgst);
  return result;
};

export const getInvoiceGstSummary = (invoices: any[]): GstSummary =>
  sumGst(invoices, resolveInvoiceGst);

export const getBillGstSummary = (bills: any[]): GstSummary =>
  sumGst(bills, resolveBillGst);
