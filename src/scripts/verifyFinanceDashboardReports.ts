import { financeDashboardReportsService } from "../services/financeDashboardReports.service.js";
import { auditFinanceDashboard, auditFinanceReport } from "../utils/finance/financeReportAudit.utils.js";
import pool from "../database/postgres.js";

const from = process.argv[2] || `${new Date().getFullYear()}-04-01`;
const to = process.argv[3] || new Date().toISOString().slice(0, 10);
const organizationId = Number(process.argv[4] || 1);
const request = (params: any = {}, query: any = {}) => ({ session: { organizationid: organizationId, role: "admin", useremail: "finance-audit" }, params, query: { from, to, ...query } });

const verify = async () => {
  const summary = await financeDashboardReportsService.getDashboardSummary(request());
  const insights = await financeDashboardReportsService.getDashboardInsights(request());
  const issues = auditFinanceDashboard(summary, insights);
  const keys = ["sales-invoices", "supplier-bills", "gst-inward", "gst-outward", "profit-loss", "balance-sheet", "trial-balance", "tds-summary"];
  for (const reportKey of keys) {
    const report = await financeDashboardReportsService.getReport(request({ reportKey }, { page: 1, count: 10000, export: "true" }));
    const reportIssues = auditFinanceReport(reportKey, report);
    issues.push(...reportIssues);
    console.log(`[Finance Audit] ${reportKey}: ${reportIssues.length ? `${reportIssues.length} issue(s)` : "PASS"}`);
  }
  if (issues.length) {
    const metrics: any = summary?.metrics || {};
    console.error(
      `[Finance Audit] Reconciliation metrics: ${JSON.stringify({
        receivables: metrics.receivables,
        ledgerReceivables: metrics.ledgerReceivables,
        receivablesLedgerVariance: metrics.receivablesLedgerVariance,
        payables: metrics.payables,
        ledgerPayables: metrics.ledgerPayables,
        payablesLedgerVariance: metrics.payablesLedgerVariance,
      })}`
    );
    issues.forEach((issue) => console.error(`[Finance Audit] ${issue.scope}: ${issue.message}`));
    process.exitCode = 1;
  } else {
    console.log(`[Finance Audit] Dashboard + all reports PASS for ${from} to ${to}, organization ${organizationId}.`);
  }
};

verify()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
