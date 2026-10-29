# On Account Phase 4 Implementation Report

## Scope

Phase 4 allows Finance users to apply existing Customer On Account balances to
one or more eligible outstanding Invoices. It supports partial applications,
multiple source references, multiple Invoices, and Customer TDS Receivable.

No new Bank/Cash transaction is created. Supplier advances, Supplier Bill
applications, transfers, and reversals remain outside this phase.

## Implemented APIs

- `GET /finance/on-account/customers/:referenceId/application-context`
  - Returns the selected Customer, all usable Customer OA references, and all
    eligible outstanding Invoices.
- `POST /finance/on-account/customers/applications`
  - Accepts exact reference amounts and exact Invoice Bank Portion/TDS amounts.
  - Uses the existing Finance create permission.
  - Is idempotent through the caller's request reference.

## Atomic accounting behavior

One database transaction performs all of the following:

1. Locks the selected OA references in stable ID order.
2. Locks the selected Invoices in stable ID order.
3. Re-reads and validates every available and outstanding balance.
4. Creates one posted allocation Journal:
   - Debit Customer Advances by the total Bank Portion.
   - Debit TDS Receivable by the TDS amount, when applicable.
   - Credit Accounts Receivable by Bank Portion plus TDS.
5. Creates immutable `document_allocation` decrease movements.
6. Creates a source-reference-to-Invoice allocation bridge for each movement.
7. Updates OA used/available snapshots, lifecycle status, and version.
8. Updates Invoice payment history, paid amount, balance, and payment status.
9. Writes the finance audit event.
10. Makes the application visible in the Customer Statement.

Any validation or database failure rolls back the entire application.

## Allocation rules

- Every selected OA reference must belong to the same Customer and Organization.
- Every selected Invoice must belong to the same Customer and remain eligible.
- The selected OA amount must exactly equal the total Invoice Bank Portion.
- A reference amount cannot exceed its currently available amount.
- Bank Portion plus TDS cannot exceed an Invoice's current outstanding amount.
- TDS settles the Invoice but does not consume OA availability.
- Multiple-reference distribution follows the explicit reference order shown
  in the request and is persisted as individual immutable bridge rows.
- Duplicate request references return the existing posting rather than posting
  again.

## Implemented UI

- Added **Apply to invoices** to usable Customer OA reference details.
- The modal shows all available references for that Customer.
- Users select exact amounts from one or multiple references.
- Users select one or multiple outstanding Invoices.
- Each Invoice supports Bank Portion and optional TDS.
- A live summary shows selected OA, Invoice Bank Portion, TDS, total settlement,
  and any source/allocation difference.
- Posting is disabled until source and Bank Portion totals match.
- After posting, the reference detail refreshes and shows the immutable
  decrease movement, Invoice, Journal, and updated balances.

## Automated verification completed

- Backend TypeScript compile: passed.
- Frontend TypeScript compile and production build: passed.
- Backend automated suite: 114 tests passed.
- Added matrix coverage for:
  - one reference across multiple Invoices;
  - multiple references against one Invoice;
  - TDS counted once across split source movements;
  - mismatched source and Invoice totals;
  - Phase 4 request-schema validation.
- Backend restarted successfully and the new routes are loaded.

## Manual testing steps

### Prerequisites

- Use a Customer with an available OA reference from Phase 2.
- The same Customer must have at least one eligible outstanding In-Store,
  Rental, or Service Invoice.
- Record the current Bank/Cash account transaction count and balance before
  testing.

### Test 1 — Partial allocation without TDS

1. Open **On Account** and open an available Customer reference.
2. Select **Apply to invoices**.
3. Keep the current OA reference selected and change its Apply Amount to a
   value lower than both the available balance and Invoice outstanding amount.
4. Select one Invoice and enter the identical Bank Portion.
5. Leave TDS disabled and post.

Expected:

- A success message shows the Journal number.
- OA used amount increases by the Bank Portion.
- OA available amount decreases by the same amount.
- OA status becomes **Partially Applied** unless it was fully consumed.
- Invoice paid amount increases and outstanding balance decreases.
- Movement history shows a `document_allocation` decrease linked to the Invoice
  and Journal.

### Test 2 — Full allocation without TDS

1. Use an OA reference whose available amount can be completely applied.
2. Select Invoice Bank Portions whose combined value equals that full available
   amount.
3. Post the application.

Expected: OA available is `0.00`, used equals original, status is **Fully
Applied**, and the Apply action is no longer shown for that reference.

### Test 3 — Allocation with TDS

Example: Invoice outstanding `1,000`, OA Bank Portion `900`, TDS `100`.

1. Select OA Apply Amount `900`.
2. Select the Invoice and enter Bank Portion `900`.
3. Enable TDS and enter `100`.
4. Confirm total settlement is `1,000` and post.

Expected:

- OA availability decreases by `900`, not `1,000`.
- Invoice outstanding decreases by `1,000`.
- Journal debits Customer Advances `900` and TDS Receivable `100`.
- Journal credits Accounts Receivable `1,000`.

### Test 4 — One reference across multiple Invoices

1. Select one OA reference and an Apply Amount such as `1,000`.
2. Select two Invoices with Bank Portions such as `400` and `600`.
3. Post.

Expected: one Journal is created, both Invoices update, two traceable allocation
movements are shown, and total OA consumption is `1,000`.

### Test 5 — Multiple references against one Invoice

1. Select two available references for the same Customer.
2. Enter source amounts such as `300` and `700`.
3. Select one Invoice and enter Bank Portion `1,000`.
4. Post.

Expected: both references update by their exact selected amounts and the single
Invoice settles by `1,000` through one balanced Journal.

### Test 6 — Validation and rollback

Confirm posting is rejected for each case:

- OA source total and Invoice Bank Portion do not match.
- A source amount exceeds current OA availability.
- Bank Portion plus TDS exceeds Invoice outstanding.
- Zero or negative values.
- Reference or Invoice belongs to another Customer.
- A fully applied or reversed reference is submitted through the API.

Expected: no reference, Invoice, Journal, movement, or audit value changes.

### Test 7 — Duplicate request protection

Submit an identical valid API request twice with the same `requestreference`.

Expected: both responses return the same Journal/application, and balances are
updated only once.

### Test 8 — No Bank/Cash impact

Return to Cash & Bank Accounts and Transactions after an application.

Expected:

- No new Bank transaction exists.
- No Bank/Cash account balance changes.
- The original advance receipt remains unchanged and traceable.

### Test 9 — Customer Statement reconciliation

Open the Customer's **Statement** tab.

Expected: the On Account application appears as a Customer payment using its
Journal reference, and the running/current receivable agrees with the updated
Invoice outstanding amount.

## Phase gate

Stop after these tests. Phase 5 must not begin until the reviewer explicitly
approves Phase 4.
