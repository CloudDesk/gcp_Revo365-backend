# On Account Phase 6 Implementation Report

## Scope

Phase 6 adds the Supplier equivalent of the approved Customer On Account list
and reference-detail experience. It is a read-only phase: applying Supplier On
Account balances to Bills and Supplier TDS settlement remain Phase 7.

## Implemented backend

- Added paginated Supplier OA list and Supplier reference-detail APIs.
- Added Supplier name, code, email, mobile, OA number, Bank transaction,
  external reference, and Journal search.
- Added Supplier, lifecycle status, and date filters.
- Added filtered totals for Supplier count, original, used, and available.
- Reused shared lifecycle, movement reconciliation, source Bank transaction,
  Journal, and movement serialization behavior.
- Enforced Organization scope and `partytype = 'supplier'` on list and detail.
- Customer endpoints retain their explicit `partytype = 'customer'` scope.

## Implemented frontend

- Added **Customers** and **Suppliers** tabs inside the existing On Account
  module.
- Supplier tab provides summary cards, search, filter popover, status display,
  consistent table spacing, and pagination.
- Supplier detail shows original, used, and available balances; lifecycle and
  reconciliation; Supplier identity; source Bank transaction; Journal/audit
  metadata; and immutable movement history.
- Source Bank transaction opens the existing Transactions module.
- Supplier detail intentionally has no application action in Phase 6.
- Returning from Supplier detail preserves the Supplier tab.

## Verification completed

- Backend TypeScript compile: passed.
- Frontend TypeScript compile: passed.
- Frontend production build: passed.
- Backend automated suite: 118 tests passed.
- Added tests for Organization/party read scope, Supplier lifecycle totals, and
  movement reconciliation.
- Runtime verification confirmed the Phase 5 Supplier advance appears with its
  OA number, Supplier, Bank transaction, Journal, balances, and origin movement.
- Runtime verification confirmed Customer references do not appear in the
  Supplier tab and Supplier references do not appear in the Customer tab.

## Manual testing steps

### Test 1 — Supplier list and totals

1. Open **On Account** from the sidebar.
2. Select the **Suppliers** tab.

Expected:

- The Phase 5 `OA-S-...` advance appears.
- Supplier count and original/used/available cards match the visible filtered
  records.
- The record shows Supplier identity, source transaction, values, and status.

### Test 2 — Search

Search separately using:

- OA reference number;
- Supplier name;
- Supplier code;
- Supplier email or mobile;
- Bank transaction number;
- Journal number.

Expected: the matching Supplier reference is returned and unrelated references
are excluded.

### Test 3 — Filters and pagination

1. Open **Filters**.
2. Test Supplier, status, From Date, and To Date independently and together.
3. Clear the filters.
4. If more than ten records exist, move between pages.

Expected: table records, totals, count, and pagination reflect the active
filter set.

### Test 4 — Supplier reference detail

Open a Supplier OA row.

Expected:

- OA number, Open/Partially Applied/Fully Applied/Reversed status, currency,
  and Reconciled indicator are correct.
- Supplier name, code, email, and mobile are correct.
- Original = Used + Available.
- Bank transaction and Journal match the Phase 5 posting.
- Movement history contains the immutable `cash_bank_origin` increase.
- No **Apply to Bills** action is shown in this phase.

### Test 5 — Source navigation

Select the Bank transaction in Supplier reference detail.

Expected: Transactions opens with the correct transaction selected or filtered.

### Test 6 — Customer/Supplier isolation

1. Inspect the **Suppliers** tab and confirm only `OA-S-...` records appear.
2. Inspect the **Customers** tab and confirm only `OA-C-...` records appear.
3. Attempt to open a Customer reference ID through the Supplier API path.

Expected: the cross-party detail request returns not found; no identities or
balances are mixed.

## Phase boundary

Phase 6 exposes and traces Supplier balances only. Supplier Bill selection,
On Account consumption, TDS Payable, Bill updates, and application Journals
must wait for Phase 7 approval.
