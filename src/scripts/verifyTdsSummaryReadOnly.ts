import { financeDashboardReportsService } from "../services/financeDashboardReports.service.js";
import { auditFinanceReport } from "../utils/finance/financeReportAudit.utils.js";
import { toMoney } from "../utils/finance/finance.utils.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const from = process.argv[2] || `${new Date().getFullYear()}-04-01`;
const to = process.argv[3] || new Date().toISOString().slice(0, 10);
const organizationId = Number(process.argv[4] || 1);
if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) throw new Error("Usage: npm run verify:tds-summary -- YYYY-MM-DD YYYY-MM-DD ORGANIZATION_ID");
if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error("ORGANIZATION_ID must be a positive integer.");

const request = (direction = ""): any => ({
  session: { organizationid: organizationId, role: "admin", useremail: "tds-read-only-audit" },
  params: { reportKey: "tds-summary" },
  query: { from, to, direction, page: 1, count: 10_000, export: "true" },
});
const [deductions, deposits]: any[] = await Promise.all([
  financeDashboardReportsService.getReport(request()),
  financeDashboardReportsService.getReport(request("deposit")),
]);
const issues = [...auditFinanceReport("tds-summary", deductions), ...auditFinanceReport("tds-summary", deposits)];
const sum = (rows: any[], predicate: (row: any) => boolean) => toMoney(rows.filter(predicate).reduce((total, row) => total + Number(row.tdsamount || 0), 0));
const customer = sum(deductions.rows || [], row => row.documenttype === "sales_invoice");
const company = sum(deductions.rows || [], row => row.documenttype === "purchase_bill");
const deposited = toMoney((deposits.rows || []).filter(row => ["paid", "reconciled"].includes(String(row.status).toLowerCase())).reduce((total, row) => total + Number(row.tdsamount || 0), 0));
const check = (scope: string, actual: number, expected: unknown) => {
  if (Math.abs(Math.round(actual * 100) - Math.round(Number(expected || 0) * 100)) > 1) issues.push({ scope, message: `${actual.toFixed(2)} does not match summary ${Number(expected || 0).toFixed(2)}` });
};
check("tds-summary.customer", customer, deductions.summary?.deductedByCustomers);
check("tds-summary.company", company, deductions.summary?.deductedByUs);
check("tds-summary.total", toMoney(customer + company), deductions.summary?.tdsAmount);
check("tds-summary.deposited", deposited, deductions.summary?.depositedByUs);

console.log(`[TDS Read-Only Audit] Organization ${organizationId}; ${from} to ${to}`);
console.log(`[TDS Read-Only Audit] Deductions ${deductions.rows?.length || 0}; Deposits ${deposits.rows?.length || 0}`);
console.log(`[TDS Read-Only Audit] Customers ${customer.toFixed(2)} + Company ${company.toFixed(2)} = Total ${toMoney(customer + company).toFixed(2)}`);
console.log(`[TDS Read-Only Audit] Deposited tax ${deposited.toFixed(2)} (interest/fee/penalty excluded)`);
if (issues.length) {
  issues.forEach(issue => console.error(`[TDS Read-Only Audit] FAIL ${issue.scope}: ${issue.message}`));
  process.exitCode = 1;
} else console.log("[TDS Read-Only Audit] PASS: deductions, deposits, sections and summaries reconcile.");
