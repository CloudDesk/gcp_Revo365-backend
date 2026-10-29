# Finance Modules — Our Zoho Books-Inspired Design and Current Implementation

## 1. Executive Summary

We have developed a set of finance capabilities inside the existing TeqIT
Inventory application, using Zoho Books only as a functional and UI reference.
This is **not a copy of Zoho Books**, and there is no Zoho Books integration or
data synchronization. Our solution follows TeqIT's existing Customer, Supplier,
Invoice, Bill, Order, Service Request, Bank/Cash, permission, and organization
models.

> **Last updated:** 15 October 2026. Status reflects the `sit` branch of the
> backend (`gcp_Revo365-backend`) and the `SIT` branch of the frontend
> (`GCP-Latest-Revo-Inventory`). See section 17 for branch-level availability.

The implemented finance area contains:

1. Cash and Bank Accounts
2. Transactions
3. Chart of Accounts
4. Customer and Supplier Statements
5. Journals
6. On Account Of
7. Direct Bills (Unified Supplier and Direct Expense Bills)
8. Finance Dashboard
9. Finance Reports
10. TDS (Sections and Government Deposits)

These are connected modules, not independent accounting databases. A
payment is recorded once in its owning source module and then reused by the
Transaction list, Journal ledger, document balance, and Statement views.

## 2. Core Design Decisions

### 2.1 Customers and Suppliers are not Chart of Accounts records

- Customers remain in the existing Customer master.
- Suppliers remain in the existing Supplier master.
- Chart of Accounts contains normal accounting ledgers such as Rent Expense,
  Salary Expense, Salary Payable, Fixed Assets, Income, and other approved
  posting accounts.
- System control accounts such as Accounts Receivable, Accounts Payable,
  Customer Advances, Supplier Advances, TDS Receivable, and TDS Payable are
  maintained as system finance accounts.
- Bank and Cash accounts have their own system-linked finance ledgers.

This avoids creating one duplicate ledger master record for every Customer or
Supplier. Party identity is stored separately on the relevant transaction and
Journal line.

### 2.2 One accounting event, multiple views

For example, a Customer receipt is not copied into separate payment records for
Cash and Bank, Transactions, Journals, and Customer Statements. The posting
creates one Bank/Cash transaction, one balanced Journal, and the required
Invoice allocation. The other modules read those records.

### 2.3 Source modules own real-world business events

- Actual money received or paid is owned by Cash and Bank.
- Invoice and Bill settlement is owned by the existing Invoice/Bill allocation
  flows.
- Manual non-cash accounting entries are owned by Journals.
- Advance availability and consumption are owned by On Account Of.
- Transactions and Statements are primarily operational/reporting views over
  those source records.

### 2.4 Posted history is preserved

Posted accounting records are not silently overwritten or deleted. Corrections
are represented through linked accounting entries, movements, or reversal
records so the audit path remains visible.

## 3. Module Summary and Status

| Module | Our purpose | Current source status |
| --- | --- | --- |
| Cash and Bank Accounts | Maintain TeqIT Bank/Cash accounts, opening/current balances, and real money movements | Core implementation completed, including Retail In-store receipts with TDS Receivable |
| Transactions | Combined operational view of posted Bank/Cash movements and their source/allocation details | Implemented for current Cash/Bank transaction types |
| Chart of Accounts | Maintain TeqIT-created accounting posting accounts and view their ledgers | Phases 1–3 completed; Lifecycle (edit, activate/deactivate, delete preview/CSV/bulk delete) completed through Phase 8 with manual acceptance on 14 Oct 2026 |
| Customer/Supplier Statements | Show party balances and source transactions without duplicating payments | Core Customer and Supplier statement flows implemented; broader Phase 3 items such as complete export/integration coverage are not declared complete |
| Journals | Show the accounting ledger and support controlled manual non-cash entries | Implemented, including Customer-to-Customer On Account transfer and replacement. Journal attachments and Draft deletion are in `Dev-New`, not yet in `sit` |
| On Account Of | Track Customer/Supplier advances by stable reference and apply them later | Phases 1–8 implemented; Customer transfer/replacement delivered through Journals |
| Direct Bills | Expense Bills with or without a Supplier and without a Purchase Order | Implemented (create, history, outstanding, attachment, payment tracking); accrual Journal on Bill creation not yet implemented |
| Finance Dashboard | KPI, trend, ageing, GST/Cash/TDS position and AR/AP reconciliation view | Implemented for agreed scope |
| Finance Reports | Document, GST, financial-statement and TDS reports with Excel export | Implemented for agreed scope |
| TDS | TDS section master and government challan deposits | Implemented; statutory compliance extensions (26AS/AIS, certificates) excluded |

"Implemented in source" means the backend/frontend code and migrations exist in
the repository. Environment deployment, migration execution, and manual
acceptance must still be completed in each target environment.

## 4. Cash and Bank Accounts

### 4.1 Account management

The module supports the organization's own:

- Bank accounts
- Cash accounts
- Opening balance and opening balance date
- Current system-calculated balance
- Active/inactive status
- Organization-level default E-commerce account

Bank account numbers are protected and only masked values are returned for
normal display. The current Bank/Cash creation workflow does not create a
separate Credit Card account type; Credit Card remains a Chart of Accounts type.

### 4.2 Balance rule

Within the Cash and Bank module:

```text
Available Balance = Previous Balance + Debit - Credit
```

- Debit means money entering the selected Bank/Cash account.
- Credit means money leaving the selected Bank/Cash account.
- Users do not manually enter the resulting balance.

### 4.3 Supported posting flows

#### Customer receipt against Invoices

- Select an existing Customer.
- Select one or more eligible outstanding Invoices.
- Allocate the Bank/Cash portion manually.
- Optionally record TDS Receivable.
- Post one Bank/Cash debit and one balanced Journal.
- Update the selected Invoice balances and payment statuses.

Accounting pattern:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Selected Bank/Cash | Bank portion | 0 |
| TDS Receivable, when applicable | TDS | 0 |
| Accounts Receivable | 0 | Bank portion + TDS |

#### Supplier payment against Bills

- Select an existing Supplier.
- Select one or more eligible outstanding Bills.
- Allocate the Bank/Cash portion manually.
- Optionally record TDS Payable with its statutory section.
- Post one Bank/Cash credit and one balanced Journal.
- Update the selected Bill balances and statuses.

Accounting pattern:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Accounts Payable | Bank portion + TDS | 0 |
| Selected Bank/Cash | 0 | Bank portion |
| TDS Payable, when applicable | 0 | TDS |

#### Direct Ledger transaction

A Finance user may post a Bank/Cash movement directly against an eligible
Chart of Accounts ledger, for example Rent Expense or Salary Payable. The
service creates the Bank/Cash transaction and its balanced system Journal.

#### E-commerce receipt

Successful eligible online payments are processed into the configured default
E-commerce Bank account. The system derives the Customer/payment information,
creates the Bank transaction and Journal, and preserves the payment reference
for idempotency and traceability.

#### Retail In-store receipt

An Admin or Accountant records money received against existing Retail
In-store (`storepurchase`) product Invoices from the selected Bank/Cash
account's **Transactions → Record receipt** action:

- Select an existing Customer (never free text) and one or more Invoices with
  an outstanding amount.
- Enter the Bank allocation per Invoice and, optionally, a manually entered
  TDS Receivable amount per Invoice (no TDS section selection in this flow).
- Bank debit = sum of allocations; Invoice settlement = allocation + TDS.

See `docs/cash-bank-account/CASH_BANK_RETAIL_RECEIPT_IMPLEMENTATION.md` and
`TDS_RECEIPT_IMPLEMENTATION.md`.

#### Customer/Supplier advance

Cash and Bank also owns the initial real-money movement for On Account Of:

- Customer advance: Debit Bank/Cash, Credit Customer Advances.
- Supplier advance: Debit Supplier Advances, Credit Bank/Cash.

The advance simultaneously creates its stable On Account reference and origin
movement.

### 4.4 Current boundaries

The current implementation is not a complete bank-reconciliation product. A
full statement-import/matching/reconciliation workflow, exchange-rate workflow,
and arbitrary deletion of posted Bank transactions are not part of the current
delivered scope.

## 5. Transactions Module

The Transactions module is the cross-account operational list of
`bank_transactions`. It is not a second ledger and it does not duplicate the
Journal module.

It currently shows and filters Bank/Cash activity by:

- Bank/Cash account
- Date range
- Debit or Credit
- Source/transaction type
- Transaction number, party, remarks, account name, or bank name search

The list includes source and accounting context such as:

- Transaction number and date
- Bank/Cash account
- Customer/Supplier/ledger party information
- Debit, Credit, and balance after posting
- Allocation method
- Source type
- Counterparty account
- Journal number
- Invoice/Bill allocations and TDS information where applicable
- Creator and posting metadata

Creating a transaction still uses the relevant owned workflow: Customer
Receipt, Supplier Payment, or Direct Ledger. The global Transactions page is
the combined view and action launcher, not a free-form transaction table.

## 6. Chart of Accounts

### 6.1 Implemented design

The Chart of Accounts implementation is deliberately simpler than Zoho Books:

- Flat account list; no parent/child tree in the current scope.
- Fixed backend-controlled Account Type catalogue.
- Organization-scoped unique Account Name and optional Account Code; when an
  Account Code is supplied, its uniqueness is enforced case-insensitively.
- User-created posting accounts are separated from system, Customer, Supplier,
  and Bank/Cash records.
- Account list, creation, detail, ledger entries, and ledger totals are
  implemented.
- Accounts Receivable and Accounts Payable totals are available on the module
  home/list view.

The broad categories are Asset, Liability, Equity, Income, and Expense, with
supported types such as Other Asset, Fixed Asset, Stock, Other Liability,
Income, Expense, Cost of Goods Sold, and others defined in the database master.

### 6.2 Posting use

Chart of Accounts records are reused by:

- Cash/Bank Direct Ledger entries
- Manual Journal lines
- Chart account ledger/detail views

Customers and Suppliers are never created from this module.

### 6.3 Account lifecycle

The Chart of Account Lifecycle work (Phases 1–8, manual acceptance completed
14 October 2026) adds:

- Edit of user-created accounts
- Single and bulk Activate / Deactivate
- Delete preview showing every referencing record, with CSV export of the
  preview
- Bulk delete protected by a signed preview token, so the deletion matches
  exactly the impact the user reviewed
- Blocked deletion where references cannot be safely removed, cascade handling
  of eligible Direct Ledger rows, and Bank/Cash balance rebuild afterwards
- Audit events for activate, deactivate, delete, cascade and balance rebuild,
  plus the read-only `monitor:chart-account-lifecycle` script
- Period filter on the account list and detail ledger

Visibility uses the existing `chart_of_accounts` `edit` and `delete`
permissions. Merging and hierarchical grouping remain out of scope. See
`docs/chart-of-account/CHART_OF_ACCOUNT_LIFECYCLE_PHASE_8_RELEASE_REPORT.md`.

## 7. Customer and Supplier Statements

### 7.1 Customer workspace

The Customer finance workspace provides:

- Customer list and receivable summary
- Overview, Transactions, and Statement tabs
- Invoice visibility
- Posted Customer Payments from Cash and Bank
- Estimate visibility
- Delivery Challan visibility
- Date-scoped opening and closing receivable calculations
- TDS and settlement values
- Links back to source transactions/documents
- A separate On Account statement panel

A Customer Payment is not recreated inside the Customer module. The workspace
reuses the existing Customer Receipt flow and then reads the posted Cash/Bank
transaction and Invoice allocation.

### 7.2 Supplier statement

The Supplier statement reads existing Bills, posted Supplier payments, TDS,
and current payable information. It also includes the Supplier's separate On
Account movement statement.

### 7.3 Statement balance principle

- Customer receivable comes from canonical Invoice outstanding balances and
  posted Customer settlements.
- Supplier payable comes from canonical Bill outstanding balances and posted
  Supplier settlements.
- On Account availability is shown separately so it is not counted twice as a
  normal Invoice/Bill payment.

The broader Phase 3 requirement document still records remaining release scope
such as full statement export and complete integration/acceptance coverage.

## 8. Journals

### 8.1 One accounting ledger, three views

The Journals page reads the shared `journal_entries` and `journal_lines`
ledger. It provides:

- Manual Journals
- System-Generated Journals
- All Entries

System Journals are created by Cash/Bank, opening balances, receipts, payments,
On Account applications, and other source services. They are read-only in the
manual Journal workspace and retain source navigation.

### 8.2 Manual Journal purposes

| Purpose | Example | Related posted entry |
| --- | --- | --- |
| General Entry | Approved non-cash accounting entry | Optional |
| Accrual / New Entry | Salary Expense Dr / Salary Payable Cr before payment | Not required |
| Reclassification | Salary Expense Dr / Rent Expense Cr | Required |
| Correction | Correct a wrong account classification | Required |

Reclassification and Correction use a structured relation to an eligible
posted accounting entry. The selector is limited to entries containing an
eligible normal Chart of Accounts line. Generic Journals do not expose
system-only E-commerce, Customer/Supplier control-account, or On Account
entries as a workaround.

### 8.3 Draft and Post

- A Draft may be edited and may temporarily be unbalanced.
- At least two valid lines are required.
- Each line must contain Debit or Credit, never both.
- Posting requires Total Debit = Total Credit and a positive total.
- Posting revalidates account eligibility and any related entry.
- Posted manual Journals become immutable.
- Manual Journal accounts are active user-created posting accounts; Bank/Cash,
  Credit Card, Payment Clearing, and system control accounts are excluded from
  generic manual selection.

### 8.4 Reverse Journal

Reversing a posted manual Journal does not edit or delete it. The system creates
a new posted Journal with Debit and Credit swapped, links it to the original,
and retains both entries and their audit history.

### 8.5 Access

Journal access is restricted to the approved Admin and Accountant roles. The
implementation includes Draft/Edit/Post/Reverse permissions, organization
isolation, optimistic version checks, audit events, source links, related-entry
links, and activity history.

### 8.6 Customer On Account transfer and replacement

Delivered (see `docs/journal/JOURNAL_TRANSFER_RELEASE_NOTES.md`):

- Guided Customer-to-Customer transfer of an unused, versioned On Account
  reference through a balanced, party-aware system Journal.
- Transfer cannot exceed the source reference's available amount.
- Paired immutable transfer-out / transfer-in movements and a destination
  reference, cross-linked from the Journal detail.
- The destination Customer can apply the transferred amount to Invoices through
  the normal On Account/TDS flow.
- Explicit replacement by a later destination-Customer Bank-origin reference:
  only transfer-funded Invoice allocations are un-cleared, the source
  Customer's availability is restored, and full history is retained.
- Customer Statements show both original and compensating transfer movements.
- Required migrations: `20260819_journal_on_account_phase2.sql` and
  `20260825_journal_on_account_transfer_contract.sql`.

### 8.7 Attachments and Draft deletion (in `Dev-New`, not yet in `sit`)

Commit `a4f0324` (15 October 2026) adds:

- `POST /finance/journals/:journalId/attachment`: an optional attachment per
  Journal (`journal_entries.attachmenturl`, `attachmentname`).
- `POST /finance/journals/:journalId/delete`: deletion of manual **Draft**
  Journals only. Posted Journals remain immutable.
- Migration `20261015_journal_client_enhancements.sql` grants the `journal`
  `delete` permission to Admin and Accountant only.

## 9. On Account Of

### 9.1 Meaning in our application

On Account Of represents real money received from a Customer or paid to a
Supplier before it is allocated to a specific Invoice or Bill. It is not only a
single balance column.

Each source amount receives a stable reference:

```text
OA-C-00000001  Customer advance
OA-S-00000001  Supplier advance
```

Every reference stores its original, used, and available amounts. Its changes
are recorded through an append-only movement ledger and document-allocation
links.

### 9.2 Customer flow

1. Receive an advance through Cash and Bank without selecting an Invoice.
2. Create the Bank/Cash debit, Customer Advances credit, OA reference, and
   immutable origin movement atomically.
3. Review the reference in the Customer On Account list/detail workspace.
4. Later apply one or more Customer OA references to one or more eligible
   Invoices.
5. Reduce only the OA Bank portion; TDS Receivable settles the remaining
   Invoice portion separately.
6. Create an application Journal and update Invoice balances without creating
   another Bank transaction.

Example:

```text
OA available       ₹50,000
Invoice outstanding ₹50,000
Bank portion        ₹45,000
TDS Receivable       ₹5,000
OA remaining         ₹5,000
Invoice remaining        ₹0
```

### 9.3 Supplier flow

1. Pay a Supplier advance through Cash and Bank without selecting a Bill.
2. Create Supplier Advances debit, Bank/Cash credit, OA reference, and origin
   movement atomically.
3. Review the reference in the Supplier On Account list/detail workspace.
4. Later apply one or more Supplier OA references to eligible Supplier Bills.
5. Reduce only the OA Bank portion; TDS Payable settles the statutory portion.
6. Create the application Journal and update Bill balances without creating a
   second Bank transaction.

### 9.4 Reporting and controls

The implementation includes:

- Separate Customer and Supplier tabs
- List, search, status/date/party filters, summaries, and pagination
- Reference detail with source Bank transaction and Journal
- Immutable movement history
- Application links to Invoices/Bills
- Customer and Supplier On Account statement panels
- Original = Used + Available reconciliation
- Organization and party isolation
- Row locking, balance revalidation, versioning, idempotency, and audit events
- Legacy unapplied-amount compatibility/backfill

### 9.5 Customer On Account transfer

The Customer-to-Customer transfer and later-payment replacement workflow is
implemented through Journals (section 8.6).

Supplier-to-Supplier transfers and mixed Customer/Supplier transfers are not in
the currently approved transfer scope.

## 10. Direct Bills (Unified Supplier and Direct Expense Bills)

`poinvoice` is the single Accounts Payable Bill document. Three mutually
exclusive origins share one Bill table and one payment model:

| Scenario | `billtype` | Purchase Order | Supplier |
| --- | --- | --- | --- |
| PO Bill | `inventory` | Required | From the Purchase Order |
| Direct Expense Bill with Supplier | `expense` | None | Required, active |
| Direct Expense Bill without Supplier | `expense` | None | None (`payeename` snapshot) |

Implemented:

- Create/update Direct Expense Bills with an active expense ledger, direct
  expense lines, and server-calculated totals
- Bill history and a separate supplier-less outstanding view
- Attachment upload and payment tracking
- Supplier-backed Expense Bills are paid through the normal Supplier payment
  flow and appear in Supplier Statements and Supplier On Account
- Supplier-less Expense Bills are settled through a direct Bill payment and are
  excluded from Supplier Statements and Supplier On Account
- A Bill with a posted Cash/Bank allocation cannot be edited or deleted
- Supplier Bill entry supports Inventory/Expense type and a Laptop/Mobile
  expense category used by Finance Reports

Not yet implemented: Bill creation does not post an accrual Journal.
`expenseaccountid` is stored for that future release. See
`UNIFIED_BILLS_IMPLEMENTATION.md`.

## 11. Finance Dashboard

Route `/finance/dashboard`, Admin and Accountant only
(`finance_dashboard` permission). Uses two requests only (summary + insights).

- KPI cards: Total Receivables, Total Payables, Net Sales excluding GST, Bill
  Expense excluding GST. Inventory Purchases and Operating Expense Bills are
  shown separately. Cards drill into the matching report.
- Monthly Income vs Expense chart and Top Expenses donut
- Customer Invoice ageing and Supplier Bill ageing with drill-down detail
- GST position, Cash/Bank position, TDS position (period deposits and
  ledger-derived payable/receivable) and Journal-exception widgets
- Accounts Receivable / Payable reconciliation panel
- **M4 reconciliation:** compares Invoices/Bills with the AR/AP control
  ledgers as of a date and cutover date. Flow: analyze → dry-run →
  Admin approve → Admin post correcting entries. Runs are listed for audit.
- Date-range filters persisted in URL query parameters

## 12. Finance Reports

Route `/finance/reports`, Admin and Accountant only (`finance_reports`
permission).

| Group | Reports |
| --- | --- |
| Documents | Sales Invoices, Supplier Bills |
| GST | Inward GST, Outward GST, Outward IST Portal |
| Financial statements | Profit & Loss, Balance Sheet, Trial Balance |
| TDS | TDS Receivable (deducted by Customers), TDS Payable (deducted by us / deposited by us) |

- Server-side date, search, status, invoice type, bill type, expense category
  and TDS direction filters, with server pagination
- Totals are all-matching-row aggregates, not current-page totals
- P&L and Balance Sheet use grouped presentation; Trial Balance shows opening,
  movement and closing Debit/Credit
- Backend-generated Excel export with the same filters, a 10,000-row limit
  (truncation is flagged in the workbook) and formula-injection protection

Full design: `docs/dashboard-and-reports/FINANCE_DASHBOARD_REPORTS_ANALYSIS_AND_DESIGN.md`.

## 13. TDS

- **TDS Sections:** master list (`/finance/tds-sections`) used when recording
  TDS Payable on Supplier payments.
- **TDS Receivable:** recorded on Customer and Retail receipts and On Account
  applications.
- **TDS Deposit (government challan):** `finance_tds_deposits` stores challan,
  deposit date, FY, quarter, section, CIN, BSR, payment reference and separate
  tax / interest / late fee / penalty amounts. Posting atomically creates the
  challan, a Bank credit transaction, a balanced Journal (tax debits
  `SYS-TDS-PAYABLE`; interest, fee and penalty debit their expense ledgers),
  the audit event and the bank-balance update. Entered from Finance Reports.

Explicitly out of scope: challan-to-individual-deduction allocation,
partial-deposit and statutory overdue tracking, Form 26AS/AIS reconciliation,
TDS certificates and the PAN/TAN workflow.

## 14. End-to-End Ownership Examples

### Normal Customer receipt

```text
Customer Invoice
→ Cash/Bank Customer Receipt
→ Bank Transaction + balanced system Journal
→ Invoice allocation and TDS update
→ Transactions view
→ Customer Payments and Statement views
```

### Customer advance and later Invoice application

```text
Cash/Bank Customer Advance
→ Bank Transaction + origin Journal + OA-C reference
→ On Account movement statement
→ Later OA application Journal, without another Bank transaction
→ Invoice balance and Customer Statement update
```

### Manual reclassification

```text
Original posted accounting entry
→ Manual Reclassification Draft linked to the source
→ Debit/Credit normal Chart of Accounts lines
→ Post
→ Account ledgers updated
→ Optional linked Reverse Journal if cancellation is required
```

## 15. What We Deliberately Do Not Copy from Zoho Books

Our current solution does not claim feature parity with Zoho Books. In
particular, the approved implementation does not currently include all of the
following Zoho-like capabilities:

- Full hierarchical Chart of Accounts management
- Complete bank statement import, matching, and reconciliation workspace
- General multi-currency and exchange-rate accounting workflow
- Customer portal, email, recurring transaction, retainer, credit-note, and
  every external accounting-product workflow
- Recurring Journals, Journal templates/imports, or automatic reversal
  schedules
- Arbitrary editing/deletion of posted accounting history
- Supplier-to-Supplier or mixed Customer/Supplier On Account transfers
- Accrual Journal posting when a Bill is created
- Statutory TDS compliance (26AS/AIS reconciliation, certificates, PAN/TAN)
- Location-dimension accounting and comparison-period reports

Any future addition must reuse the existing source records and balanced Journal
ledger rather than introduce a duplicate accounting store.

## 16. Final Current-State Statement

TeqIT's finance implementation is a purpose-built accounting layer inside the
Inventory application. Cash and Bank owns money movement, Transactions provides
the combined operational view, Chart of Accounts owns normal posting ledgers,
Statements report party balances from existing documents and settlements,
Journals record the balanced accounting effect, On Account Of tracks
unallocated Customer/Supplier advances until they are applied or transferred,
Direct Bills extend Accounts Payable to non-PO expenses, and the Dashboard,
Reports and TDS modules read the same ledger for analysis and statutory
deposits.

All ten modules, including the Customer On Account transfer/replacement
workflow and the Chart of Account lifecycle, exist in source and on the `sit`
branches. Remaining functional gaps are listed in section 15; the main pending
items are Direct Bill accrual posting and the AR/AP control-ledger baseline
noted in the Chart of Account Phase 8 release report.

## 17. Branch Availability (checked 15 October 2026)

| Item | Backend `sit` | Frontend `SIT` |
| --- | --- | --- |
| Cash/Bank, Transactions, Retail receipt, Statements | Yes | Yes |
| Chart of Accounts + Lifecycle | Yes | Yes |
| Journals + Customer OA transfer/replacement | Yes | Yes |
| On Account Of | Yes | Yes |
| Direct Bills | Yes | Yes |
| Finance Dashboard + M4 reconciliation | Yes | Yes |
| Finance Reports + TDS Deposit | Yes | Yes |
| Journal attachments + Draft deletion (`a4f0324`) | **No** (only in `Dev-New`) | — |

The `zohobooks` backend branch (used by `cloudbuildfinance.yaml`) is fully
contained in `sit` but does not include the Chart of Account Lifecycle service.

Branch presence only means the code is merged. Whether each migration has been
run and the build deployed must be confirmed separately in each environment.
