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

This document is an implementation specification and UI/component design. It does not implement the feature.

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

Add dedicated resources instead of inheriting broad dashboard access:

- `finance_dashboard.read`
- `finance_reports.read`
- `finance_reports.export`
- Optional `finance_reports.view_sensitive`

Recommended defaults: Admin and Accountant can read/export; other roles only by explicit grant and location scope. Every export should create a finance audit event with user, report key, filters, row count, and generated timestamp.

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
- Permissions and location scope are tested at API level.
- Reversal, cancellation, partial payment, return, credit note, TDS, advance, and historical as-of scenarios are covered.
- Customer-deducted TDS, company-deducted TDS, government deposits, partial allocations, and 26AS/AIS reconciliation are covered.
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
| Sales Invoices report | Complete | 8.1, 19, 21.1 | Summary, columns, filters, lifecycle cases, and drill-down are specified. |
| Supplier Bills report | Complete | 5, 8.2, 19, 21.2 | Bill type/category, summary, columns, filters, lifecycle cases, and drill-down are specified. |
| Expense Bill Type | Complete | 5, 21.2 | `inventory`/`expense`, ledger mapping, form behavior, posting templates, and edit restrictions are specified. |
| Laptop/Mobile only for Expense bills | Complete | 5, 8.2, 19, 21.2 | Initial allowed Expense Category values are explicitly restricted to Laptop and Mobile. |
| Inward supplier GST summary | Complete | 8.3, 19, 21.2, 21.6 | Input GST sources, groups, filters, eligibility, signed adjustments, and edge cases are covered. |
| Outward supply GST summary | Complete | 8.4, 19, 21.1, 21.6 | Output GST sources, groups, filters, signed adjustments, and edge cases are covered. |
| Profit & Loss Account | Complete | 3.2, 8.5, 19, 21.5 | Ledger basis, formulas, groups, comparison, drill-down, and reconciliation are specified. |
| Balance Sheet | Complete | 3.2, 8.6, 19, 21.5 | As-of rules, retained earnings, balance equation, warnings, and comparison are specified. |
| Trial Balance | Complete | 3.2, 8.7, 19, 21.5 | Opening/period/closing columns, formulas, zero-account behavior, and debit/credit checks are specified. |
| TDS details | Complete | 4.6, 6, 8.8, 19, 21.7 | Customer deductions, company deductions, government deposits, payable/receivable, posting, allocations, reconciliation, filters, and details are specified. |
| Download Excel | Complete | 11, 24 | Backend generation, workbook design, same-filter guarantee, security, empty/large exports, and lifecycle states are covered. |
| Filters | Complete | 9, 19 | Shared behavior and an exact filter matrix for every dashboard/report screen are specified. |
| All major scenarios | Complete for the defined first-release scope | 16, 21–28 | Accounting, GST, lifecycle, UI states, navigation, export, accessibility, performance, security, and production acceptance are covered. |

### 29.1 Required product decisions before coding

The design is complete, but these business choices cannot be safely guessed during implementation. They must be confirmed once and then stored in configuration or acceptance criteria:

1. **Dashboard Income source:** recommended `issued invoices excluding GST`; alternatively include confirmed but uninvoiced orders through an explicit `includeUninvoicedOrders` filter. Never include both without deduplication.
2. **Dashboard Expense wording:** recommended card title `Bills excluding GST`, with Inventory Purchases and Operating Expenses shown separately. Calling all inventory bills “Expense” would make the dashboard disagree with P&L.
3. **Location accounting:** confirm whether journals are location-specific. If `journal_entries`/`journal_lines` do not store a reliable location dimension, location-filtered Trial Balance, P&L, and Balance Sheet must remain unavailable until that dimension is added.
4. **GST first-release scope:** confirm whether only normal domestic taxable IGST/CGST/SGST is required, or whether RCM, exempt, nil-rated, zero-rated/export, and blocked input credit must be implemented immediately.
5. **Accounting basis:** this document recommends accrual accounting. Cash-basis P&L is not included unless separately requested.
6. **Inventory and COGS:** confirm whether COGS is posted at delivery/invoice time using actual stock cost, weighted average, or another valuation method. P&L gross profit cannot be authoritative until this is defined.
7. **Legacy start date:** define the first reliable accounting/reporting date and how opening balances/legacy unposted documents will be migrated.
8. **Comparative periods:** confirm whether comparison is required in the first release for both P&L and Balance Sheet or may follow the initial release.

### 29.2 Explicitly out of initial scope unless approved

- Multi-currency accounting and foreign-exchange gain/loss.
- Bank reconciliation.
- Budgets and budget-versus-actual reporting.
- Cash-flow statement.
- Department, project, or cost-center dimensions.
- Consolidation across multiple legal entities.
- Statutory GST return filing/API submission; the design provides summaries, not a promise of GSTR filing compliance.
- Automated year-end closing workflow.

These exclusions prevent ambiguous implementation scope. The underlying component/report design can be extended for them later.
