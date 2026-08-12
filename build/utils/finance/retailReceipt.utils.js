import { FinanceValidationError, toMoney, } from "./finance.utils.js";
const parseJsonObject = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    if (typeof value !== "string")
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
};
export const parseRetailMoney = (value) => {
    if (value == null || value === "")
        return 0;
    const parsed = typeof value === "number"
        ? value
        : Number(String(value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? toMoney(parsed) : 0;
};
export const resolveRetailInvoiceAmount = (invoice) => {
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
        if (amount > 0)
            return amount;
    }
    return 0;
};
export const getSuccessfulRetailPaymentsTotal = (paymentData) => {
    const payments = Array.isArray(paymentData)
        ? paymentData
        : typeof paymentData === "string"
            ? (() => {
                try {
                    const parsed = JSON.parse(paymentData);
                    return Array.isArray(parsed) ? parsed : [];
                }
                catch {
                    return [];
                }
            })()
            : [];
    return toMoney(payments.reduce((total, payment) => {
        if (String(payment?.status || "success").toLowerCase() === "failed") {
            return total;
        }
        return (total +
            parseRetailMoney(payment?.settlementamount ?? payment?.paymentamount ?? payment?.amount));
    }, 0));
};
const hasLegacyRentalOrderPayment = (invoice) => {
    if (String(invoice?.invoicefor || "").trim().toLowerCase() !== "rental") {
        return false;
    }
    const payments = Array.isArray(invoice?.paymentdata)
        ? invoice.paymentdata
        : typeof invoice?.paymentdata === "string"
            ? (() => {
                try {
                    const parsed = JSON.parse(invoice.paymentdata);
                    return Array.isArray(parsed) ? parsed : [];
                }
                catch {
                    return [];
                }
            })()
            : [];
    return payments.some((payment) => String(payment?.source || "").trim().toLowerCase() === "order_payment");
};
const getSuccessfulRentalReceiptPaymentsTotal = (paymentData) => {
    const payments = Array.isArray(paymentData)
        ? paymentData
        : typeof paymentData === "string"
            ? (() => {
                try {
                    const parsed = JSON.parse(paymentData);
                    return Array.isArray(parsed) ? parsed : [];
                }
                catch {
                    return [];
                }
            })()
            : [];
    return getSuccessfulRetailPaymentsTotal(payments.filter((payment) => String(payment?.source || "").trim().toLowerCase() !== "order_payment"));
};
export const getRetailInvoicePaymentState = (invoice) => {
    const invoiceAmount = resolveRetailInvoiceAmount(invoice);
    const legacyRentalOrderPayment = hasLegacyRentalOrderPayment(invoice);
    const successfulPayments = legacyRentalOrderPayment
        ? getSuccessfulRentalReceiptPaymentsTotal(invoice?.paymentdata)
        : getSuccessfulRetailPaymentsTotal(invoice?.paymentdata);
    const recordedPaid = Math.max(legacyRentalOrderPayment ? 0 : parseRetailMoney(invoice?.paidamount), successfulPayments);
    const paidAmount = Math.min(recordedPaid, invoiceAmount);
    const outstandingAmount = toMoney(Math.max(invoiceAmount - paidAmount, 0));
    return { invoiceAmount, paidAmount, outstandingAmount };
};
export const getRetailInvoicesOutstandingTotal = (invoices) => toMoney((Array.isArray(invoices) ? invoices : []).reduce((total, invoice) => total + getRetailInvoicePaymentState(invoice).outstandingAmount, 0));
export const applyRetailInvoiceAllocation = (invoice, allocationAmount, tdsAmount = 0) => {
    const state = getRetailInvoicePaymentState(invoice);
    const allocation = parseRetailMoney(allocationAmount);
    const tds = parseRetailMoney(tdsAmount);
    if (allocation <= 0) {
        throw new FinanceValidationError("Each invoice allocation must be greater than zero.");
    }
    if (tds < 0) {
        throw new FinanceValidationError("TDS Receivable amount cannot be negative.");
    }
    const totalSettledAmount = toMoney(allocation + tds);
    if (totalSettledAmount > state.outstandingAmount) {
        throw new FinanceValidationError(`Total settlement for invoice ${invoice?.invoicenumber || invoice?.id} exceeds its outstanding amount.`);
    }
    const paidAmount = toMoney(state.paidAmount + totalSettledAmount);
    const balanceAmount = toMoney(Math.max(state.invoiceAmount - paidAmount, 0));
    const paymentStatus = balanceAmount === 0
        ? "paid"
        : paidAmount > 0
            ? "partially_paid"
            : "pending";
    return {
        ...state,
        allocationAmount: allocation,
        tdsAmount: tds,
        totalSettledAmount,
        paidAmount,
        balanceAmount,
        paymentStatus,
    };
};
export const isRetailStoreProductOrder = (order) => {
    const orderName = String(order?.ordername || "").trim().toLowerCase();
    const invoiceFor = String(order?.invoicefor || "").trim().toLowerCase();
    return orderName === "storepurchase" && invoiceFor === "product";
};
export const isRetailStoreInvoice = (invoice) => {
    const invoiceData = parseJsonObject(invoice?.invoicedata);
    return isRetailStoreProductOrder({
        ordername: invoice?.linkedordername || invoiceData.ordername,
        invoicefor: invoice?.invoicefor,
    });
};
export const isServiceRequestInvoice = (invoice) => {
    const invoiceFor = String(invoice?.invoicefor || "").trim().toLowerCase();
    const ticketNumber = String(invoice?.ticketnumber || "").trim();
    return invoiceFor === "service" && Boolean(ticketNumber);
};
export const isRentalInvoice = (invoice) => String(invoice?.invoicefor || "").trim().toLowerCase() === "rental";
const CUSTOMER_RECEIPT_SOURCE_METADATA = Object.freeze({
    in_store: {
        label: "In-store",
        transactionSource: "retail_receipt",
        paymentSource: "finance_retail_receipt",
    },
    service_request: {
        label: "Service Request",
        transactionSource: "service_request_receipt",
        paymentSource: "finance_service_receipt",
    },
    rental: {
        label: "Rental",
        transactionSource: "rental_receipt",
        paymentSource: "finance_rental_receipt",
    },
});
export const resolveCustomerReceiptInvoiceSource = (invoice) => {
    if (isRentalInvoice(invoice))
        return "rental";
    if (isServiceRequestInvoice(invoice))
        return "service_request";
    if (isRetailStoreInvoice(invoice))
        return "in_store";
    return null;
};
export const isEligibleCustomerReceiptInvoice = (invoice, mode) => {
    const source = resolveCustomerReceiptInvoiceSource(invoice);
    if (!source)
        return false;
    if (mode === "all")
        return true;
    if (mode === "rental")
        return source === "rental";
    return source === "in_store" || source === "service_request";
};
export const getCustomerReceiptInvoiceSourceMetadata = (invoice) => {
    const source = resolveCustomerReceiptInvoiceSource(invoice);
    return source ? { source, ...CUSTOMER_RECEIPT_SOURCE_METADATA[source] } : null;
};
export const resolveCustomerReceiptSourceType = (invoices) => {
    const sources = new Set(invoices.map(resolveCustomerReceiptInvoiceSource).filter(Boolean));
    if (sources.size !== 1)
        return "customer_receipt";
    const source = Array.from(sources)[0];
    return CUSTOMER_RECEIPT_SOURCE_METADATA[source].transactionSource;
};
//# sourceMappingURL=retailReceipt.utils.js.map