# Phase 4: Journal Module Requirements

## 1. Document Purpose

This document defines the Phase 4 requirements for a Journal module that allows
the accounting team to create, review, post, and reverse new accounting
entries, accruals, adjustments, corrections, reclassifications, and approved
On Account Of transfers.

A Journal is not limited to correcting an earlier entry. It may participate in
a business scenario that also has an earlier or later Cash/Bank movement when
the Journal records a distinct accounting event that is not handled by an
existing module. The actual receipt or payment must still be recorded once
through Cash and Bank; the Journal must not duplicate that money movement.

The module must reuse the existing Chart of Accounts, `journal_entries`,
`journal_lines`, and account-ledger mechanisms. It must not create a second
accounting engine or duplicate the financial effects already produced by
Cash and Bank transactions, Invoices, Bills, Customer Receipts, Supplier
Payments, or other source modules.

## 2. Status and Dependencies

| Item | Value |
| --- | --- |
| Delivery phase | Phase 4 |
| Requirement status | BA approved, including Customer-to-Customer On Account Of Journal transfers |
| Implementation status | Independent Journal scope implemented: categorized list, detail, Manual Draft/Edit/Post/Reverse lifecycle, purpose classification, optional structured related-entry linkage, linked reversal/source navigation, activity history, responsive layout, and Admin/Accountant access. On Account Of foundation is owned by its separate feature branch; Journal transfer and dependent reversal remain integration work. |
| Primary dependencies | Chart of Accounts, existing finance journal tables, account ledger, authentication and organization permissions |

Related requirement references:

- [Cash and Bank Account Requirements](../cash-bank-account/CASH_BANK_REQUIREMENTS.md)
- [Chart of Accounts Requirements](../chart-of-account/CHART_OF_ACCOUNT_REQUIREMENTS.md)
- [Phase 3 Customer and Supplier Statement Requirements](../customer-statement/PHASE_3_CUSTOMER_STATEMENT_REQUIREMENTS.md)
- [On Account Of — Reference and Movement Requirement Plan](../cash-bank-account/ON_ACCOUNT_OF_REFERENCE_PLAN.md)

### 1.1 Branch ownership and integration order

The Journal and On Account Of work may be developed in separate feature
branches, but they must not independently create competing On Account tables,
reference formats, balance rules, or allocation logic.

- The **On Account Of branch** owns On Account reference persistence, immutable
  movements, available-balance calculation, Customer/Supplier Cash and Bank
  creation, Invoice/Bill allocation links, locking, and reversal primitives.
- The **Journal branch** owns the Journal header/lines, Draft/Post/Reverse
  lifecycle, Journal permissions, Journal list/detail UI, and the dedicated
  Customer-to-Customer transfer orchestration and UI.
- The Journal branch consumes the On Account service/API contract. It must not
  update `party_unapplied_amounts` or Invoice allocation balances directly.
- Merge the On Account Of foundation first. Rebase the Journal branch onto that
  integration commit, then implement the transfer and later-payment replacement
  orchestration against the finalized contract.
- Until that contract is available, Journal transfer work remains planned and
  feature-gated; ordinary manual Journals must not post to Customer/Supplier
  advance control accounts as a workaround.

Minimum contract required by the Journal branch:

1. Search eligible open Customer On Account references with stable ID, display
   number, Customer, currency, available amount, status, and version.
2. Atomically transfer an amount using source reference/version, destination
   Customer, Journal ID, actor, and idempotency key; return both linked movement
   IDs and the destination reference.
3. Query transfer dependencies, including allocations funded by the transferred
   reference.
4. Atomically reverse/replace a transfer with explicit optimistic-lock and
   idempotency inputs; return restored balances and reversal movement IDs.
5. Return typed errors for insufficient balance, stale version, incompatible
   downstream activity, duplicate request, organization mismatch, and currency
   mismatch.

## 3. Business Understanding

### 3.1 Cash/Bank Transaction

A Cash/Bank transaction is used when money is actually received or paid through
an organization's Bank or Cash account.

Examples include:

- Customer Receipt
- Supplier Payment
- Direct Ledger Entry paid from or received into Bank/Cash
- Approved automatic e-commerce payment posting

These flows already create their required journal effect. The Journal module
must not create another entry for the same financial event.

### 3.2 Invoice or Bill

An Invoice represents an amount receivable from a Customer. A Bill represents
an amount payable to a Supplier. An unpaid Invoice or Bill must not result in a
fake Bank/Cash transaction or an additional manual Journal merely because it
remains outstanding.

The related Customer Receipt or Supplier Payment is recorded only when the
money movement occurs.

### 3.3 Manual Journal

A manual Journal is used for a new accounting entry, accrual, adjustment,
correction, reclassification, or approved party-control transfer that is not
already posted by another source module. The Journal itself may refer to an
earlier or later Cash/Bank event, but it must not create a second copy of the
actual receipt or payment.

Examples include:

- Recording Salary Expense before the salary is paid.
- Moving an amount from Office Expense to Rent Expense after the original Bank
  transaction has already been posted.
- Recording another approved non-cash adjustment between Chart of Accounts
  accounts.
- Transferring an available Customer On Account Of amount to another Customer
  through the dedicated party-transfer Journal workflow.

### 3.4 Reverse Journal

A Reverse Journal cancels the accounting effect of a previously posted manual
Journal by creating a new Journal with the Debit and Credit sides exchanged.
The original Journal remains in history and is linked to the reversal.

### 3.5 Two Distinct Account Sources and Operations (Final Business Model)

The Journal module strictly separates account-based entries from party-based On Account Of movements:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           JOURNAL MODULE WORKSPACE                          │
├───────────────────────────────┬─────────────────────────────────────────────┤
│  A. CHART OF ACCOUNTS         │  B. CUSTOMER / SUPPLIER (ON ACCOUNT OF)     │
│     (Account-Based Journals)  │     (Party Receivable / Payable Movement)   │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ • Accruals / New entries      │ • Customer receivable / on-account movement │
│ • Corrections                 │ • Supplier payable / on-account movement    │
│ • Reclassifications           │ • Customer-to-Customer on-account transfer  │
│ • Non-cash adjustments        │ • Supplier-to-Supplier on-account transfer  │
│ • Selected from active COA    │ • Uses approved party control-accounts      │
│ • No Party selection required │ • Requires Party & On Account Reference     │
│ • NEVER creates Bank movement │ • NEVER creates duplicate "Journal accounts"│
└───────────────────────────────┴─────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  C. REVERSE JOURNAL (Journal Operation)                                     │
│  • Reverses an existing posted Journal by creating a NEW linked Journal.     │
│  • Swaps Debit and Credit lines; original remains immutable in history.     │
│  • Prevents duplicate reversal.                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Important Distinction Rules:

1. **Normal Account-Based Journal:**
   - Customer/Supplier selection is **NOT** required.
   - Lines use active posting accounts from the existing **Chart of Accounts**.
   - Used for accruals (e.g. Salary Expense Dr / Salary Payable Cr) and reclassifications (e.g. Salary Expense Dr / Rent Expense Cr).
2. **On Account Of:**
   - Customer/Supplier party selection **IS** required.
   - Operates through the approved Customer/Supplier receivable/payable **control-account mechanism** and On Account references.
   - Do **NOT** create separate "Journal accounts" for Customers or Suppliers.
   - Do **NOT** treat Customers or Suppliers as normal Chart of Accounts dropdown items.
3. **Reverse Journal:**
   - Not an account source, but an atomic operation on an eligible posted Journal.
   - Creates a **NEW** linked Journal with opposite Debit/Credit sides and preserves the original record unchanged.

## 4. Scope

### 4.1 Included

1. A permission-controlled Journal workspace.
2. A Journal list with search, filters, pagination, source, status, and totals.
3. Read-only details for existing system-generated and manual Journal entries.
4. Creation and editing of manual Journal drafts.
5. Two or more Journal lines using active Chart of Accounts records.
6. Debit and Credit validation on every line.
7. Draft and Post actions.
8. Transactional posting to the existing accounting ledger.
9. Reversal of an eligible posted manual Journal.
10. Original-to-reversal traceability.
11. Organization isolation, permissions, audit fields, and concurrency controls.
12. Immediate visibility of posted and reversed effects in the existing Chart
    of Accounts ledger and totals.
13. Customer-to-Customer transfer of an unused On Account Of amount through a
    dedicated party-aware Journal.
14. Source and destination On Account Reference traceability.
15. Controlled reversal of the transfer and its dependent Invoice allocations
    when a later Customer payment replaces the transferred amount.

### 4.2 Excluded

The following are not part of this phase unless separately approved:

- Creating or editing Bank/Cash transactions from the Journal module.
- General-purpose allocation of an ordinary manual Journal against Customer
  Invoices or Supplier Bills. The approved On Account Of transfer uses the
  normal On Account allocation flow after transfer and supports only the
  explicitly defined dependent reversal.
- TDS selection or TDS allocation in a manual Journal.
- Creating Customers or Suppliers as Chart of Accounts records.
- Duplicating an Invoice, Bill, Customer Receipt, Supplier Payment, Direct
  Ledger Entry, or e-commerce posting.
- Reversing a system-generated Journal independently of its source transaction.
- Editing or deleting a posted Journal.
- Editing or deleting a posted reversal.
- Recurring Journals, Journal templates, approval workflows, attachments, or
  scheduled auto-reversal.
- Multi-currency conversion or exchange gain/loss calculations.
- Backdated-period locking or financial-year closing rules unless a common
  finance period-control mechanism is separately approved.
- Parent/child Chart of Accounts hierarchy, tree display, test-account cleanup,
  or historical account migration.
- Importing Journals from spreadsheet or another accounting system.
- Cross-organization On Account transfers, Customer-to-Supplier transfers, and
  Supplier-to-Customer transfers.

## 5. Core Principles

### 5.1 Single Accounting Source of Truth

| Business information | Source of truth |
| --- | --- |
| Accounting account | Existing `finance_accounts` record |
| Account type catalogue | Existing `finance_account_types` master |
| Journal header | Existing `journal_entries` mechanism |
| Journal line | Existing `journal_lines` mechanism |
| Account ledger and totals | Existing posted Journal-line queries |
| Cash/Bank movement | Existing Cash and Bank transaction workflow |
| Customer/Supplier balance | Existing Invoice, Bill, allocation, and settlement workflow |

The Journal module is an additional controlled entry point into the existing
accounting ledger. It is not a separate ledger.

### 5.2 Double-Entry Accounting

For every posted Journal:

```text
Total Debit = Total Credit
```

The Journal must contain at least two valid lines. A line must contain either a
positive Debit or a positive Credit, but never both.

### 5.3 No Duplicate Financial Posting

The user must not create a manual Journal when the accounting effect belongs to
another supported source workflow.

Examples:

| Scenario | Correct workflow |
| --- | --- |
| Customer pays an Invoice | Customer Receipt in Cash and Bank |
| Company pays a Supplier Bill | Supplier Payment in Cash and Bank |
| Rent is paid directly from Bank | Direct Ledger Entry in Cash and Bank |
| Customer Invoice remains unpaid | No additional Journal; keep the Invoice outstanding |
| Salary expense is recognized before payment | Manual Journal |
| Existing expense was classified to the wrong COA account | Manual Journal reclassification |
| Texve On Account is temporarily transferred to Clouddesk | Dedicated On Account Of Journal Transfer |
| Clouddesk later pays through Bank | Customer Receipt recorded once in Cash and Bank, followed by the linked transfer-replacement reversal workflow |

### 5.4 Actual Posting Accounts

Journals must use the existing Chart of Accounts and must post only to actual
active posting accounts. The Journal module must not create a separate account
catalogue.

Parent, group, category, or main-heading records are display/aggregation nodes
and are never valid Journal posting targets. If the current Chart of Accounts
is flat, every eligible record must still represent a real posting account.

The dedicated On Account Of transfer is the only approved Phase 4 exception to
the general system-account restriction. It may use approved party control
accounts, but each line must also carry the correct Customer/Supplier and On
Account Reference so the control-account total and party subledger reconcile.

### 5.5 Organization Isolation

Every Journal header, Journal line, account lookup, list, detail, post, and
reversal operation must be restricted to the authenticated user's organization.
An ID from another organization must be treated as unavailable.

### 5.6 Posted History Is Immutable

After posting, a Journal's date, description, reference, accounts, Debit
amounts, and Credit amounts must not be edited or deleted. A correction must be
made through a linked Reverse Journal and, when required, a new correct Journal.

## 6. Journal Workspace

### 6.1 Navigation

Add a dedicated **Journals** item under the existing Finance navigation and
permission structure.

The Journal workspace must provide:

- Journal list
- Create Journal action
- Journal detail view
- Edit Draft action for eligible manual drafts
- Post action for eligible manual drafts
- Reverse action for eligible posted manual Journals

### 6.2 Journal List

The Journals list workspace is dedicated exclusively to Manual Journals (Drafts,
Posted, Reversed, and Reversals). Normal system-generated transactions (Cash/Bank,
Invoices, Bills, Customer Receipts, Supplier Payments) are managed within their
respective transaction modules.

The UI displays the active manual journal workspace with focused search and status filters:

1. **Manual Journals Workspace** — list of manual Draft, Posted, Reversed, and
   Reversal Journals.
2. **Search and Filters** — filter by search term, status (`draft`, `posted`,
   `reversed`), source type, or "Created by Me".

Required columns:

| Column | Description |
| --- | --- |
| Journal Number | System-generated unique Journal reference |
| Entry Date | Accounting date of the Journal |
| Reference | Optional user reference for a manual Journal, or source reference when available |
| Description | Journal narration or description |
| Source | Manual Journal, Cash/Bank, Customer Receipt, Supplier Payment, e-commerce, opening balance, or another supported source |
| Total Debit | Sum of Journal Debit lines |
| Total Credit | Sum of Journal Credit lines |
| Status | Draft, Posted, Reversed, or Reversal |
| Created By | User or system actor that created the Journal |
| Posted By | User or system actor that posted the Journal, when applicable |

Manual Journals must provide a server-side **Created by Me** filter using the
authenticated actor. System-generated rows should show their source reference
when available and provide **Open Source** navigation to the owning module. They
must not expose direct manual Edit, Post, or Reverse actions.

The Source label must be derived from the stored source type through a
controlled mapping. Raw database values must not be shown directly to users.

### 6.3 Search and Filters

The list must support:

- Search by Journal Number, Reference, or Description.
- Date From and Date To.
- Status.
- Source.
- Category: Manual, System-Generated, or All.
- Created by Me for Manual Journals.
- Account, using an active or historical Chart of Accounts lookup as
  appropriate.
- Common server-side pagination and sorting.

The default sort order must be Entry Date descending, followed by Journal ID
descending so results remain deterministic when dates are equal.

### 6.4 Journal Detail

The detail view must show:

- Journal Number
- Entry Date
- Reference
- Description
- Source and source reference
- Status
- Created By and Created Date
- Posted By and Posted Date
- Reversed By and Reversed Date, when applicable
- Original Journal link, when the current record is a reversal
- Reversal Journal link, when the current record has been reversed
- All account lines
- Total Debit and Total Credit

Line columns:

| Column | Description |
| --- | --- |
| Account | Account Code and Account Name |
| Description | Optional line narration |
| Debit | Debit amount or blank |
| Credit | Credit amount or blank |

## 7. Create Manual Journal

### 7.1 Header Fields

| Field | Required | Rule |
| --- | --- | --- |
| Entry Date | Yes | Valid business date; stored as a date without unintended timezone conversion |
| Journal Purpose | Yes | General Entry, Accrual/New Entry, Reclassification, or Correction |
| Reference | No | Trimmed free text; used for an external or internal supporting reference |
| Description | Yes | Trimmed Journal narration; must not be blank |
| Related Accounting Entry | Conditional | Structured link to an eligible posted Journal entry; required for Reclassification and Correction, optional for General Entry, and not used for a standalone Accrual/New Entry |

The Journal Number, status, created user, created date, posted user, and posted
date are system-controlled and must not be manually entered.

The Related Accounting Entry selector searches the posted accounting ledger by
Journal number, source transaction number, reference, description, and account.
It stores the related Journal entry ID rather than copying display text. The
source must belong to the same organization, remain posted, and not already be
reversed when the Draft is saved and again when it is posted. Selecting a source
does not modify that entry and does not automatically copy or reverse its lines.
For the independent Journal scope, the selector includes only entries containing
at least one eligible normal Chart of Accounts posting line. System-only
E-commerce, Customer/Supplier control-account, and On Account Of entries are not
offered through this generic correction/reclassification lookup.

### 7.2 Journal Lines

Each persisted line must contain:

| Field | Required | Rule |
| --- | --- | --- |
| Account | Yes | Eligible account from the current organization |
| Description | No | Optional trimmed line narration |
| Debit | Conditional | Positive amount when Credit is empty/zero |
| Credit | Conditional | Positive amount when Debit is empty/zero |
| On Account Of | Conditional | Required for an approved party-control transfer; structured Customer/Supplier relationship, never free text |
| On Account Reference | Conditional | Required source or destination reference for an On Account Of transfer |

The form must:

- Start with at least two line rows.
- Allow the user to add and remove rows.
- Keep at least two persisted valid lines before posting.
- Show running Total Debit, Total Credit, and Difference.
- Format monetary values to two decimal places.
- Prevent negative values.
- Prevent both Debit and Credit on one line.
- Prevent a line with both Debit and Credit empty or zero from being persisted.
- Require party type, party ID, and On Account Reference on every dedicated On
  Account Of transfer line.
- Validate that the selected control account is compatible with the party type:
  Customer-related lines use Accounts Receivable/Customer Advances as approved;
  Supplier-related lines use Accounts Payable/Supplier Advances as approved.

Running calculation:

```text
Difference = Total Debit - Total Credit
```

The form is balanced only when Difference is `0.00` and both totals are greater
than zero.

### 7.3 Account Selection

The Account selector must:

- Load eligible active Chart of Accounts records for the current organization.
- Be searchable by Account Name and Account Code.
- Show Account Code, Account Name, Account Type, and Category.
- Exclude Customers and Suppliers maintained in their separate party masters.
- Exclude Bank/Cash ledgers and other system-only accounts that would represent
  an actual money movement or are not approved for manual posting.
- Allow only the explicitly approved party control accounts in the dedicated On
  Account Of transfer workflow; do not expose those accounts to unrestricted
  ordinary manual Journals.
- Reject an inactive, missing, cross-organization, or otherwise ineligible
  account during backend validation even if an old browser value is submitted.
- Exclude parent/group/main-heading accounts and accept only real posting
  accounts.

The same eligible account may appear on more than one line only when there is a
valid accounting reason. The backend must aggregate all lines when checking the
Journal totals, but it must preserve the entered lines for audit history.

### 7.4 Current Flat Chart of Accounts

The approved Chart of Accounts requirement currently uses a flat account list
and excludes parent/child hierarchy. Phase 4 must therefore operate on eligible
posting accounts in that current flat structure.

If a parent/child Chart of Accounts enhancement is approved later:

- Parent/group accounts must not be selectable for posting.
- Only active leaf/posting accounts may be used.
- Existing Journal history must continue to display the account information
  that applied when the Journal was posted.

The hierarchy redesign, cleanup of test accounts, and historical migration are
separate requirements and must not be implicitly added to Phase 4.

## 8. Draft Behaviour

### 8.1 Save as Draft

A manual Journal may be saved as Draft before it is ready to affect the ledger.

For Draft save:

- Entry Date and Description are required.
- Every persisted line must have an eligible Account and exactly one positive
  Debit or Credit amount.
- At least two valid lines are required.
- A Draft may be unbalanced so work can be completed later.
- A Draft must not affect account ledgers, account totals, Cash/Bank balances,
  Receivables, or Payables.

### 8.2 Edit Draft

An authorized user may edit the header and lines of a manual Draft belonging to
the current organization.

The backend must apply optimistic concurrency or an equivalent last-updated
check so one user's changes do not silently overwrite another user's changes.

### 8.3 Delete Draft

Draft deletion is not included in Phase 4. If this action is later approved, it
must be permission-controlled and audit logged.

## 9. Post Journal

### 9.1 Posting Preconditions

Posting is allowed only when:

1. The Journal is a manual Draft in the current organization.
2. The user has Journal Post permission.
3. Entry Date and Description are valid.
4. At least two valid Journal lines exist.
5. Every selected account is eligible and active at posting time.
6. Every line contains either Debit or Credit, but not both.
7. Total Debit is greater than zero.
8. Total Credit is greater than zero.
9. Total Debit equals Total Credit exactly at two-decimal currency precision.
10. The Journal has not already been posted or reversed by another request.

### 9.2 Posting Behaviour

Posting must occur in one database transaction:

1. Lock or otherwise protect the Draft from concurrent posting.
2. Revalidate the Journal header, lines, accounts, organization, and totals.
3. Assign the system-generated Journal Number if it was not assigned earlier.
4. Set status to Posted.
5. Store Posted By and Posted Date.
6. Commit the header and all lines atomically.
7. Make the lines available to the existing account-ledger and total queries.
8. Write the audit event.

If any step fails, the entire operation must roll back. No partial Journal or
partial ledger effect may remain.

### 9.3 Journal Number

The Journal Number must be unique and system-generated using the existing
finance convention. The current convention is equivalent to:

```text
JE-00000001
```

The backend is the authority for number generation. A client-supplied Journal
Number must be ignored or rejected.

### 9.4 Idempotency and Concurrency

Repeated submission of the same Post request must not create two posted
Journals. Concurrent Post requests for one Draft must result in one successful
posting and one safe already-processed response or business error.

## 10. Reverse Journal

### 10.1 Eligible Journal

A Journal may be reversed from this module only when all of the following are
true:

- It is a posted manual Journal.
- It belongs to the current organization.
- It has not already been reversed.
- It is not itself a reversal.
- The user has Journal Reverse permission.

A system-generated Journal must be corrected or reversed through its owning
source workflow. The Journal workspace must not independently reverse it.

### 10.2 Reversal Input

The Reverse action must require:

| Field | Required | Rule |
| --- | --- | --- |
| Reversal Date | Yes | Valid business date |
| Reversal Reason | Yes | Trimmed text; must not be blank |

The user must not manually edit the copied accounts or reversal amounts.

### 10.3 Reversal Accounting

For each original line, create a reversal line using the same account and
opposite side:

```text
Reversal Debit  = Original Credit
Reversal Credit = Original Debit
```

Example:

#### Original Journal

| Account | Debit | Credit |
| --- | ---: | ---: |
| Rent Expense | 10,000.00 |  |
| Office Expense |  | 10,000.00 |

#### Reverse Journal

| Account | Debit | Credit |
| --- | ---: | ---: |
| Office Expense | 10,000.00 |  |
| Rent Expense |  | 10,000.00 |

### 10.4 Reversal Posting Behaviour

Reversal must occur in one database transaction:

1. Lock and revalidate the original Journal.
2. Create a new posted Journal with a new Journal Number.
3. Copy each original line with Debit and Credit exchanged.
4. Store the Reversal Date and Reversal Reason.
5. Link the reversal to the original through `reversalofid` or the approved
   equivalent relationship.
6. Mark the original as reversed for user-facing status without removing its
   historical accounting lines from ledger calculation.
7. Store the reversing user and timestamp in the audit trail.
8. Commit the original status/link and reversal Journal atomically.

### 10.5 Ledger Treatment of Reversal

The original posted lines and the posted reversal lines must both remain in
ledger history. Their combined net accounting effect is zero.

This requirement is important because existing account-ledger queries currently
use posted Journal status. An implementation must not mark the original as
`reversed` and then exclude it from ledger totals while still including the
reversal; that would create an incorrect opposite balance.

The implementation must use one consistent approach, such as:

- Keep the original accounting status Posted and derive a separate display
  status of Reversed from its linked reversal; or
- Store status as Reversed but update all ledger and total queries to include
  valid original reversed Journals together with their posted reversals.

Whichever approach is chosen, the following must be true:

```text
Original accounting effect + Reversal accounting effect = 0
```

### 10.6 Reversal Concurrency

Two concurrent reversal requests for the same original Journal must never
create two reversals. The database and service must enforce a single valid
reversal relationship for an original Journal.

### 10.7 Dependent Reversal for an On Account Of Transfer

An On Account Of transfer may have downstream Invoice allocations. Reversing
only its Debit and Credit lines would leave the Customer subledgers and Invoice
balances incorrect. The dedicated reversal must therefore reverse the complete
linked effect.

The replacement/reversal action must:

1. Identify the original transfer Journal, source Customer and On Account
   Reference, destination Customer and transferred On Account Reference, and
   every downstream allocation funded by that transfer.
2. Confirm that the later Bank receipt belongs to the destination Customer and
   has created a separate available On Account Of amount sufficient for the
   intended replacement. An unrelated Customer payment must not automatically
   reverse a transfer.
3. Lock the transfer references, allocation links, affected Invoices, later
   payment reference, and original Journal.
4. Reverse/un-clear only the Invoice settlements funded by the transferred
   reference, restoring their balances and statuses.
5. Restore the transferred amount to the destination reference temporarily,
   then create the linked opposite Journal that moves it back to the source
   Customer.
6. Restore the source Customer's available On Account Of balance.
7. Leave the destination Customer's later Bank-origin On Account Of amount
   available for normal allocation.
8. Leave all original Transactions, Journals, movements, and allocations in
   history with explicit reversal links; do not delete or rewrite them.
9. Post the dependent allocation reversals, On Account movements, opposite
   Journal, document balance/status updates, and audit events atomically.

If any linked Invoice or On Account balance has changed in a way that prevents
safe reversal, the action must fail without partial changes and explain which
dependency requires Finance review.

## 11. Accounting Examples

### 11.1 Salary Accrual Before Payment

The company recognizes Salary Expense of ₹30,000 before the salary is paid.

#### Manual Journal

| Account | Debit | Credit |
| --- | ---: | ---: |
| Salary Expense | 30,000.00 |  |
| Salary Payable |  | 30,000.00 |

No Bank/Cash balance changes at this stage.

Later, when the salary is actually paid, use the existing Cash and Bank Direct
Ledger workflow:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Salary Payable | 30,000.00 |  |
| Selected Bank Account |  | 30,000.00 |

The Journal and the payment are two different financial events.

### 11.2 Expense Reclassification

An amount of ₹10,000 was already paid from Bank and incorrectly classified as
Office Expense. It should be Rent Expense.

The Bank movement must not be posted again. Create this manual Journal:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Rent Expense | 10,000.00 |  |
| Office Expense |  | 10,000.00 |

The Bank balance remains unchanged while the expense classification is
corrected.

### 11.3 Unpaid Customer Invoice

A Customer Invoice of ₹2,00,000 remains unpaid.

Required behaviour:

```text
Invoice remains outstanding
        ↓
No fake Bank/Cash transaction
        ↓
No duplicate manual Journal
        ↓
Record Customer Receipt only when payment occurs
```

### 11.4 Reverse an Incorrect Reclassification

If the reclassification in section 11.2 was posted incorrectly, reverse it:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Office Expense | 10,000.00 |  |
| Rent Expense |  | 10,000.00 |

The original and reverse Journals remain visible and linked.

### 11.5 Customer-to-Customer On Account Of Transfer

Customer **Texve** has an unused On Account Of balance of `₹1,00,000`.
Finance transfers the full amount to **Clouddesk** through the dedicated Journal
transfer workflow.

Required transfer relationships:

```text
Texve On Account Reference
        ↓ decrease ₹1,00,000
Transfer Journal
        ↓ increase ₹1,00,000
Clouddesk Transferred On Account Reference
```

Party-subledger Journal:

| Account and party | Debit | Credit |
| --- | ---: | ---: |
| Customer Advances — Texve | 1,00,000.00 | 0.00 |
| Customer Advances — Clouddesk | 0.00 | 1,00,000.00 |

The general-ledger control account nets to zero, while ownership moves between
the two Customer subledgers. The transfer amount cannot exceed Texve's unused
available balance. Clouddesk may then use the transferred reference through the
normal On Account Of allocation flow to clear its eligible Invoices.

#### Later Clouddesk payment and transfer replacement

Clouddesk later pays `₹1,00,000` through Bank.

1. Record the Bank receipt once against Clouddesk and create a new Bank-origin
   Clouddesk On Account Reference.
2. Use the explicit **Replace Transfer With Payment** action to select the
   earlier transfer. Do not reverse it merely because any payment was received.
3. Reverse/un-clear the Clouddesk Invoice allocations funded by the transferred
   reference.
4. Create the opposite transfer Journal:

| Account and party | Debit | Credit |
| --- | ---: | ---: |
| Customer Advances — Clouddesk transferred reference | 1,00,000.00 | 0.00 |
| Customer Advances — Texve restored reference | 0.00 | 1,00,000.00 |

5. Texve again has `₹1,00,000` available and may allocate it against Texve's
   Invoices through the normal flow.
6. Clouddesk's new Bank-origin `₹1,00,000` remains available for Clouddesk and
   may be applied separately against its Invoices.

The Bank receipt, transfer reversal, allocation reversal, and any later
reapplication are distinct traceable financial events. No second Bank receipt
is created.

## 12. Backend Requirements

The backend must provide operations equivalent to:

- List Journals with server-side filters, sorting, and pagination.
- Get one Journal with its lines, totals, source, audit information, and
  reversal relationships.
- Get eligible accounts for manual Journal posting.
- Create a manual Journal Draft.
- Update a manual Journal Draft.
- Post a manual Journal Draft.
- Reverse an eligible posted manual Journal.
- Search eligible source and destination Customers and On Account References
  for the dedicated transfer workflow.
- Create and post a Customer-to-Customer On Account Of transfer Draft.
- Replace a linked transfer with a later destination-Customer payment and
  reverse its dependent Invoice allocations safely.

Exact routes may follow existing Finance module conventions. Responses must use
the project's standard success, validation-error, authorization-error, and
not-found formats.

### 12.1 Source Type

Manual Journals must use a dedicated, stable source type such as
`manual_journal`. It must not reuse `bank_transaction` or another source type
owned by an existing workflow.

On Account Of transfer Journals must use a separate controlled source type such
as `on_account_transfer`. A transfer-reversal Journal must link to both the
original transfer Journal and the approved replacement/payment workflow.

For a manual Journal, `sourceid` must follow one documented, self-consistent
model. If the current schema requires a non-null source ID, the implementation
may use the manual Journal's own stable record/header ID or add a suitable
nullable/manual-source design through an approved migration. The service must
not store an unrelated or fabricated business-record ID.

### 12.2 Monetary Precision

- Store amounts using the existing `NUMERIC(18, 2)` finance precision.
- Perform equality validation using decimal arithmetic, not binary floating
  point.
- Reject values with more than two effective decimal places unless the common
  finance input layer safely rounds them under an approved rule.
- Do not silently convert a negative Debit into a Credit or a negative Credit
  into a Debit.

### 12.3 Query Behaviour

- Draft Journals must not appear in account-ledger totals.
- Posted manual Journals must appear exactly once in each affected account
  ledger.
- Original and reversal lines must both appear in chronological history.
- Ledger totals must apply the reversal rule in section 10.5.
- Journal list totals must be calculated from all lines, not only the visible
  page or a partial join.
- Pagination must not duplicate Journals because of line joins.

## 13. Conceptual Data Requirements

The existing finance journal tables should be reused where they satisfy these
requirements. Any migration must be additive, idempotent, and safe for existing
system-generated Journals.

### 13.1 Journal Header

Required conceptual values:

- ID
- Organization ID
- Journal Number
- Entry Date
- Source Type
- Source ID or approved manual-source relationship
- Optional manual Reference
- Status
- Description
- Reversal Of ID
- Created By and Created Date
- Posted By and Posted Date
- Last Updated By, Last Updated Date, or concurrency version for Draft editing

If Reference, update metadata, or another required value does not exist in the
current table, add it through the Phase 4 database migration rather than
overloading Description or another unrelated field.

### 13.2 Journal Line

Required conceptual values:

- ID
- Journal Entry ID
- Finance Account ID
- Debit Amount
- Credit Amount
- Optional Description
- Created Date
- Stable line order for consistent display
- Party Type and Party ID when the line is party-related
- On Account Reference ID when the line increases, decreases, transfers, or
  reverses an On Account Of amount
- Transfer role such as Source, Destination, or Reversal when applicable

If stable line order is not already guaranteed, add an explicit line sequence.

### 13.3 Constraints and Indexes

The database design must support or enforce:

- Unique Journal Number.
- Organization-scoped Journal list by Entry Date and ID.
- Efficient lookup of lines by Journal Entry ID.
- Efficient account-ledger lookup by Finance Account ID and Journal Entry ID.
- Only one valid reversal for an original Journal.
- No self-reversal relationship.
- No cross-organization reversal relationship.
- No Journal line with both Debit and Credit positive.
- No Journal line with both Debit and Credit zero.
- Foreign-key protection for referenced accounts and Journal relationships.
- Foreign-key or equivalent validated protection for source/destination On
  Account References and party relationships.
- Only one active replacement/reversal chain for one transfer Journal.
- No transfer amount greater than the source reference's available amount.
- No source and destination Customer being the same.
- No cross-organization or currency-mismatched transfer.

Balanced totals require transaction-level validation and should also use a
database-safe enforcement strategy where practical.

## 14. Permissions

### 14.1 Approved role access

The organization's **Admin** and **Accountant** roles have full access to the
Journal module. For both roles, full access includes list, detail, create, edit
Draft, Post, Reverse, Customer On Account Transfer, and Replace Transfer With
Payment actions.

This role rule does not weaken tenant boundaries or business validation. Every
request must still be restricted to the authenticated user's organization and
must satisfy Journal status, balance, reference, allocation, concurrency, and
reversal rules. Users outside the Admin and Accountant roles have no Journal
access unless a later approved role mapping explicitly grants it.

### 14.2 Permission capabilities

Use dedicated Journal permissions equivalent to:

| Permission | Allows |
| --- | --- |
| Journal Read | List and view Journal details |
| Journal Create | Create a manual Draft |
| Journal Edit | Edit a manual Draft |
| Journal Post | Post a balanced manual Draft |
| Journal Reverse | Reverse an eligible posted manual Journal |
| Journal On Account Transfer | Transfer an available amount between approved Customer On Account References |
| Journal Transfer Replacement | Reverse a linked transfer and its dependent allocations after a later destination-Customer payment |

Permissions must be enforced by both frontend action visibility and backend
authorization. Admin and Accountant must receive all listed capabilities;
hiding a button is not sufficient security.

## 15. Validation and Error Handling

### 15.1 Required Validations

The backend must reject:

- Missing or invalid Entry Date.
- Blank Description.
- Fewer than two valid lines.
- Missing or ineligible Account.
- Cross-organization Account or Journal IDs.
- Inactive account at posting time.
- A line with both Debit and Credit entered.
- A line with neither Debit nor Credit entered.
- Zero or negative amount.
- Amount with invalid precision.
- An unbalanced Post request.
- Editing or posting a Journal that is not a manual Draft.
- Editing a posted or reversed Journal.
- Reversing a Draft, system-generated Journal, reversal Journal, or already
  reversed Journal.
- A blank Reversal Reason.
- Duplicate concurrent Post or Reverse processing.
- Missing or invalid source/destination Customer or On Account Reference.
- Source and destination Customer being the same.
- Transfer amount greater than the source unused On Account Of balance.
- A party-control account incompatible with the selected party type.
- A parent/group/main-heading account.
- An automatic transfer reversal triggered by an unrelated payment.
- A dependent reversal when linked allocation or document state cannot be
  restored safely.

### 15.2 Required Business Errors

Use clear business messages equivalent to:

- `At least two Journal lines are required.`
- `Enter either Debit or Credit for each line.`
- `Debit and Credit cannot both be entered on the same line.`
- `Total Debit must equal Total Credit before posting.`
- `The selected account is not available for manual Journal posting.`
- `Only a manual Draft can be edited or posted.`
- `This Journal has already been posted.`
- `This Journal cannot be reversed from the Journal module.`
- `This Journal has already been reversed.`
- `The Journal changed after you opened it. Refresh and try again.`

Raw SQL errors, stack traces, internal table names, and cross-organization
record details must not be exposed to the user.

## 16. Audit Requirements

Audit events must be written for:

- Manual Draft creation.
- Manual Draft update.
- Manual Journal posting.
- Manual Journal reversal.
- Failed or rejected Post and Reverse attempts when required by the common
  audit policy.

Audit information must identify:

- Organization
- Journal ID and Journal Number, when assigned
- Action
- Acting user or system actor
- Timestamp
- Before and after values for Draft updates, where supported
- Original and reversal Journal IDs for a reversal
- Reversal Reason

Posted accounting history and audit history must not be physically deleted by
normal module operations.

## 17. UI and UX Requirements

- Use existing Finance page, form, table, date, amount, search, pagination,
  loading, empty, error, and success patterns.
- Clearly distinguish Draft, Posted, Reversed, and Reversal statuses.
- Keep Debit and Credit columns aligned and easy to scan.
- Show Total Debit, Total Credit, and Difference while editing.
- Disable Post until client-side checks pass, while always repeating validation
  on the backend.
- Display field-level or line-level validation beside the relevant input.
- Warn the user before the irreversible Post action.
- Warn the user before creating a Reverse Journal and show the original totals.
- Do not show Edit on posted Journals.
- Do not show Reverse on system-generated Journals, Drafts, reversal Journals,
  or already reversed Journals.
- Use `—` for missing optional display values instead of `null`, `false`, or
  `undefined`.
- Preserve user-entered Draft values when a recoverable validation error occurs.

## 18. Acceptance Criteria

1. An authorized user can open a dedicated Journal workspace.
2. The list shows manual and existing system-generated Journals without
   duplicating records because of their lines.
3. An authorized user can create a manual Draft with at least two valid lines.
4. A Draft does not affect the existing Chart of Accounts ledger or totals.
5. An authorized user can edit an eligible manual Draft.
6. The Account selector shows only eligible accounts from the current
   organization.
7. Customers, Suppliers, Bank/Cash ledgers, and system-only accounts are not
   incorrectly available for ordinary manual Journal posting; approved party
   control accounts and Customer selectors appear only in the dedicated On
   Account Of transfer workflow.
8. A line cannot contain both Debit and Credit.
9. A line cannot contain a zero or negative posting amount.
10. An unbalanced Journal cannot be posted.
11. A balanced manual Journal is posted atomically with a unique Journal Number.
12. Posted lines appear exactly once in the affected existing account ledgers
    and totals.
13. Posting a manual Journal does not change a Bank/Cash balance.
14. Posting an ordinary manual Journal does not independently change Invoice,
    Bill, Receivable, Payable, allocation, or TDS records. The dedicated On
    Account Of transfer/replacement workflow changes only its explicitly linked
    party balances and dependent allocations.
15. A posted Journal cannot be edited or deleted.
16. An eligible posted manual Journal can be reversed once.
17. A reversal creates a new posted Journal with the original Debit and Credit
    values exchanged.
18. The original and reversal Journals link to each other and remain visible.
19. The original and reversal accounting effects net to zero in every affected
    account ledger.
20. A system-generated Journal cannot be independently reversed from this
    workspace.
21. Duplicate concurrent Post requests do not create duplicate Journals.
22. Duplicate concurrent Reverse requests do not create duplicate reversals.
23. All Journal operations enforce organization isolation and backend
    permissions.
24. Search, date, status, source, account filters, sorting, and pagination work
    without incorrect totals.
25. Audit events identify the acting user and relevant Journal relationships.
26. A Customer-to-Customer transfer cannot exceed the source Customer's unused
    On Account Of balance.
27. The transfer creates linked decrease/increase movements and a balanced
    party-aware Journal without changing Bank/Cash.
28. The destination Customer may allocate the transferred reference to its own
    eligible Invoices only.
29. A later destination-Customer Bank payment creates a separate On Account
    Reference and does not automatically reverse an unrelated transfer.
30. The explicit replacement action reverses the transfer-funded Invoice
    allocations, restores the source Customer balance, and retains the later
    payment for the destination Customer.
31. Original and reversal Transactions, Journals, allocations, and movements
    remain visible and linked.
32. Admin and Accountant users can perform every Journal action permitted by
    the record's current state; other roles are denied unless explicitly added
    by a later approved role mapping.

## 19. Minimum Test Scenarios

1. Create and save a balanced manual Draft.
2. Create and save an unbalanced Draft and verify no ledger effect.
3. Edit a manual Draft and verify optimistic concurrency behaviour.
4. Reject a Draft line with both Debit and Credit.
5. Reject a Draft line with neither Debit nor Credit.
6. Reject zero, negative, and over-precision amounts.
7. Reject fewer than two valid lines.
8. Reject an inactive, Bank/Cash, system-only, or cross-organization account.
9. Reject posting an unbalanced Draft.
10. Post a balanced Salary Expense / Salary Payable Journal.
11. Verify both affected account ledgers and totals after posting.
12. Verify that Cash/Bank balances remain unchanged after manual Journal post.
13. Verify that Invoice, Bill, Receivable, and Payable values remain unchanged.
14. Send two concurrent Post requests and verify one Journal effect.
15. Reverse a posted manual Journal and verify copied opposite lines.
16. Verify original and reversal links in both detail views.
17. Verify the original plus reversal net to zero in ledger totals.
18. Reject a second reversal of the same original Journal.
19. Reject reversing a Draft.
20. Reject reversing a reversal Journal.
21. Reject independently reversing a system-generated Journal.
22. Verify Journal list pagination does not duplicate headers with multiple
    lines.
23. Verify filters and totals against Journals with two and more than two lines.
24. Verify same-date deterministic ordering.
25. Verify Entry Date is not shifted by timezone conversion.
26. Verify all permissions independently at the backend.
27. Verify organization isolation for list, detail, account lookup, edit, post,
    and reversal.
28. Verify transaction rollback when one line insert, posting update, or audit
    write fails.
29. Transfer `₹1,00,000` from Texve's available On Account Reference to
    Clouddesk and verify both party balances and the net-zero control account.
30. Reject a transfer greater than Texve's available unused amount.
31. Reject same-Customer, cross-organization, currency-mismatched, and
    unauthorized party transfers.
32. Allocate the transferred Clouddesk reference across one and multiple
    Clouddesk Invoices and preserve reference-level traceability.
33. Record a later Clouddesk Bank receipt and verify it creates a separate
    Clouddesk On Account Reference.
34. Replace the earlier transfer with that payment, un-clear only the Invoices
    funded by the transfer, restore Texve's balance, and retain Clouddesk's new
    Bank-origin balance.
35. Reject dependent reversal when a linked allocation has an incompatible
    later change; verify complete rollback.
36. Send concurrent transfer and replacement requests and verify idempotent,
    single effects.
37. Verify both Admin and Accountant can list, view, create, edit Drafts, Post,
    Reverse, transfer On Account Of, and replace a transfer with a payment.
38. Verify an unapproved role cannot access Journal APIs or actions.

## 20. BA Approval and Remaining Implementation Decisions

The BA-approved business direction includes:

- Journals may create new entries such as Salary accruals and are not limited to
  corrections.
- Actual Bank/Cash receipts and payments remain owned by Cash and Bank, while a
  Journal may record a distinct related accounting event without duplication.
- Reversal creates a new linked Journal and preserves the original.
- Journals reuse existing actual posting accounts and never post to group/main
  headings.
- Draft and Post are distinct states; **Post** is the approved system term for
  publish.
- Customer-to-Customer On Account Of transfer and the linked later-payment
  replacement/reversal workflow are approved requirements.
- Admin and Accountant roles have full Journal module access, including On
  Account transfer and replacement/reversal actions.

The following implementation decisions remain and must not change the approved
business outcomes:

1. Whether an unbalanced Journal may be saved as Draft. This document currently
   allows it but requires balance before Post.
2. The exact list of system or restricted accounts excluded from manual posting.
3. Whether the Journal list should show all system-generated Journals or only
   manual Journals. This document currently shows all for audit but permits
   write actions only on manual Journals.
4. Whether manual Journal Reference must be unique, optional, or required for
   specific organizations.
5. Whether attachments, recurring Journals, templates, imports, or automatic
   reversal dates are required in a future phase. Admin and Accountant access
   is already confirmed and is not an open decision.
6. Whether the organization already has a financial-period lock that must be
   applied to Entry Date and Reversal Date.

Implemented lifecycle decision: the original Journal retains stored status
`posted` so the ledger continues to include its lines, while the linked opposite
Journal also remains `posted`. The API derives the original's displayed
`Reversed` state from the reversal link; together both Journals net to zero.

## 21. Definition of Done

Phase 4 is complete when:

- Approved database migrations are applied safely and idempotently.
- Backend list, detail, account lookup, Draft, Post, and Reverse operations are
  implemented with permissions and organization isolation.
- Frontend Journal list, form, detail, posting, and reversal flows are complete.
- Posted and reversed entries are correctly reflected in the existing account
  ledger and totals.
- No duplicate Cash/Bank, Invoice, Bill, Receivable, Payable, allocation, or TDS
  effects are introduced.
- Customer-to-Customer On Account transfers, downstream allocation links, and
  later-payment replacement reversals satisfy the approved atomicity,
  traceability, and balance-restoration rules.
- Automated unit, integration, authorization, organization-isolation,
  concurrency, and reversal tests pass.
- Frontend and backend production builds pass.
- The minimum scenarios in section 19 are verified against a test database.
- The open decisions in section 20 are resolved and recorded in this document.
