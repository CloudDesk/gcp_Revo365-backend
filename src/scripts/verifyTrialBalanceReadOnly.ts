import { financeDashboardReportsService } from "../services/financeDashboardReports.service.js";
import { auditFinanceReport } from "../utils/finance/financeReportAudit.utils.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const from = process.argv[2] || `${new Date().getFullYear()}-04-01`;
const to = process.argv[3] || new Date().toISOString().slice(0, 10);
const organizationId = Number(process.argv[4] || 1);

if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
  throw new Error("Usage: npm run verify:trial-balance -- YYYY-MM-DD YYYY-MM-DD ORGANIZATION_ID");
}
if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
  throw new Error("ORGANIZATION_ID must be a positive integer.");
}

const request: any = {
  session: { organizationid: organizationId, role: "admin", useremail: "trial-balance-read-only-audit" },
  params: { reportKey: "trial-balance" },
  query: { from, to },
};

const report: any = await financeDashboardReportsService.getReport(request);
const issues = auditFinanceReport("trial-balance", report);
const totals = report.totals || {};
const money = (value: unknown) => Number(value || 0).toFixed(2);

const abnormalBalances = (report.rows || []).filter((row: any) => {
  if (row.accountType === "asset") return Number(row.closingCredit || 0) > 0;
  if (["liability", "equity"].includes(row.accountType)) return Number(row.closingDebit || 0) > 0;
  if (row.accountType === "income") return Number(row.periodDebit || 0) > Number(row.periodCredit || 0);
  if (row.accountType === "expense") return Number(row.periodCredit || 0) > Number(row.periodDebit || 0);
  return false;
});

console.log(`[Trial Balance Read-Only Audit] Organization: ${organizationId}`);
console.log(`[Trial Balance Read-Only Audit] Period: ${from} to ${to}`);
console.log(`[Trial Balance Read-Only Audit] Accounts checked: ${(report.rows || []).length}`);
console.log(`[Trial Balance Read-Only Audit] Opening Dr ${money(totals.openingDebit)} | Opening Cr ${money(totals.openingCredit)}`);
console.log(`[Trial Balance Read-Only Audit] Period Dr ${money(totals.periodDebit)} | Period Cr ${money(totals.periodCredit)}`);
console.log(`[Trial Balance Read-Only Audit] Closing Dr ${money(totals.closingDebit)} | Closing Cr ${money(totals.closingCredit)}`);
console.log(`[Trial Balance Read-Only Audit] Variance ${money(report.variance)}`);

if (abnormalBalances.length) {
  console.warn(`[Trial Balance Read-Only Audit] ${abnormalBalances.length} abnormal-side balance(s) require accounting review:`);
  abnormalBalances.forEach((row: any) => console.warn(
    `  ${row.accountCode} ${row.accountName} (${row.accountType}) Closing Dr ${money(row.closingDebit)} / Closing Cr ${money(row.closingCredit)}`
  ));
}

if (issues.length) {
  issues.forEach((issue) => console.error(`[Trial Balance Read-Only Audit] FAIL ${issue.scope}: ${issue.message}`));
  process.exitCode = 1;
} else {
  console.log("[Trial Balance Read-Only Audit] PASS: period and closing debits equal credits; variance is zero.");
}
