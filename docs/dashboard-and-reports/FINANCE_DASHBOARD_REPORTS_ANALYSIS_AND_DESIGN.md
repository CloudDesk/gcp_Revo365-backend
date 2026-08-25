# Finance Dashboard and Reports — Analysis and Component Design

## 1. Objective

Design the next finance phase for Revo365 after Chart of Accounts, Cash/Bank Accounts, On Account, and Journals:

- Finance dashboard with Total Receivables, Total Payables, Income, and Expense.
- Sales Invoice report.
- Supplier Bill report, including a new Bill Type (`Inventory` or `Expense`).
- Inward GST summary from supplier bills.
- Outward GST summary from sales invoices.
- Profit and Loss Account.
- Balance Sheet.
- Trial Balance.
- TDS summary and transaction details.
- Shared filters and Excel download.

This document is the implementation specification, UI/component design, agreed-scope record, and implementation-status reference. The final agreed scope and deployment evidence are recorded in section 31.

> **Agreed scope note:** Challan-to-deduction allocation, partial-deposit compliance tracking, 26AS/AIS reconciliation, TDS certificate/PAN/TAN workflows, location accounting dimensions, and comparison-period reporting are explicitly outside this Dashboard/Reports deliverable. They are not completion blockers.

## 2. Existing Codebase Analysis

### 2.1 Accounting foundation already available

The backend already contains the correct base for ledger-driven reports:

- `finance_accounts` with categories `asset`, `liability`, `equity`, `income`, and `expense`.
- `finance_account_types` with subtypes such as cash, bank, stock, income, expense, cost of goods sold, and other expense.
- System ledgers including `SYS-AR`, `SYS-AP`, customer advances, supplier advances, TDS receivable/payable, and opening balance equity.
- `journal_entries` supporting draft, posted, reversed, source links, posting, and reversal.
- `journal_lines` with account, party, debit, credit, and line ordering.
- Cash/bank transaction posting and customer/supplier allocation flows.
- Customer and supplier statements and on-account application flows.
- Existing GST normalization helpers for invoices and bills.
- Existing React pages for Chart of Accounts, Journals, On Account, Invoices, Purchase Order Bills, and the current sales/operations dashboard.

### 2.2 Current source documents

| Business object | Current source | Important existing fields |
|---|---|---|
| Sales invoices | `revoinvoice` | invoice date/type, total/tax snapshots, payment status, paid and balance amounts |
| Supplier bills | `poinvoice` | `subtotal`, `discount`, `sgst`, `cgst`, `payabletaxamount`, `invoiceamount`, `balanceamount`, status, supplier/PO link |
| Sales/orders | order/order-line data | order status and order amount/tax modes vary by workflow |
| Accounting | `journal_entries` + `journal_lines` | posted/reversed state, account, debit, credit, party and source |

The bill service currently calculates:

```text
taxable value = subtotal - discount
GST = taxable value × (SGST rate + CGST rate)
bill total = taxable value + GST
```

The existing GST utility already handles legacy invoice JSON snapshots and splits invoice/bill GST into IGST, CGST, and SGST. It should be reused and progressively replaced by normalized stored tax columns for new documents.

### 2.3 Gaps that block reliable financial statements

1. Not every invoice, bill, order, or adjustment is guaranteed to create a posted journal entry.
2. Supplier bills currently have no explicit `billtype` distinguishing inventory purchases from operating expenses.
3. Expense bills need a selected expense ledger. A document cannot be posted correctly from only a label such as Laptop or Mobile.
4. Existing invoice tax values live partly in JSON snapshots and use several legacy formats.
5. Reports do not yet share one accounting period/filter contract.
6. Existing dashboard revenue charts are operational dashboards, not ledger-based financial reports.
7. Opening balances, stock/COGS rules, credit notes, debit notes, cancellations, and returns must have defined journal behavior before Balance Sheet and P&L are authoritative.

## 3. Core Accounting Decision

Keep two concepts separate in both API names and UI labels:

### 3.1 Operational dashboard values

These follow the requested business definitions:

- **Income (Net Sales):** eligible orders/invoices in the selected period excluding GST.
- **Expense (Bills):** eligible supplier bills in the selected period excluding GST.
- **Receivables:** outstanding customer invoice principal including GST, less applied receipts/credits.
- **Payables:** outstanding supplier bill principal including GST, less applied payments/credits.

These are management metrics and may be sourced from business documents.

### 3.2 Accounting reports

P&L, Balance Sheet, and Trial Balance must use only `posted` journal entries and must exclude reversed entries. They must never sum raw orders/invoices/bills directly. Otherwise the reports will double count once automatic journal posting exists.

Recommended UI wording:

- Dashboard card: **Net Sales (excl. GST)**, not simply Income.
- Dashboard card: **Bill Expense (excl. GST)**, not simply Expense.
- Report: **Profit & Loss**, strictly ledger-based.

## 4. Metric Definitions

All calculations are organization-scoped. Dates use the organization timezone; API dates use ISO `YYYY-MM-DD`.

### 4.1 Total Receivables

**As-of metric**, not a period-only sales total.

```text
Total Receivables = sum(customer invoice balance amount as of toDate)
                  - unapplied customer credits that reduce AR
```

Rules:

- Include posted/issued invoices dated on or before `toDate`.
- Exclude draft, void, and cancelled invoices.
- Include partially paid and overdue invoices.
- Payments after `toDate` must not reduce a historical as-of balance.
- Prefer the posted `SYS-AR` ledger balance when all document posting is complete.
- Card click opens an Accounts Receivable ageing/drill-down view.

### 4.2 Total Payables

**As-of metric**:

```text
Total Payables = sum(supplier bill balance amount as of toDate)
               - unapplied supplier credits that reduce AP
```

Rules mirror Receivables and use `SYS-AP` after journal coverage is complete.

### 4.3 Net Sales excluding GST

Use invoices as the authoritative source when an invoice exists. Orders should be used only for uninvoiced sales if the business explicitly wants an order-book metric.

Recommended default:

```text
Net Sales = sum(invoice taxable value)
          - sum(credit note/return taxable value)
```

If the product requirement remains “all orders without GST”:

```text
Order Net Sales = sum(eligible order line taxable values)
                - cancelled lines
                - returned/refunded taxable values
```

Do not subtract GST from a GST-inclusive total using a hard-coded rate. Resolve taxable value per line/document because rates can differ.

### 4.4 Bill Expense excluding GST

```text
Bill Expense = sum(subtotal - discount)
             - supplier credit/debit adjustments that reduce expense
```

- Exclude cancelled/draft bills.
- For `billtype = inventory`, this is Purchases, not necessarily current-period Expense.
- For `billtype = expense`, post directly to the selected expense account.
- Dashboard may show all bills as requested, but should split Inventory Purchases and Operating Expenses in the detail/tooltip.

### 4.5 Income vs Expense chart

- Monthly or weekly comparison based on selected range.
- Two series: Net Sales excluding GST and Bills excluding GST.
- Tooltip includes gross value, GST, taxable value, document count, and comparison with the previous equivalent period.

### 4.6 TDS metrics

TDS must be presented as two separate flows:

1. **TDS deducted by customers from the company** — tax deducted from customer payments against our invoices. This is an asset/claim recorded in `SYS-TDS-RECEIVABLE` until reconciled with Form 26AS/AIS or utilized in the income-tax return.
2. **TDS deducted by the company from suppliers/other payees** — tax withheld from payments made by us. This is a liability recorded in `SYS-TDS-PAYABLE` until deposited with the government.

Dashboard formulas:

```text
Customer-deducted TDS = TDS deducted by customers in selected period
TDS deducted by us    = TDS withheld from supplier/payee payments in period
TDS deposited by us   = valid TDS government deposits in period

TDS payable as of date = opening payable + deducted by us
                        - deposited - valid reversals

TDS receivable as of date = opening receivable + deducted by customers
                           - utilized/written off - valid reversals
```

“TDS paid” is ambiguous and must not be used as one value. Use the explicit labels **Deducted by Customers**, **Deducted by Us**, **Deposited by Us**, **TDS Payable**, and **TDS Receivable**.

## 5. Supplier Bill Type Design

Add these normalized fields to `poinvoice`:

| Field | Type | Rule |
|---|---|---|
| `billtype` | varchar/enum | `inventory` or `expense`; required |
| `expensecategory` | varchar/enum | initially `laptop` or `mobile`; required for Expense bills |
| `expenseaccountid` | bigint FK | active expense/other-expense/COGS account; required for Expense bills |
| `inventoryaccountid` | bigint FK | stock/current asset ledger; required/defaulted for Inventory bills |
| `placeofsupply` | varchar | needed for GST classification |
| `suppliergstin` | varchar | snapshot for report reproducibility |
| `igst` | numeric | add because the current PO bill flow primarily stores CGST/SGST |
| `taxableamount` | numeric | persisted normalized `subtotal - discount` |

Initial Expense category picklist values are only:

- Laptop
- Mobile

`expensecategory` is an operational classification; `expenseaccountid` is the accounting classification. Both are needed.

### Bill form behavior

1. Bill Type appears before product/expense details.
2. Inventory shows the existing PO and product allocation flow.
3. Expense hides inventory product allocation and shows Expense Category, Expense Account, description, taxable value, GST, and attachments.
4. Changing Bill Type after transactions or journal posting is not allowed; reverse/cancel and recreate instead.
5. GST totals are always server-calculated and the UI only previews them.

### Posting templates

Inventory bill:

```text
Dr Inventory / Stock Asset     taxable value
Dr Input CGST                  CGST
Dr Input SGST                  SGST
Dr Input IGST                  IGST
    Cr Accounts Payable                    gross bill value
```

Expense bill:

```text
Dr Selected Expense Account    taxable value
Dr Input CGST                  CGST
Dr Input SGST                  SGST
Dr Input IGST                  IGST
    Cr Accounts Payable                    gross bill value
```

Sales invoice:

```text
Dr Accounts Receivable         gross invoice value
    Cr Selected Sales Income               taxable value
    Cr Output CGST                         CGST
    Cr Output SGST                         SGST
    Cr Output IGST                         IGST
```

## 6. Dashboard Page Design

Do not overload the existing operations dashboard. Add a dedicated route such as `/finance/dashboard`, while preserving the current sales/stock/ticket dashboard.

### Desktop layout

```text
Finance Dashboard                       [Period ▼] [Location ▼] [Refresh]
As of 20 Aug 2026                                      Last updated 10:42

[Receivables] [Payables] [Net Sales excl. GST] [Bills excl. GST]
[amount      ] [amount ] [amount + trend       ] [amount + trend   ]

[ Income vs Expense trend (8 columns) ] [ GST position (4 columns) ]

[Receivables ageing] [Payables ageing] [Cash & Bank]

[TDS deducted by customers] [TDS deducted by us] [TDS deposited] [TDS payable]

[Recent financial activity / exceptions and links]
```

### Mobile layout

- Sticky compact period filter.
- Cards in a two-column grid; one column below 360 px.
- Charts become horizontally scrollable or switch to summarized bars.
- Ageing widgets use stacked bars plus a “View details” link instead of wide tables.
- Tables use responsive row cards with primary amount and status visible first.

### Dashboard component hierarchy

```text
FinanceDashboardPage
├── FinancePageHeader
├── FinanceFilterBar
│   ├── DatePresetSelect
│   ├── DateRangePicker
│   ├── LocationSelect
│   └── AppliedFilterChips
├── FinanceKpiGrid
│   ├── ReceivablesKpiCard
│   ├── PayablesKpiCard
│   ├── NetSalesKpiCard
│   └── BillExpenseKpiCard
├── IncomeExpenseTrendCard
├── GstPositionCard
├── AgeingSummaryCard (receivable)
├── AgeingSummaryCard (payable)
├── CashBankSummaryCard
├── TdsSummaryCard
└── FinanceExceptionsCard
```

### KPI card contract

Every card should accept:

```ts
type FinanceKpi = {
  title: string;
  value: number;
  currency: "INR";
  periodLabel: string;
  comparisonValue?: number;
  comparisonPercent?: number | null;
  direction?: "up" | "down" | "flat";
  intent: "neutral" | "positive" | "warning" | "negative";
  tooltip: string;
  drilldownUrl: string;
};
```

Use semantic meaning, not decorative colors: overdue exposure is warning/negative; higher sales can be positive; higher expenses are neutral until compared with budget or sales.

### Recommended secondary widgets

- Receivables ageing: Current, 1–30, 31–60, 61–90, 90+ days.
- Payables ageing: same buckets.
- GST position: Output GST, Input GST, Net Payable/Input Credit.
- TDS position: deducted by customers, deducted by us, deposited by us, payable, and receivable.
- Cash & Bank: total ledger balance and top accounts.
- Exceptions: unposted invoices/bills, unbalanced drafts, missing ledger mapping, negative/invalid tax values.

## 7. Reports Workspace Design

Add one Finance Reports workspace route such as `/finance/reports`.

### Report navigation

Use a left report menu on desktop and a report selector on mobile:

1. Sales Invoices
2. Supplier Bills
3. Inward GST Summary
4. Outward GST Summary
5. Profit & Loss
6. Balance Sheet
7. Trial Balance
8. TDS Summary

### Shared report shell

```text
Reports / Profit & Loss                   [Download Excel ▼]
[This FY ▼] [01 Apr 2026] [20 Aug 2026] [Location ▼] [More filters] [Apply]
Applied: Head Office ×  Posted only ×                              [Clear]

[report-specific summary cards]
[report table / statement]
[pagination where applicable]
```

### Component hierarchy

```text
FinanceReportsPage
├── ReportNavigation
└── ReportWorkspace
    ├── ReportHeader
    ├── ReportFilterBar
    ├── ReportSummaryStrip
    ├── ReportStateBoundary
    │   ├── ReportSkeleton
    │   ├── ReportErrorState
    │   ├── ReportEmptyState
    │   └── ActiveReport
    └── ReportExportMenu
```

Report-specific components:

```text
SalesInvoiceReport
SupplierBillReport
InwardGstReport
OutwardGstReport
ProfitLossStatement
BalanceSheetStatement
TrialBalanceTable
TdsSummaryReport
```

Shared primitives:

```text
MoneyCell
AccountingMoneyCell
ReportGroupRow
ReportSubtotalRow
ReportGrandTotalRow
ExpandableAccountRow
DocumentStatusBadge
GstBreakdownCells
ReportPagination
```

`AccountingMoneyCell` should display credits/negative amounts consistently, use tabular numerals, right alignment, and show zero as `—`.

## 8. Report Specifications

### 8.1 Sales Invoice report

Summary: invoice count, taxable value, CGST, SGST, IGST, total tax, gross invoice value, received, outstanding.

Columns:

- Invoice date and number
- Customer and GSTIN
- Invoice type/source
- Place of supply
- Taxable value
- CGST, SGST, IGST
- Gross total
- Received and balance
- Payment status

Drill-down opens the existing invoice detail.

### 8.2 Supplier Bill report

Summary: bill count, taxable value, input GST, gross bill value, paid, outstanding; split by Inventory and Expense.

Columns:

- Bill date and bill number
- Supplier and GSTIN
- Bill Type
- Expense Category (Laptop/Mobile) or PO number
- Ledger account
- Taxable value
- CGST, SGST, IGST
- Gross total
- Paid and balance
- Status and due date

### 8.3 Inward GST summary

Source: eligible supplier bills. This is Input GST from purchases/expenses.

Group options:

- GST rate
- Supplier
- Month
- Bill Type
- Place of supply

Summary values: taxable value, Input CGST, Input SGST, Input IGST, total Input GST, gross bill value.

### 8.4 Outward GST summary

Source: eligible sales invoices. This is Output GST on sales.

Group options:

- GST rate
- Customer
- Month
- Invoice type
- Place of supply

Summary values: taxable value, Output CGST, Output SGST, Output IGST, total Output GST, gross invoice value.

Both GST reports must handle credit/debit notes as signed adjustments and must clearly show whether cancelled documents are excluded.

### 8.5 Profit & Loss Account

Period report from posted journal lines:

```text
Income             = credits - debits for income accounts
Expenses           = debits - credits for expense accounts
Gross Profit       = Sales - Cost of Goods Sold
Operating Profit   = Gross Profit + Other Income - Operating Expenses
Net Profit/Loss    = total Income - total Expenses
```

Design:

- Collapsible groups: Income, Cost of Goods Sold, Operating Expenses, Other Income, Other Expenses.
- Account rows link to a ledger drill-down filtered to the same period.
- Current period and optional comparison-period columns.
- Show gross profit, operating profit, and net profit as strong subtotal rows.

### 8.6 Balance Sheet

As-of report from all posted journal lines up to `toDate`:

```text
Assets      = debit - credit
Liabilities = credit - debit
Equity      = credit - debit
```

Current-period retained earnings must include the calculated P&L through the as-of date unless closing entries already transfer it to equity.

Required validation displayed in the response and UI:

```text
Assets = Liabilities + Equity
variance = Assets - (Liabilities + Equity)
```

If variance is not zero within ₹0.01, show a red “Out of balance” banner and do not label the report final.

### 8.7 Trial Balance

For each active or used finance account:

```text
opening debit/credit = posted activity before fromDate
period debit/credit  = posted activity within date range
closing balance      = opening + period movement
```

Columns:

- Account code
- Account name
- Account type
- Opening Debit
- Opening Credit
- Period Debit
- Period Credit
- Closing Debit
- Closing Credit

Footer validations:

- Total period debits = total period credits.
- Total closing debits = total closing credits.
- Display variance even when zero.

### 8.8 TDS Summary and Details

The TDS report has three tabs so the company can see how much TDS others deducted and how much the company deducted and deposited.

#### Tab A — TDS Deducted by Customers

Summary cards: deducted in period, TDS Receivable as of `toDate`, reconciled with Form 26AS/AIS, and pending reconciliation.

Columns:

- Deduction/payment date, customer, and authorized PAN/TAN details.
- Invoice number/date and gross amount.
- TDS section, rate, base amount, and amount deducted.
- Customer receipt/reference.
- Form 16A certificate status.
- Form 26AS/AIS reconciliation status, matched amount, and date.
- TDS Receivable ledger impact.

#### Tab B — TDS Deducted by Us

Summary cards: deducted in period, deposited in period, TDS Payable as of `toDate`, and overdue deposit amount.

Columns:

- Deduction/payment date, supplier/payee, and authorized PAN details.
- Bill/reference number and gross amount.
- TDS section, rate, base amount, and amount deducted.
- Net amount paid to the supplier.
- Government deposit due date.
- Status: Pending, Partially Deposited, Deposited, Overdue, or Reversed.
- Challan reference/date and allocated deposit amount.
- Return quarter and certificate status.

#### Tab C — TDS Deposits

Columns:

- Deposit/challan date and supported challan reference fields.
- Financial year, quarter, and TDS section/category.
- Tax, interest, fee, penalty, and total deposited.
- Bank/cash account.
- Linked deduction count/total and unallocated deposit amount.
- Filing and reconciliation status.

TDS filters: financial year/date range, direction, party, TDS section, status, permitted PAN/TAN search, certificate status, 26AS/AIS reconciliation, deposit due status, quarter, and location when supported by the accounting dimension.

Posting when a customer deducts TDS:

```text
Dr Bank/Cash                    net amount received
Dr TDS Receivable              TDS deducted by customer
    Cr Accounts Receivable                 gross amount settled
```

Posting when the company deducts TDS from a supplier payment:

```text
Dr Accounts Payable            gross amount settled
    Cr Bank/Cash                           net amount paid
    Cr TDS Payable                         TDS deducted by us
```

Posting when TDS is deposited with the government:

```text
Dr TDS Payable                 tax deposited
Dr Interest/Penalty Expense    interest/fee/penalty, if any
    Cr Bank                                total amount paid
```

TDS records and journals must have immutable source links. Correct posted amounts through reversal and reposting, never direct editing.

Recommended normalized entities:

```text
tds_deductions
- organizationid, direction (customer_deducted/company_deducted)
- partytype, partyid, documenttype, documentid, paymentreference
- deductiondate, financialyear, quarter
- sectioncode, rate, baseamount, tdsamount
- duedate, status, financeaccountid, journalentryid
- certificate/reference and reconciliation status

tds_deposits
- organizationid, depositdate, financialyear, quarter
- challan/reference fields, sectioncode
- taxamount, interestamount, feeamount, penaltyamount, totalamount
- bankcashaccountid, journalentryid, status

tds_deposit_allocations
- depositid, deductionid, allocatedamount, status
```

Use allocation rows because one challan may cover many deductions and one deduction may be covered by a partial deposit. PAN/TAN and certificate data require field-level permission and appropriate protection at rest.

## 9. Shared Filter Design

### Always visible

- Date preset: Today, This Month, Previous Month, This Quarter, This Financial Year, Previous Financial Year, Custom.
- From and To date for period reports.
- As-of date only for Balance Sheet and dashboard receivable/payable cards.
- Location/branch when user permission allows multiple locations.
- Apply and Reset.

### Advanced filters

- Search.
- Status.
- Customer/Supplier.
- Document type/source.
- Bill Type.
- Expense Category.
- Account and account type.
- GST type: IGST or CGST+SGST.
- Include zero-balance accounts.
- Comparison period for P&L.

Filters must be URL query parameters so views are refreshable, shareable, and preserved when drilling down. Do not fetch on every keystroke; apply explicitly or debounce search.

## 11. Excel Export Design

Generate Excel on the backend so exports are complete and do not depend on the current UI page.

Each workbook should contain:

- `Report` sheet with title, organization, period/as-of date, applied filters, generated time, data rows, subtotals, and totals.
- `Summary` sheet for GST and document reports.
- Optional `Details` sheet when the main report is grouped.

Formatting:

- Real Excel date and numeric cells, not formatted strings.
- INR number format with negatives in parentheses.
- Frozen header row, auto-filter, sensible widths, bold subtotal/total rows.
- Filename example: `TEQIT_Trial_Balance_2026-04-01_to_2026-08-20.xlsx`.
- Export must use exactly the same filter/parser/service as the screen endpoint.
- Add a reasonable maximum synchronous export size; use a queued export only if data exceeds it.

## 12. Backend Structure

Suggested files:

```text
src/services/financeDashboard.service.ts
src/services/financeReports.service.ts
src/services/financeReportExport.service.ts
src/controller/financeDashboard.controller.ts
src/controller/financeReports.controller.ts
src/schemas/financeReports.schema.ts
src/utils/finance/reportFilters.utils.ts
src/utils/finance/reportRows.utils.ts
src/utils/finance/reportExcel.utils.ts
src/routes/financeReports.routes.ts
```

Prefer a small number of report services with shared CTE/query builders over one service per visual component. Keep raw SQL parameterized and organization-scoped.

Recommended indexes:

- `journal_entries (organizationid, status, entrydate, id)`.
- `journal_lines (journalentryid, financeaccountid)` and, if query plans require it, `(financeaccountid, journalentryid)` already exists.
- Invoice date/status/customer indexes used by invoice reports.
- Bill date/status/supplier/billtype indexes used by bill and GST reports.

## 13. Frontend Structure

Suggested files:

```text
src/Pages/V2/FinanceDashboard/index.tsx
src/Pages/V2/FinanceDashboard/components/*
src/Pages/V2/FinanceReports/index.tsx
src/Pages/V2/FinanceReports/reportRegistry.ts
src/Pages/V2/FinanceReports/components/*
src/Pages/V2/FinanceReports/reports/*
src/Pages/V2/FinanceReports/financeReportsApi.ts
src/Pages/V2/FinanceReports/types.ts
src/utility/financeReportFormat.ts
```

Use a `reportRegistry` to define label, permission, date mode, allowed filters, component, and export key for each report. This prevents a large conditional component and makes adding future reports safer.

## 14. Permissions and Audit

Both components are restricted to the **Admin** and **Accountant** roles only:

- Finance Dashboard (`/finance/dashboard`).
- Finance Reports (`/finance/reports` and every nested report/export/drill-down endpoint).

This is a hard product role allowlist, not a configurable grant for other roles. Store Manager, Technician, and all current or future roles must not see or access these two components unless this product requirement is formally changed.

### 14.1 Role access matrix

| Capability | Admin | Accountant | Store Manager | Technician | Any other role |
|---|---:|---:|---:|---:|---:|
| See Finance Dashboard navigation | Yes | Yes | No | No | No |
| Open Finance Dashboard route | Yes | Yes | No | No | No |
| Call Finance Dashboard APIs | Yes | Yes | No | No | No |
| See Finance Reports navigation | Yes | Yes | No | No | No |
| Open reports and drill-downs | Yes | Yes | No | No | No |
| Download report Excel files | Yes | Yes | No | No | No |
| View permitted sensitive TDS details | Yes | Yes | No | No | No |

Role comparison must use the application’s canonical role constants (currently Admin/Accountant, normalized safely for comparison), not display labels typed independently in multiple components.

### 14.2 Frontend enforcement

- Add the Finance Dashboard and Finance Reports sidebar/menu items only when the authenticated role is Admin or Accountant.
- Apply one shared guard such as `FinanceRoleGuard` to both top-level routes and all nested report routes.
- Do not render KPI/report components and then hide them with CSS; unauthorized components must not mount or fetch data.
- A direct unauthorized URL navigation shows the application’s standard `403 — You do not have access` state and provides a safe link back to the user’s permitted dashboard.
- Loading/auth hydration must show a neutral route-loading state; it must not briefly flash finance navigation or amounts before the role is known.
- Client-side checks improve UX but are never treated as security enforcement.

Suggested frontend policy:

```ts
const FINANCE_ALLOWED_ROLES = new Set([ROLES.ADMIN, ROLES.ACCOUNTANT]);
const canAccessFinance = (role: string) => FINANCE_ALLOWED_ROLES.has(role);
```

Use the same helper in sidebar route policy, route configuration, page guards, drill-down links, and export-button visibility.

### 14.3 Backend enforcement

- Every `/finance/dashboard/*`, `/finance/reports/*`, report detail, and export endpoint must run authenticated organization scoping and the Admin/Accountant role guard before its service/query executes.
- Never accept a role supplied through request body, query string, or frontend headers as authority; use the authenticated server context.
- Return HTTP `403` for an authenticated non-Admin/non-Accountant and `401` for an unauthenticated request.
- Do not return aggregate totals, row counts, export job metadata, signed download links, filter options, party lookups, or error details to unauthorized roles.
- Export/download authorization must be rechecked both when generating and when retrieving a file.
- Stale permission records must not override the hard role allowlist.
- Cache keys and cached responses must remain separated by organization and authorized role/access scope.

Suggested backend guard:

```ts
const FINANCE_ALLOWED_ROLES = new Set(["admin", "accountant"]);

if (!FINANCE_ALLOWED_ROLES.has(normalizeRole(authenticatedUser.role))) {
  throw new ForbiddenError("Finance Dashboard and Reports are restricted.");
}
```

Keep dedicated action resources for the two permitted roles instead of inheriting broad dashboard access:

- `finance_dashboard.read`
- `finance_reports.read`
- Future extension: `finance_reports.export`
- Future extension: `finance_reports.view_sensitive`

The current User Permissions editor supports standard CRUD actions only. The first implementation therefore uses `read` for page/API access and fixes `create`, `edit`, and `delete` to false. Export and sensitive-data actions should be introduced when the editor supports custom actions; until then, export inherits Finance Reports read access plus the hard Admin/Accountant role check. Every export should create a finance audit event with user, role, organization, report key, filters, row count, and generated timestamp.

### 14.4 Unauthorized and role-change scenarios

- Store Manager/Technician login: neither Finance menu item is present and no finance request is made.
- Unauthorized direct route: display 403; never redirect to a page that could reveal finance state in its title, breadcrumb, or cached content.
- Unauthorized direct API/export URL: return 403 without report metadata.
- User role changes from Admin/Accountant to another role during a session: invalidate/refresh auth state, remove menu entries, clear finance query caches, cancel in-flight finance requests where possible, and block the next API call.
- User role changes to Admin/Accountant: finance navigation appears only after refreshed authenticated claims/context confirm the role.
- Browser Back after logout/role downgrade: route guard and API guard prevent cached sensitive data from being displayed.
- Shared computer/browser cache: finance responses use appropriate private/no-store caching policy where sensitive data could persist.
- Admin/Accountant without export action permission: reports remain readable but the export action is absent and export APIs return 403.
- Accountant without sensitive-TDS permission: TDS totals remain visible if permitted, while PAN/TAN/certificate-sensitive columns are masked or omitted on screen and in Excel.

### 14.5 Permission acceptance tests

- Test sidebar visibility for Admin, Accountant, Store Manager, Technician, missing role, unknown role, mixed-case legacy role, and expired authentication.
- Test both top-level routes and every nested report route for all roles.
- Test every dashboard/report/filter/lookup/export/download endpoint for 401/403 behavior.
- Verify unauthorized requests execute no report SQL and create no export file/job.
- Verify role downgrade clears already-loaded finance data from client query/state caches.
- Verify Admin and Accountant still receive organization/location-scoped results only.
- Verify permissions cannot be bypassed by changing query parameters, local storage, route state, or request payloads.

### 14.6 Existing User Permissions integration

The two components must be added to the existing `permissions.permissionset` JSONB structure used by User Permissions. Do not create a second permission framework.

Canonical permission objects:

```json
{
  "object": "Finance Dashboard",
  "objectAPI": "finance_dashboard",
  "permissions": {
    "read": true,
    "create": false,
    "edit": false,
    "delete": false
  }
}
```

```json
{
  "object": "Finance Reports",
  "objectAPI": "finance_reports",
  "permissions": {
    "read": true,
    "create": false,
    "edit": false,
    "delete": false
  }
}
```

Permission defaults by role:

| Permission object/action | Admin | Accountant | Every other role |
|---|---:|---:|---:|
| `finance_dashboard.read` | `true` | `true` | `false` |
| `finance_reports.read` | `true` | `true` | `false` |
| Both resources: `create/edit/delete` | `false` | `false` | `false` |

The User Permissions editor may display both permission objects for every role so its data shape remains consistent. For roles outside Admin and Accountant, these actions must remain false/disabled because the hard role allowlist cannot be overridden from the permission editor. For Admin and Accountant, action permissions may be edited only if the existing product policy allows action-level restriction; removing an action may reduce access but never grant it to another role.

Mapping to UI behavior:

| Permission | UI/API behavior |
|---|---|
| `finance_dashboard.read` | Show Finance Dashboard navigation, allow route, and allow dashboard APIs. |
| `finance_reports.read` | Show Finance Reports navigation, allow report routes, lookups, drill-downs, and report APIs. |
| `finance_reports.read` + Admin/Accountant role | Initial export authorization until a custom `export` action is added to the permission editor. |

The effective-access rule is:

```text
effective access = authenticated role is Admin or Accountant
                   AND required permission action is true
```

### 14.7 Permission data migration design

Create an additive, idempotent migration following the existing Journal permission migrations. Recommended file:

```text
src/database/migrations/20260821_finance_dashboard_reports.sql
```

Recommended schema version:

```text
20260821_finance_dashboard_reports_permissions_v1
```

Migration responsibilities:

1. Normalize a null `permissionset` to an empty JSONB array.
2. Create exactly one canonical `finance_dashboard` object.
3. Create exactly one canonical `finance_reports` object.
4. Seed `read` as true only for `LOWER(TRIM(role)) IN ('admin', 'accountant')`; seed false for all other roles and fix `create/edit/delete` to false.
5. Replace duplicate legacy entries with one canonical entry during the first application.
6. Preserve unrelated permission objects and their order.
7. Preserve an intentionally disabled Admin/Accountant action on later reruns after the migration has already been applied; migration reruns must not continually reset user configuration.
8. Force all actions false for non-Admin/non-Accountant roles to satisfy the hard role restriction.
9. Insert an idempotent entry in `finance_schema_versions`.
10. Run safely when roles use legacy capitalization such as `Admin`, `Accountant`, or `Storemanager`.

Important migration behavior:

- The initial migration seeds the canonical defaults.
- The migration runner executes SQL files repeatedly, so the schema-version record or equivalent conditional logic must distinguish first-time seeding from routine reruns.
- Do not use a simple unconditional JSON merge that resets Admin/Accountant choices every deployment.
- Preserve all unrelated permission objects and remove duplicates only for the two owned canonical `objectAPI` values.

### 14.8 Migration verification scenarios

- New database containing Admin, Accountant, Store Manager, Technician, and Vendor roles.
- Existing database where neither object exists.
- Existing database where only one of the two objects exists.
- Existing database with null or empty `permissionset`.
- Existing object missing one of the standard CRUD keys.
- Existing Admin/Accountant action intentionally changed to false after first deployment.
- Existing non-Admin action incorrectly set to true; migration/role guard must make it ineffective and normalize it to false.
- Legacy mixed-case and whitespace-padded role values.
- Repeated migration execution produces no duplicate objects or changed user configuration.
- User Permissions list/edit API returns both canonical objects.
- Frontend permission editor renders their labels and actions using existing controls.
- Admin and Accountant navigation/API behavior matches the stored actions.
- Every other role remains blocked even if frontend state/local storage is manipulated.

## 15. Data Quality and Reconciliation

Before calling reports production-ready, provide an accounting health endpoint/widget:

- Posted journals where total debit differs from total credit.
- Issued invoices without posted journals.
- active supplier bills without posted journals.
- Documents with missing income/expense/inventory/tax mappings.
- Invoice/bill total not equal to taxable value + GST + round-off.
- AR/AP ledger balance compared with document outstanding balance.
- Trial Balance debit/credit variance.
- Balance Sheet equation variance.

Reports should return warnings rather than silently showing apparently final numbers when source coverage is incomplete.

## 16. Testing and Acceptance Criteria

### Calculation tests

- GST-exclusive and GST-inclusive invoices.
- IGST and CGST+SGST.
- Multiple GST rates in one document.
- Full/partial/unpaid customer and supplier documents.
- Payments before and after a historical as-of date.
- Cancelled, returned, credited, and reversed documents.
- Inventory bill versus Expense bill.
- Opening balance and current-period retained earnings.
- Zero-activity and zero-balance accounts.
- Rounding to two decimals and ₹0.01 reconciliation tolerance.

### UI criteria

- Desktop and mobile layouts do not require page-level horizontal scrolling.
- Every KPI has a definition tooltip and drill-down.
- Applied filters are visible and survive refresh.
- Empty, loading, error, stale, and partial-data states are distinct.
- Tables are keyboard accessible and amounts are readable with tabular numerals.
- Excel output totals match the visible report for the same filters.

### Accounting invariants

- Every posted journal balances.
- Reversed journals do not contribute to active balances.
- Trial Balance total debit equals total credit.
- Balance Sheet balances.
- P&L net result reconciles to the income/expense portion of Trial Balance.
- AR/AP ledger totals reconcile to party/document subledgers.

## 17. Recommended Implementation Order

### Phase 1 — Data contracts and posting completeness

1. Add Bill Type, Expense Category, ledger selection, IGST, place of supply, and normalized taxable amount.
2. Add/verify system Input GST, Output GST, Sales Income, Inventory, and COGS accounts.
3. Implement automatic journal posting/reversal for invoices and bills.
4. Add reconciliation/health checks and fix legacy normalization gaps.

### Phase 2 — Shared reporting engine

1. Shared filter validation, organization/location scoping, and date handling.
2. Trial Balance first; it proves the ledger aggregation.
3. P&L and Balance Sheet using the same balance query.
4. Excel engine and permission/audit behavior.

### Phase 3 — Document and GST reports

1. Sales Invoice and Supplier Bill reports.
2. Inward and Outward GST summaries.
3. Drill-downs and Excel details sheets.

### Phase 4 — Finance dashboard

1. KPI summary and trends.
2. Ageing and GST position widgets.
3. Exceptions and reconciliation status.
4. Performance tuning and caching, if measurements require it.

## 18. Final Recommendation

Build the reporting engine from posted journals, and treat document-derived dashboard figures as clearly labeled operational metrics. Start with Trial Balance before P&L and Balance Sheet because it validates the accounting foundation. Add explicit Bill Type plus a real ledger mapping—not only Laptop/Mobile—so expense posting remains correct as categories grow. Keep the new Finance Dashboard separate from the existing operations dashboard, but reuse existing design primitives, permissions, GST helpers, invoice/bill pages, and drill-down routes.

## 19. Filter Matrix by Screen

Filters should be relevant to the selected report. Do not show disabled or meaningless controls.

| Screen | Date behavior | Primary filters | Advanced filters |
|---|---|---|---|
| Finance Dashboard | period for sales/expense; `toDate` as-of for AR/AP | preset, custom dates, location | comparison period, include uninvoiced orders |
| Sales Invoices | invoice date range | location, status, customer | invoice type/source, GST type, payment status, amount range, invoice number |
| Supplier Bills | bill date range | location, status, supplier, Bill Type | Expense Category, PO number, payment status, due status, GST type, ledger, amount range |
| Inward GST | bill/tax period | location, Bill Type, supplier | GST type/rate, place of supply, GSTIN, Expense Category, grouping |
| Outward GST | invoice/tax period | location, invoice type, customer | GST type/rate, place of supply, GSTIN, grouping |
| Profit & Loss | accounting period | location, comparison period | account group, account, show percentage of income, show zero accounts |
| Balance Sheet | single as-of date | location | account group, account, show zero accounts, comparative as-of date |
| Trial Balance | accounting period | location | account type, account, show zero accounts, show opening balances |
| TDS Summary | deduction/deposit period plus `toDate` for balances | direction, TDS section, party, status | PAN/TAN, certificate, 26AS/AIS reconciliation, due status, quarter, location |

### Filter interaction rules

- Changing report resets filters not supported by the destination report, while keeping common date and location filters.
- `Apply` is disabled until dates are valid.
- `from` cannot be after `to`; display the validation beside the date fields.
- Financial Year is configurable and defaults to 1 April–31 March for India.
- Maximum interactive period should be configurable; warn before querying unusually large ranges.
- Search is debounced; select changes wait for `Apply` unless the report is already loaded and the query is inexpensive.
- Applied filter chips show human-readable labels, not IDs.
- Reset restores the report’s default period, normally the current financial year.
- Export uses the last successfully applied filters, not unsubmitted control values.
- Browser Back/Forward restores filters, selected report, expanded groups, sorting, and page when practical.
- Location is forced and hidden when the user has access to only one location.
- Date and time boundaries are computed by the backend using the organization timezone.

## 20. Detailed Visual and Interaction Design

### 20.1 Design language

- Use the existing Revo365 Tailwind/component language for visual consistency.
- Page background: soft neutral; content cards: white with a subtle border and restrained shadow.
- Use an 8 px spacing system and consistent card radius.
- Use one primary accent for actions and selection. Reserve red, amber, and green for financial meaning.
- Use tabular numerals for all monetary values and right-align amounts.
- Always display currency context (`₹` and/or `INR`) and Indian digit grouping.
- Do not communicate positive/negative states by color alone; include an icon and text.

### 20.2 Page header

The header contains title, short context (`FY 2026–27 · Head Office`), last successful refresh, and actions. On desktop, filters sit below the header. On mobile, the primary preset and a Filter button remain visible; the full filter form opens in a bottom sheet.

### 20.3 KPI card anatomy

Each KPI card contains:

1. Clear title and definition tooltip.
2. Main amount, never abbreviated when space permits.
3. Period/as-of label.
4. Previous-period change with direction and absolute/percentage value.
5. Supporting fact such as document count or overdue amount.
6. Entire card is keyboard/click accessible and opens the filtered drill-down.

Card scenarios:

- Normal value: amount and comparison.
- Zero value: show `₹0.00`, not an empty card.
- No comparison data: show `No previous-period data`.
- Partial source coverage: show an amber `Incomplete` badge and explanation.
- Stale data: retain last result with a `Last updated` warning while refresh retries.
- Permission-restricted detail: show aggregate only and disable drill-down with an explanation.

### 20.4 Charts

- Income vs Expense defaults to monthly buckets for ranges over 90 days, weekly for 31–90 days, and daily for 30 days or less.
- Do not use dual axes for comparable currency series.
- Tooltip shows period, taxable amount, GST, gross amount, document count, and prior-period change.
- Legend items can toggle series without altering report totals.
- Provide a compact accessible data-table alternative under an `View data` action.
- Empty charts show a useful empty state, not an empty plotting area.

### 20.5 Report tables and statements

- Sticky header and sticky first identity column on wide tables.
- Sorting is server-side for document reports.
- Financial statements preserve accounting order and do not allow arbitrary sorting that destroys hierarchy.
- Parent groups expand/collapse; expansion is lazy-loaded only if the row count requires it.
- Clicking an account opens General Ledger with the same date/location filters.
- Clicking a document opens the existing Invoice/Bill detail in the same application context.
- Totals remain visible at the bottom; for long tables use a sticky totals bar if it does not obscure content.
- Desktop tables paginate; Excel export always includes all matching rows.

### 20.6 Mobile report behavior

- Document reports become cards: identity/date/status first, total/outstanding second, GST detail inside an expandable section.
- Financial statements retain rows but use horizontal scrolling inside the statement container only.
- Group label and closing amount remain sticky.
- Filters open in a bottom sheet with `Clear` and `Show results` actions.
- Export is in the overflow menu and shows progress after activation.

## 21. Complete Business Scenario Matrix

### 21.1 Sales and income scenarios

| Scenario | Dashboard | GST report | Accounting report |
|---|---|---|---|
| Draft order/invoice | excluded | excluded | excluded |
| Confirmed order not invoiced | included only when `includeUninvoicedOrders=true` | excluded | excluded until posted accounting event |
| Issued unpaid invoice | Net Sales included; full AR | Output GST included | posted income, GST liability, and AR included |
| Partially paid invoice | Net Sales unchanged; remaining AR | Output GST unchanged | receipt reduces AR and increases cash/bank |
| Fully paid invoice | Net Sales included; zero AR | Output GST included | income remains; AR settled |
| Cancelled before posting | excluded | excluded | no journal |
| Cancelled after posting | reversal in cancellation period | signed reversal/credit according to tax rule | reversing journal, never deletion |
| Full/partial return | taxable return reduces Net Sales | signed GST adjustment | sales/AR/tax reversal or credit note journal |
| Credit note | signed negative adjustment | signed negative Output GST | posted credit-note journal |
| Invoice dated before range, paid in range | not period Net Sales; AR as-of reflects payment | not in current tax period unless tax rule says otherwise | P&L unchanged; cash/AR movement in period |
| Multiple GST rates | sum line taxable/tax values | group by rate | aggregated posted accounts |
| GST-inclusive price | derive per-line taxable value | correct tax component | journal uses normalized values |
| Zero-rated/exempt sale | taxable/exempt value tracked separately | zero-rated/exempt columns, zero GST | income is still recognized |
| Inter-state sale | Net Sales unchanged | IGST | Output IGST liability |
| Intra-state sale | Net Sales unchanged | CGST + SGST | separate Output CGST/SGST liabilities |
| Rounding difference | show normalized taxable/GST/round-off | report explicit round-off separately | post to configured Round-off account |

### 21.2 Supplier bill and expense scenarios

| Scenario | Dashboard | GST report | Accounting report |
|---|---|---|---|
| Draft bill | excluded | excluded | excluded |
| Inventory bill | shown under Purchases split | Input GST included when eligible | Inventory asset + Input GST against AP |
| Expense bill: Laptop | shown under Operating Expense/Laptop | Input GST included when eligible | selected Expense ledger + Input GST against AP |
| Expense bill: Mobile | shown under Operating Expense/Mobile | Input GST included when eligible | selected Expense ledger + Input GST against AP |
| Non-creditable GST | GST is not Input Credit | shown separately as ineligible | capitalize or expense tax using configured rule |
| Bill partially paid | expense/purchase unchanged; remaining AP | Input GST unchanged | payment reduces AP |
| Advance to supplier | not bill expense; may reduce payable display separately | no GST until eligible document/event | Supplier Advance asset against cash/bank |
| Supplier credit/debit note | signed adjustment | signed Input GST adjustment | AP, asset/expense, and tax adjustment |
| Bill cancelled after payment | block direct cancellation | adjustment only after approved reversal | reverse allocations/payment as policy permits, then reverse bill |
| Bill without PO | allowed only for Expense type or authorized exception | normal GST validation | selected expense/account mapping required |
| Expense category changed after posting | blocked | unchanged | reverse and recreate/repost |
| Duplicate supplier invoice number | block within supplier/organization | excluded until resolved | no posting |
| Bill in foreign currency | out of initial INR-only scope | out of initial scope | future FX design required |

### 21.3 Receivable and payable as-of scenarios

- Historical as-of balances must reconstruct allocations by transaction date; current `balanceamount` alone is insufficient for past dates.
- A receipt/payment dated after `toDate` must not affect that historical balance.
- Unapplied customer receipts are liabilities/customer advances, not negative receivables unless explicitly netted in a secondary view.
- Supplier advances are assets, not negative payables unless explicitly netted in a secondary view.
- Overpayments appear in advance accounts and must not make invoice/bill outstanding negative.
- Bad-debt write-off reduces AR and posts to a configured bad-debt expense account.
- TDS deducted by customers may settle part of AR while posting TDS Receivable.
- TDS deducted from suppliers may settle part of AP while posting TDS Payable.
- Ageing uses due date when available, otherwise document date plus configured credit terms.
- Age bucket boundary days are inclusive and evaluated in organization timezone.

### 21.4 Journal and ledger scenarios

- Only `posted` journals contribute to reports.
- Draft journals never affect balances.
- A reversed original and its posted reversal must produce a net-zero lifetime effect while preserving both records.
- Back-dated journals alter historical reports and should update cache/version metadata.
- Manual journals to AR/AP should require party information to preserve subledger reconciliation.
- Journals cannot post when debit and credit totals differ beyond ₹0.01.
- Inactive accounts remain visible for historical periods but cannot be selected for new postings.
- Deleted accounting history is never supported; corrections use reversal and reposting.
- Duplicate source posting is prevented using organization, source type, and source ID idempotency.

### 21.5 Financial statement scenarios

- P&L without activity shows the hierarchy and zero/hidden accounts according to the filter.
- Comparative P&L uses equal-length aligned periods and separately labels each period.
- Balance Sheet includes all lifetime movements through the as-of date.
- Current earnings are included in Equity when year-closing entries do not yet exist.
- Prior-year earnings must not be counted twice after closing journals exist.
- Contra-asset and contra-income accounts display in their configured presentation group with inverted sign where appropriate.
- Negative assets/liabilities are shown with parentheses and a warning only when configuration expects a normal positive balance.
- Trial Balance includes accounts with opening balance even when period movement is zero.
- An out-of-balance result is never hidden by rounding; show raw variance to two decimals and a health warning.
- Reports spanning a locked/closed period are viewable, but new back-dated posting follows period-lock policy.

### 21.6 GST scenarios

- IGST and CGST/SGST are mutually exclusive for a document unless a supported special case exists.
- Place of supply and organization/supplier/customer state determine tax mode; manual override requires permission and reason.
- GSTIN validation failure prevents final posting but may allow draft save.
- Registered, unregistered, composition, export, exempt, nil-rated, and zero-rated parties/supplies need explicit classification before statutory GST exports are claimed.
- Reverse-charge bills must separately identify tax payable under RCM and eligible input credit.
- Input GST eligibility must distinguish eligible, blocked/ineligible, and pending documentation.
- GST report period follows document/tax date policy and must not silently use payment date.
- Legacy invoice snapshots with ambiguous tax components are marked `Derived` in detail/export metadata.
- Credit/debit notes link to the original document and retain their own tax date and signed amounts.
- Rounding is reconciled at document level before aggregation.

The first release can support the current normal taxable domestic cases, but unsupported classifications must be explicitly blocked or labeled—not silently treated as ordinary GST.

### 21.7 TDS scenarios

- Customer pays an invoice net of TDS: settle AR by bank receipt plus TDS Receivable, not by bank amount alone.
- Customer deducts TDS partially or at a different permitted rate: store actual section, rate, base, and amount; do not infer only from invoice total.
- Customer certificate/26AS amount differs from the recorded deduction: retain both values, mark the mismatch, and require reconciliation.
- A corrected customer deduction uses reversal and a linked corrected entry.
- Supplier payment with TDS: reduce AP by the gross amount settled, pay the supplier net, and credit TDS Payable.
- Multiple bills settled in one payment: allocate TDS base and amount to every bill while preserving one payment reference.
- One bill paid in installments: preserve deduction and cumulative values per payment according to the configured policy.
- TDS deducted but not deposited remains in TDS Payable and shows its due/overdue status.
- A partial government deposit is allocated to deductions and leaves the remainder payable.
- Only the tax portion of a challan reduces TDS Payable; interest, fee, and penalty post to separate expense accounts.
- An excess or unallocated deposit is shown separately and never silently offsets unrelated liabilities.
- Challan corrections preserve the original deposit and an audit-linked correction.
- Store the TDS section/rate rule snapshot on each deduction so later threshold/rate changes do not rewrite history.
- Missing/invalid PAN can trigger a configured higher-rate rule only when that rule is implemented and authorized.
- Advance payments subject to TDS support deduction without a bill and later application to the bill.
- A credit note/refund after TDS does not automatically reverse TDS without an approved accounting/tax rule.
- Historical as-of values exclude deductions, deposits, utilization, and reconciliation events after `toDate`.
- Location-filtered TDS is available only when deductions and deposits have a reliable location dimension.
- Form 26AS/AIS and statutory return integration are reconciliation statuses in the first release unless import/filing integration is separately implemented.

## 22. UI State and Failure Scenarios

### Initial loading

- Show card/table skeletons matching final dimensions to avoid layout shift.
- Load dashboard summary first; secondary widgets may load independently.
- A failed secondary widget must not replace the entire dashboard with an error page.

### Empty results

- Explain the active period and filters.
- Offer `Clear filters` and, when authorized, shortcuts to create/open relevant documents.
- Zero accounting activity is a valid result and is different from missing source configuration.

### Partial failure

- Keep successful widgets visible.
- Failed widget shows retry and a short error reference.
- Financial statements should not show partial totals; fail the statement atomically.

### Network/offline

- Keep the last successful response visibly marked as stale.
- Disable export when it cannot guarantee server-computed results.
- Retrying must not duplicate export jobs or accounting mutations.

### Validation and configuration errors

- Missing system accounts: show an actionable configuration error to Admin/Accountant.
- Incomplete journal coverage: show `Preliminary` report status with document counts not posted.
- Invalid date/location permission: return a safe validation response without leaking other-location data.
- Excessive result size: ask user to narrow filters for UI, while offering an authorized background export if implemented.

### Concurrency

- Response metadata includes `generatedAt` and a data version/high-water mark.
- If documents change while a paginated report is open, show `Data changed — Refresh` rather than mixing snapshots.
- Export records its own generated timestamp and may legitimately differ from an older on-screen view.

## 23. Drill-down and Navigation Scenarios

| Starting point | Destination | Filters preserved |
|---|---|---|
| Receivables KPI | AR ageing/customer statement | as-of date, location |
| Payables KPI | AP ageing/supplier statement | as-of date, location |
| Net Sales KPI/chart point | Sales Invoice report | date bucket, location, valid statuses |
| Bill Expense KPI/chart point | Supplier Bill report | date bucket, location, Bill Type |
| GST widget | Inward/Outward GST | date, location, GST type |
| P&L account row | General Ledger | account, period, location, posted only |
| Balance Sheet account row | General Ledger | account, through as-of date, location |
| Trial Balance row | General Ledger | account, period, location |
| Document report row | Existing document detail | document ID plus return URL |

Returning from detail restores the report, filters, page, scroll position, and expanded group when possible.

## 24. Excel Export Scenarios

- Export button is disabled until the first successful report response establishes valid applied filters.
- Small exports download synchronously with visible progress.
- Large exports, if queued, show Pending, Processing, Ready, Failed, and Expired states.
- Repeated clicks with the same idempotency key do not create duplicate jobs.
- Empty results may export a workbook containing report metadata and `No matching records`.
- Restricted columns such as sensitive party details are omitted according to permission.
- Excel formula injection is prevented by escaping text beginning with `=`, `+`, `-`, or `@` when it is not intended as a numeric/formula cell.
- Export failure does not clear screen results or filters.
- Workbook totals are server-calculated and validated before delivery.
- The workbook states whether tax values are stored, calculated, or derived from legacy snapshots.

## 25. Accessibility and Localization

- Full keyboard navigation for filters, cards, report navigation, expandable rows, and export menu.
- Visible focus states and logical focus order.
- Cards use buttons/links when interactive, not clickable `div` elements.
- Chart information has text/table equivalents and meaningful accessible labels.
- Status, trend, and reconciliation states use text/icons in addition to color.
- Minimum touch target of 44 × 44 px on mobile.
- Screen readers announce filter result count and report refresh completion using a polite live region.
- Dates display in the organization/user format while APIs retain ISO dates.
- Currency defaults to INR with Indian grouping; architecture retains a currency field for future support.
- Avoid abbreviating amounts to `L`/`Cr` in formal reports or Excel; dashboard may provide abbreviation only with the exact amount in tooltip/accessibility text.

## 26. Performance and Caching Scenarios

- Dashboard summary is one aggregated request; do not issue one request per KPI.
- Trend, ageing, GST, and exceptions can be independently cached and loaded.
- Financial statement cache keys include organization, location scope, dates, filters, permission scope, and accounting data version.
- Posted/reversed/back-dated journals invalidate affected report periods.
- Document reports use server pagination and indexed sorting.
- Export streams rows or uses bounded batches instead of loading an unlimited workbook dataset into application memory.
- Use database `EXPLAIN ANALYZE` before adding materialized views. Begin with correct indexed queries.
- Never cache across organizations or permission scopes.

## 27. Security and Privacy Scenarios

- Organization and allowed location scope come from authenticated context, never trusted query parameters alone.
- Accountants with one-location access cannot infer totals for other locations through KPI, count, export, or error messages.
- Export authorization is checked when generating the file, not only when showing the button.
- Signed/temporary download URLs expire and are not logged with sensitive tokens.
- Search and sorting fields use allowlists; SQL remains parameterized.
- Report definition tooltips contain no sensitive data.
- Audit events record exports and access to sensitive reports without storing unnecessary report contents.

## 28. Production Definition of Done

The feature is ready only when all of the following are true:

- Invoice and bill lifecycle events post or reverse balanced journals idempotently.
- Bill Type and real account mappings exist and are validated.
- Historical AR/AP balances reconstruct correctly as of any supported date.
- Trial Balance, P&L, and Balance Sheet reconcile for seeded and production-like data.
- Dashboard values have visible definitions and drill down to matching detail totals.
- GST totals reconcile to eligible source documents and unsupported cases are identified.
- Every report has relevant filters, URL persistence, loading/empty/error states, mobile behavior, and Excel export.
- Screen and Excel totals match for identical filters and generation version.
- Finance module permissions are tested at API level.
- Finance Dashboard and Finance Reports are visible and accessible only to Admin and Accountant; all other roles are rejected by both route and API guards.
- Reversal, cancellation, partial payment, return, credit note, TDS, advance, and historical as-of scenarios are covered.
- Customer-deducted TDS, company-deducted TDS, government deposits, TDS Receivable and TDS Payable are covered.
- Performance is measured on expected production volumes.
- Admin/Accountant user acceptance testing signs off metric definitions and presentation.

## 29. Original Requirement Coverage Audit

This section maps the original request to the exact design decision in this document. It should be used during estimation, implementation, review, and user acceptance testing.

| Original requirement | Coverage | Primary sections | Verification outcome |
|---|---|---|---|
| Analyze existing Chart of Accounts | Complete | 2, 3, 12, 15 | Existing account categories, types, system accounts, gaps, indexes, and reconciliation are documented. |
| Analyze Accounts/On Account | Complete | 2, 4, 21.3 | Customer/supplier advances, allocations, TDS, AR/AP, and historical as-of behavior are covered. |
| Analyze Journals | Complete | 2, 3, 8, 21.4 | Draft/posted/reversed behavior, report eligibility, balancing, idempotency, and drill-down are covered. |
| Dashboard component design | Complete | 6, 20, 22, 23 | Desktop/mobile layout, hierarchy, KPI contract, charts, widgets, states, and drill-downs are specified. |
| Total Receivables | Complete | 4.1, 6, 21.3 | Formula, as-of behavior, historical payments, advances, ageing, and drill-down are covered. |
| Total Payables | Complete | 4.2, 6, 21.3 | Formula, as-of behavior, historical payments, advances, ageing, and drill-down are covered. |
| Income without GST | Complete with explicit source decision | 3, 4.3, 21.1 | Both invoice-based Net Sales and optional uninvoiced Order Net Sales are defined without GST. |
| Expense/all bills without GST | Complete with accounting warning | 3, 4.4, 5, 21.2 | Taxable bill value is defined; Inventory Purchases are separated from operating Expense for correct P&L treatment. |
| Reports component design | Complete | 7, 8, 13, 20 | Report shell, navigation, hierarchy, shared primitives, responsive behavior, and report-specific components are covered. |
| Admin/Accountant-only access | Complete | 14 | Sidebar visibility, route/API/export guards, role-change cases, sensitive TDS access, audit, and permission tests are specified. |
| Sales Invoices report | Complete | 8.1, 19, 21.1 | Summary, columns, filters, lifecycle cases, and drill-down are specified. |
| Supplier Bills report | Complete | 5, 8.2, 19, 21.2 | Bill type/category, summary, columns, filters, lifecycle cases, and drill-down are specified. |
| Expense Bill Type | Complete | 5, 21.2 | `inventory`/`expense`, ledger mapping, form behavior, posting templates, and edit restrictions are specified. |
| Laptop/Mobile only for Expense bills | Complete | 5, 8.2, 19, 21.2 | Initial allowed Expense Category values are explicitly restricted to Laptop and Mobile. |
| Inward supplier GST summary | Complete | 8.3, 19, 21.2, 21.6 | Input GST sources, groups, filters, eligibility, signed adjustments, and edge cases are covered. |
| Outward supply GST summary | Complete | 8.4, 19, 21.1, 21.6 | Output GST sources, groups, filters, signed adjustments, and edge cases are covered. |
| Profit & Loss Account | Complete | 3.2, 8.5, 19, 21.5 | Ledger basis, formulas, groups, comparison, drill-down, and reconciliation are specified. |
| Balance Sheet | Complete | 3.2, 8.6, 19, 21.5 | As-of rules, retained earnings, balance equation, warnings, and comparison are specified. |
| Trial Balance | Complete | 3.2, 8.7, 19, 21.5 | Opening/period/closing columns, formulas, zero-account behavior, and debit/credit checks are specified. |
| TDS details | Complete for agreed scope | 4.6, 6, 8.8, 19, 21.7, 31 | Customer deductions, company deductions, government deposits, payable/receivable, posting, filters, and details are implemented. Allocation and statutory reconciliation workflows are explicitly excluded. |
| Download Excel | Complete | 11, 24 | Backend generation, workbook design, same-filter guarantee, security, empty/large exports, and lifecycle states are covered. |
| Filters | Complete | 9, 19 | Shared behavior and an exact filter matrix for every dashboard/report screen are specified. |
| All major scenarios | Complete for the defined first-release scope | 16, 21–28 | Accounting, GST, lifecycle, UI states, navigation, export, accessibility, performance, security, and production acceptance are covered. |

### 29.1 Required product decisions before coding

The design is complete, but these business choices cannot be safely guessed during implementation. They must be confirmed once and then stored in configuration or acceptance criteria:

1. **Dashboard Income source:** recommended `issued invoices excluding GST`; alternatively include confirmed but uninvoiced orders through an explicit `includeUninvoicedOrders` filter. Never include both without deduplication.
2. **Dashboard Expense wording:** recommended card title `Bills excluding GST`, with Inventory Purchases and Operating Expenses shown separately. Calling all inventory bills “Expense” would make the dashboard disagree with P&L.
3. **Location accounting:** excluded from the agreed deliverable. Location-filtered statements require a future journal dimension.
4. **GST first-release scope:** confirm whether only normal domestic taxable IGST/CGST/SGST is required, or whether RCM, exempt, nil-rated, zero-rated/export, and blocked input credit must be implemented immediately.
5. **Accounting basis:** this document recommends accrual accounting. Cash-basis P&L is not included unless separately requested.
6. **Inventory and COGS:** confirm whether COGS is posted at delivery/invoice time using actual stock cost, weighted average, or another valuation method. P&L gross profit cannot be authoritative until this is defined.
7. **Legacy start date:** define the first reliable accounting/reporting date and how opening balances/legacy unposted documents will be migrated.
8. **Comparative periods:** excluded from the agreed deliverable and may be implemented later.

### 29.2 Explicitly out of initial scope unless approved

- Multi-currency accounting and foreign-exchange gain/loss.
- Bank reconciliation.
- Budgets and budget-versus-actual reporting.
- Cash-flow statement.
- Department, project, or cost-center dimensions.
- Consolidation across multiple legal entities.
- Statutory GST return filing/API submission; the design provides summaries, not a promise of GSTR filing compliance.
- Automated year-end closing workflow.
- Challan-to-individual-TDS-deduction allocation and partial-deposit compliance tracking.
- Form 26AS/AIS reconciliation and TDS certificate/PAN/TAN workflows.
- Location accounting dimensions and comparison-period reports.

These exclusions prevent ambiguous implementation scope. The underlying component/report design can be extended for them later.

## 30. Implementation Progress

### Completed — Permission foundation

- Added consolidated idempotent migration `20260821_finance_dashboard_reports.sql`.
- Added canonical `finance_dashboard` and `finance_reports` permission resources.
- Seeded `read=true` for Admin and Accountant and `read=false` for every other role.
- Fixed unsupported `create/edit/delete` actions to false.
- Exposed both virtual resources through the existing table/permission metadata response.
- Reused the existing User Permissions editor instead of creating another permission system.
- Disabled finance permissions in the editor for roles outside Admin and Accountant.
- Added backend normalization so a modified request cannot grant finance access to another role.
- Preserved an intentional Admin/Accountant read restriction on later permission saves.
- Added focused permission tests for role normalization, defaults, denial, duplicate cleanup, and preservation.
- Added frontend protected-route resource types for the two future component routes.

### Verification completed

- Backend TypeScript check passes.
- Frontend TypeScript check passes.
- Five focused finance permission tests pass.

### Completed — Functional components

- Added guarded `/finance/dashboard` and `/finance/reports` frontend routes.
- Added permission-derived sidebar entries, including compatibility with saved legacy menu ordering.
- Added `GET /finance/dashboard/summary`, returning all primary KPI values in one aggregate response.
- Added selected-only `GET /finance/reports/:reportKey` for Sales Invoices, Supplier Bills, Inward GST, Outward GST, Trial Balance, Profit & Loss, Balance Sheet, and TDS Summary.
- Added `GET /finance/dashboard/insights` for trends, ageing, GST position, cash/bank position, and journal exceptions without a browser-side API cascade.
- Added server-generated filtered Excel workbooks through `GET /finance/reports/:reportKey/export` and wired browser download states.
- Added supplier-bill `inventory`/`expense` persistence fields, direct-supplier/expense-account support, validation, and migration.
- Added a partial posted-journal database index for the reporting hot path.
- Added primary Finance Dashboard KPI request plus one independently recoverable insights request, with filters, Income/Expense/Net Profit, TDS, GST, ageing, trend, liquidity, and exception components.
- Added one-request-per-selected-report workspace with date/search filters, server pagination, report-specific tables, totals, and reconciliation variance.
- Added stale-response protection so rapid filter/report changes do not replace newer data.
- Backend and frontend TypeScript checks pass after integration.

### Deployment requirements and accounting boundaries

- Run the single consolidated Finance Dashboard/Reports migration listed in section 31.6 before enabling the routes. The code does not run migrations automatically.
- Financial statements are ledger-first and include posted journal entries only. Their accuracy therefore depends on complete invoice, bill, receipt, payment, TDS, and opening-balance posting.
- Dashboard income/expense and all statement reports exclude GST by deriving values from account classification or taxable document values.
- TDS Summary distinguishes customer-deducted TDS, company-deducted TDS and government challan deposits. Statutory allocation/reconciliation extensions are outside the agreed deliverable.
- Supplier expense bills accept direct supplier and expense-account mapping, and the bill-entry form exposes Inventory/Expense type, Laptop/Mobile category and Expense Ledger fields.
- GST reports are summaries from stored document tax fields and are not statutory return-filing integrations.

## 31. Agreed Implementation Scope and Final Status — 2026-08-21

### 31.1 Agreed scope

The agreed deliverable is the Chart of Accounts–based Finance Dashboard and Finance Reports workspace:

- Total Receivables and Total Payables.
- Net Sales and Supplier Bills excluding GST.
- Inventory Purchases separated from Operating Expense Bills.
- Posted-ledger Income, Expense and Net Profit/Loss.
- Sales Invoices and Supplier Bills reports.
- Inward GST and Outward GST summaries.
- Profit & Loss, Balance Sheet and Trial Balance.
- TDS deducted by customers, TDS deducted by the company, TDS Receivable and TDS Payable.
- TDS government challan/deposit entry and reporting.
- Shared relevant filters, URL persistence, server pagination and backend Excel export.
- Admin/Accountant-only sidebar, route, API and export access.
- Responsive Dashboard and Reports components with loading, empty and error states.

### 31.2 Explicitly not required for this deliverable

The following compliance and accounting-dimension extensions are not part of the agreed Dashboard/Reports scope and are not completion blockers:

- Challan-to-individual-TDS-deduction allocation.
- Partial-deposit compliance and statutory overdue tracking.
- Form 26AS/AIS reconciliation.
- TDS certificate and PAN/TAN workflow.
- Location accounting dimensions and location-filtered financial statements.
- Comparison-period reporting.

These may be implemented later as separate statutory-compliance or accounting-dimension modules. They do not belong directly inside Chart of Accounts.

### 31.3 Completed implementation

- Added guarded `/finance/dashboard` and `/finance/reports` routes and permission-derived sidebar entries.
- Added `finance_dashboard` and `finance_reports` permission resources. Admin and Accountant may receive read access; other roles are rejected by frontend and backend guards.
- Dashboard cards use eligible invoice and bill documents excluding GST. Posted Income/Expense remain separately visible for P&L reconciliation.
- Inventory Purchases and Operating Expense Bills are separately calculated and displayed.
- Added trends, ageing, GST position, Cash/Bank position, TDS position and journal-exception widgets.
- Dashboard summary and insights use independent stale-request counters and do not issue one API request per KPI.
- Added Sales Invoices, Supplier Bills, Inward GST, Outward GST, P&L, Balance Sheet, Trial Balance and TDS reports.
- Document report totals are independent all-matching-row aggregates rather than current-page totals.
- Added server-backed date, search, status, invoice type, bill type, Laptop/Mobile expense category and TDS direction filters.
- Dashboard KPI cards drill into the relevant report. Dashboard and report filter state is persisted in URL query parameters.
- P&L and Balance Sheet use grouped statement presentation. Trial Balance retains opening, movement and closing debit/credit columns.
- Added backend-generated Excel workbooks using identical applied filters, with formula-injection protection.
- Supplier Bill entry supports Inventory/Expense type, conditional Laptop/Mobile category, Expense Ledger selection, conditional product validation and matching backend validation.
- Added `finance_tds_deposits` as the government challan source with challan, deposit date, FY, quarter, section, CIN, BSR, payment reference and separated tax/interest/fee/penalty values.
- Posting a TDS deposit atomically creates the challan, bank-credit transaction, posted balanced journal, audit event and bank-balance update.
- TDS tax debits `SYS-TDS-PAYABLE`; interest, late fee and penalty debit dedicated expense ledgers; the complete payment credits Bank.
- TDS reports provide Deducted by Customers, Deducted by Us and Deposited by Us views. The Dashboard includes period deposits and ledger-derived payable/receivable balances.

### 31.4 Performance and responsive-design hardening

- Dashboard data is intentionally split into only two independently recoverable requests: one KPI summary request and one insights request. It does not make an API call per card or widget.
- Dashboard insight queries select only the invoice and bill columns required for calculations instead of loading complete document rows and unrelated JSON payloads.
- Reporting hot paths have partial indexes for posted journals and active invoice/bill effective dates (`COALESCE(document_date, created_date)`).
- Each selected report uses one server request, server pagination, stale-response protection and debounced search so rapid filter changes cannot create a request cascade or render older results.
- Excel export executes one filtered report query with a 10,000-row safety limit instead of repeatedly recalculating report totals page by page. A truncated export is explicitly identified in the workbook so the user can refine filters.
- Report navigation becomes a horizontally scrollable tab strip on small screens and a vertical report menu on large screens.
- Filters use a single-column mobile layout, then progressively expand from the `sm` breakpoint. Tables retain horizontal scrolling so accounting columns are not compressed or hidden.
- Statement report rendering is memoized, preventing a large Trial Balance, P&L or Balance Sheet from rendering again while the user is only typing or changing draft filters.
- Dashboard date controls use a full-width single-column mobile layout, touch-safe 40-pixel controls, a three-column tablet layout and a content-width desktop layout.
- Pagination stacks on mobile, action controls retain touch-safe widths, and the TDS deposit dialog uses a full-screen mobile layout with a bounded desktop modal.
- Dashboard cards and charts use responsive grids with explicit loading, empty and recoverable error states.

### 31.5 Verification

- Backend TypeScript check passes.
- Backend production build passes.
- Frontend TypeScript check passes.
- The compiled backend regression suite passes all 141 tests across 34 top-level suites, including existing invoice, supplier-bill allocation, On Account, journal, delivery-challan, service-invoice and stock-policy boundaries.
- All five focused finance-permission tests are included in the passing compiled regression suite. Running the same sources through `tsx` remains environment-blocked by Windows `uv_os_get_passwd ENOMEM`, so compiled JavaScript was used to verify the complete suite without the failing loader.
- The optional Expense Ledger lookup is failure-isolated: an unavailable or unauthorized finance-account request cannot prevent the established Inventory Bill form from opening or being used.
- Final scenario audit confirms January–March defaults use the prior April financial-year start; invalid/reversed dates are rejected; cancelled and void documents are consistently excluded; and legacy invoice totals fall back from `totalorderamount` to `invoiceamount`.
- TDS deposit posting now verifies that FY and quarter match Deposit Date, the selected TDS Section is active and belongs to the session organization, and the payment account is an active Bank account in the same organization.
- A failed insights request is presented as a recoverable warning with retry and is not displayed as legitimate zero-valued financial data.
- Frontend Vite bundling and rendered-browser validation are blocked in the current desktop environment by an esbuild parent-directory access error. This is an environment verification limitation, not additional product scope.

### 31.6 Deployment requirements

Run this single consolidated idempotent migration before enabling the pages:

1. `20260821_finance_dashboard_reports.sql`

This one file contains the permission seed, supplier expense-bill columns, TDS government-deposit table/system accounts and all Dashboard/Reports performance indexes in dependency-safe order. The earlier four separate migration files were removed so this feature has one deployment unit.

The codebase does not automatically apply these migrations through the UI. Financial statements remain ledger-first and include posted journal entries only, so production accuracy depends on complete opening balances and source-document posting.

## 32. Chart of Accounts Integration — Fully Implemented

The Finance Dashboard and Finance Reports are integrated with the existing Chart of Accounts and posted Journal foundation. The implementation deliberately separates ledger balances from operational document analysis so financial statements remain auditable while invoice and GST reports retain document-level information.

### 32.1 Dashboard Chart of Accounts mapping

| Dashboard component | Accounting source | Calculation basis |
|---|---|---|
| Total Receivables | `accounts_receivable` account subtype | Posted Journal debits minus credits through the selected To date |
| Total Payables | `accounts_payable` account subtype | Posted Journal credits minus debits through the selected To date |
| Posted Income | All active Income accounts | Posted period credits minus debits |
| Posted Expense | All active Expense accounts | Posted period debits minus credits |
| Net Profit/Loss | Income and Expense accounts | Posted Income minus Posted Expense |
| TDS Receivable | `tds_receivable` account subtype | Posted debit balance through the selected To date |
| TDS Payable | `tds_payable` account subtype | Posted credit balance through the selected To date |
| Cash and Bank position | Bank/Cash accounts linked to finance accounts | Current balances for the session organization |
| Monthly Income versus Expense | Income and Expense accounts | Posted Journal movement grouped by accounting month |
| Accounting Exceptions | Journal Entries and Journal Lines | Draft journals and any posted debit/credit variance |

Net Sales, Supplier Bills, Inventory Purchases, Operating Expense Bills and GST widgets are document-derived analytical metrics. They are shown separately from posted-ledger Income and Expense so users can identify unposted or incorrectly mapped source documents instead of silently treating documents as ledger entries.

### 32.2 Reports Chart of Accounts mapping

| Report | Chart of Accounts usage |
|---|---|
| Profit & Loss | Groups posted period movements for every Income and Expense account and calculates Net Profit/Loss |
| Balance Sheet | Groups closing balances for Asset, Liability and Equity accounts and includes calculated Current Earnings |
| Trial Balance | Displays every Chart of Accounts ledger with Opening Debit/Credit, Period Debit/Credit and Closing Debit/Credit |
| TDS Summary | Reconciles TDS transaction activity with `SYS-TDS-RECEIVABLE` and `SYS-TDS-PAYABLE` balances |
| TDS Government Deposits | Debits `SYS-TDS-PAYABLE`, debits dedicated charge Expense accounts and credits the selected Bank finance account |
| Supplier Expense Bills | Stores the selected Expense Ledger through `expenseaccountid` for accounting classification |

Sales Invoices, Supplier Bills, Inward GST and Outward GST remain document-level reports because invoice number, party, GSTIN, taxable value, tax components, settlement and document status are not Chart of Accounts attributes. Their totals exclude cancelled and void documents and their taxable values exclude GST.

### 32.3 TDS posting accounts

- Deposited tax debits `SYS-TDS-PAYABLE`; therefore only the tax portion reduces the TDS liability.
- Interest debits `SYS-TDS-INTEREST-EXPENSE`.
- Late fee debits `SYS-TDS-LATE-FEE-EXPENSE`.
- Penalty debits `SYS-TDS-PENALTY-EXPENSE`.
- The complete challan payment credits the selected Bank account.
- The resulting Journal is balanced, posted and linked to the TDS deposit and Bank transaction in the same database transaction.

### 32.4 Accounting and reconciliation boundaries

- Only posted Journal Entries contribute to the Dashboard ledger metrics, P&L, Balance Sheet and Trial Balance.
- Draft, reversed or otherwise unposted Journals do not affect financial statements.
- Receivables, Payables, TDS Receivable and TDS Payable are as-of balances through the selected To date.
- Income, Expense and Net Profit/Loss are movements within the selected From/To period.
- Document reports and GST summaries use the selected document period and retain server-side filters and pagination.
- A difference between document-derived totals and posted-ledger totals indicates an unposted, incomplete or incorrectly classified accounting source and must not be hidden by the Dashboard.
- Opening balances and complete source-document posting are required before production financial statements can be considered final.

### 32.5 Final implementation statement

Within the agreed scope, the Finance Dashboard and Finance Reports are fully implemented with Chart of Accounts integration, Admin/Accountant permissions, filters, responsive UI, optimized API behavior, Excel export, supplier expense classification and TDS government-deposit accounting. The statutory extensions explicitly excluded in section 31.2 remain separate future modules and are not required for completion of these two components.
