import { toMoney } from "./finance.utils.js";

type BalanceSheetRow = Record<string, any>;

const normalized = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

export const isGstLedgerRow = (row: BalanceSheetRow) => {
  if (!["asset", "liability"].includes(normalized(row?.accountType))) return false;
  const identity = [row?.accountCode, row?.accountName, row?.accountSubtype].map(normalized).join("_");
  return identity.includes("gst")
    || identity.includes("input_tax_credit")
    || identity.includes("goods_and_services_tax");
};

/**
 * Nets posted GST ledger presentation without changing the accounting equation.
 * Operational invoice/bill GST must never be passed to this function.
 */
export const netPostedGstLedgerRows = (rows: BalanceSheetRow[]) => {
  const statementRows = Array.isArray(rows) ? rows : [];
  const gstRows = statementRows.filter(isGstLedgerRow);
  if (gstRows.length === 0) return statementRows;

  const sum = (field: string) => toMoney(gstRows.reduce((total, row) => total + Number(row[field] || 0), 0));
  const closingNetDebit = toMoney(sum("closingDebit") - sum("closingCredit"));
  const withoutGst = statementRows.filter(row => !isGstLedgerRow(row));
  if (closingNetDebit === 0) return withoutGst;

  const receivable = closingNetDebit > 0;
  const amount = Math.abs(closingNetDebit);
  return [...withoutGst, {
    accountId: receivable ? -3 : -4,
    accountCode: receivable ? "NET-GST-RECEIVABLE" : "NET-GST-PAYABLE",
    accountName: receivable ? "GST Receivable / Input Tax Credit" : "GST Payable",
    accountType: receivable ? "asset" : "liability",
    accountSubtype: receivable ? "gst_receivable" : "gst_payable",
    openingDebit: sum("openingDebit"),
    openingCredit: sum("openingCredit"),
    periodDebit: sum("periodDebit"),
    periodCredit: sum("periodCredit"),
    closingDebit: receivable ? amount : 0,
    closingCredit: receivable ? 0 : amount,
    balance: receivable ? amount : -amount,
    ledgerNetted: true,
    sourceAccountIds: gstRows.map(row => Number(row.accountId)).filter(Number.isFinite),
  }];
};
