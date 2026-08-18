# On Account Of — Phased Implementation Plan

## 1. Document Status

This document defines the approved implementation sequence for the Customer and
Supplier **On Account Of** capability. It is an execution plan only; creating
this document does not authorize or begin implementation.

Implementation must proceed one phase at a time. After each phase:

1. The implementation is completed only for that phase.
2. Relevant automated checks are run.
3. A manual test guide is provided to the reviewer.
4. The reviewer performs manual testing.
5. Issues found during testing are corrected within the same phase.
6. Work on the next phase begins only after explicit reviewer approval.

This plan is based on `ON_ACCOUNT_OF_REFERENCE_PLAN.md`, with Journal transfers
and their downstream reversal workflows intentionally deferred to a later
project phase.

## 2. Objective

Support money received from a Customer or paid to a Supplier before a specific
Invoice or Bill is selected, and later allow that available amount to be applied
to eligible documents without creating a second Cash/Bank transaction.

The implementation must maintain:

- A stable system-generated On Account reference
- The owning Organization and Customer/Supplier
- Original amount
- Used amount
- Unused/available amount
- Source Cash/Bank transaction and Journal links
- Document allocation history
- Bank portion, TDS amount, and total settlement
- Auditability, idempotency, and concurrency safety

## 3. Confirmed Scope

### Included

- Customer advance receipt without Invoice selection
- Supplier advance payment without Bill selection
- Customer and Supplier On Account reference list and detail views
- Original, used, and available balance tracking
- Full and partial document allocation
- One On Account reference applied across multiple documents
- Multiple On Account references applied to one document
- TDS support equivalent to the existing receipt/payment flows
- Customer statement and Supplier statement integration
- Migration of compatible existing `party_unapplied_amounts` data
- Search, filtering, traceability, reconciliation, and audit information
- Backward compatibility with existing direct Invoice/Bill payment flows

### Excluded

- Journal transfers between Customers
- Journal transfers between Suppliers
- Cross-party or cross-organization transfers
- Automatic reversal of earlier transfers when a later payment is received
- Reopening documents because a transferred balance was reversed
- New transfer/reclassification approval workflows
- Foreign-currency On Account allocation or exchange-rate processing
- Editing or deleting posted On Account movements
- Rewriting historical Journals during migration

## 4. Core Accounting Rules

### Customer advance receipt

```text
Dr Bank/Cash
Cr Customer Advances
```

### Customer On Account allocation

Example: apply a Bank Portion of 45,000 and TDS of 5,000 to an Invoice of
50,000.

```text
Dr Customer Advances      45,000
Dr TDS Receivable          5,000
Cr Accounts Receivable    50,000
```

Only the 45,000 Bank Portion reduces the available On Account balance. TDS
settles the Invoice but does not reduce the On Account balance.

### Supplier advance payment

```text
Dr Supplier Advances
Cr Bank/Cash
```

### Supplier On Account allocation

Example: apply a Bank Portion of 45,000 and TDS of 5,000 to a Bill of 50,000.

```text
Dr Accounts Payable       50,000
Cr Supplier Advances      45,000
Cr TDS Payable             5,000
```

Only the Bank Portion reduces the available Supplier On Account balance.

## 5. Phase Names and Order

1. **On Account Database Foundation and Legacy Migration**
2. **Customer Advance Payment Creation**
3. **Customer On Account List and Reference Details**
4. **Customer Invoice Application with TDS**
5. **Supplier Advance Payment Creation**
6. **Supplier On Account List and Reference Details**
7. **Supplier Bill Application with TDS**
8. **Statements, Reconciliation, Security, and Final Regression**

The ordering is mandatory unless the plan is revised and approved before the
affected phase begins.

---

## Phase 1 — On Account Database Foundation and Legacy Migration

### Goal

Create the durable data model required by every later phase, while preserving
the existing Cash/Bank and unapplied-amount behavior.

### Database work

Introduce the following conceptual structures. Final table and constraint names
will follow repository conventions during implementation.

#### On Account reference header

Store:

- Internal ID
- Organization ID
- Stable On Account number
- Party type: `customer` or `supplier`
- Party ID
- Currency
- Source type and source ID
- Original amount
- Used amount snapshot
- Available amount snapshot
- Derived lifecycle status
- Version/concurrency field
- Created/updated audit fields

Reference numbers must be unique within an Organization and immutable after
posting. Proposed formats:

```text
OA-C-00000001
OA-S-00000001
```

#### On Account movement ledger

Store append-only increases and decreases, including:

- Reference ID
- Movement type
- Direction
- Positive movement amount
- Related Bank transaction ID
- Related Journal entry/line ID
- Related allocation ID
- Idempotency reference
- Posting/audit metadata

For this implementation scope, required movement types are:

- `cash_bank_origin`
- `document_allocation`
- Migration/opening movement type
- Reversal/correction representation required only to preserve current source
  transaction behavior; no new transfer reversal workflow is included

#### Allocation source bridge

Store the exact relationship between an On Account source and an Invoice/Bill
allocation:

- Reference ID
- Movement ID
- Document type and ID
- Existing Bank transaction allocation link where applicable
- Bank Portion
- TDS amount
- Total settlement
- Allocation status
- Idempotency and audit fields

### Constraints and indexes

- Party type and party ownership validation
- Non-negative monetary values
- `original = used + available` snapshot reconciliation
- Movement amounts greater than zero
- Organization-scoped reference uniqueness
- Idempotency uniqueness for posting operations
- Search indexes for reference, party, source transaction, and document links
- Protection against negative available balances
- Foreign-key and deletion rules that preserve posted history

### Legacy migration

For compatible `party_unapplied_amounts` records:

- Generate a stable On Account reference
- Preserve Customer/Supplier ownership
- Preserve original, applied, and remaining amounts
- Preserve the related Bank transaction and audit dates
- Create a migration/opening movement equal to the remaining available balance
- Do not invent historical allocation movements that cannot be proven
- Do not rewrite historical Bank transactions or Journal entries
- Retain compatibility until all readers use the new structures

### Service foundation

Create shared domain helpers for:

- Reference-number generation
- Reference lookup and ownership validation
- Available-balance calculation
- Movement creation
- Snapshot reconciliation
- Transaction-level locking
- Idempotency lookup

No new end-user workflow is introduced in this phase.

### Automated checks

- Migration applies successfully to an empty database
- Migration applies successfully with legacy unapplied rows
- Reference numbers remain unique during concurrent creation
- Migrated totals reconcile with legacy totals
- Invalid or negative balances are rejected
- Movement immutability constraints are enforced
- Existing Cash/Bank automated tests continue to pass

### Manual test handoff

The reviewer will receive steps to verify:

- Existing Cash & Bank pages still load
- Existing Customer receipt and Supplier payment flows still work
- Existing statements retain their current totals
- Migrated records reconcile through approved database/API verification output
- No new UI actions appear before their later phase

### Exit criteria

- Schema and migration are stable
- Legacy totals reconcile
- Existing transaction flows are unaffected
- Reviewer explicitly approves Phase 1

---

## Phase 2 — Customer Advance Payment Creation

### Goal

Allow Finance/Admin users to record a Customer payment without selecting an
Invoice.

### Backend work

- Extend the Customer receipt request contract with an explicit On Account mode
- Keep the existing against-Invoice mode unchanged
- Validate Organization, Customer, Bank/Cash account, amount, and request
  reference
- Lock the Bank/Cash account while calculating the next balance
- Post the Bank transaction, balanced Journal, On Account reference, and origin
  movement in one database transaction
- Return the stable OA reference and balance summary
- Use the request reference/idempotency value to prevent duplicate posting
- Roll back all records if any step fails

### Frontend work

- Add a clear payment-purpose choice to the existing Customer receipt flow
- Allow `On Account` without requiring Invoice selection
- Continue requiring Invoice allocation in the existing against-Invoice mode
- Show the selected Customer, Bank/Cash account, amount, reference, date, and
  remarks for confirmation
- Show the generated OA reference after successful posting
- Prevent repeat submission while the request is processing

### Rules

- Amount must be greater than zero
- Customer must belong to the current Organization
- The selected account must be active and eligible
- No Invoice allocation is created
- The full posted amount becomes available
- Reusing the same idempotency reference returns the original result

### Automated checks

- Successful advance receipt
- Balanced Journal lines
- Correct Bank/Cash balance update
- Correct OA original/used/available values
- Duplicate submission protection
- Invalid Customer/account/amount rejection
- Complete rollback on simulated failure
- Existing Invoice receipt regression tests

### Manual test handoff

The reviewer will receive steps for:

- Creating a Customer advance
- Verifying the Bank/Cash transaction
- Verifying the Journal link
- Verifying the generated OA reference
- Confirming original and available amounts match the receipt
- Retrying the same submission and confirming no duplicate
- Confirming normal Invoice receipt still works

### Exit criteria

- Customer advance posting is correct and traceable
- Existing Customer receipt functionality remains unchanged
- Reviewer explicitly approves Phase 2

---

## Phase 3 — Customer On Account List and Reference Details

### Goal

Give users a navigable view of Customer On Account balances before allocation is
introduced.

### Backend work

- Customer On Account paginated list API
- Reference detail API
- Search by OA reference, Customer, Bank transaction, Journal, and external
  reference
- Filters for status, date, and Customer
- Organization-scoped authorization
- Aggregate original, used, and available totals
- Movement/source link projection

### Frontend work

- Customer On Account list page or approved shared On Account page
- Supplier/Customer type separation if a shared page is used
- Standard application header, filters, table spacing, pagination, and colors
- Reference detail view showing:
  - OA reference and status
  - Customer
  - Original, used, and available amounts
  - Source Bank transaction and Journal
  - Movement history available at this phase
  - Audit dates and creator
- Navigation to linked Bank transaction and Journal where existing routes permit

### Automated checks

- Organization isolation
- Search and filter accuracy
- Pagination and totals
- Open/partially applied/fully applied status derivation
- Reference detail ownership validation
- Source traceability

### Manual test handoff

The reviewer will receive steps to verify:

- Newly created advance appears in the list
- Search works using its OA number and Customer name
- Detail totals match the original receipt
- Source navigation opens the correct records
- Another Organization cannot access the reference
- Empty and pagination states follow existing UI standards

### Exit criteria

- Customer references are searchable and traceable
- Displayed balances reconcile with the movement ledger
- Reviewer explicitly approves Phase 3

---

## Phase 4 — Customer Invoice Application with TDS

### Goal

Apply an existing Customer On Account balance against one or more outstanding
Invoices without creating another Bank transaction.

### Backend work

- Fetch eligible outstanding Invoices for the selected Customer
- Accept one or more exact OA references and one or more Invoice allocations
- Support Bank Portion and TDS per allocation
- Lock selected references and Invoices in a consistent order
- Re-read balances inside the database transaction
- Validate available and outstanding values
- Post the balanced allocation Journal
- Create append-only `document_allocation` movements
- Create allocation bridge records
- Update Invoice settlement/payment state using existing finance rules
- Update OA snapshots and derived status
- Return updated Invoice and OA summaries
- Enforce idempotency across the entire allocation request

### Frontend work

- Add an `Apply to invoices` action for eligible Customer references
- Show available OA references with original, used, and available balances
- Show eligible outstanding Invoices
- Allow full and partial application
- Allow TDS using existing Customer receipt conventions
- Display Bank Portion, TDS, total settlement, remaining Invoice balance, and
  remaining OA balance before confirmation
- Show validation errors without partially updating the screen

### Rules

- Selected references and Invoices must belong to the same Customer and
  Organization
- Bank Portion must not exceed combined selected OA availability
- Total settlement must not exceed combined Invoice outstanding amount
- TDS settles the Invoice but does not consume OA availability
- No new Bank transaction is created
- Allocation Journals and all balance changes are atomic
- Automatic allocation order, if needed, must be deterministic and visible; the
  first implementation should prefer explicit source selection

### Automated checks

- Full allocation
- Partial allocation
- One reference across multiple Invoices
- Multiple references against one Invoice
- TDS and non-TDS allocations
- Over-available and over-outstanding rejection
- Wrong Customer/Organization rejection
- Concurrent allocation protection
- Duplicate request protection
- Atomic rollback
- Invoice status and statement reconciliation

### Manual test handoff

The reviewer will receive test cases for:

- Full allocation without TDS
- Partial allocation without TDS
- Allocation with TDS
- Multiple Invoice selection
- Multiple reference selection
- Insufficient OA balance
- Excess settlement attempt
- Duplicate submission
- Verifying that no new Bank transaction was created
- Verifying Invoice and OA balances after application

### Exit criteria

- Customer allocations reconcile at document, Journal, and OA levels
- TDS behaves like the existing Customer receipt flow
- Reviewer explicitly approves Phase 4

---

## Phase 5 — Supplier Advance Payment Creation

### Goal

Allow Finance users to pay a Supplier without selecting a Bill.

### Backend work

- Extend the Supplier payment contract with an explicit On Account mode
- Keep existing against-Bill mode unchanged
- Validate Organization, Supplier, account, amount, and request reference
- Post the Bank transaction, Supplier Advance Journal, OA reference, and origin
  movement atomically
- Return the generated Supplier OA reference and balance summary
- Apply locking and idempotency equivalent to the Customer flow

### Frontend work

- Add an On Account purpose to the Supplier payment flow
- Do not require Bill selection in this mode
- Preserve the existing against-Bill workflow
- Show the generated Supplier OA reference after posting

### Automated checks

- Successful Supplier advance payment
- Correct Bank/Cash balance reduction
- Balanced Supplier Advance Journal
- Correct OA balance creation
- Duplicate submission protection
- Validation and rollback coverage
- Existing Supplier Bill payment regression tests

### Manual test handoff

The reviewer will receive steps to verify:

- Supplier advance creation
- Bank/Cash and Journal effects
- OA reference and available balance
- Duplicate prevention
- Existing against-Bill payment behavior

### Exit criteria

- Supplier advance posting is correct and traceable
- Existing Supplier payment behavior remains unchanged
- Reviewer explicitly approves Phase 5

---

## Phase 6 — Supplier On Account List and Reference Details

### Goal

Provide the Supplier equivalent of the approved Customer On Account list and
detail experience.

### Backend work

- Supplier-scoped list, search, filters, pagination, totals, and detail support
- Reuse shared domain queries where Customer/Supplier accounting differences do
  not require separate logic
- Enforce Organization and Supplier ownership

### Frontend work

- Supplier references in the approved On Account navigation structure
- Supplier filters and status display
- Original, used, and available values
- Source Bank transaction, Journal, movement, and audit information
- Consistent table and detail UI with the Customer implementation

### Automated checks

- Supplier filtering and search
- Organization isolation
- Totals and lifecycle status
- Source navigation and reconciliation

### Manual test handoff

The reviewer will receive steps to verify:

- Supplier advance appears correctly
- OA number and Supplier searches work
- Detail totals reconcile
- Source links identify the correct payment and Journal
- Customer and Supplier records cannot be mixed

### Exit criteria

- Supplier references are searchable and traceable
- UI and balances match the approved Customer pattern
- Reviewer explicitly approves Phase 6

---

## Phase 7 — Supplier Bill Application with TDS

### Goal

Apply existing Supplier On Account balances against outstanding Bills without
creating another Bank payment.

### Backend work

- Fetch eligible outstanding Bills for a Supplier
- Accept exact Supplier OA references and Bill allocations
- Support Bank Portion, TDS, and total settlement
- Lock references and Bills before validation
- Post the Supplier allocation Journal
- Create movements and allocation bridges
- Update Bill balances and statuses using existing Supplier finance rules
- Update OA snapshots and derived status
- Enforce idempotency and atomic rollback

### Frontend work

- Add `Apply to bills` action
- Show Supplier OA sources and outstanding Bills
- Support full, partial, multi-reference, and multi-Bill allocation
- Reuse existing Supplier TDS inputs and validations
- Preview resulting OA and Bill balances

### Rules

- References and Bills must belong to the same Supplier and Organization
- Bank Portion reduces OA availability
- TDS settles the Bill without consuming OA availability
- No new Bank transaction is created
- Applied Bank Portion cannot exceed available OA balance
- Total settlement cannot exceed Bill outstanding

### Automated checks

- Full and partial Bill allocation
- Multiple Bills and references
- TDS and non-TDS paths
- Ownership, balance, concurrency, and idempotency validation
- Journal and Supplier statement reconciliation
- Atomic rollback

### Manual test handoff

The reviewer will receive the Supplier equivalents of all Customer allocation
test cases, including explicit verification that no second Bank payment is
created.

### Exit criteria

- Supplier allocation reconciles at Bill, Journal, and OA levels
- TDS matches the existing Supplier payment behavior
- Reviewer explicitly approves Phase 7

---

## Phase 8 — Statements, Reconciliation, Security, and Final Regression

### Goal

Complete reporting and traceability, then confirm that the feature is safe for
release without changing unrelated functionality.

### Statement integration

Customer and Supplier statements should distinguish On Account availability
from Invoice/Bill outstanding balances and expose:

- Opening available balance
- Advance increases
- Document-allocation decreases
- TDS settlement information
- Closing available balance
- OA reference number
- Links to the source transaction, Journal, and allocated documents

### Reconciliation

Verify for every reference:

```text
Original Amount = Used Amount + Available Amount
```

Verify movement totals against header snapshots and allocation bridge totals.
Verify party aggregates equal the sum of their references.

### Security and audit

- Confirm Finance/Admin permissions for creation and allocation
- Confirm read permissions for list/detail/statement views
- Confirm Organization isolation on every API and database query
- Confirm audit actor and timestamps on references, movements, and allocations
- Confirm posted movements cannot be edited or deleted through application APIs

### Compatibility and cleanup

- Complete reader migration away from legacy-only queries
- Retain or retire compatibility paths only after reconciliation is approved
- Remove no database object or compatibility path unless separately reviewed
- Confirm existing Cash/Bank, Customer receipt, Supplier payment, Invoice, Bill,
  Customer statement, and Supplier statement behavior

### Automated checks

- End-to-end Customer and Supplier scenarios
- Migration and reconciliation checks
- Permission and Organization-isolation tests
- Concurrency and idempotency tests
- Statement opening/movement/closing totals
- Existing finance regression suite
- Frontend build, lint, and targeted component tests where available

### Manual test handoff

The final guide will cover:

- Complete Customer lifecycle
- Complete Supplier lifecycle
- Statement traceability
- Search and navigation
- Permissions
- Duplicate and concurrent attempts
- Existing direct payment regression
- Cross-module balance reconciliation

### Exit criteria

- All phase acceptance scenarios pass
- Customer, Supplier, Bank/Cash, Journal, document, and statement values reconcile
- No critical regression remains
- Reviewer gives final release approval

## 6. Approval and Handoff Protocol

At the end of every phase, the implementation report must contain:

- Phase name and scope completed
- Files and database objects changed
- Migrations or commands to run
- Automated checks executed and results
- Manual test prerequisites
- Numbered manual test steps
- Expected result for each step
- Known limitations or deferred items
- Explicit request for approval to begin the next phase

Silence or partial testing is not approval. The next phase starts only after an
explicit go-ahead from the reviewer.

## 7. Change-Control Rules

- Do not include Journal transfer functionality in these phases.
- Do not change unrelated Cash/Bank behavior to simplify On Account processing.
- Do not duplicate existing TDS calculations; reuse the approved finance rules.
- Do not directly edit posted On Account movements.
- Do not silently auto-allocate across parties or Organizations.
- Stop and revise this plan if a newly discovered requirement materially changes
  accounting behavior, migration safety, or phase boundaries.

## 8. Starting Point After Approval

After explicit approval, implementation begins with **Phase 1 — On Account
Database Foundation and Legacy Migration** only. No Phase 2 work begins until
Phase 1 has passed automated verification, manual review, and explicit approval.
