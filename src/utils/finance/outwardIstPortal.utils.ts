import { resolveInvoiceGst } from "./gstSummary.utils.js";
import { getRetailInvoicePaymentState } from "./retailReceipt.utils.js";
import { toMoney } from "./finance.utils.js";

export type OutwardIstPortalRow = {
  code: string;
  description: string;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  invoiceTotal: number;
};

const zeroRow = (code: string, description: string): OutwardIstPortalRow => ({
  code, description, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, invoiceTotal: 0,
});

const isTamilNadu = (value: unknown) => {
  const state = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return state === "tamilnadu" || state === "tn" || state === "33";
};

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
};

const isEcommerceInvoice = (invoice: any) => {
  const snapshots = [invoice?.invoicedata, invoice?.summaryinvoicedata, invoice?.supportingdocumentdata].map(parseObject);
  return snapshots.some((snapshot) =>
    [snapshot.ordername, snapshot.ordertype, snapshot.channel, snapshot.source]
      .some((value) => /^(online|e-?commerce|ecommerce)$/i.test(String(value || "").trim()))
  );
};

const isBusinessInvoice = (invoice: any) => invoice.isbusinessuser === true;
const isLargeInterstateConsumerInvoice = (invoice: any) => {
  const state = String(invoice?.customerstate || "").trim();
  return invoice?.isbusinessuser !== true && Boolean(state) && !isTamilNadu(state)
    && getRetailInvoicePaymentState(invoice).invoiceAmount > 100000;
};

const detailRow = (invoice: any, forceIgst = false) => {
  const gst = resolveInvoiceGst(invoice);
  const payment = getRetailInvoicePaymentState(invoice);
  return {
    id: Number(invoice.id), date: Number(invoice.invoicedate || invoice.createddate),
    number: invoice.invoicenumber || `INV-${invoice.id}`,
    partyName: invoice.partyname || `Customer ${invoice.customerid || "—"}`,
    taxableValue: toMoney(payment.invoiceAmount - gst.total),
    igstAmount: forceIgst ? gst.total : gst.igst,
    cgstAmount: forceIgst ? 0 : gst.cgst,
    sgstAmount: forceIgst ? 0 : gst.sgst,
    invoiceTotal: payment.invoiceAmount,
  };
};

export const buildOutwardIstPortalDetails = (invoices: any[]) => {
  const valid = Array.isArray(invoices) ? invoices : [];
  const b2b = valid.filter(isBusinessInvoice).map(invoice => detailRow(invoice));
  const b2c = valid.filter(invoice => !isBusinessInvoice(invoice)).map(invoice => detailRow(invoice));
  return {
    b2b, b2cl: valid.filter(isLargeInterstateConsumerInvoice).map(invoice => detailRow(invoice, true)),
    "hsn-b2b": b2b, "hsn-b2c": b2c,
    ecommerce: valid.filter(isEcommerceInvoice).map(invoice => detailRow(invoice)),
  };
};

const aggregate = (invoices: any[], predicate: (invoice: any) => boolean) =>
  invoices.filter(predicate).reduce((sum, invoice) => {
    const gst = resolveInvoiceGst(invoice);
    const payment = getRetailInvoicePaymentState(invoice);
    sum.igstAmount += gst.igst;
    sum.cgstAmount += gst.cgst;
    sum.sgstAmount += gst.sgst;
    sum.invoiceTotal += payment.invoiceAmount;
    return sum;
  }, { igstAmount: 0, cgstAmount: 0, sgstAmount: 0, invoiceTotal: 0 });

const rounded = (value: ReturnType<typeof aggregate>) => ({
  igstAmount: toMoney(value.igstAmount), cgstAmount: toMoney(value.cgstAmount),
  sgstAmount: toMoney(value.sgstAmount), invoiceTotal: toMoney(value.invoiceTotal),
});

export const buildOutwardIstPortalRows = (invoices: any[]): OutwardIstPortalRow[] => {
  const valid = Array.isArray(invoices) ? invoices : [];
  const business = rounded(aggregate(valid, isBusinessInvoice));
  const largeInterstateConsumer = valid.filter(isLargeInterstateConsumerInvoice);
  // This statutory row reports the full tax on qualifying inter-State B2C
  // invoices under IGST, even when a legacy snapshot split the same tax.
  const b2clTax = toMoney(largeInterstateConsumer.reduce((total, invoice) => total + resolveInvoiceGst(invoice).total, 0));
  const b2clTotal = toMoney(largeInterstateConsumer.reduce((total, invoice) => total + getRetailInvoicePaymentState(invoice).invoiceAmount, 0));
  const b2bHsn = rounded(aggregate(valid, (invoice) => invoice.isbusinessuser === true));
  const b2cHsn = rounded(aggregate(valid, (invoice) => invoice.isbusinessuser !== true));
  const ecommerce = rounded(aggregate(valid, isEcommerceInvoice));

  return [
    { code: "b2b", description: "Taxable outward supplies made to registered persons (including UIN-holders)", ...business },
    { code: "b2cl", description: "Taxable outward inter-State supplies to unregistered persons where the invoice value is more than ₹1 lakh", igstAmount: b2clTax, cgstAmount: 0, sgstAmount: 0, invoiceTotal: b2clTotal },
    zeroRow("zero-rated", "Zero rated supplies and Deemed Exports"),
    zeroRow("consumer", "Taxable outward supplies to consumer"),
    zeroRow("nil-exempt", "Nil rated, Exempted and non-GST outward supplies"),
    zeroRow("notes-refund", "Details of Credit/Debit Notes and Refund Voucher"),
    zeroRow("advances", "Consolidated Statement of Advances Received"),
    zeroRow("advance-tax-paid", "Tax already paid (on advance receipt) on invoices issued in the current period"),
    { code: "hsn-b2b", description: "HSN-wise summary of the B2B Supplies", ...b2bHsn },
    { code: "hsn-b2c", description: "HSN-wise summary of the B2C Supplies", ...b2cHsn },
    { code: "ecommerce", description: "Supplies made through E-Commerce Operators", ...ecommerce },
  ];
};
