# On Account Phase 8 Implementation Report

## Scope

Phase 8 completes the reporting, reconciliation, security, audit, compatibility,
and regression work for the Customer and Supplier On Account flows delivered in
Phases 1–7.

Customer-to-customer Journal transfer, subsequent-payment reversal, and reversal
of documents settled through a transferred balance remain a separate future
phase and are not implemented here.

## Statement implementation

- Added one shared, read-only On Account statement service for Customer and
  Supplier parties.
- Embedded the On Account statement in the existing Customer Statement and
  Supplier Statement responses without mixing it into normal receivable or
  payable activity.
- Added a reusable statement panel to both statement screens.
- The statement reports:
  - opening available balance for the selected period;
  - advance and other increase movements;
  - document-allocation decrease movements;
  - TDS settled against documents, separately from OA availability;
  - closing available balance;
  - current original, used, and available totals;
  - OA reference and lifecycle status;
  - source Bank/Cash transaction;
  - source Journal number when applicable;
  - allocated Invoice or Supplier Bill; and
  - actor and posting timestamps.
- Reference, source-transaction, and allocated-document values link to their
  existing application views where a route is available.
- Each reference and the overall statement show whether the stored snapshot,
  movement ledger, and allocation bridge reconcile.

## Reconciliation and audit verification

The release verifier now checks the live database for:

- required Phase 1 tables, columns, migration registration, constraints, and
  immutable-posting triggers;
- duplicate reference numbers and movement idempotency keys;
- legacy unapplied-balance compatibility;
- `original amount = used amount + available amount` for every reference;
- reference available balance against append-only movement totals;
- document allocation Bank Portions against document-allocation decrease
  movements;
- party-level availability against the sum of party references; and
- actor and timestamp completeness on references, movements, and allocations.

The verifier now closes its PostgreSQL pool after either success or failure, so
it exits deterministically in release automation.

## Security and compatibility

- Existing Finance/Admin route guards remain mandatory for OA creation and
  allocation operations.
- Read access remains guarded for OA lists, details, and statement data.
- The statement service scopes references, movements, transactions, Journals,
  allocations, and documents by Organization and party.
- Posted OA references and movements still have no application edit/delete API;
  database triggers continue to protect immutable financial fields.
- Existing Customer receipt, Supplier payment, Invoice, Bill, Cash/Bank,
  Customer Statement, and Supplier Statement response fields remain intact.
- Legacy compatibility objects and readers were not removed in this phase.

## Automated verification

- Backend TypeScript build: passed.
- Frontend production build: passed.
- Backend suite: **126 tests passed across 26 suites**.
- Phase 8 tests cover:
  - period opening, increases, decreases, TDS, and closing availability;
  - TDS exclusion from spendable OA availability;
  - invalid statement periods and malformed movement audit data; and
  - denial of Finance statement access to missing/non-Finance roles.
- Live database release verifier: passed.

Verifier result:

```text
[On Account Release] Schema, migration, immutability, audit, reference,
movement, allocation, and party balances verified successfully.
```

The frontend build retains the project's existing stale Browserslist-data and
large-chunk advisory warnings; neither is a Phase 8 functional failure.

## Manual acceptance testing

Use a Finance/Admin account for tests 1–8. Record the starting Bank/Cash, OA,
Invoice/Bill, and statement values before posting any new test transactions.

### 1. Customer statement lifecycle

1. Record a Customer advance using **Transactions → Record transaction →
   Customer advance → On Account**.
2. Open **Customer Statement**, select that Customer, and open **Statement**.
3. Locate the On Account statement section.

Expected:

- The advance appears as an increase under its OA reference.
- Opening, increase, and closing values reconcile.
- The source transaction link opens the correct Bank receipt.
- Normal Invoice/receipt statement activity remains separate and unchanged.

### 2. Customer Invoice application and TDS

1. Apply some or all of the Customer OA balance to an outstanding Invoice.
2. Include TDS Receivable in one test application.
3. Reopen the Customer statement for a period containing the advance and
   application.

Expected:

- The OA Bank Portion appears as a decrease.
- TDS appears separately and does not reduce OA availability a second time.
- The allocated Invoice link opens the correct Invoice.
- Closing availability equals opening plus increases minus decreases.
- The Invoice outstanding balance and normal Customer statement settlement
  agree with the application.

### 3. Supplier statement lifecycle

1. Record a Supplier advance through **Transactions → Record transaction →
   Supplier advance → On Account**.
2. Open the Supplier detail and its **Statement** tab.

Expected:

- The advance appears as an increase against the Supplier OA reference.
- The source Bank payment is linked.
- Supplier payable/Bill activity remains separate from OA availability.

### 4. Supplier Bill application and TDS

1. Apply the Supplier OA balance to an outstanding Supplier Bill.
2. Include TDS Payable in one application.
3. Reopen the Supplier statement.

Expected:

- The OA Bank Portion appears as a decrease.
- TDS is reported separately and is not deducted twice from availability.
- The allocated Bill link opens the correct Supplier document.
- OA closing availability, Bill outstanding, and the Supplier statement agree.

### 5. Date-period behavior

For both a Customer and Supplier with an advance before the selected `From`
date and an application inside the period:

1. Set a date range that excludes the advance but includes the application.
2. Reload the statement.

Expected:

- The advance is included in opening availability, not as a period increase.
- The application is a period decrease.
- Closing availability still equals opening plus increases minus decreases.

### 6. Search and navigation

1. Open an OA reference from each statement.
2. Open its source Bank/Cash transaction.
3. Open its allocated Invoice or Supplier Bill.
4. Return to the statement and confirm the same reference/document association.

Expected: every navigation target belongs to the same Organization, party,
reference, and posted application.

### 7. Permissions and Organization isolation

1. Attempt OA list/detail/statement access using a user without Finance read
   permission.
2. Attempt creation/allocation using a user without Finance create permission.
3. If a second Organization is available, confirm its users cannot retrieve or
   allocate the first Organization's references or documents.

Expected: access is denied, and no cross-Organization data or partial posting is
visible.

### 8. Duplicate and concurrent attempts

1. Retry a successful Customer and Supplier application using the same request
   reference.
2. From two sessions, attempt to consume the same remaining OA balance at the
   same time.

Expected:

- The idempotent retry returns the original result without another movement,
  allocation, Journal, or balance change.
- Concurrent over-consumption is rejected or serialized; availability never
  becomes negative.

### 9. Existing direct-payment regression

1. Post a normal Customer receipt **Against invoices**, not On Account.
2. Post a normal Supplier payment **Against bills**, not On Account.

Expected: both existing flows behave as before, update Bank/Cash and their
documents once, and do not create an OA reference.

### 10. Cross-module balance reconciliation

For the records used above, compare:

- OA list and detail original/used/available values;
- Customer or Supplier OA statement opening/movement/closing values;
- Invoice or Bill outstanding values;
- Bank/Cash transaction and balance changes from the original advance only;
- Journals created by the advance and document application; and
- TDS Receivable or TDS Payable entries.

Expected: all values reconcile, and applying existing OA never creates another
Bank/Cash transaction.

## Release boundary and approval

Phase 8 is the final phase in the approved Customer/Supplier On Account plan.
The feature is ready for the manual acceptance tests above. Final release remains
subject to reviewer approval after those tests pass.

