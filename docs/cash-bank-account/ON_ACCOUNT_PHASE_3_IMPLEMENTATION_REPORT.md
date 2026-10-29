# On Account Phase 3 Implementation Report

## Scope

Phase 3 adds the read-only Customer On Account workspace. Finance users can
review Customer advances created in Phase 2, reconcile the displayed balances
with their immutable movements, and trace each reference back to its source
Bank/Cash transaction and Journal.

Applying an On Account balance against an Invoice remains outside this phase.

## Implemented APIs

- `GET /finance/on-account/customers`
  - Organization-scoped, Customer-only references.
  - Ten records per page by default, with a maximum page size of 100.
  - Search by OA reference, Customer name/email/mobile, source identifier,
    Bank transaction number, payment reference, merchant reference, or Journal
    number.
  - Filter by Customer, lifecycle status, and source/created date range.
  - Returns filtered totals for Customers, original amount, used amount, and
    available amount.
- `GET /finance/on-account/customers/:referenceId`
  - Organization-scoped reference lookup with ownership validation.
  - Returns the source Bank/Cash transaction, source Journal, immutable
    movements, related allocations where present, balance reconciliation, and
    audit metadata.

Both routes use the existing Finance read permission boundary.

## Implemented UI

- Added **On Account** to the Finance section of the sidebar.
- Added a dedicated Customer On Account list page with:
  - aggregate balance cards;
  - a separate search layout;
  - Customer, status, and date filters in a compact popover;
  - standard dense table spacing and ten-row pagination;
  - status and reconciliation indicators.
- Added a read-only OA reference detail page with:
  - original, used, and available balances;
  - Customer identity;
  - linked source Bank/Cash transaction;
  - source Journal information;
  - immutable movement history and audit values.
- Existing users with legacy Cash & Bank route scopes can see the new Finance
  child page without requiring a saved-sidebar reset.

## Balance reconciliation

For every reference the API derives a movement balance as:

`sum(increases) - sum(decreases)`

The reference is marked reconciled only when that value equals the stored
available amount at two-decimal money precision. Phase 3 does not update either
value; it only exposes any discrepancy.

## Automated verification completed

- Backend TypeScript compile: passed.
- Frontend TypeScript compile: passed.
- Backend automated suite: 110 tests passed.
- Frontend production build: passed.
- Added tests for status-filter validation and movement-ledger reconciliation.

## Manual testing steps

### Prerequisite

Use the Customer advance created and approved during Phase 2. Restart the
backend before testing so the new routes are loaded.

### Test 1 — Open the Customer On Account list

1. Sign in as a user with Cash & Bank read permission.
2. Select **On Account** from the sidebar.

Expected:

- The page header says **On Account**.
- The Phase 2 OA reference is listed.
- Customer, original, used, and available summary cards are shown.
- The new advance shows original and available amounts equal to the receipt,
  used amount `0.00`, and status **Open**.
- Pagination is at the bottom and shows ten records per page.

### Test 2 — Search

Search separately using values that belong to the Phase 2 advance:

- OA reference, such as `OA-C-00000001`;
- Customer name, email, or mobile;
- Bank transaction number;
- receipt/payment request reference;
- linked Journal number.

Expected: the matching reference remains and unrelated references are removed.
Clear the search and confirm all records return.

### Test 3 — Filters

1. Open **Filters**.
2. Filter by the advance's Customer.
3. Filter by **Open** status.
4. Apply From/To dates containing the receipt date.
5. Change the dates so the receipt is outside the range.
6. Select **Clear**.

Expected:

- Filters update the results automatically.
- The summary cards represent the filtered records, not the unfiltered total.
- The outside date range shows the neat empty state.
- Clear restores the complete list.

### Test 4 — Reference details and traceability

1. Select the Phase 2 OA reference row.
2. Verify the reference header, Customer, status, currency, original amount,
   used amount, available amount, source transaction, Journal, and audit data.
3. Verify movement history contains one `cash_bank_origin` increase for the
   complete receipt amount.
4. Select the linked Bank transaction.

Expected:

- The reference is marked reconciled.
- Movement balance equals available balance.
- The source link opens the existing Transactions page and its transaction
  details.
- No Allocate, Apply, Reverse, or other mutation action is present.

### Test 5 — Pagination and empty results

If more than ten Customer references exist:

1. Verify page one contains at most ten rows.
2. Move to the next and previous pages.
3. Search for a value that cannot exist.

Expected: page navigation, record counts, and the empty state remain correct.

### Test 6 — Organization isolation

If a second Organization login is available, copy a reference ID from the
first Organization and request:

`GET /finance/on-account/customers/<reference_id>`

Expected: the second Organization receives not found and cannot see the first
Organization's reference in list, search, summaries, or details.

### Test 7 — Existing transaction regression

Open **Transactions**, **Cash & Bank Accounts**, and the Phase 2 source
transaction.

Expected: existing transaction list/detail behavior and Bank/Cash balances are
unchanged by the new read-only pages.

## Phase gate

Stop after these tests. Phase 4 must not begin until the reviewer explicitly
approves Phase 3.
