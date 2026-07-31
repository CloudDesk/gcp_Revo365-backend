# Cash and Bank Account Module

## Phase 1 Functional and Technical Implementation Report

**Status:** Bank/Cash foundation, e-commerce payment ingestion, and Retail
In-store receipt allocation implemented locally
**Scope:** Accounting foundation, E-commerce Order receipts, Retail In-store
Sales receipts, and Manual Bank/Cash entries  
**Deferred:** Rental and all Repair/Service Request payment flows  
**Backend branch inspected:** `zohobooks`  
**Frontend repository inspected:** `GCP-Latest-Revo-E-commerce` on `SIT`

---

## 1. Purpose of This Report

This report converts the requirements and discussions completed so far into a
practical Phase 1 implementation plan.

It does not replace or modify the protected source documents:

- `CASH_BANK_REQUIREMENTS.md`
- `CASH_BANK_ACCOUNT_UNDERSTANDING.md`

The source requirement remains the BA/Finance reference. This report contains:

- Confirmed requirements
- Accounting interpretation
- Proposed implementation decisions
- Current-code observations
- Data model and API design
- User-interface flows
- Posting and allocation rules
- Validation and test scenarios
- Deferred items and open decisions

Any item marked **Proposed** or **Needs confirmation** is not treated as an
approved BA requirement until the relevant stakeholder confirms it.

---

## 2. Inputs and Decision Precedence

The implementation must use the following precedence when information
conflicts:

1. Latest written clarification from Finance
2. BA Cash and Bank Account requirement
3. Approved Cash and Bank Account understanding
4. Product-owner operational overview
5. Technical proposal in this report

### 2.1 Protected documents

The BA requirement and understanding documents must not be changed without
explicit approval.

### 2.2 Important Finance corrections

The following corrections are treated as confirmed:

- Manual text entry is not permitted in the banking transaction Name field.
- The Name must reference an existing Customer, Supplier, or Chart of Accounts
  ledger.
- E-commerce money received must appear in the Debit column.
- Running/Available Balance must use Debit as an increase and Credit as a
  decrease.
- Invoice/Bill settlement includes the bank allocation and TDS adjustment.

---

## 3. Phase 1 Goal

Phase 1 will establish a reliable accounting base and support these flows:

1. Create and maintain Bank and Cash accounts.
2. Maintain a separate transaction ledger for each Bank/Cash account.
3. Automatically create a Debit transaction for a successfully paid
   e-commerce order.
4. Link the e-commerce receipt to its sales invoice immediately or later when
   the invoice is generated.
5. Record Retail In-store customer receipts.
6. Allow manual Bank/Cash entries against existing parties or ledger accounts.
7. Allocate a customer receipt across one or more outstanding invoices.
8. Allocate a vendor payment across one or more outstanding bills.
9. Support TDS Receivable and TDS Payable during allocation.
10. Update account balance and invoice/bill payment state only after successful
    posting.
11. Produce balanced journal lines required by future accounting reports.

Phase 1 is a foundation. It will not deliver the complete accounting product.

### 3.1 Current implementation progress

Implemented:

- Common Finance, Bank/Cash, journal, transaction, advance, audit, and TDS
  foundation
- Admin and Accountant read/create/edit permissions
- Successful online Product payment ingestion from the existing checkout and
  webhook paths
- Idempotent system Debit posting to a configured Bank/Cash account
- Credit posting to Customer Advances with an open unapplied amount
- Durable pending events when the e-commerce default Bank account is unavailable
- Retail customer lookup restricted to customers with outstanding Store
  Purchase invoices
- Manual allocation of one receipt across one or more Retail In-store invoices
- Bank/Cash Debit, Accounts Receivable journal credit, running-balance update,
  invoice payment-status update, and audit trail in one database transaction
- Idempotent retail receipt request references

Next:

- Existing/deferred sales-invoice allocation and invoice payment-status update
- TDS adjustment posting

---

## 4. Scope Boundaries

### 4.1 Included in Phase 1

- Bank account creation
- Cash account creation
- Opening balance and opening balance date
- Active/Inactive status
- Per-account Transactions tab
- Debit and Credit entry
- Automatic running/available balance
- Search for existing Customers, Suppliers, and ledger accounts
- Direct Ledger allocation
- Against Invoice/Bill allocation
- Advance allocation
- On Account allocation
- Partial and full invoice/bill allocation
- TDS Receivable and TDS Payable
- E-commerce Order payment ingestion
- Deferred invoice linking when payment precedes invoice creation
- Retail In-store paid sale receipt
- Retail In-store credit sale behavior
- Manual Bank/Cash entry
- System journal creation
- Audit and idempotency controls
- Permissions restricted to Accountant and Admin roles

### 4.2 Future compatibility only

The core accounting model should remain extensible, but Phase 1 will not
implement source-specific behavior for:

- Rental
- Repair/Service Request
- Retail In-store Service collection
- Refund
- Reversal

### 4.3 Deferred from Phase 1

- Rental payment automation
- E-commerce Repair/Service Request integration
- Retail In-store Service invoice collection
- Complete Credit Card account workflow
- Bank statement import and bank feed
- Automated bank reconciliation
- Payment-gateway settlement and fee reconciliation
- Foreign-currency accounting
- Cheque lifecycle
- Manual Journal user interface
- Complete Chart of Accounts management interface
- P&L, Balance Sheet, Trial Balance, Dashboard, and other Reports interfaces

The accounting records created in Phase 1 must still be structured so those
modules can use them later.

### 4.4 Explicit Repair/Service Request exclusion

The current logged-in E-commerce repair flow creates the Service Request
without collecting payment. Payment is also not collected during estimation
approval, and the resolved service-invoice flow currently has no Pay Now
action.

Therefore, during Phase 1:

- Raising a Repair/Service Request must not create a Bank/Cash transaction.
- Selecting a free, warranty, standard, or premium service type must not create
  a Bank/Cash transaction.
- Automatic estimation approval must not create a Bank/Cash transaction.
- Customer approval, requote, or rejection must not create a Bank/Cash
  transaction.
- Service invoice generation must not create a Bank/Cash transaction.
- The existing unused ticket-payment endpoint is not an accounting trigger.

If a customer later pays a service invoice at the retail store, that will be
implemented as a future Retail In-store Service receipt flow. It is not part of
Phase 1.

---

## 5. Core Accounting Interpretation

### 5.1 Bank-screen Debit and Credit

For the selected Bank/Cash account:

| Business event | Debit | Credit | Balance effect |
| --- | ---: | ---: | --- |
| Customer money received | Amount | 0 | Increase |
| Cash sale received | Amount | 0 | Increase |
| E-commerce payment received | Amount | 0 | Increase |
| Vendor payment made | 0 | Amount | Decrease |
| Expense paid | 0 | Amount | Decrease |
| Bank charge | 0 | Amount | Decrease |
| Refund received | Amount | 0 | Increase |
| Refund paid | 0 | Amount | Decrease |

The running balance is:

```text
Available Balance =
Previous Available Balance + Debit Amount - Credit Amount
```

### 5.2 Invoice creation is not a Bank/Cash event

Generating a sales invoice creates an amount receivable. It does not by itself
mean that money entered a bank or cash account.

A Bank/Cash transaction is created when:

- Payment is successfully captured/received, or
- An authorized accounts user posts a manual Bank/Cash transaction.

### 5.3 Payment received before invoice generation

If payment is received before an invoice exists:

1. Create one Bank/Cash Debit transaction.
2. Record the receipt as Advance or Pending Invoice Link.
3. Retain the order and provider-payment references.
4. When the invoice is generated, link the existing receipt to the invoice.
5. Do not create a second Bank/Cash transaction.

### 5.4 Payment status

For each invoice or bill:

```text
Total Settled Amount = Allocation Amount + TDS Amount
Remaining Balance = Previous Outstanding Amount - Total Settled Amount
```

Status:

| Condition | Status |
| --- | --- |
| Total settled is zero | Unpaid/Pending |
| Total settled is greater than zero but less than outstanding | Partially Paid |
| Total settled equals outstanding | Paid |

The existing backend currently uses:

- `pending`
- `partially_paid`
- `paid`

**Proposed:** Preserve these backend values and display user-facing labels as
Unpaid, Partially Paid, and Paid/Fully Paid.

### 5.5 TDS treatment

#### Customer receipt

Example:

```text
Invoice outstanding: 100,000
Bank receipt:          90,000
TDS Receivable:        10,000
Invoice settlement:   100,000
```

Journal:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Selected Bank Account | 90,000 | 0 |
| TDS Receivable | 10,000 | 0 |
| Accounts Receivable/Customer | 0 | 100,000 |

#### Vendor payment

Example:

```text
Bill outstanding: 100,000
Bank payment:       90,000
TDS Payable:        10,000
Bill settlement:   100,000
```

Journal:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Accounts Payable/Vendor | 100,000 | 0 |
| Selected Bank Account | 0 | 90,000 |
| TDS Payable | 0 | 10,000 |

### 5.6 Adjustment UI

The system should not ask the user to choose an unrelated adjustment type.

| Selected party/transaction | Adjustment shown |
| --- | --- |
| Customer receipt | TDS Receivable |
| Vendor payment | TDS Payable |
| Direct ledger transaction | No invoice/bill TDS adjustment by default |

The applicable TDS ledger and TDS amount must both be captured.

---

## 6. Source-to-Transaction Matrix

| Source | Trigger | Date used | Name | Bank Debit | Bank Credit | Allocation |
| --- | --- | --- | --- | ---: | ---: | --- |
| E-commerce Order | Successful payment capture | Payment/settlement date | Existing Customer | Received amount | 0 | Auto-link invoice or hold for later link |
| Retail In-store paid sale | Successful receipt posting | Payment date | Existing Customer | Received amount | 0 | Selected/created sales invoice |
| Retail In-store credit sale | Invoice generated, no payment | No Bank/Cash entry | Customer | 0 | 0 | Invoice stays outstanding |
| Manual customer receipt | Accounts user posts entry | Entered date | Existing Customer | Entered amount | 0 | Invoice, Advance, or On Account |
| Manual vendor payment | Accounts user posts entry | Entered date | Existing Supplier | 0 | Entered amount | Bill, Advance, or On Account |
| Manual direct ledger | Accounts user posts entry | Entered date | Existing ledger | Depends on event | Depends on event | Direct Ledger |

---

## 7. Detailed Functional Flows

## 7.1 Create Bank/Cash Account

### User

Accountant.

### Input

| Field | Bank | Cash |
| --- | --- | --- |
| Account Type | Required | Required |
| Account Name | Required | Required |
| Bank Name | Required | Hidden/Not required |
| Account Number | Required | Hidden/Not required |
| IFSC Code | Required | Hidden/Not required |
| Branch Name | Optional | Optional/Hidden |
| Opening Balance | Required | Required |
| Opening Balance Date | Required | Required |
| Status | Active/Inactive | Active/Inactive |

### Processing

1. Validate required fields.
2. Validate account-name uniqueness within the organization.
3. Create the Bank/Cash account.
4. Create or link its Asset ledger account.
5. Post an opening-balance journal.
6. Set current available balance to the opening balance.
7. Write an audit record.

### Result

The account appears in the Cash and Bank Account list with:

- Account name
- Type
- Opening balance
- Current available balance
- Status

### Important dependency

Although the full Chart of Accounts module is planned later, each Bank/Cash
account needs a stable ledger identity now. Phase 1 must create a minimal
accounting ledger foundation that the later Chart of Accounts module will
manage.

---

## 7.2 Open Account Transactions Tab

### Header

- Account name
- Account type
- Opening balance
- Opening balance date
- Current available balance
- Status

### Transaction columns

| Column | Behavior |
| --- | --- |
| Date | Transaction/payment date |
| Name | Existing Customer, Supplier, or ledger |
| Source | E-commerce, Retail In-store, Manual, etc. |
| Reference | Order/payment/manual reference |
| Debit | Money coming into selected account |
| Credit | Money going out of selected account |
| Invoice/Bill | Linked documents |
| Adjustment | TDS details when applicable |
| Running Balance | System-calculated and read-only |
| Remarks | Optional |
| Status | Draft, Posted, Reversed |

### Sorting

**Proposed:** Calculate and display balances in:

```text
Transaction Date ASC, Posted Timestamp ASC, Transaction ID ASC
```

For normal viewing, the UI may show newest entries first, but each stored
`balance_after` must be calculated using the authoritative chronological order.

---

## 7.3 E-commerce Order Automatic Receipt

### Trigger

The trigger is a verified, successfully captured payment—not order creation and
not invoice generation.

Current backend hooks include:

- Razorpay checkout confirmation
- Razorpay webhook
- Existing transaction insertion after payment verification

### Required source data

- Provider
- Provider payment ID
- Provider order ID
- Merchant transaction ID
- E-commerce order ID
- Customer ID
- Customer display name
- Payment date
- Amount
- Currency
- Payment method
- Invoice ID/number when available

### Processing

1. Verify the provider event/signature using the existing payment flow.
2. Confirm that payment status is captured/successful.
3. Resolve the configured destination Bank/Cash account.
4. Check whether the payment has already produced an accounting transaction.
5. Create one Posted Bank Debit transaction.
6. Credit Accounts Receivable when an invoice exists.
7. Otherwise credit Customer Advance/Unapplied Receipt.
8. Create balanced journal lines.
9. Update the Bank/Cash available balance.
10. If an invoice exists, create the allocation and update invoice status.
11. If an invoice does not exist, retain a pending-link record.
12. Commit all accounting changes atomically.

### Resulting Bank transaction

| Field | Value |
| --- | --- |
| Date | Provider payment/settlement date |
| Name | Existing customer |
| Debit | Captured amount |
| Credit | 0 |
| Invoice | Invoice number when available |
| Source | E-commerce Order |
| Reference | Order ID and provider payment ID |
| Remarks | Auto-generated e-commerce receipt description |
| Entry mode | System |

### Invoice generated after payment

When an immediate or admin-triggered invoice is generated:

1. Search for an unapplied receipt using order ID and merchant transaction ID.
2. Lock the payment/allocation records.
3. Link the receipt to the new invoice.
4. Move the accounting effect from Customer Advance to Accounts Receivable if
   the initial posting used Customer Advance.
5. Update `paidamount`, `balanceamount`, and `paymentstatus`.
6. Mark the pending link as completed.
7. Do not create another Bank Debit.

### Idempotency

The accounting transaction must be unique for the provider payment.

Recommended unique keys:

- `(source_type, source_payment_id)`
- Provider payment ID
- Merchant transaction ID where the business guarantees one payment per ID

The existing Razorpay webhook-event and payment uniqueness controls should be
reused.

### E-commerce default Bank account

The implemented Phase 1 decision is one organization-level Bank account marked
as the **E-commerce default account**.

- Only an active Bank account can be selected.
- Only one default can exist per organization.
- Replacing the current default requires user confirmation.
- Razorpay and PhonePe product-order receipts post to this account.
- Provider/payment-method mapping remains in the database as future foundation
  and does not override the Phase 1 default.
- Gateway clearing and settlement-fee accounting remain future enhancements.

---

## 7.4 Retail In-store Paid Sale

### Preconditions

- Customer exists.
- Sales invoice exists or is created as part of the approved retail-sale
  workflow.
- Payment was received into a selected Bank/Cash account.

### Input

- Payment date
- Existing customer
- Selected Bank/Cash account
- Debit amount
- Outstanding invoice selection
- Allocation amount per invoice
- TDS Receivable ledger and amount when applicable
- Remarks

### Flow

1. Select the Bank/Cash account.
2. Enter payment date.
3. Search and select the existing customer.
4. Enter the Debit amount.
5. Load the customer’s outstanding sales invoices.
6. Select one or more invoices.
7. Enter allocation per invoice.
8. Enter TDS Receivable per invoice when applicable.
9. Validate totals.
10. Post atomically.

### Posting validation

```text
Bank Entry Debit = Sum of Invoice Allocation Amounts
```

TDS is excluded from Bank Entry matching because it did not enter the bank:

```text
Invoice Settlement =
Invoice Allocation Amount + TDS Receivable Amount
```

### Result

- Bank/Cash Debit posted
- Running balance increased
- Invoice allocation stored
- Invoice outstanding reduced
- Invoice status updated
- TDS Receivable posted when applicable
- Journal entry balanced

---

## 7.5 Retail In-store Credit Sale

If the customer has not paid:

1. Generate/post the sales invoice.
2. Debit Accounts Receivable.
3. Credit Sales/Tax accounts through the invoice posting flow.
4. Leave the invoice as Pending/Unpaid.
5. Do not create a Bank/Cash transaction.

When payment is later received, use the Retail In-store receipt or Manual
Customer Receipt flow.

---

## 7.6 Manual Bank/Cash Entry

### Editable input

- Date
- Existing Name
- Debit or Credit amount
- Allocation method
- Invoice/Bill allocations where applicable
- TDS adjustment where applicable
- Remarks

### System-calculated/read-only

- Available Balance
- Total allocation
- Total TDS
- Total settled
- Difference
- Payment status
- Journal totals

### Name search

The Name field must search:

- Existing Customers
- Existing Suppliers
- Active Chart of Accounts ledgers

It must not accept an arbitrary manually typed value.

Each search result should include:

- Entity ID
- Entity type
- Display name
- Optional code/phone number for disambiguation

### Direction validation

| Party and event | Expected side |
| --- | --- |
| Customer receipt | Debit |
| Vendor payment | Credit |

**Proposed:** Warn or block when the selected party conflicts with the expected
direction, unless the user chooses an explicit refund/reversal transaction type.

### Allocation method

| Selected type | Available methods |
| --- | --- |
| Customer | Against Invoice, Advance, On Account |
| Supplier/Vendor | Against Bill, Advance, On Account |
| Expense ledger | Direct Ledger |
| Income ledger | Direct Ledger |
| Loan ledger | Direct Ledger; split support later/if approved |

### Atomic posting

The following must succeed or fail together:

- Bank transaction
- Allocations
- TDS records
- Journal entry and lines
- Available balance update
- Invoice/bill outstanding update
- Payment status update
- Audit record

---

## 7.7 Outstanding Invoice/Bill Popup

### Trigger

Open after:

- Existing Customer/Supplier is selected
- Debit/Credit amount is entered
- Against Invoice/Bill is selected

### Fields

| Field | Behavior |
| --- | --- |
| Document No | Read-only |
| Document Date | Read-only |
| Document Amount | Read-only |
| Balance Amount | Read-only |
| Allocation Amount | User-entered |
| TDS Applied | Yes/No |
| TDS Ledger | Required when TDS Applied is Yes |
| TDS Amount | Enabled when TDS Applied is Yes |
| Total Settled Amount | System-calculated |

### Footer totals

- Bank Entry Amount
- Total Allocation Amount
- Total TDS Amount
- Total Settled Amount
- Difference

Formula:

```text
Difference = Bank Entry Amount - Total Allocation Amount
```

Save is enabled only when Difference equals zero.

### Row validation

```text
Total Settled Amount = Allocation Amount + TDS Amount
```

The Total Settled Amount must not exceed the document’s current outstanding
balance.

### Concurrency validation

Outstanding amounts must be checked again inside the database transaction.
The UI value alone cannot be trusted because another user may allocate the same
invoice at the same time.

---

## 7.8 Advance and On Account

### Advance

Use when payment is received or made before the invoice/bill is selected or
created.

The amount remains available for later adjustment.

### On Account

Use when the party is known but the payment is not currently mapped to a
specific document.

### Phase 1 behavior

- No invoice/bill allocation is required during initial posting.
- Store the unapplied amount against the party.
- Permit a later allocation without creating another Bank/Cash movement.
- Retain the original payment date and reference.
- Maintain an applied and remaining amount.

---

## 8. Proposed User Interface

## 8.1 Cash and Bank Account list

### Actions

- Add Bank Account
- Add Cash Account
- Open Transactions
- Activate/Deactivate account

### Columns

- Account Name
- Account Type
- Bank Name
- Masked Account Number
- Opening Balance
- Current Available Balance
- Status
- Last Transaction Date

## 8.2 Add Account form

The form must conditionally show bank-specific fields.

### Bank

- Account Name
- Bank Name
- Account Number
- IFSC Code
- Branch Name
- Opening Balance
- Opening Balance Date
- Status

### Cash

- Account Name
- Opening Balance
- Opening Balance Date
- Status

## 8.3 Transactions screen

### Header actions

- Add Transaction
- Filter
- Search
- Export (deferred unless already available)

### Filters

- Date range
- Debit/Credit
- Source
- Name
- Posting status
- Invoice/Bill number

### System-created row behavior

E-commerce rows must show a System/Auto indicator.

Accounts users may review and reconcile them. They must not recreate them.

**Proposed:** Posted system entries cannot be edited directly. Corrections use
reversal and reposting to preserve the audit trail.

## 8.4 TDS Section Master

Phase 1 does not include a TDS management UI. The supplied catalogue is seeded
directly through the baseline database migration and is consumed as a dropdown
through the GET endpoint.

### Access

| Action | Accountant | Admin | Other roles |
| --- | --- | --- | --- |
| View sections | Yes | Yes | No |
| Select during transaction | Yes | Yes | No |
| Backend POST/PATCH | Retained | Retained | No |

### Initial supplied section catalogue

The database stores only `newcode`, `natureofpayment`, and `rate`, together
with standard identity, organization, and audit columns. The 12 supplied rows
are inserted directly by the migration.

The GET response derives `displayname` using:

```text
natureofpayment newcode(rate)
```

Example:

```text
Commission or Brokerage - others 1006(2%)
```

---

## 9. Proposed Accounting Data Model

Names are proposed and may be adjusted to match repository conventions.

## 9.1 `finance_accounts`

Minimal accounting-ledger foundation required before the full Chart of Accounts
interface is built.

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `organization_id` | Organization boundary |
| `account_code` | Unique ledger code |
| `account_name` | Ledger name |
| `account_type` | Asset, Liability, Equity, Income, Expense |
| `account_subtype` | Bank, Cash, AR, AP, TDS Receivable, TDS Payable, etc. |
| `currency_code` | Account currency |
| `is_system` | System-controlled ledger |
| `status` | Active/Inactive |
| Audit columns | Created/modified metadata |

## 9.2 `bank_cash_accounts`

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `organization_id` | Organization boundary |
| `finance_account_id` | Linked Asset ledger |
| `account_type` | Bank/Cash |
| `account_name` | Display name |
| `bank_name` | Bank-only |
| `account_number_encrypted` | Protected bank account number |
| `account_number_last4` | Safe display |
| `ifsc_code` | Bank-only |
| `branch_name` | Optional |
| `opening_balance` | Initial balance |
| `opening_balance_date` | Opening date |
| `current_balance` | Current posted balance |
| `status` | Active/Inactive |
| `version` | Optimistic concurrency |
| Audit columns | Created/modified metadata |

## 9.3 `bank_transactions`

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `organization_id` | Organization boundary |
| `bank_cash_account_id` | Selected account |
| `transaction_number` | Human-readable unique number |
| `transaction_date` | Accounting/payment date |
| `party_type` | Customer, Supplier, Ledger |
| `party_id` | Existing entity ID |
| `counterparty_account_id` | Direct Ledger account |
| `entry_side` | Debit/Credit |
| `amount` | Actual bank/cash movement |
| `debit_amount` | Debit value |
| `credit_amount` | Credit value |
| `balance_after` | Running balance after posting |
| `allocation_method` | Invoice/Bill, Advance, On Account, Direct Ledger |
| `source_type` | E-commerce Order, Retail, Manual, etc. |
| `source_id` | Source order/ticket/retail reference |
| `source_payment_id` | Provider payment reference |
| `merchant_transaction_id` | Existing commerce reference |
| `remarks` | Optional |
| `posting_status` | Draft, Posted, Reversed |
| `entry_mode` | System/Manual |
| `reversal_of_id` | Original transaction if reversal |
| Audit columns | Created/posted/reversed metadata |

Constraints:

- Amount must be greater than zero.
- Exactly one of Debit or Credit must be greater than zero.
- Posted system-payment source must be idempotently unique.
- Posted transaction must reference a valid active account.

## 9.4 `bank_transaction_allocations`

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `bank_transaction_id` | Parent transaction |
| `document_type` | Sales Invoice/Purchase Bill |
| `document_id` | Existing document ID |
| `allocation_amount` | Actual bank amount allocated |
| `tds_applied` | Yes/No |
| `tds_account_id` | TDS ledger |
| `tds_amount` | TDS value |
| `total_settled_amount` | Allocation + TDS |
| `status` | Applied/Reversed |
| Audit columns | Created/modified metadata |

## 9.5 `party_unapplied_amounts`

Supports Advance and On Account.

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `bank_transaction_id` | Original payment |
| `party_type` | Customer/Supplier |
| `party_id` | Existing party |
| `original_amount` | Initial unapplied amount |
| `applied_amount` | Amount later allocated |
| `remaining_amount` | Still available |
| `unapplied_type` | Advance/On Account |
| `status` | Open/Fully Applied/Reversed |

## 9.6 `journal_entries`

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `organization_id` | Organization boundary |
| `journal_number` | Unique journal number |
| `entry_date` | Accounting date |
| `source_type` | Bank Transaction |
| `source_id` | Bank transaction ID |
| `status` | Posted/Reversed |
| `description` | Posting description |
| Audit columns | Created/posted metadata |

## 9.7 `journal_lines`

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `journal_entry_id` | Parent journal |
| `finance_account_id` | Ledger |
| `party_type` | Optional Customer/Supplier |
| `party_id` | Optional party |
| `debit_amount` | Debit |
| `credit_amount` | Credit |
| `description` | Line description |

Constraint:

```text
Sum of Journal Debits = Sum of Journal Credits
```

## 9.8 `payment_account_mappings`

| Column | Purpose |
| --- | --- |
| `provider` | Razorpay, Offline Cash, etc. |
| `payment_method` | Card, UPI, Netbanking, Cash, etc. |
| `bank_cash_account_id` | Destination account |
| `effective_from` | Mapping start |
| `status` | Active/Inactive |

## 9.9 `tds_sections`

Stores the supplied TDS dropdown catalogue.

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `organizationid` | Organization boundary |
| `newcode` | TDS code |
| `natureofpayment` | Display description |
| `rate` | Supplied display rate |
| Audit columns | Created/modified metadata |

The unique rule is `organizationid + newcode`.

---

## 10. Integration With Existing Backend

The current backend uses Fastify, TypeScript, PostgreSQL migrations, and direct
SQL service functions.

### 10.1 Existing payment foundation to reuse

The backend already includes:

- Razorpay payment initialization and confirmation
- Razorpay webhook signature verification
- A payment-webhook event ledger
- Duplicate-event handling
- Unique Razorpay payment/order identifiers
- An existing commerce `transaction` table
- Merchant transaction identifiers

The accounting module should subscribe to or be called from the successful
payment finalization path after payment verification.

### 10.2 Existing invoice foundation to reuse

`revoinvoice` already contains:

- `paymentdata`
- `paidamount`
- `balanceamount`
- `paymentstatus`
- `lastpaymentdate`

It also supports:

- `pending`
- `partially_paid`
- `paid`

Phase 1 should store normalized allocation records as the accounting source of
truth, then update these existing invoice summary fields inside the same
database transaction or through a consistent synchronization service.

### 10.3 Existing party sources

- Customers currently come from `users`.
- Suppliers currently come from `supplier`.
- A unified, searchable counterparty response is required for the transaction
  Name field.

### 10.4 Existing Retail In-store foundation

The backend already has:

- Store quotation tables
- Sale/rental quotation types
- Conversion references to order and invoice
- Store quotation APIs

The Retail In-store receipt flow can attach to the converted sales invoice.

### 10.5 Current gaps

The inspected backend does not currently expose dedicated structures for:

- Chart of Accounts
- Bank/Cash accounts
- Bank/Cash transactions
- Normalized document allocations
- TDS allocation
- Journal entries/lines
- Running balance
- Payment-to-account mapping

These must be introduced before implementing the complete UI flow.

### 10.6 Frontend prerequisite

The inspected e-commerce frontend is on `SIT`, and no `zohobooks` branch was
found in that repository’s local or remote branch list.

Before frontend implementation begins, confirm:

- The correct accounting/admin frontend repository
- The correct target branch
- Whether Cash and Bank Account screens belong in the e-commerce frontend or
  another internal application

No branch should be switched or created solely from an assumption.

---

## 11. Proposed Backend APIs

Routes are proposed under `/finance`.

## 11.1 Account APIs

### Create account

```http
POST /finance/bank-accounts
```

### List accounts

```http
GET /finance/bank-accounts
```

### Account detail

```http
GET /finance/bank-accounts/:accountId
```

### Update account metadata/status

```http
PATCH /finance/bank-accounts/:accountId
```

Posted opening balance should not be silently overwritten. Corrections require
an authorized adjustment or reversal.

## 11.2 Transaction APIs

### List account transactions

```http
GET /finance/bank-accounts/:accountId/transactions
```

Filters:

- From/to date
- Source
- Debit/Credit
- Party
- Reference
- Status
- Pagination

### Create and post manual transaction

```http
POST /finance/bank-accounts/:accountId/transactions
```

The request includes:

- Date
- Party/ledger reference
- Debit or Credit
- Allocation method
- Allocations
- TDS
- Remarks

The server performs the complete atomic posting.

### Reverse transaction

```http
POST /finance/bank-transactions/:transactionId/reverse
```

### Transaction detail

```http
GET /finance/bank-transactions/:transactionId
```

## 11.3 Lookup APIs

### Name search

```http
GET /finance/counterparties/search?q=S
```

Result combines existing:

- Customers
- Suppliers
- Ledger accounts

### Outstanding documents

```http
GET /finance/parties/:partyType/:partyId/outstanding-documents
```

Filters:

- Invoice/Bill
- As-of date
- Currency

### TDS ledgers

```http
GET /finance/accounts/tds?type=receivable
GET /finance/accounts/tds?type=payable
```

### TDS Section Master

```http
GET  /finance/tds-sections
POST /finance/tds-sections
GET  /finance/tds-sections/:sectionId
PATCH /finance/tds-sections/:sectionId
```

## 11.4 Internal integration

### Record successful commerce payment

This should preferably be an internal service call from the verified payment
finalization path rather than a user-facing endpoint.

Conceptual contract:

```text
recordSuccessfulPayment({
  provider,
  providerPaymentId,
  providerOrderId,
  merchantTransactionId,
  sourceType,
  sourceId,
  customerId,
  amount,
  currency,
  paymentDate
})
```

It must be safe to call multiple times.

### Link invoice generated after payment

Conceptual contract:

```text
linkPendingReceiptToInvoice({
  orderId,
  merchantTransactionId,
  invoiceId
})
```

---

## 12. Posting Algorithm

## 12.1 Manual posting

1. Authenticate user.
2. Verify Finance/Accounting permission.
3. Validate Bank/Cash account and active status.
4. Validate transaction date.
5. Validate existing party/ledger.
6. Validate exactly one of Debit/Credit.
7. Validate amount greater than zero.
8. Begin database transaction.
9. Lock the Bank/Cash account row.
10. Reload outstanding invoice/bill balances with locks.
11. Validate allocations and TDS.
12. Validate Bank Entry Amount equals Total Allocation Amount when Against
    Invoice/Bill is selected.
13. Insert Bank transaction.
14. Insert allocation/unapplied records.
15. Insert balanced journal and journal lines.
16. Update invoice/bill outstanding and status.
17. Calculate and persist `balance_after`.
18. Update account `current_balance`.
19. Insert audit event.
20. Commit.
21. Return the posted transaction.

Any error must roll back all changes.

## 12.2 Automatic e-commerce posting

1. Verify successful captured payment.
2. Resolve the order, customer, and active e-commerce default Bank account.
3. Begin database transaction.
4. Acquire idempotency protection for source payment.
5. Return existing result if already posted.
6. Create Bank Debit.
7. If invoice exists, allocate it.
8. Otherwise create an unapplied/pending link.
9. Create journal lines.
10. Update available balance.
11. Commit.

---

## 13. Running Balance Design

### 13.1 Normal posting

For a new latest-dated transaction:

```text
Balance After = Current Account Balance + Debit - Credit
```

Update `bank_cash_accounts.current_balance` only after successful posting.

### 13.2 Backdated entry

A backdated transaction affects every later running balance.

**Phase 1 proposal:** Permit backdated posting only for authorized users and
recalculate all later `balance_after` values inside a controlled service.

Alternative:

- Do not permit backdated transactions in Phase 1.

This requires Finance confirmation.

### 13.3 Edit/delete

Posted accounting transactions should not be hard-deleted.

**Proposed:**

- Draft may be edited/deleted.
- Posted transaction may only be reversed.
- Reversal creates an equal opposite transaction and reversal journal.
- Audit history remains intact.

---

## 14. Permissions and Audit

## 14.1 Proposed permission matrix

| Action | Accountant | Admin | Other roles |
| --- | --- | --- | --- |
| View accounts/transactions | Yes | Yes | No |
| Create Bank/Cash account | Yes | Yes | No |
| Post manual entry | Yes | Yes | No |
| Allocate invoices/bills | Yes | Yes | No |
| Reverse posted entry | Yes | Yes | No |
| Configure payment mapping | Yes | Yes | No |

## 14.2 Audit data

Capture:

- Created by and time
- Posted by and time
- Entry mode
- Source system
- Source identifiers
- Original request/reference
- Reversal reason
- Reversed by and time
- Allocation changes
- Before/after document balances

Sensitive payment payloads and bank account numbers must not be exposed in list
responses or logs.

---

## 15. Validation Rules

### Account

- Account Type is Bank or Cash.
- Account Name is required and unique within the organization.
- Bank Name, Account Number, and IFSC are required for Bank.
- Opening Balance and date are required.
- Inactive account cannot accept new postings.

### Transaction

- Date is required.
- Existing Name/ledger is required.
- Manual arbitrary Name is rejected.
- Exactly one of Debit/Credit is greater than zero.
- Amount must be greater than zero.
- Available Balance is never accepted from the client as authoritative.
- Customer receipt uses Debit.
- Vendor payment uses Credit.

### Allocation

- Allocation amount cannot be negative.
- TDS amount cannot be negative.
- TDS amount must be zero when TDS Applied is No.
- TDS ledger is required when TDS Applied is Yes.
- Total settled cannot exceed current outstanding.
- Against Invoice/Bill requires full allocation of the Bank Entry Amount.
- Advance, On Account, and Direct Ledger do not require document allocation.

### Automatic source

- Payment must be verified successful/captured.
- Source customer must resolve to an existing customer.
- An active e-commerce default Bank account must exist.
- Duplicate source payment must return the prior result, not create a new
  posting.

---

## 16. Error Handling

User-facing errors should be specific and safe.

Examples:

- `Allocated amount does not match the bank entry amount. Please allocate the full amount before posting.`
- `The selected invoice balance changed. Refresh the outstanding documents and try again.`
- `TDS ledger is required when TDS is applied.`
- `Only one of Debit or Credit can contain an amount.`
- `The selected account is inactive.`
- `No destination bank account is configured for this payment method.`

Provider retries and duplicate webhooks must produce successful idempotent
responses when the payment was already processed.

---

## 17. Minimum Acceptance Scenarios

## 17.1 Account foundation

1. Create Bank account with all required fields.
2. Reject Bank account without Bank Name/Account Number/IFSC.
3. Create Cash account without bank-only fields.
4. Opening balance appears as available balance.
5. Inactive account rejects new posting.

## 17.2 Running balance

Starting balance: ₹10,000.

| Entry | Debit | Credit | Expected balance |
| --- | ---: | ---: | ---: |
| Customer receipt | 5,000 | 0 | 15,000 |
| Vendor payment | 0 | 3,000 | 12,000 |
| Expense | 0 | 2,000 | 10,000 |

## 17.3 E-commerce payment with invoice available

- Captured payment: ₹5,000
- One Bank Debit: ₹5,000
- Invoice allocation: ₹5,000
- Invoice becomes Paid
- Duplicate webhook creates no duplicate transaction

## 17.4 E-commerce payment before invoice

- Captured payment: ₹5,000
- One Bank Debit: ₹5,000
- Advance/pending link: ₹5,000
- Invoice generated later
- Existing receipt linked
- No second Bank Debit
- Invoice becomes Paid

## 17.5 Retail partial allocation

- Bank Debit: ₹10,000
- Invoice A allocation: ₹5,000
- Invoice B allocation: ₹5,000
- Both invoices become Partially Paid
- Posting succeeds because total allocation equals Bank Debit

## 17.6 Customer TDS

- Bank Debit: ₹90,000
- Allocation: ₹90,000
- TDS Receivable: ₹10,000
- Invoice settlement: ₹1,00,000
- Invoice becomes Paid
- Journal debits equal credits

## 17.7 Vendor TDS

- Bank Credit: ₹90,000
- Allocation: ₹90,000
- TDS Payable: ₹10,000
- Bill settlement: ₹1,00,000
- Bill becomes Paid
- Journal debits equal credits

## 17.8 Validation

- Debit and Credit both entered: reject.
- Debit and Credit both zero: reject.
- Allocation less than Bank Entry Amount: reject.
- Allocation greater than outstanding: reject.
- TDS Yes without ledger: reject.
- Duplicate provider payment: return original posting.
- Concurrent allocation against the same remaining invoice: only one valid
  result may commit.

---

## 18. Testing Strategy

### Unit tests

- Debit/Credit validation
- Running-balance calculation
- Allocation totals
- TDS settlement
- Invoice status calculation
- Journal balancing
- Idempotency-key generation

### Service integration tests

- Create account and opening journal
- Manual customer receipt
- Manual vendor payment
- Multi-invoice allocation
- Advance and later invoice link
- E-commerce payment ingestion
- Duplicate webhook
- Database rollback on allocation failure
- Concurrent posting

### API tests

- Authorization
- Validation errors
- Search and pagination
- Outstanding-document lookup
- Posted transaction response
- Reversal

### Frontend tests

- Conditional account form
- Name search without free text
- Debit/Credit mutual exclusion
- Allocation popup totals
- TDS enable/disable behavior
- Save-button state
- Read-only running balance
- Auto-entry indicator

---

## 19. Migration and Rollout

### Step 1: Schema

- Add minimal finance-account tables.
- Add Bank/Cash tables.
- Add allocations and journals.
- Add indexes and constraints.
- Add the e-commerce default Bank-account control.

### Step 2: Configuration

- Create system ledgers:
  - Accounts Receivable
  - Accounts Payable
  - Customer Advance
  - Supplier Advance
  - TDS Receivable
  - TDS Payable
- Create Bank/Cash accounts.
- Mark one active Bank account as the e-commerce default.

### Step 3: Backend foundation

- Account services and APIs
- Posting engine
- Allocation engine
- Running balance
- Journal creation
- Audit

### Step 4: E-commerce integration

- Call accounting posting after verified payment success.
- Implement deferred invoice linking.
- Verify idempotency against checkout and webhook paths.

### Step 5: Retail In-store

- Customer receipt screen
- Outstanding invoice popup
- Allocation and TDS

### Step 6: Manual flows

- Customer receipt
- Vendor payment
- Direct ledger
- Advance/On Account

### Step 7: Controlled rollout

- Run migrations in a test environment.
- Configure one test Bank account.
- Replay representative payment scenarios.
- Reconcile commerce transactions against accounting transactions.
- Enable access for limited Finance users.
- Monitor duplicates, unmatched payments, and balance differences.

### Database deployment and change-control plan

The database process must not require a person to open and execute every SQL
file individually. Incremental files remain the audit history, while deployment
is performed through one migration command per environment.

#### Current frozen Phase 1 baseline

The final database state completed on 30 July 2026 is stored in:

```text
src/database/releases/20260730_cash_bank_phase1_release.sql
```

This release contains the complete Phase 1 foundation completed on that date:

- Finance, Cash/Bank, journal, transaction, allocation, TDS, audit, payment
  mapping, and e-commerce event tables
- Final indexes and duplicate account-name handling
- One active Bank-only e-commerce default account per organization
- Seven system finance accounts
- Twelve TDS sections
- Admin and Accountant Cash/Bank permissions
- Compatible incremental and frozen-release version records

The release file is a manual baseline artifact and is intentionally stored
under `src/database/releases`. The automatic migration runner does not execute
files from that directory.

Once this frozen file has been applied to an environment, it must not be
edited. A later database change must be recorded in a new dated migration.

#### Future database changes

Each approved database change must have a dated, immutable, idempotent file
under:

```text
src/database/migrations/
```

Example:

```text
20260731_cash_bank_add_settlement_reference.sql
```

Each migration must:

- Contain only the new change required after the previous release
- Be safe to execute more than once where practical
- Insert its unique version into `finance_schema_versions`
- Preserve existing data
- Include explicit handling and review for destructive changes
- Never modify a migration that has already been applied to any environment

Having many migration files is expected. Users must not execute 20 or more
files manually; the migration runner is responsible for ordering them.

#### Migration commands and ordering

The migration runner is implemented in:

```text
src/database/runMigrations.ts
src/scripts/runMigrations.ts
```

It reads `.sql` files from `src/database/migrations`, sorts them by filename,
and executes them in chronological filename order.

For a source-based/local deployment using the currently configured database:

```bash
npm run migrate:dev
```

For a compiled deployment:

```bash
npm run build
npm run migrate
```

The database connection comes from the active environment configuration.
Running the command once does not update DEV, UAT, and PROD together. The same
deployment workflow must be executed separately with each environment's
approved configuration.

The current runner re-executes all migration files and therefore requires every
migration to be idempotent. Before relying on it for long-term Production
deployment, enhance the runner to consult `finance_schema_versions` and a stored
checksum so that it:

1. Skips migrations already applied successfully.
2. Executes only missing migrations in filename order.
3. Rejects an applied migration whose checksum has changed.
4. Records the version, checksum, execution time, and result atomically.

This runner improvement is a deployment-control task and does not change the
approved accounting requirements.

#### Verification

The verification script is:

```text
src/scripts/verifyFinanceFoundation.ts
```

Run it after migration in every environment:

```bash
npm run verify:finance-foundation
```

Verification is read-only. It does not create tables, execute migration files,
or update another environment. It checks only the database selected by the
current environment configuration.

The controlled environment sequence is:

```text
Select target environment
  -> apply the baseline or run migrations
  -> run finance verification
  -> perform Cash/Bank smoke tests
  -> record the deployed version
```

For the initial rollout:

- DEV, UAT, and PROD may use the frozen Phase 1 baseline once.
- After the baseline, all environments use the same incremental migrations in
  the same filename order.
- An environment that is several migrations behind is updated with one
  migration command, not by manually executing each file.
- The verification command must pass before the environment is considered
  successfully updated.

---

## 20. Recommended Delivery Slices

The confirmed delivery order is:

| Order | Delivery | Release grouping |
| ---: | --- | --- |
| 1 | Common Cash/Bank account and transaction foundation, including TDS Section Master shell | Phase 1 |
| 2 | E-commerce Order automatic payment entries | Phase 1 |
| 3 | Automatic or deferred sales-invoice mapping | Phase 1 |
| 4 | Retail In-store receipts and manual invoice allocation | Phase 1 |
| 5 | TDS Receivable adjustment and applicable-section selection | Phase 1 |
| 6 | Manual Vendor payment, bill allocation, and TDS Payable | Phase 1 |
| 7 | Rental transactions | Future phase |
| 8 | Retail In-store Service/SR invoice receipts | Future phase |

E-commerce Repair/SR is not a payment source in this order. The future
Service/SR item means a customer actually pays a service invoice at the retail
store.

### Slice 0: Confirm prerequisites

- Confirm correct frontend repository/branch.
- Confirm destination Bank/Cash account per payment method.
- Confirm customer ID mapping.
- Confirm sales-invoice and purchase-bill tables.
- Confirm opening-balance offset ledger.

### Slice 1: Accounting base

- Minimal finance accounts
- Bank/Cash accounts
- Opening balance
- Transactions and running balance
- Journal engine
- TDS Section Master Add/Manage foundation
- Account APIs

### Slice 2: E-commerce Order auto-entry

- Payment-success integration
- Debit transaction
- Idempotency
- Pending invoice link
- Invoice-generation linking

### Slice 3: Retail In-store receipts

- Customer search
- Outstanding invoice lookup
- Allocation popup
- Partial/full allocation
- TDS Receivable
- Context-sensitive TDS section selection

### Slice 4: Manual and supplier flows

- Manual customer receipt
- Vendor payment
- Bill allocation
- TDS Payable
- Advance/On Account
- Direct Ledger

### Later slices

- Rental
- Retail In-store Service invoice collection
- Repair/Service Request payment integration, only if a real payment flow is
  introduced and approved
- Reconciliation
- Full Chart of Accounts UI
- Manual Journals UI
- Reports

---

## 21. Open Decisions Requiring Confirmation

These decisions should be resolved before or during the relevant slice:

1. Which frontend repository and branch will contain the accounting screens?
2. Does Credit Card belong in Phase 1 or a later phase?
3. Which ledger offsets the opening balance?
4. Which Bank/Cash account receives Razorpay, cash, and other payment methods?
5. Should online payments use a gateway clearing account before bank
   settlement?
6. Are backdated postings allowed in Phase 1?
7. What is the authoritative purchase-bill table and status field?
8. Should user-facing full-settlement status display `Paid` or `Fully Paid`?
9. Can TDS apply to Retail In-store sales, or only selected B2B customers?
10. Are advances available against both customer invoices and vendor bills?
11. Does On Account require later mandatory allocation?
12. Who can reverse posted entries?
13. Which event represents the accounting date for each provider: capture date
    or actual bank settlement date?
14. Should accounts users manually select an invoice for Retail In-store, or
    should the invoice created by the sale be selected automatically?
15. Should a payment greater than the invoice balance create an automatic
    advance for the remainder?

---

## 22. Definition of Done for Phase 1

Phase 1 is complete when:

- Bank and Cash accounts can be created with valid opening balances.
- Every posted transaction has one authoritative Debit/Credit value.
- Available balance is system-calculated and cannot be manually edited.
- Successful e-commerce payments create exactly one Bank Debit.
- Payments received before invoices are linked later without duplicate Bank
  entries.
- Retail In-store receipts can be allocated to outstanding invoices.
- Manual customer receipts and vendor payments follow the approved allocation
  rules.
- TDS Receivable and TDS Payable settlements work and create balanced journal
  entries.
- Invoice/bill outstanding amounts and statuses update atomically.
- Duplicate payment events do not duplicate accounting entries.
- Posted entries have an audit trail.
- Automated tests cover the critical calculations, posting, rollback,
  concurrency, and idempotency cases.
- Finance validates the acceptance scenarios and signs off the Phase 1 flow.
