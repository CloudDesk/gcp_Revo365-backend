# On Account Phase 5 Implementation Report

## Scope

Phase 5 allows Finance users to pay a Supplier advance from an active Bank/Cash
account without selecting a Bill. The complete amount is retained as a
Supplier On Account balance for later use.

Applying Supplier balances to Bills, Supplier On Account list/detail screens,
transfers, and reversals remain outside this phase.

## Implemented workflow

- The existing Supplier payment endpoint now accepts an explicit
  `allocationmethod` of `against_document` or `on_account`.
- Omitting the field continues to use the existing against-Bill behavior.
- On Account mode requires a Supplier, date, positive amount, and request
  reference, and rejects Bill allocations.
- The Supplier selector includes active, non-deleted Suppliers even when they
  have no outstanding Bills.
- The response includes the stable generated `OA-S-########` reference and its
  original, used, available, and status values.

## Atomic accounting behavior

One database transaction performs all of the following:

1. Locks the Organization/request reference and the selected Bank/Cash account.
2. Validates the account, Supplier, accounting date, amount, and system ledger.
3. Posts a Bank/Cash credit and reduces the account balance.
4. Creates a balanced Journal:
   - Debit Supplier Advances.
   - Credit the selected Bank/Cash ledger.
5. Creates the Supplier OA reference with its full amount available.
6. Creates one immutable `cash_bank_origin` increase movement.
7. Writes the finance audit event.

Any failure rolls back the Bank transaction, Journal, OA reference, movement,
account balance, and audit event together. Reusing the same request reference
returns the original posting instead of creating a duplicate.

## Implemented UI

- Added **Against bills** and **On Account** purposes to Supplier payment.
- Existing Bill selection and TDS controls remain unchanged in Against Bills.
- On Account mode hides Bill and TDS controls and accepts a direct advance
  amount.
- A posting summary shows the Bank payment and new available On Account amount.
- The success notification displays the generated Supplier OA reference.

## Automated verification completed

- Backend TypeScript compile: passed.
- Frontend TypeScript compile: passed.
- Backend automated suite: 116 tests passed.
- Added coverage for Supplier allocation-method normalization, legacy contract
  compatibility, allocation-free advances, invalid mixed-mode allocations, and
  the Supplier On Account source type.

## Manual testing steps

### Prerequisites

- Use an active Bank/Cash account with enough available balance.
- Note its current balance.
- Choose an active Supplier. A Supplier without outstanding Bills is useful for
  confirming the new selector behavior.

### Test 1 — Create a Supplier advance

1. Open **Transactions** or an individual Cash & Bank Account.
2. Select **Record transaction**, then **Supplier payment**.
3. Change Payment Purpose to **On Account**.
4. Select a Supplier, date, and a positive Paid Amount.
5. Optionally enter remarks and select **Post supplier advance**.

Expected:

- Posting succeeds and the message contains an `OA-S-########` reference.
- No Bill selection or TDS fields are shown in On Account mode.
- The transaction appears as a Supplier payment/credit.
- The Bank/Cash balance decreases by exactly the paid amount.

### Test 2 — Verify accounting entries

Open the new transaction and its Journal details.

Expected:

- Bank transaction Entry Side is **Credit**.
- Supplier Advances is debited by the payment amount.
- The selected Bank/Cash ledger is credited by the same amount.
- Journal debit equals Journal credit.
- Allocation Method is **On Account** and the Supplier is traceable.

### Test 3 — Verify OA persistence

Until the Phase 6 Supplier list/detail UI is added, verify using the API or
database:

- `on_account_references` contains one Supplier reference with the displayed
  OA number.
- Original and available amounts equal the payment; used amount is zero; status
  is open.
- `on_account_movements` contains one immutable `cash_bank_origin` increase.
- The reference points to the new Bank transaction and Journal.

### Test 4 — Supplier without Bills

1. Open the modal in On Account mode.
2. Search for a Supplier that has no outstanding Bills.
3. Post a valid advance.

Expected: the Supplier is selectable and the advance posts normally.

### Test 5 — Validation and rollback

Confirm posting is rejected for zero/negative amount, inactive account,
unknown Supplier, and an unsupported backdated date.

Expected: no Bank balance, transaction, Journal, OA reference, movement, or
audit value changes.

### Test 6 — Duplicate protection

Submit the same valid API payload twice with the same `requestreference`.

Expected: both responses identify the same Bank transaction, Journal, and OA
reference, and the Bank balance decreases only once.

### Test 7 — Existing Supplier Bill payment regression

1. Reopen Supplier payment and keep **Against bills** selected.
2. Select a Supplier and Bill, enter the Bank allocation, and optionally enable
   TDS Payable.
3. Post the payment.

Expected: the existing payment, Bill settlement, TDS, Journal, and balance
behavior remains unchanged.

## Phase boundary

Phase 5 creates and preserves Supplier advance balances only. Do not expect a
Supplier On Account navigation/list page or Bill application action until the
approved later phases.
