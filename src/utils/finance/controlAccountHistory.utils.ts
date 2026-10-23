import { toMoney } from "./finance.utils.js";
import { toCustomerStatementDate } from "./customerStatement.utils.js";
import {
  getRetailInvoicePaymentState,
  parseRetailMoney,
} from "./retailReceipt.utils.js";
import { getSupplierBillPaymentState } from "./supplierBill.utils.js";

// Accounts Receivable and Accounts Payable history is calculated from the
// invoices/bills and the payments recorded against them, because invoice and
// bill creation does not post journal entries to the control accounts.

export type ControlAccountKind = "receivable" | "payable";

export type ControlAccountHistoryEntry = {
  id: string;
  journalentryid: null;
  transactiondate: string | null;
  entryname: string;
  description: string | null;
  debitamount: number;
  creditamount: number;
  runningbalance: number;
  journalnumber: null;
  transactionnumber: string;
  documentnumber: string;
  partyname: string | null;
  sourcetype: string;
  allocationmethod: null;
  remarks: string | null;
  bankcashaccountid: null;
  bankcashaccountname: string | null;
  createdby: string | null;
  postedby: null;
  createddate: unknown;
  posteddate: null;
  postingstatus: "calculated";
  transaction: null;
  iscalculated: true;
};

type DraftEntry = Omit<ControlAccountHistoryEntry, "runningbalance"> & {
  // A payment dated before its document (for example an order paid before
  // the invoice was raised) is ordered after the document it settles.
  sortdate: string;
  sortrank: number;
  documentid: number;
  sequence: number;
};

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

const formatAmount = (value: number) =>
  value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  online: "Online",
  upi: "UPI",
  card: "Card",
  cheque: "Cheque",
  on_account: "On Account",
};

const getPaymentMethodLabel = (method: unknown) => {
  const normalized = String(method || "").trim().toLowerCase();
  if (!normalized) return null;
  return (
    PAYMENT_METHOD_LABELS[normalized] ||
    normalized.replace(/_/g, " ").replace(/^./, (value) => value.toUpperCase())
  );
};

// Mirrors getRetailInvoicePaymentState: rental invoices settled under the
// original order exclude the order payment from the invoice settlement.
const isLegacyRentalOrderPayment = (invoice: any, payments: any[]) =>
  String(invoice?.invoicefor || "").trim().toLowerCase() === "rental" &&
  payments.some(
    (payment) =>
      String(payment?.source || "").trim().toLowerCase() === "order_payment"
  );

const resolveDocumentState = (kind: ControlAccountKind, document: any) => {
  if (kind === "receivable") {
    const state = getRetailInvoicePaymentState(document);
    return { amount: state.invoiceAmount, settled: state.paidAmount };
  }
  const state = getSupplierBillPaymentState(document);
  return { amount: state.invoiceAmount, settled: state.settledAmount };
};

const getDocumentPayments = (kind: ControlAccountKind, document: any) => {
  const payments = parseJsonArray(document?.paymentdata);
  const excludeOrderPayments =
    kind === "receivable" && isLegacyRentalOrderPayment(document, payments);
  return payments.filter((payment) => {
    if (String(payment?.status || "success").toLowerCase() === "failed") {
      return false;
    }
    if (
      excludeOrderPayments &&
      String(payment?.source || "").trim().toLowerCase() === "order_payment"
    ) {
      return false;
    }
    return true;
  });
};

const buildDocumentEntries = (
  kind: ControlAccountKind,
  document: any,
  bankAccountNames: Map<number, string>
): DraftEntry[] => {
  const isReceivable = kind === "receivable";
  const documentId = Number(document.id);
  const documentNumber =
    document.invoicenumber || `${isReceivable ? "INV" : "BILL"}-${document.id}`;
  const documentDate = toCustomerStatementDate(
    document.invoicedate || document.createddate
  );
  const partyName = document.partyname || null;
  const { amount, settled } = resolveDocumentState(kind, document);

  // Receivable: invoice increases the balance (Debit), receipts reduce it.
  // Payable: bill increases the balance (Credit), payments reduce it.
  const documentSide = (value: number) =>
    isReceivable
      ? { debitamount: value, creditamount: 0 }
      : { debitamount: 0, creditamount: value };
  const settlementSide = (value: number) =>
    isReceivable
      ? { debitamount: 0, creditamount: value }
      : { debitamount: value, creditamount: 0 };

  const base = {
    journalentryid: null,
    journalnumber: null,
    documentnumber: documentNumber,
    partyname: partyName,
    allocationmethod: null,
    bankcashaccountid: null,
    postedby: null,
    posteddate: null,
    postingstatus: "calculated" as const,
    transaction: null,
    iscalculated: true as const,
    documentid: documentId,
  };

  const entries: DraftEntry[] = [];
  if (amount > 0) {
    entries.push({
      ...base,
      ...documentSide(amount),
      id: `${isReceivable ? "invoice" : "bill"}-${documentId}`,
      transactiondate: documentDate,
      entryname: `${isReceivable ? "Invoice" : "Bill"} ${documentNumber}${
        partyName ? ` · ${partyName}` : ""
      }`,
      description: null,
      transactionnumber: documentNumber,
      sourcetype: isReceivable ? "sales_invoice" : "purchase_bill",
      remarks: document.parentreference
        ? `PO: ${document.parentreference}`
        : null,
      bankcashaccountname: null,
      createdby: document.createdby || null,
      createddate: document.createddate || null,
      sortdate: documentDate || "",
      sortrank: 0,
      sequence: 0,
    });
  }

  let paymentsTotal = 0;
  getDocumentPayments(kind, document).forEach((payment, index) => {
    const settlementAmount = parseRetailMoney(
      payment?.settlementamount ?? payment?.paymentamount ?? payment?.amount
    );
    if (settlementAmount <= 0) return;
    paymentsTotal = toMoney(paymentsTotal + settlementAmount);

    const tdsAmount = parseRetailMoney(payment?.tdsamount);
    const isOnAccount =
      String(payment?.paymentmethod || "").toLowerCase() === "on_account" ||
      String(payment?.source || "").toLowerCase().includes("on_account");
    const bankTransactionId = Number(payment?.banktransactionid) || null;
    const paymentDate =
      toCustomerStatementDate(payment?.paymentdate) || documentDate;
    const reference =
      payment?.transactionreference ||
      payment?.providerpaymentid ||
      `${documentNumber}-P${index + 1}`;
    const paymentLabel = isOnAccount
      ? "On Account applied"
      : isReceivable
        ? "Receipt"
        : "Payment";

    entries.push({
      ...base,
      ...settlementSide(settlementAmount),
      id: `${isReceivable ? "invoice" : "bill"}-${documentId}-payment-${index + 1}`,
      transactiondate: paymentDate,
      entryname: `${paymentLabel} for ${documentNumber}${
        partyName ? ` · ${partyName}` : ""
      }`,
      description: null,
      transactionnumber: String(reference),
      sourcetype: isOnAccount
        ? "on_account"
        : isReceivable
          ? "customer_receipt"
          : "supplier_payment",
      remarks:
        tdsAmount > 0
          ? `${isReceivable ? "Received" : "Paid"} ${formatAmount(
              toMoney(settlementAmount - tdsAmount)
            )} + TDS ${formatAmount(tdsAmount)}`
          : payment?.comments || null,
      bankcashaccountname:
        (bankTransactionId && bankAccountNames.get(bankTransactionId)) ||
        getPaymentMethodLabel(payment?.paymentmethod),
      createdby: null,
      createddate: payment?.paymentdate || null,
      sortdate: [paymentDate || "", documentDate || ""].sort().pop() || "",
      sortrank: 1,
      sequence: index + 1,
    });
  });

  // Keep the history consistent with the settled amount stored on the
  // document (older documents may carry a paid amount without payment rows).
  const difference = toMoney(settled - paymentsTotal);
  if (Math.abs(difference) >= 0.01) {
    const isMissingSettlement = difference > 0;
    entries.push({
      ...base,
      ...(isMissingSettlement
        ? settlementSide(difference)
        : documentSide(Math.abs(difference))),
      id: `${isReceivable ? "invoice" : "bill"}-${documentId}-adjustment`,
      transactiondate: documentDate,
      entryname: isMissingSettlement
        ? `Settlement recorded on ${documentNumber}`
        : `Excess payment over ${documentNumber} amount`,
      description: null,
      transactionnumber: documentNumber,
      sourcetype: "settlement_adjustment",
      remarks: isMissingSettlement
        ? `Paid amount recorded on the ${
            isReceivable ? "invoice" : "bill"
          } without payment details`
        : `Payments exceed the ${isReceivable ? "invoice" : "bill"} amount`,
      bankcashaccountname: null,
      createdby: null,
      createddate: null,
      sortdate: documentDate || "",
      sortrank: 2,
      sequence: 0,
    });
  }

  return entries;
};

/**
 * Builds the chronological AR/AP history (oldest first) with a running
 * Debit-minus-Credit balance. The closing balance equals the total
 * outstanding amount of the supplied documents.
 */
export const buildControlAccountHistory = (
  kind: ControlAccountKind,
  documents: any[],
  bankAccountNames: Map<number, string> = new Map()
): ControlAccountHistoryEntry[] => {
  const drafts = (Array.isArray(documents) ? documents : []).flatMap(
    (document) => buildDocumentEntries(kind, document, bankAccountNames)
  );

  drafts.sort(
    (left, right) =>
      left.sortdate.localeCompare(right.sortdate) ||
      left.documentid - right.documentid ||
      left.sortrank - right.sortrank ||
      left.sequence - right.sequence
  );

  let runningBalance = 0;
  return drafts.map(({ sortdate, sortrank, documentid, sequence, ...entry }) => {
    runningBalance = toMoney(
      runningBalance + entry.debitamount - entry.creditamount
    );
    return { ...entry, runningbalance: runningBalance };
  });
};

export const summarizeControlAccountHistory = (
  entries: Array<Pick<ControlAccountHistoryEntry, "transactiondate" | "debitamount" | "creditamount">>,
  fromDate: string | null = null,
  toDate: string | null = null
) =>
  entries.reduce(
    (totals, entry) => {
      const date = String(entry.transactiondate || "");
      if (fromDate && toDate && (date < fromDate || date > toDate)) {
        return totals;
      }
      return {
        totaldebit: toMoney(totals.totaldebit + entry.debitamount),
        totalcredit: toMoney(totals.totalcredit + entry.creditamount),
      };
    },
    { totaldebit: 0, totalcredit: 0 }
  );

export const collectBankTransactionIds = (documents: any[]): number[] =>
  Array.from(
    new Set(
      (Array.isArray(documents) ? documents : [])
        .flatMap((document) => parseJsonArray(document?.paymentdata))
        .map((payment) => Number(payment?.banktransactionid))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
