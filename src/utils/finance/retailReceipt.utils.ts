import {
  FinanceValidationError,
  toMoney,
} from "./finance.utils.js";

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

export const parseRetailMoney = (value: unknown): number => {
  if (value == null || value === "") return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? toMoney(parsed) : 0;
};

export const resolveRetailInvoiceAmount = (invoice: any): number => {
  const invoiceData = parseJsonObject(invoice?.invoicedata);
  const summaryData = parseJsonObject(invoice?.summaryinvoicedata);
  const supportingData = parseJsonObject(invoice?.supportingdocumentdata);
  const candidates = [
    invoice?.totalorderamount,
    invoice?.invoiceamount,
    invoiceData.payableamount,
    supportingData.payableamount,
    summaryData.totalamount,
    invoiceData.total,
    invoiceData.totalamount,
  ];

  for (const candidate of candidates) {
    const amount = parseRetailMoney(candidate);
    if (amount > 0) return amount;
  }
  return 0;
};

export const getSuccessfulRetailPaymentsTotal = (
  paymentData: unknown
): number => {
  const payments = Array.isArray(paymentData)
    ? paymentData
    : typeof paymentData === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(paymentData);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return toMoney(
    payments.reduce((total: number, payment: any) => {
      if (String(payment?.status || "success").toLowerCase() === "failed") {
        return total;
      }
      return (
        total +
        parseRetailMoney(payment?.paymentamount ?? payment?.amount)
      );
    }, 0)
  );
};

export const getRetailInvoicePaymentState = (invoice: any) => {
  const invoiceAmount = resolveRetailInvoiceAmount(invoice);
  const recordedPaid = Math.max(
    parseRetailMoney(invoice?.paidamount),
    getSuccessfulRetailPaymentsTotal(invoice?.paymentdata)
  );
  const paidAmount = Math.min(recordedPaid, invoiceAmount);
  const outstandingAmount = toMoney(
    Math.max(invoiceAmount - paidAmount, 0)
  );

  return { invoiceAmount, paidAmount, outstandingAmount };
};

export const applyRetailInvoiceAllocation = (
  invoice: any,
  allocationAmount: unknown
) => {
  const state = getRetailInvoicePaymentState(invoice);
  const allocation = parseRetailMoney(allocationAmount);
  if (allocation <= 0) {
    throw new FinanceValidationError(
      "Each invoice allocation must be greater than zero."
    );
  }
  if (allocation > state.outstandingAmount) {
    throw new FinanceValidationError(
      `Allocation for invoice ${invoice?.invoicenumber || invoice?.id} exceeds its outstanding amount.`
    );
  }

  const paidAmount = toMoney(state.paidAmount + allocation);
  const balanceAmount = toMoney(
    Math.max(state.invoiceAmount - paidAmount, 0)
  );
  const paymentStatus =
    balanceAmount === 0
      ? "paid"
      : paidAmount > 0
        ? "partially_paid"
        : "pending";

  return {
    ...state,
    allocationAmount: allocation,
    paidAmount,
    balanceAmount,
    paymentStatus,
  };
};

export const isRetailStoreInvoice = (invoice: any): boolean => {
  const invoiceData = parseJsonObject(invoice?.invoicedata);
  const invoiceFor = String(invoice?.invoicefor || "").trim().toLowerCase();
  const orderName = String(
    invoice?.linkedordername || invoiceData.ordername || ""
  )
    .trim()
    .toLowerCase();

  return invoiceFor === "product" && orderName === "storepurchase";
};

