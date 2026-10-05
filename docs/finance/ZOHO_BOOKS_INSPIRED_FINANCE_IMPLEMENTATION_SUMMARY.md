# Finance Modules — Our Zoho Books-Inspired Design and Current Implementation

## 1. Executive Summary

We have developed a set of finance capabilities inside the existing TeqIT
Inventory application, using Zoho Books only as a functional and UI reference.
This is **not a copy of Zoho Books**, and there is no Zoho Books integration or
data synchronization. Our solution follows TeqIT's existing Customer, Supplier,
Invoice, Bill, Order, Service Request, Bank/Cash, permission, and organization
models.

The implemented finance area contains:

1. Cash and Bank Accounts
2. Transactions
3. Chart of Accounts
4. Customer and Supplier Statements
5. Journals
6. On Account Of

These are connected modules, not six independent accounting databases. A
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
| Cash and Bank Accounts | Maintain TeqIT Bank/Cash accounts, opening/current balances, and real money movements | Core implementation completed |
| Transactions | Combined operational view of posted Bank/Cash movements and their source/allocation details | Implemented for current Cash/Bank transaction types |
| Chart of Accounts | Maintain TeqIT-created accounting posting accounts and view their ledgers | Planned Phases 1–3 completed |
| Customer/Supplier Statements | Show party balances and source transactions without duplicating payments | Core Customer and Supplier statement flows implemented; broader Phase 3 items such as complete export/integration coverage are not declared complete |
| Journals | Show the accounting ledger and support controlled manual non-cash entries | Independent scope implemented; On Account transfer integration remains pending |
| On Account Of | Track Customer/Supplier advances by stable reference and apply them later | Phases 1–8 implemented in source; manual acceptance/release approval remains, while Journal transfer/replacement remains future work |

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
- Organization-scoped unique Account Name and Account Code.
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

Customers and Suppliers are never created from this module. Account editing,
deletion, merging, archiving, and hierarchical grouping are not included in the
completed Chart of Accounts phases unless separately approved later.

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

### 9.5 Remaining On Account work

The following approved Journal-dependent workflow is not yet implemented:

- Transfer an unused Customer On Account amount to another Customer through a
  controlled Journal.
- Prevent transfer beyond the source available amount.
- Track linked transfer-out and transfer-in movements/references.
- If a later destination-Customer payment replaces the transfer, reverse only
  the dependent allocations, restore the original Customer's OA availability,
  and retain the complete history.

Supplier-to-Supplier transfers and mixed Customer/Supplier transfers are not in
the currently approved transfer scope.

## 10. End-to-End Ownership Examples

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

## 11. What We Deliberately Do Not Copy from Zoho Books

Our current solution does not claim feature parity with Zoho Books. In
particular, the approved implementation does not currently include all of the
following Zoho-like capabilities:

- Full hierarchical Chart of Accounts management
- Complete bank statement import, matching, and reconciliation workspace
- General multi-currency and exchange-rate accounting workflow
- Customer portal, email, recurring transaction, retainer, credit-note, and
  every external accounting-product workflow
- Recurring Journals, Journal templates/imports, attachments, or automatic
  reversal schedules
- Arbitrary editing/deletion of posted accounting history
- On Account transfer/replacement workflow described in section 9.5

Any future addition must reuse the existing source records and balanced Journal
ledger rather than introduce a duplicate accounting store.

## 12. Final Current-State Statement

TeqIT's finance implementation is a purpose-built accounting layer inside the
Inventory application. Cash and Bank owns money movement, Transactions provides
the combined operational view, Chart of Accounts owns normal posting ledgers,
Statements report party balances from existing documents and settlements,
Journals record the balanced accounting effect, and On Account Of tracks
unallocated Customer/Supplier advances until they are applied.

The independent Journal workflows and On Account Phases 1–8 exist in source.
The remaining major functional dependency is the controlled Customer-to-
Customer On Account Journal transfer and its later-payment replacement/reversal
workflow.
