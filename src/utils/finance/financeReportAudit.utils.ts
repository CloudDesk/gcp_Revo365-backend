import { toMoney } from "./finance.utils.js";

export type FinanceAuditIssue = { scope: string; message: string };

const amount = (value: unknown) => toMoney(Number(value) || 0);
const equalMoney = (left: unknown, right: unknown) =>
  Math.abs(Math.round(amount(left) * 100) - Math.round(amount(right) * 100)) <= 1;

const validDocumentDate = (value: unknown) => {
  if (value == null || value === "") return false;
  const normalized = String(value).trim();
  if (/^\d{10,13}$/.test(normalized)) return Number(normalized) > 0;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && !Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime());
};

export const auditFinanceReport = (reportKey: string, report: any): FinanceAuditIssue[] => {
  const issues: FinanceAuditIssue[] = [];
  const add = (scope: string, message: string) => issues.push({ scope, message });

  if (["sales-invoices", "supplier-bills", "gst-inward", "gst-outward"].includes(reportKey)) {
    (report?.rows || []).forEach((row: any, index: number) => {
      const scope = `${reportKey}.row[${index}]#${row.number || row.id}`;
      if (!String(row.number || "").trim()) add(scope, "Document number is missing");
      if (!validDocumentDate(row.date)) add(scope, "Document date is missing or invalid");
      if (!String(row.partyName || "").trim()) add(scope, "Party name is missing");
      if (!String(row.documentType || "").trim()) add(scope, "Document type is missing");
      if (!equalMoney(amount(row.cgst) + amount(row.sgst) + amount(row.igst), row.tax))
        add(scope, "CGST + SGST + IGST does not equal Total GST");
      if (amount(row.igst) > 0 && (amount(row.cgst) > 0 || amount(row.sgst) > 0))
        add(scope, "IGST cannot be combined with CGST or SGST on the same document");
      if (!equalMoney(amount(row.taxableValue) + amount(row.tax), row.grossAmount))
        add(scope, "Taxable Value + Total GST does not equal Gross Amount");
      if (!reportKey.startsWith("gst-") && !equalMoney(amount(row.paidAmount) + amount(row.balanceAmount), row.grossAmount))
        add(scope, "Paid Amount + Balance Amount does not equal Gross Amount");
      ["taxableValue", "cgst", "sgst", "igst", "tax", "grossAmount", "paidAmount", "balanceAmount"].forEach((key) => {
        if (row[key] != null && (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0))
          add(scope, `${key} is negative or invalid`);
      });
      if (amount(row.paidAmount) > amount(row.grossAmount) + 0.01)
        add(scope, "Paid Amount exceeds Gross Amount");
    });
    const summary = report?.summary || {};
    if (reportKey.startsWith("gst-")) {
      if (!equalMoney(amount(summary.cgst) + amount(summary.sgst) + amount(summary.igst), summary.tax))
        add(`${reportKey}.summary`, "CGST + SGST + IGST does not equal Total GST");
    } else {
      if (!equalMoney(amount(summary.taxableValue) + amount(summary.tax), summary.grossAmount))
        add(`${reportKey}.summary`, "Taxable Value + Tax does not equal Gross Amount");
      if (!equalMoney(amount(summary.paidAmount) + amount(summary.balanceAmount), summary.grossAmount))
        add(`${reportKey}.summary`, "Paid Amount + Balance Amount does not equal Gross Amount");
    }
    if (reportKey === "supplier-bills" && !equalMoney(amount(summary.inventoryPurchases) + amount(summary.operatingExpense), summary.taxableValue))
      add(`${reportKey}.summary`, "Inventory Purchases + Operating Expense does not equal Taxable Value");
  }

  if (reportKey === "trial-balance") {
    const totals = report?.totals || {};
    if (!equalMoney(totals.periodDebit, totals.periodCredit)) add(reportKey, "Period Debit does not equal Period Credit");
    if (!equalMoney(totals.closingDebit, totals.closingCredit)) add(reportKey, "Closing Debit does not equal Closing Credit");
    if (!equalMoney(report?.variance, 0)) add(reportKey, "Trial Balance variance is not zero");
  }

  if (reportKey === "balance-sheet" && !equalMoney(report?.variance, 0))
    add(reportKey, "Balance Sheet does not balance");

  if (reportKey === "balance-sheet") {
    (report?.rows || []).forEach((row: any, index: number) => {
      if (!["asset", "liability", "equity"].includes(row.accountType))
        add(`${reportKey}.row[${index}]`, "Balance Sheet contains a non-Asset/Liability/Equity account");
    });
    const assets = amount((report?.rows || []).filter((row: any) => row.accountType === "asset")
      .reduce((sum: number, row: any) => sum + amount(row.closingDebit) - amount(row.closingCredit), 0));
    const liabilitiesAndEquity = amount((report?.rows || []).filter((row: any) => ["liability", "equity"].includes(row.accountType))
      .reduce((sum: number, row: any) => sum + amount(row.closingCredit) - amount(row.closingDebit), 0));
    if (!equalMoney(assets, liabilitiesAndEquity))
      add(reportKey, "Assets do not equal Liabilities + Equity");
  }

  if (reportKey === "profit-loss") {
    (report?.rows || []).forEach((row: any, index: number) => {
      if (!["income", "expense"].includes(row.accountType))
        add(`${reportKey}.row[${index}]`, "P&L contains a non-Income/Expense account");
      ["periodDebit", "periodCredit"].forEach((key) => {
        if (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0)
          add(`${reportKey}.row[${index}]`, `${key} is negative or invalid`);
      });
    });
    const incomeRows = (report?.rows || []).filter((row: any) => row.accountType === "income");
    const expenseRows = (report?.rows || []).filter((row: any) => row.accountType === "expense");
    const netIncome = amount(incomeRows.reduce((sum: number, row: any) => sum + amount(row.periodCredit) - amount(row.periodDebit), 0));
    const netExpense = amount(expenseRows.reduce((sum: number, row: any) => sum + amount(row.periodDebit) - amount(row.periodCredit), 0));
    if (report?.summary) {
      if (!equalMoney(report.summary.netIncome, netIncome)) add(reportKey, "Reported Net Income does not match Income account movements");
      if (!equalMoney(report.summary.netExpense, netExpense)) add(reportKey, "Reported Net Expense does not match Expense account movements");
      if (!equalMoney(report.summary.netProfit, netIncome - netExpense)) add(reportKey, "Net Profit does not equal Net Income - Net Expense");
      if (!equalMoney(amount(report.summary.expenseDebits) - amount(report.summary.expenseCredits), report.summary.netExpense))
        add(reportKey, "Expense Debits - Expense Credits does not equal Net Expense");
    }
  }

  if (reportKey === "tds-summary") {
    (report?.rows || []).forEach((row: any, index: number) => {
      if (amount(row.tdsamount) < 0) add(`${reportKey}.row[${index}]`, "TDS amount is negative");
      if (row.documenttype === "deposit") {
        const expectedTotal = amount(row.tdsamount) + amount(row.interestamount) + amount(row.feeamount) + amount(row.penaltyamount);
        if (!equalMoney(expectedTotal, row.totalamount))
          add(`${reportKey}.row[${index}]`, "Deposit tax + interest + fee + penalty does not equal total");
      } else if (row.totalsettledamount != null && !equalMoney(amount(row.allocationamount) + amount(row.tdsamount), row.totalsettledamount)) {
        add(`${reportKey}.row[${index}]`, "Allocation + TDS does not equal Total Settled Amount");
      }
      if (row.documenttype === "purchase_bill" && !String(row.sectioncode || "").trim())
        add(`${reportKey}.row[${index}]`, "TDS deducted by us is missing its section code");
    });
    const summary = report?.summary || {};
    if (summary.tdsAmount != null && !equalMoney(amount(summary.deductedByCustomers) + amount(summary.deductedByUs), summary.tdsAmount))
      add(`${reportKey}.summary`, "Deducted by Customers + Deducted by Us does not equal Total TDS");
  }
  return issues;
};

export const auditFinanceDashboard = (summary: any, insights: any): FinanceAuditIssue[] => {
  const issues: FinanceAuditIssue[] = [];
  const metrics = summary?.metrics || {};
  if (!equalMoney(metrics.postedIncome - metrics.postedExpense, metrics.netProfit))
    issues.push({ scope: "dashboard", message: "Posted Income - Posted Expense does not equal Net Profit/Loss" });
  if (!equalMoney(metrics.inventoryPurchases + metrics.operatingExpense, metrics.expense))
    issues.push({ scope: "dashboard", message: "Inventory Purchases + Operating Expense does not equal Bills excluding GST" });
  if (!equalMoney(amount(insights?.gst?.outward?.total) - amount(insights?.gst?.inward?.total), insights?.gst?.net))
    issues.push({ scope: "dashboard", message: "Output GST - Input GST does not equal Net GST" });
  const ageingTotal = (buckets: any) => amount(Object.values(buckets || {}).reduce(
    (sum: number, value: any) => sum + amount(value), 0
  ));
  if (insights?.receivablesAgeing && !equalMoney(metrics.receivables, ageingTotal(insights.receivablesAgeing)))
    issues.push({ scope: "dashboard.receivables", message: "Total Receivables does not equal Receivables Ageing" });
  if (insights?.payablesAgeing && !equalMoney(metrics.payables, ageingTotal(insights.payablesAgeing)))
    issues.push({ scope: "dashboard.payables", message: "Total Payables does not equal Payables Ageing" });
  if (metrics.ledgerReceivables != null && !equalMoney(
    amount(metrics.ledgerReceivables) - amount(metrics.receivables), metrics.receivablesLedgerVariance
  )) issues.push({ scope: "dashboard.receivables", message: "AR ledger reconciliation variance is incorrect" });
  else if (metrics.ledgerReceivables != null && !equalMoney(metrics.receivablesLedgerVariance, 0))
    issues.push({ scope: "dashboard.receivables", message: "Invoice receivables do not reconcile with the AR ledger" });
  if (metrics.ledgerPayables != null && !equalMoney(
    amount(metrics.ledgerPayables) - amount(metrics.payables), metrics.payablesLedgerVariance
  )) issues.push({ scope: "dashboard.payables", message: "AP ledger reconciliation variance is incorrect" });
  else if (metrics.ledgerPayables != null && !equalMoney(metrics.payablesLedgerVariance, 0))
    issues.push({ scope: "dashboard.payables", message: "Supplier payables do not reconcile with the AP ledger" });
  if (metrics.tdsPayableAdjustments != null && !equalMoney(
    amount(metrics.openingTdsPayable)
      + amount(metrics.tdsDeductedByUs)
      + amount(metrics.tdsPayableAdjustments)
      - amount(metrics.tdsDepositedByUs),
    metrics.tdsPayable
  )) issues.push({ scope: "dashboard.tds", message: "TDS opening + deductions + adjustments - deposits does not equal TDS payable" });
  return issues;
};
