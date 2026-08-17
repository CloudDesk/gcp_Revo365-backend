# Phase 4: Journal Module Requirements

## 1. Document Purpose

This document defines the Phase 4 requirements for a Journal module that allows
the accounting team to create, review, post, and reverse accounting adjustments
that do not require an actual Cash/Bank movement.

The module must reuse the existing Chart of Accounts, `journal_entries`,
`journal_lines`, and account-ledger mechanisms. It must not create a second
accounting engine or duplicate the financial effects already produced by
Cash and Bank transactions, Invoices, Bills, Customer Receipts, Supplier
Payments, or other source modules.

## 2. Status and Dependencies

| Item | Value |
| --- | --- |
| Delivery phase | Phase 4 |
| Requirement status | Draft for review |
| Implementation status | Not started |
| Primary dependencies | Chart of Accounts, existing finance journal tables, account ledger, authentication and organization permissions |

Related requirement references:

- [Cash and Bank Account Requirements](../cash-bank-account/CASH_BANK_REQUIREMENTS.md)
- [Chart of Accounts Requirements](../chart-of-account/CHART_OF_ACCOUNT_REQUIREMENTS.md)
- [Phase 3 Customer and Supplier Statement Requirements](../customer-statement/PHASE_3_CUSTOMER_STATEMENT_REQUIREMENTS.md)

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

A manual Journal is used for an accounting entry, accrual, adjustment, or
reclassification that does not require an actual Bank/Cash movement and is not
already posted by another source module.

Examples include:

- Recording Salary Expense before the salary is paid.
- Moving an amount from Office Expense to Rent Expense after the original Bank
  transaction has already been posted.
- Recording another approved non-cash adjustment between Chart of Accounts
  accounts.

### 3.4 Reverse Journal

A Reverse Journal cancels the accounting effect of a previously posted manual
Journal by creating a new Journal with the Debit and Credit sides exchanged.
The original Journal remains in history and is linked to the reversal.

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

### 4.2 Excluded

The following are not part of this phase unless separately approved:

- Creating or editing Bank/Cash transactions from the Journal module.
- Allocating a Journal against Customer Invoices or Supplier Bills.
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

### 5.4 Organization Isolation

Every Journal header, Journal line, account lookup, list, detail, post, and
reversal operation must be restricted to the authenticated user's organization.
An ID from another organization must be treated as unavailable.

### 5.5 Posted History Is Immutable

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

The list must show both manual Journals and system-generated Journals so the
accounting team has one audit view of the existing journal ledger.

System-generated Journals are read-only in this workspace. They remain owned by
their source modules.

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

The Source label must be derived from the stored source type through a
controlled mapping. Raw database values must not be shown directly to users.

### 6.3 Search and Filters

The list must support:

- Search by Journal Number, Reference, or Description.
- Date From and Date To.
- Status.
- Source.
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
| Reference | No | Trimmed free text; used for an external or internal supporting reference |
| Description | Yes | Trimmed Journal narration; must not be blank |

The Journal Number, status, created user, created date, posted user, and posted
date are system-controlled and must not be manually entered.

### 7.2 Journal Lines

Each persisted line must contain:

| Field | Required | Rule |
| --- | --- | --- |
| Account | Yes | Eligible account from the current organization |
| Description | No | Optional trimmed line narration |
| Debit | Conditional | Positive amount when Credit is empty/zero |
| Credit | Conditional | Positive amount when Debit is empty/zero |

The form must:

- Start with at least two line rows.
- Allow the user to add and remove rows.
- Keep at least two persisted valid lines before posting.
- Show running Total Debit, Total Credit, and Difference.
- Format monetary values to two decimal places.
- Prevent negative values.
- Prevent both Debit and Credit on one line.
- Prevent a line with both Debit and Credit empty or zero from being persisted.

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
- Reject an inactive, missing, cross-organization, or otherwise ineligible
  account during backend validation even if an old browser value is submitted.

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

Exact routes may follow existing Finance module conventions. Responses must use
the project's standard success, validation-error, authorization-error, and
not-found formats.

### 12.1 Source Type

Manual Journals must use a dedicated, stable source type such as
`manual_journal`. It must not reuse `bank_transaction` or another source type
owned by an existing workflow.

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

Balanced totals require transaction-level validation and should also use a
database-safe enforcement strategy where practical.

## 14. Permissions

Use dedicated Journal permissions equivalent to:

| Permission | Allows |
| --- | --- |
| Journal Read | List and view Journal details |
| Journal Create | Create a manual Draft |
| Journal Edit | Edit a manual Draft |
| Journal Post | Post a balanced manual Draft |
| Journal Reverse | Reverse an eligible posted manual Journal |

Permissions must be enforced by both frontend action visibility and backend
authorization. Hiding a button is not sufficient security.

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
   incorrectly available for manual Journal posting.
8. A line cannot contain both Debit and Credit.
9. A line cannot contain a zero or negative posting amount.
10. An unbalanced Journal cannot be posted.
11. A balanced manual Journal is posted atomically with a unique Journal Number.
12. Posted lines appear exactly once in the affected existing account ledgers
    and totals.
13. Posting a manual Journal does not change a Bank/Cash balance.
14. Posting a manual Journal does not independently change Invoice, Bill,
    Receivable, Payable, allocation, or TDS records.
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

## 20. Open Decisions Before Implementation Approval

The following points require confirmation before this draft is marked approved:

1. Whether an unbalanced Journal may be saved as Draft. This document currently
   allows it but requires balance before Post.
2. The exact list of system or restricted accounts excluded from manual posting.
3. Whether the Journal list should show all system-generated Journals or only
   manual Journals. This document currently shows all for audit but permits
   write actions only on manual Journals.
4. Whether manual Journal Reference must be unique, optional, or required for
   specific organizations.
5. Whether a future phase requires Customer/Supplier control-account Journals,
   approval workflow, attachments, recurring Journals, templates, imports, or
   automatic reversal dates.
6. Whether the organization already has a financial-period lock that must be
   applied to Entry Date and Reversal Date.
7. Whether the original Journal should retain stored status `posted` with a
   derived Reversed display state, or use stored status `reversed` with updated
   ledger queries. Either implementation must satisfy section 10.5.

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
- Automated unit, integration, authorization, organization-isolation,
  concurrency, and reversal tests pass.
- Frontend and backend production builds pass.
- The minimum scenarios in section 19 are verified against a test database.
- The open decisions in section 20 are resolved and recorded in this document.
