# On Account Phase 7 Implementation Report

## Scope

Phase 7 allows an existing Supplier On Account balance to settle eligible
outstanding Supplier Bills. It supports partial/full allocations, multiple On
Account references, multiple Bills, and Supplier TDS Payable. The operation
does not create another Bank/Cash transaction.

Journal transfers between parties and later reversal workflows remain outside
this phase.

## Backend implementation

- Added a Supplier application-context endpoint that returns:
  - the selected Supplier;
  - every usable OA reference for that Supplier and Organization;
  - eligible outstanding Supplier Bills; and
  - the Organization's statutory TDS sections.
- Added an atomic Supplier Bill application endpoint.
- Locks OA references and Bills before validating availability and outstanding
  balances.
- Enforces Supplier ownership, Organization scope, unique source/document
  selection, exact source-to-Bank-Portion matching, and idempotency.
- Reuses the existing Supplier Bill balance, eligibility, status, TDS-section,
  and TDS Payable validation rules.
- Creates the application Journal:
  - Debit Accounts Payable by Bank Portion plus TDS;
  - Credit Supplier Advances by Bank Portion; and
  - Credit TDS Payable by TDS, when selected.
- Creates immutable OA decrease movements and purchase-Bill allocation
  bridges.
- Updates OA used/available snapshots and lifecycle status.
- Appends the settlement and TDS statutory snapshot to Bill payment history,
  then updates the Bill balance and status.
- Writes a Finance audit event with references, Bills, amounts, and allocation
  bridges.
- Does not insert or update `bank_transactions` or Bank/Cash balances.

## Frontend implementation

- Added **Apply to bills** to usable Supplier OA references.
- Added a Supplier allocation dialog with:
  - multi-reference selection and exact source amounts;
  - multi-Bill selection and Bank Portion per Bill;
  - TDS toggle, statutory section, and TDS amount per Bill;
  - live OA, Bank Portion, TDS, total-settlement, and difference totals;
  - over-allocation and required-section validation; and
  - an explicit statement that no new Bank transaction is created.
- Reloads the Supplier reference after a successful application so balances and
  movement history immediately reflect the posting.

## Automated verification

- Backend TypeScript build: passed.
- Frontend production build: passed.
- Backend test suite: 122 tests passed across 25 suites.
- Phase 7 checks cover:
  - multiple references and Bills;
  - TDS counted once when a Bill is split across references;
  - Bill settlement with TDS Payable;
  - over-settlement rejection;
  - statutory-section validation; and
  - strict request schema validation.

## Runtime verification

Using the approved Phase 5 Supplier advance, the signed-in application was
verified without posting:

- `OA-S-00000001` showed **Apply to bills**.
- The dialog loaded Supplier `ABC Industrial Supplies Pvt. Ltd.` and only its
  outstanding Bill.
- The available OA value was ₹10,000.00.
- Selecting the Bill suggested a ₹10,000.00 Bank Portion and reconciled the
  source total.
- The Supplier TDS catalogue was available and remained disabled until TDS was
  selected.
- The dialog was cancelled, so no runtime accounting data was changed.

## Manual testing

### 1. Partial application without TDS

1. Open **On Account → Suppliers**.
2. Open an available Supplier reference.
3. Click **Apply to bills**.
4. Select one outstanding Bill.
5. Enter a Bank Portion lower than both the Bill outstanding and OA available
   balance.
6. Change the selected OA amount to exactly match the Bank Portion.
7. Post.

Expected:

- OA used increases by the Bank Portion and available decreases by the same
  amount.
- Bill outstanding decreases by the Bank Portion.
- A document-allocation decrease movement and balanced Journal are shown.
- No new row appears in Transactions and no Bank/Cash balance changes.

### 2. Application with TDS Payable

Example: OA Bank Portion ₹9,000 and TDS ₹1,000 against a Bill with at least
₹10,000 outstanding.

1. Select the reference and Bill.
2. Enter `9000` as the OA/reference amount and Bill Bank Portion.
3. Enable TDS, select a statutory section, and enter `1000`.
4. Post.

Expected:

- OA availability decreases only by ₹9,000.
- Bill outstanding decreases by ₹10,000.
- Journal debits Accounts Payable ₹10,000, credits Supplier Advances ₹9,000,
  and credits TDS Payable ₹1,000.
- Bill payment history retains the chosen statutory TDS section.
- No Bank transaction is created.

### 3. Multiple references and multiple Bills

1. Ensure one Supplier has at least two available OA references and two
   outstanding Bills.
2. Select both references and Bills.
3. Make the reference total exactly equal to total Bill Bank Portions.
4. Optionally apply TDS to one Bill and post.

Expected: every reference, Bill, movement, allocation bridge, and Journal total
reconciles; TDS is applied once to its Bill.

### 4. Validation and isolation

Verify that posting is rejected when:

- OA source total differs from total Bill Bank Portion;
- OA usage exceeds available balance;
- Bank Portion plus TDS exceeds Bill outstanding;
- TDS is enabled without a positive amount or statutory section;
- a Bill or OA reference belongs to another Supplier; or
- duplicate references or Bills are submitted.

Expected: the entire request rolls back with no partial Bill, OA, Journal,
movement, audit, or Bank/Cash change.

### 5. Idempotency

Retry the same successful request using the same request reference.

Expected: the original result is returned; balances, movements, allocations,
and Journal are not duplicated.

## Phase boundary

Phase 7 covers Supplier Bill application only. Cross-customer Journal transfer,
subsequent-payment reversal, and transferred-balance reversal are not included.
