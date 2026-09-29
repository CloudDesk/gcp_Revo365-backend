# On Account Phase 2 Implementation Report

## Scope

Phase 2 adds Customer advance receipt creation without selecting an Invoice.
It deliberately does not add On Account listing or allocation screens; those
belong to later approved phases.

## Implemented behavior

- The existing Customer receipt endpoint accepts an optional
  `allocationmethod` value:
  - `against_document` keeps the existing Invoice allocation flow.
  - `on_account` creates a Customer advance and permits no Invoice allocations.
- Omitting `allocationmethod` continues to mean `against_document`, preserving
  existing clients and workflows.
- On Account customer search includes Customers even when they have no
  outstanding Invoices.
- The Customer receipt modal now has a payment-purpose choice and a direct
  amount field for On Account receipts.
- A successful advance returns and displays its stable OA reference.
- The submit action remains disabled while the request is processing.

## Atomic accounting result

One database transaction creates all of the following:

1. A posted Bank/Cash transaction with `allocationmethod = 'on_account'`.
2. A balanced Journal:
   - Debit the selected Bank/Cash ledger.
   - Credit `SYS-CUSTOMER-ADVANCE`.
3. One open Customer record in `on_account_references` with:
   - `originalamount = receipt amount`
   - `usedamount = 0`
   - `availableamount = receipt amount`
4. One immutable `cash_bank_origin` increase in `on_account_movements`.
5. The selected Bank/Cash account balance increase.
6. A finance audit event.

No `bank_transaction_allocations` row is created and no Invoice is changed.
Any failure rolls back the complete posting.

## Idempotency

The caller's `requestreference` is used as the idempotency reference. A
transaction-scoped advisory lock serializes concurrent attempts using the same
Organization and request reference. A retry returns the original Bank/Cash
transaction and OA reference instead of posting a duplicate.

## Automated verification completed

- Backend TypeScript compile: passed.
- Frontend TypeScript compile: passed.
- Backend automated suite: 108 tests passed.
- Added schema tests for legacy Invoice receipts and allocation-free On Account
  receipts.
- Added allocation-method normalization and invalid-value tests.

## Manual testing steps

### Prerequisite

Phase 1 must already be applied and verified. Use an active Bank/Cash account
whose latest posted transaction date is not later than the test receipt date.

### Test 1 - Create a Customer advance

1. Open **Cash & Bank Accounts**.
2. Open an active Bank or Cash account.
3. Select **Record transaction**, then the Customer receipt option.
4. Change **Payment purpose** to **On Account**.
5. Confirm the Rental option, TDS controls, and Invoice table are hidden.
6. Search for and select a Customer. Also test a Customer with no outstanding
   Invoice if one is available.
7. Enter a receipt date, amount such as `1000.00`, and optional remarks.
8. Select **Post customer advance** once.

Expected:

- A success message includes a stable reference such as `OA-C-00000001`.
- The Bank/Cash transaction appears as a debit for the Customer.
- The account available balance increases by exactly `1000.00`.
- No Invoice balance or payment status changes.

### Test 2 - Verify the transaction and Journal

Open the created transaction and verify:

- Allocation method is On Account.
- Source/reference contains the generated OA reference.
- Debit amount equals the receipt amount.
- The linked Journal is posted and balanced.
- Bank/Cash ledger debit equals the receipt amount.
- Customer Advances ledger credit equals the receipt amount.

### Test 3 - Verify canonical On Account records

Use the generated OA reference in the following read-only queries:

```sql
SELECT
  id,
  referencenumber,
  partytype,
  partyid,
  originalamount,
  usedamount,
  availableamount,
  status,
  sourcebanktransactionid,
  sourcejournalentryid
FROM on_account_references
WHERE referencenumber = 'OA-C-00000001';
```

Expected: one Customer row, `status = 'open'`, original and available amounts
equal the receipt, and used amount is zero.

```sql
SELECT
  movementtype,
  direction,
  amount,
  banktransactionid,
  journalentryid,
  idempotencykey
FROM on_account_movements
WHERE onaccountreferenceid = <reference_id>;
```

Expected: one `cash_bank_origin` / `increase` movement for the full amount.

```sql
SELECT COUNT(*) AS allocation_count
FROM bank_transaction_allocations
WHERE banktransactionid = <bank_transaction_id>;
```

Expected: `allocation_count = 0`.

### Test 4 - Validation

Confirm each attempt is rejected without creating records or changing the
account balance:

- No Customer selected.
- Empty, zero, or negative amount.
- Inactive Bank/Cash account.
- Receipt date earlier than the account's latest posted transaction date.

### Test 5 - Existing Invoice receipt regression

1. Open the same Customer receipt flow.
2. Keep **Against invoices** selected.
3. Select a Customer and an outstanding Invoice.
4. Allocate a valid amount and post the receipt.

Expected: the existing receipt behavior is unchanged; the Invoice is updated,
the allocation is created, and no new OA reference is created.

### Test 6 - Idempotent retry (API verification)

Submit the same valid On Account request twice with an identical
`requestreference`.

Expected:

- Both responses identify the same Bank transaction and OA reference.
- Only one Bank transaction, one Journal, one OA reference, and one origin
  movement exist.
- The Bank/Cash balance increases only once.

## Phase gate

Stop after these tests. Phase 3 must not begin until the reviewer explicitly
approves Phase 2.
