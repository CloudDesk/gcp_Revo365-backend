import {
  FinanceValidationError,
  toMoney,
} from "./finance.utils.js";

const parseJsonArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const parseSupplierBillMoney = (value: unknown): number => {
  if (value == null || value === "") return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? toMoney(parsed) : 0;
};

export const getSupplierBillPaymentState = (bill: any) => {
  const invoiceAmount = Math.max(
    parseSupplierBillMoney(bill?.invoiceamount),
    0
  );
  const payments = parseJsonArray(bill?.paymentdata);
  const paymentHistoryTotal = toMoney(
    payments.reduce((total: number, payment: any) => {
      if (String(payment?.status || "success").toLowerCase() === "failed") {
        return total;
      }
      return (
        total +
        parseSupplierBillMoney(
          payment?.settlementamount ??
            payment?.paymentamount ??
            payment?.amount
        )
      );
    }, 0)
  );
  const hasStoredBalance =
    bill?.balanceamount !== null &&
    bill?.balanceamount !== undefined &&
    bill?.balanceamount !== "";
  const storedBalance = parseSupplierBillMoney(bill?.balanceamount);
  const settledFromBalance =
    hasStoredBalance && storedBalance >= 0 && storedBalance <= invoiceAmount
      ? toMoney(invoiceAmount - storedBalance)
      : 0;
  const settledAmount = Math.min(
    Math.max(paymentHistoryTotal, settledFromBalance),
    invoiceAmount
  );
  const outstandingAmount = toMoney(
    Math.max(invoiceAmount - settledAmount, 0)
  );

  return { invoiceAmount, settledAmount, outstandingAmount };
};

export const isSupplierBillOpen = (bill: any): boolean => {
  const status = String(bill?.invoicestatus || "")
    .trim()
    .toLowerCase();
  return (
    !["cancelled", "complete", "overdue_complete"].includes(status) &&
    getSupplierBillPaymentState(bill).outstandingAmount > 0
  );
};

export const resolveSupplierBillStatus = (
  bill: any,
  balanceAmount: unknown,
  atEpoch: number
): string => {
  const balance = parseSupplierBillMoney(balanceAmount);
  const dueDate = Number(bill?.paymentduedate);
  const isOverdue =
    bill?.iscreditpayment === true &&
    Number.isFinite(dueDate) &&
    dueDate > 0 &&
    atEpoch > dueDate;

  if (balance === 0) return isOverdue ? "overdue_complete" : "complete";
  return isOverdue ? "overdue" : "in_progress";
};

export const applySupplierBillAllocation = (
  bill: any,
  allocationAmount: unknown,
  tdsAmount: unknown = 0
) => {
  const state = getSupplierBillPaymentState(bill);
  const allocation = parseSupplierBillMoney(allocationAmount);
  const tds = parseSupplierBillMoney(tdsAmount);
  if (allocation <= 0) {
    throw new FinanceValidationError(
      "Each bill allocation must be greater than zero."
    );
  }
  if (tds < 0) {
    throw new FinanceValidationError(
      "TDS Payable amount cannot be negative."
    );
  }

  const totalSettledAmount = toMoney(allocation + tds);
  if (totalSettledAmount > state.outstandingAmount) {
    throw new FinanceValidationError(
      `Total settlement for bill ${bill?.invoicenumber || bill?.id} exceeds its outstanding amount.`
    );
  }

  const settledAmount = toMoney(state.settledAmount + totalSettledAmount);
  const balanceAmount = toMoney(
    Math.max(state.invoiceAmount - settledAmount, 0)
  );

  return {
    ...state,
    allocationAmount: allocation,
    tdsAmount: tds,
    totalSettledAmount,
    settledAmount,
    balanceAmount,
  };
};
