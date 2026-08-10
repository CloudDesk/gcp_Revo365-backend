# Chart of Accounts Requirements

## 1. Purpose

The Chart of Accounts module provides a single place to create and view the
organization's accounting accounts.

Customers and suppliers are maintained as separate party masters and are not
created as Chart of Accounts records. All other accounts used for accounting
entries are maintained in this module.

## 2. Delivery Phases

| Phase | Scope | Status |
| --- | --- | --- |
| Phase 1 | Create and list Chart of Accounts records using the fixed Account Type catalogue. | **Completed** |
| Phase 2 | Use the created accounts when posting a Direct Ledger transaction from the Cash and Bank Account module. | **Completed** |
| Phase 3 | Show each account's ledger entries and totals, and show Accounts Payable and Accounts Receivable totals on the home/list page. | **Completed** |

### 2.1 Implementation Status

**Overall planned implementation: 100% completed.**

All Phase 1, Phase 2, and Phase 3 requirements and acceptance criteria defined
in this document have been implemented. The frontend and backend production
builds pass, the backend automated test suite passes, and the Direct Ledger and
account-ledger results have been verified against the database.

Environment deployment activities, such as running the master SQL and
restarting the backend service, are operational release steps and are not
remaining implementation scope.

Related Cash and Bank Account references:

- [Cash and Bank Account Requirements](../cash-bank-account/CASH_BANK_REQUIREMENTS.md)
- [Cash and Bank Phase 1 Implementation Report](../cash-bank-account/CASH_BANK_PHASE_1_IMPLEMENTATION_REPORT.md)

## 3. Phase 1: Chart of Accounts Setup

### 3.1 Scope

This phase includes:

- A fixed list of supported account types supplied by the backend.
- Creation of new accounts using one flat account structure.
- A list page showing all accounts created for the current organization.
- Case-insensitive uniqueness validation for Account Name and Account Code.

This phase does not include:

- Creating customers or suppliers as Chart of Accounts records.
- User configuration of account types.
- Parent accounts, child accounts, or any account hierarchy.
- Nested or tree-based display of accounts.
- Editing, deleting, merging, or archiving accounts unless added in a later
  requirement.

### 3.2 Account Structure

All accounts must be stored in one flat account list. No `parentaccountid` or
similar hierarchy field is required in this phase.

The existing `finance_accounts` model can be used as the accounting account
master. Its fields should be interpreted as follows:

- `accounttype`: the broad accounting category (`asset`, `liability`,
  `equity`, `income`, or `expense`).
- `accountsubtype`: the specific Account Type selected by the user, such as
  `cash`, `bank`, or `cost_of_goods_sold`.
- `accountname`: the user-entered Account Name.
- `accountcode`: the user-entered Account Code.
- `description`: the user-entered Description. This field must be added if it
  is not already present in the account master.
- `isusercreatedchartaccount`: `true` only for accounts created through this
  module; used to keep existing system and Cash/Bank ledgers out of this list.

The frontend only needs to present one **Account Type** selector. The backend
must derive and persist its broad accounting category from the selected type.

### 3.3 Supported Account Types

The account type catalogue is fixed for this phase and is stored as seeded
database master data in `finance_account_types`. It follows the database-master
pattern used for TDS Sections, while remaining read-only and not configurable
by the user in Phase 1.

Each Account Type master record stores its canonical code, display name, broad
accounting category, category label, display order, status, and whether it is
configurable. All Phase 1 seeds use `isconfigurable = false`.

| Category | Account Type shown to the user | Canonical value |
| --- | --- | --- |
| Assets | Other Asset | `other_asset` |
| Assets | Other Current Asset | `other_current_asset` |
| Assets | Cash | `cash` |
| Assets | Bank | `bank` |
| Assets | Fixed Asset | `fixed_asset` |
| Assets | Stock | `stock` |
| Assets | Payment Clearing | `payment_clearing` |
| Liability | Other Current Liability | `other_current_liability` |
| Liability | Credit Card | `credit_card` |
| Liability | Long Term Liability | `long_term_liability` |
| Liability | Other Liability | `other_liability` |
| Liability | Overseas Tax Payable | `overseas_tax_payable` |
| Equity | Equity | `equity` |
| Income | Income | `income` |
| Income | Other Income | `other_income` |
| Expense | Expense | `expense` |
| Expense | Cost of Goods Sold | `cost_of_goods_sold` |
| Expense | Other Expense | `other_expense` |

The backend must load the dropdown from active Account Type master records and
reject an Account Type that is missing or inactive in this catalogue.

### 3.4 Create Account

#### 3.4.1 Form Fields

| Field | Required | Rule |
| --- | --- | --- |
| Account Type | Yes | Select one value from the backend-provided account type catalogue. |
| Account Name | Yes | Trim leading and trailing whitespace; must not be blank; must be unique within the organization without regard to letter case. |
| Account Code | Yes | Trim leading and trailing whitespace; must not be blank; must be unique within the organization without regard to letter case. |
| Description | No | Free-text description of the account. |

#### 3.4.2 Creation Behaviour

1. The frontend obtains the supported account types from the backend.
2. The user completes the form and submits it.
3. The backend validates all fields and derives the broad accounting category
   from the selected Account Type.
4. The backend creates the account for the current organization.
5. The created account is returned to the frontend and appears on the account
   list page.

### 3.5 Uniqueness Rules

Account Name and Account Code must each be unique within the current
organization, irrespective of uppercase or lowercase formatting.

Examples:

- If `Office Rent` exists, `office rent` and `OFFICE RENT` must be rejected as
  duplicate Account Names.
- If `ACC-001` exists, `acc-001` must be rejected as a duplicate Account Code.
- Account Name uniqueness and Account Code uniqueness are independent rules.

Uniqueness must be enforced in both places:

- Service validation, to return a clear field-level error.
- Database unique indexes using normalized values such as
  `LOWER(TRIM(accountname))` and `LOWER(TRIM(accountcode))`, scoped by
  `organizationid`, to prevent duplicates during concurrent requests.

Expected duplicate errors:

- `An account with this Account Name already exists.`
- `An account with this Account Code already exists.`

### 3.6 Account List

The list page must show only accounts created through the Phase 1 Chart of
Accounts form for the current organization. Customer and supplier party-master
records, system accounting ledgers, and Bank/Cash ledgers created by the Cash
and Bank Account module must not be included.

User-created Chart records are identified by
`isusercreatedchartaccount = true`. Existing accounting records remain in
`finance_accounts` for their respective workflows but are not part of this
page.

Each row must show at least:

- Account Name
- Account Code
- Account Type
- Category
- Description

The API and query must always apply organization-level isolation. Accounts from
another organization must never be returned.

### 3.7 Backend Requirements

The backend must provide operations equivalent to:

- Get the active database-backed Account Type catalogue.
- Create a Chart of Accounts record.
- List all Chart of Accounts records for the current organization.

The exact routes may follow the existing finance module conventions. Responses
must use the project's standard success and validation-error formats.

Account creation must be transactional. A failed validation or database write
must not leave a partial account record.

#### Phase 1 Database Deployment

Use the following file as the single Phase 1 database master for every
environment:

- [`20260806_chart_of_accounts_phase1.sql`](../../src/database/migrations/20260806_chart_of_accounts_phase1.sql)

Do not maintain a second copy of this SQL under another deployment folder. The
same idempotent file is used by the migration runner and may be run manually
for another database deployment.

### 3.8 Validation and Error Handling

The backend must reject:

- A missing or unsupported Account Type.
- A missing, blank, or whitespace-only Account Name.
- A missing, blank, or whitespace-only Account Code.
- A duplicate Account Name after trimming and case normalization.
- A duplicate Account Code after trimming and case normalization.
- Attempts to create an account for an organization outside the authenticated
  user's scope.

Validation errors must identify the relevant field so the frontend can display
the message below that field.

### 3.9 Acceptance Criteria

1. The Account Type selector contains all and only the fixed types listed in
   this document, grouped under Assets, Liability, Equity, Income, and Expense.
2. A user can create an account with a valid Account Type, Account Name,
   Account Code, and optional Description.
3. The backend correctly derives the broad category for the selected Account
   Type.
4. A newly created account is shown on the list page for the same organization.
5. Customers, suppliers, system ledgers, and Cash/Bank module ledgers are not
   returned on the Chart of Accounts page.
6. The list is flat and does not require parent or child account handling.
7. Account Name comparison is trimmed and case-insensitive for uniqueness.
8. Account Code comparison is trimmed and case-insensitive for uniqueness.
9. Duplicate validation remains reliable when two matching requests are sent
   concurrently.
10. An unsupported Account Type is rejected by the backend.
11. Accounts belonging to one organization are not visible to another
    organization.

### 3.10 Examples

#### Valid Create Request

```json
{
  "accounttype": "cost_of_goods_sold",
  "accountname": "Hardware Purchases",
  "accountcode": "COGS-001",
  "description": "Cost of computer hardware purchased for resale"
}
```

The backend derives the category as `expense`.

#### Duplicate Name Request

If `Hardware Purchases` already exists for the organization, creating an
account named `hardware purchases` must fail even when the new Account Code is
different.

#### Duplicate Code Request

If `COGS-001` already exists for the organization, creating an account with
code `cogs-001` must fail even when the new Account Name is different.

## 4. Phase 2: Direct Ledger Transaction

### 4.1 Purpose

The Cash and Bank Account module already supports transactions against customer
invoices and supplier bills. This phase adds the corresponding transaction flow
for accounts created in Phase 1.

When the user selects **Record Transaction**, the available transaction options
must include **Direct Ledger Entry**. Selecting this option must render a form
consistent with the existing customer receipt and supplier payment forms, but
without invoice/bill allocation or TDS controls.

### 4.2 Account Selection

For a Direct Ledger Entry:

- Replace the Customer/Supplier selector with an **Account** selector.
- Load active Chart of Accounts records created or available in Phase 1.
- Do not show customer or supplier party-master records in this selector.
- The selector must be searchable by Account Name and Account Code.
- The selected account must belong to the current organization.
- The selected ledger must not be the same Bank/Cash ledger from which the
  transaction is being recorded.
- Bank-to-bank and cash-transfer entries must use a separate transfer workflow
  and must not be posted as Direct Ledger entries.

### 4.3 Form Layout

The form must contain:

| Field | Required | Behaviour |
| --- | --- | --- |
| Bank/Cash Account | Yes | The account from whose Cash and Bank Account screen the transaction is opened. |
| Transaction Type | Yes | `Direct Ledger Entry`. |
| Account | Yes | Search and select an active Chart of Accounts record. |
| Transaction Date | Yes | Use the same date component and date rules as the existing transaction forms. |
| Entry Name | Yes | Manual narration for the row, for example `June 26 Rent`. |
| Entry Side | Yes | Select either Debit or Credit from the Bank/Cash account perspective. |
| Amount | Yes | Must be greater than zero and use the module's standard money precision. |
| Remarks | No | Optional transaction-level remarks. |

The manual-entry area should use the same visual container as the existing
invoice/bill allocation area. Instead of document rows, it must display manual
entry rows with:

- Entry Name
- Debit/Credit
- Amount

At least one valid row is required. If the UI supports multiple rows, the
system-calculated transaction amount must equal the sum of all row amounts.

### 4.4 Excluded Controls

A Direct Ledger Entry must not show or accept:

- Invoice selection
- Bill selection
- Invoice or bill allocation amount
- TDS Applied
- TDS Section
- TDS Payable
- TDS Receivable
- Payment settlement status

Its allocation method must be stored as `direct_ledger`.

### 4.5 Debit, Credit, and Balance Rules

Debit and Credit in the Cash and Bank Account screen retain the existing
meaning:

- **Debit**: money coming into the selected Bank/Cash account.
- **Credit**: money going out of the selected Bank/Cash account.

The Bank/Cash running balance must be calculated by the backend:

```text
Balance After = Previous Available Balance + Bank Debit - Bank Credit
```

The client must not submit `balanceafter` or the Bank/Cash current balance as an
authoritative value.

Exactly one side must be used for each entry:

- Debit and Credit cannot both contain an amount.
- Debit and Credit cannot both be zero.
- Amount must be greater than zero.

### 4.6 Journal Posting Rules

Every saved Direct Ledger Entry must create a balanced journal. The selected
account receives the opposite accounting side from the Bank/Cash ledger.

| Bank/Cash entry | Bank/Cash journal line | Selected account journal line |
| --- | --- | --- |
| Debit | Debit | Credit |
| Credit | Credit | Debit |

The following must be saved atomically:

- Bank/Cash transaction
- Transaction number
- Direct Ledger selection
- Journal entry
- Balanced journal lines
- Updated Bank/Cash available balance
- Audit record

If any operation fails, none of the above changes may be committed.

Only a successfully posted transaction may affect balances or appear in ledger
totals. Reversed entries must be excluded from current totals or represented by
their posted reversal, following the existing Cash and Bank Account rules.

### 4.7 Stored Transaction Values

The transaction must store or reference at least:

- Current organization
- Selected Bank/Cash account
- Selected Chart of Accounts ID as the counterparty ledger
- Transaction date
- Entry name/description
- Entry side
- Amount
- Debit amount
- Credit amount
- Balance after posting
- Allocation method: `direct_ledger`
- Source type: `manual`
- Posting status
- Journal entry reference
- Created and posted audit information

### 4.8 Example: Rental Payment

Assume the user has created this Phase 1 account:

```text
Account Name: Rental
Account Code: EXP-RENT
Account Type: Expense
```

The user opens a Bank account and records:

```text
Transaction Type: Direct Ledger Entry
Account: Rental
Transaction Date: 26 June 2026
Entry Name: June 26 Rent
Entry Side: Credit
Amount: ₹50,000
```

The posting result is:

| Ledger | Debit | Credit |
| --- | ---: | ---: |
| Rental Expense | ₹50,000 | ₹0 |
| Selected Bank | ₹0 | ₹50,000 |

The selected Bank available balance decreases by ₹50,000. The Rental
account detail shows a ₹50,000 Debit entry because the ledger side is the
opposite of the Bank/Cash entry side.

### 4.9 GST Summary Extension

The Chart of Accounts home page must include two GST summary sections:

- **Invoice GST — Output GST**
- **Bill GST — Input GST**

Each section must display separate currency totals for:

- IGST
- CGST
- SGST
- Overall GST Total

#### Invoice GST (Output GST)

Invoice Output GST is the sum of the GST amounts recorded on all
non-cancelled invoices from these sales flows:

- E-commerce sales
- In-store sales
- Rental invoices
- Service Request invoices

E-commerce and In-store invoices are both represented by Product invoices in
the current invoice data. Penalty invoices are not part of this summary.

Different invoice flows currently store GST in different shapes. Product
invoices store component amounts, Rental invoices may use either legacy
component fields or explicit `igstamount`, `cgstamount`, and `sgstamount`
fields, and Service Request invoices store GST rates with a total tax amount.
The backend must normalize those shapes and sum GST currency amounts. It must
never add percentage rates as though they were monetary values.

#### Bill GST (Input GST)

Bill Input GST is the sum of the GST amounts recorded on every non-cancelled
supplier Bill. The backend must use the Bill's payable tax amount and allocate
it to IGST or CGST/SGST according to the tax mode or component rates stored on
the Bill. Under the current Bill schema, which stores CGST and SGST rates but
does not yet store IGST, Input IGST is shown as zero.

GST summaries are based on issued invoices and Bills, irrespective of whether
they are unpaid, partially paid, or fully paid. Payment and settlement status
must not reduce Output or Input GST. Cancelled documents must not contribute.

```text
Invoice Output GST Total = Output IGST + Output CGST + Output SGST
Bill Input GST Total = Input IGST + Input CGST + Input SGST
```

The page must show a loader in each GST section while the summary is being
calculated and must not temporarily display zero as though it were the loaded
result.

### 4.10 Phase 2 Acceptance Criteria

1. Record Transaction includes a Direct Ledger Entry option.
2. Selecting Direct Ledger Entry displays an Account selector instead of a
   Customer or Supplier selector.
3. The Account selector returns active Phase 1 accounts for the current
   organization.
4. The manual-entry area accepts Entry Name, Debit/Credit, and Amount.
5. Transaction Date is mandatory and follows the existing module's date rules.
6. TDS and invoice/bill allocation controls are not displayed.
7. A zero, negative, blank, or dual-sided entry is rejected.
8. Posting creates a Bank/Cash transaction and balanced journal lines in one
   database transaction.
9. Bank/Cash available balance uses the existing automatic calculation.
10. The selected Chart of Accounts ledger receives the opposite side of the
    Bank/Cash journal line.
11. The Chart of Accounts home page shows Invoice GST as Output IGST, CGST,
    SGST, and Total.
12. Invoice GST includes non-cancelled E-commerce, In-store, Rental, and
    Service Request invoices and excludes Penalty invoices.
13. The Chart of Accounts home page shows Bill GST as Input IGST, CGST, SGST,
    and Total for non-cancelled supplier Bills.
14. GST cards sum tax amounts rather than GST percentage rates and do not
    change when a document is paid.
15. Both GST sections show a loading state until their values are available.

## 5. Phase 3: Account Ledger and Summary Reporting

### 5.1 Account List

The Chart of Accounts home/list page must continue to show one flat row per
account. Each row must also show that account's individual current ledger
balance.

The value shown for an account must be calculated only from posted journal
lines belonging to that account and organization. It must not be calculated by
adding values supplied by the frontend.

The list page should remain a summary. Debit and Credit breakdowns belong on
the account detail page.

### 5.2 Account Detail View

Selecting an account, such as **Rental**, must open its account detail view.
The view must include all posted entries that affected that account, including
Direct Ledger entries created in Phase 2.

The detail summary must show:

- Account Name
- Account Code
- Account Type and Category
- Total Debit
- Total Credit
- Current Ledger Balance

The entry list must show each individual ledger value rather than only a
combined transaction total. Each entry should show:

- Transaction Date
- Entry Name or journal-line description
- Transaction/Journal reference
- Source Type
- Related Bank/Cash Account, when applicable
- Debit Amount
- Credit Amount
- Created/Posted information

The detail page must support pagination so a large ledger is not loaded in one
unbounded response.

### 5.3 Account Totals

For every account:

```text
Total Debit = Sum of posted journal-line Debit amounts
Total Credit = Sum of posted journal-line Credit amounts
```

The natural current balance depends on the broad account category:

| Category | Current Ledger Balance |
| --- | --- |
| Asset | Total Debit - Total Credit |
| Expense | Total Debit - Total Credit |
| Liability | Total Credit - Total Debit |
| Equity | Total Credit - Total Debit |
| Income | Total Credit - Total Debit |

The response should also retain the separate Debit and Credit totals so the UI
does not lose the underlying accounting direction.

### 5.4 Amount Receivable and Amount Payable Home Summary

The Chart of Accounts home/list page must display summary cards labelled:

- **Amount Receivable**
- **Amount Payable**

These labels represent the Accounts Receivable and Accounts Payable business
concepts. The card values use the document balances maintained by their source
modules because those balances include both the originating document amount
and all subsequent settlements.

These totals use the transaction-derived balance stored against each customer
invoice and supplier bill. The Cash and Bank settlement workflows update these
balances whenever a posted receipt, payment, or TDS adjustment is recorded.

```text
Amount Receivable =
  Sum of each non-cancelled invoice amount minus its successful settlements

Amount Payable =
  Sum of positive balanceamount values for non-cancelled supplier bills
```

The values represent current outstanding document balances, not the gross sum
of every historic transaction and not settlement-only SYS-AR/SYS-AP journal
activity. Paid documents contribute zero. Failed or reversed settlement effects
must first be reflected in the document balance before the cards are updated.

The summary queries must be scoped to the current organization.

### 5.5 Phase 3 Backend Requirements

The backend must provide operations equivalent to:

- List Chart of Accounts with each account's current balance.
- Get one account's details, Total Debit, Total Credit, and Current Ledger
  Balance.
- List paginated journal entries/lines for one account.
- Get the current Amount Receivable and Amount Payable home summary.

The exact routes may follow the existing finance module conventions.

### 5.6 Phase 3 Acceptance Criteria

1. Every account row shows that account's individual current balance.
2. Opening an account shows its Total Debit, Total Credit, and Current Ledger
   Balance.
3. The account detail lists every posted Direct Ledger entry affecting the
   account with its individual Debit or Credit value.
4. The Rental example appears as a Debit in the Rental ledger and a Credit in
   the selected Bank ledger.
5. Draft and failed transactions do not affect account totals.
6. Reversed transactions do not remain in current totals without the
   corresponding reversing effect.
7. The home/list page shows current Amount Receivable and Amount Payable
   totals.
8. Amount Receivable equals the sum of positive outstanding customer invoice
   balances derived from invoice amounts and successful settlements, including
   legacy records whose stored balance is stale.
9. Amount Payable equals the sum of positive outstanding supplier bill
   balances.
10. List, detail, and summary queries are isolated by organization.
