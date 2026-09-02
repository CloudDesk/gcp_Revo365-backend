import { FinanceValidationError, toMoney, } from "./finance.utils.js";
const parseJsonArray = (value) => {
    if (Array.isArray(value))
        return value;
    if (typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
export const parseSupplierBillMoney = (value) => {
    if (value == null || value === "")
        return 0;
    const parsed = typeof value === "number"
        ? value
        : Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? toMoney(parsed) : 0;
};
export const assertSupplierBillTotalWithinPurchaseOrder = (purchaseOrderTotal, existingBillTotal, currentBillTotal) => {
    const poTotal = parseSupplierBillMoney(purchaseOrderTotal);
    const existingTotal = parseSupplierBillMoney(existingBillTotal);
    const billTotal = parseSupplierBillMoney(currentBillTotal);
    const aggregateBillTotal = toMoney(existingTotal + billTotal);
    if (aggregateBillTotal > poTotal) {
        const remainingAmount = toMoney(Math.max(poTotal - existingTotal, 0));
        throw new FinanceValidationError(`Bill amount ${billTotal} exceeds the remaining purchase order amount ${remainingAmount}.`);
    }
    return {
        purchaseOrderTotal: poTotal,
        existingBillTotal: existingTotal,
        currentBillTotal: billTotal,
        aggregateBillTotal,
        remainingAmount: toMoney(Math.max(poTotal - aggregateBillTotal, 0)),
    };
};
export const validateSupplierBillProductInput = (name, quantityValue, fallbackLabel = "Product") => {
    const productName = typeof name === "string" ? name.trim() : "";
    if (!productName ||
        ["null", "undefined", "false", "0"].includes(productName.toLowerCase())) {
        throw new FinanceValidationError("Product Name must contain a valid value.");
    }
    const quantity = Number(quantityValue);
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new FinanceValidationError(`Bill quantity for ${fallbackLabel} must be a whole number greater than 0.`);
    }
    return { productName, quantity };
};
export const assertSupplierBillCanBeModified = (hasTransactions) => {
    if (hasTransactions === true || hasTransactions === "true") {
        throw new FinanceValidationError("This Bill cannot be updated or deleted because a Cash & Bank transaction has already been recorded against it.");
    }
};
export const assertSupplierTdsMapping = (tdsApplied, tdsAmount, tdsSectionId) => {
    if (tdsAmount < 0) {
        throw new FinanceValidationError("TDS Payable amount cannot be negative.");
    }
    if (tdsApplied) {
        if (!Number.isSafeInteger(tdsSectionId) || Number(tdsSectionId) <= 0) {
            throw new FinanceValidationError("A valid TDS section is required when TDS Payable is applied.");
        }
        return;
    }
    if (tdsAmount !== 0 || tdsSectionId !== null) {
        throw new FinanceValidationError("TDS amount and section must be empty when TDS is not applied.");
    }
};
export const getSupplierBillPaymentState = (bill) => {
    const invoiceAmount = Math.max(parseSupplierBillMoney(bill?.invoiceamount), 0);
    const payments = parseJsonArray(bill?.paymentdata);
    const paymentHistoryTotal = toMoney(payments.reduce((total, payment) => {
        if (String(payment?.status || "success").toLowerCase() === "failed") {
            return total;
        }
        return (total +
            parseSupplierBillMoney(payment?.settlementamount ??
                payment?.paymentamount ??
                payment?.amount));
    }, 0));
    const hasStoredBalance = bill?.balanceamount !== null &&
        bill?.balanceamount !== undefined &&
        bill?.balanceamount !== "";
    const storedBalance = parseSupplierBillMoney(bill?.balanceamount);
    const settledFromBalance = hasStoredBalance && storedBalance >= 0 && storedBalance <= invoiceAmount
        ? toMoney(invoiceAmount - storedBalance)
        : 0;
    const hasFinanceSettlement = bill?.finance_settled_amount !== null &&
        bill?.finance_settled_amount !== undefined &&
        bill?.finance_settled_amount !== "";
    const financeSettledAmount = parseSupplierBillMoney(bill?.finance_settled_amount);
    const settledAmount = Math.min(Math.max(paymentHistoryTotal, settledFromBalance, hasFinanceSettlement ? financeSettledAmount : 0), invoiceAmount);
    const outstandingAmount = toMoney(Math.max(invoiceAmount - settledAmount, 0));
    return { invoiceAmount, settledAmount, outstandingAmount };
};
export const isSupplierBillOpen = (bill) => {
    const status = String(bill?.invoicestatus || "")
        .trim()
        .toLowerCase();
    return (!["cancelled", "complete", "overdue_complete"].includes(status) &&
        getSupplierBillPaymentState(bill).outstandingAmount > 0);
};
export const resolveSupplierBillStatus = (bill, balanceAmount, atEpoch) => {
    const balance = parseSupplierBillMoney(balanceAmount);
    const dueDate = Number(bill?.paymentduedate);
    const isOverdue = bill?.iscreditpayment === true &&
        Number.isFinite(dueDate) &&
        dueDate > 0 &&
        atEpoch > dueDate;
    if (balance === 0)
        return isOverdue ? "overdue_complete" : "complete";
    return isOverdue ? "overdue" : "in_progress";
};
export const applySupplierBillAllocation = (bill, allocationAmount, tdsAmount = 0) => {
    const state = getSupplierBillPaymentState(bill);
    const allocation = parseSupplierBillMoney(allocationAmount);
    const tds = parseSupplierBillMoney(tdsAmount);
    if (allocation <= 0) {
        throw new FinanceValidationError("Each bill allocation must be greater than zero.");
    }
    if (tds < 0) {
        throw new FinanceValidationError("TDS Payable amount cannot be negative.");
    }
    const totalSettledAmount = toMoney(allocation + tds);
    if (totalSettledAmount > state.outstandingAmount) {
        throw new FinanceValidationError(`Total settlement for bill ${bill?.invoicenumber || bill?.id} exceeds its outstanding amount.`);
    }
    const settledAmount = toMoney(state.settledAmount + totalSettledAmount);
    const balanceAmount = toMoney(Math.max(state.invoiceAmount - settledAmount, 0));
    return {
        ...state,
        allocationAmount: allocation,
        tdsAmount: tds,
        totalSettledAmount,
        settledAmount,
        balanceAmount,
    };
};
//# sourceMappingURL=supplierBill.utils.js.map