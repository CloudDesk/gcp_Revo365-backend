# Journal and On Account Of Integration — Phased Implementation Plan

## 1. Document Status

**Status:** Final draft for approval — planning only; no implementation is
authorized by this document.

This is the next implementation plan after the completed On Account Of phases
and the independently completed Journal module work have been merged into the
same branch. It converts the approved integration requirements in
[`PHASE_4_JOURNAL_MODULE_REQUIREMENTS.md`](./PHASE_4_JOURNAL_MODULE_REQUIREMENTS.md)
and the established On Account rules in
[`ON_ACCOUNT_OF_REFERENCE_PLAN.md`](../cash-bank-account/ON_ACCOUNT_OF_REFERENCE_PLAN.md)
into a safe, reviewable delivery sequence.

The Journal module's independent scope is treated as the baseline: its list,
detail, Manual Draft/Edit/Post/Reverse lifecycle, permissions, activity view,
and ordinary account-based Journal behaviour already exist. This plan does not
rebuild that work. Phase 1 verifies that baseline after the merge, then the
remaining phases add only the approved Journal-to-On-Account integration.

Implementation will proceed one phase at a time:

1. Complete only the approved phase scope.
2. Run the phase's automated checks.
3. Provide the listed manual test steps to the reviewer.
4. Correct issues found within that same phase.
5. Start the next phase only after explicit reviewer approval.

## 2. Objective

Integrate the existing Journal module with the completed On Account Of
foundation so Finance/Admin users can perform an approved **Customer-to-Customer
On Account transfer** and, later, explicitly replace that transfer with a real
destination-Customer Bank receipt.

The integration must preserve a single accounting source of truth:

- On Account owns stable references, immutable movements, available balances,
  Invoice allocations, TDS treatment, and allocation/reversal primitives.
- Journal owns Journal headers and lines, Draft/Post/Reverse lifecycle,
  permissions, Journal workspace UI, and transfer/replacement orchestration.
- Cash & Bank remains the only owner of actual money received or paid.
- The integration must never create a duplicate Bank transaction, Invoice,
  allocation, receivable, payable, or TDS posting.

## 3. Confirmed Scope

### Included

- Reconcile the merged Journal and On Account implementations against one
  approved ownership and API contract.
- Customer-to-Customer transfer of an available Customer On Account reference
  through a dedicated Journal workflow.
- Creation of a balanced, party-aware Journal and linked immutable
  `journal_transfer_out` / `journal_transfer_in` movements in one transaction.
- Transfer traceability from Journal, On Account detail, Customer statement,
  movement history, and linked Invoice allocation records.
- Allocation of a transferred destination reference only to that destination
  Customer's eligible Invoices through the existing On Account allocation flow.
- Explicit replacement of a transfer after a later destination-Customer Bank
  receipt, including dependent allocation reversal/un-clearing.
- Journal, movement, reference, allocation, audit, permission, organization,
  idempotency, concurrency, and regression validation.

### Explicitly excluded

- Supplier-to-Supplier, Customer-to-Supplier, and Supplier-to-Customer
  transfers.
- Creating a Bank/Cash transaction from the Journal workspace.
- Allowing a generic manual Journal to create, edit, allocate, or otherwise
  change an On Account balance.
- TDS selection inside a Journal. TDS remains part of the established On
  Account Invoice/Bill allocation flows.
- Reversing a system-generated Journal directly from the Journal workspace.
- Editing or deleting posted Journal, On Account, movement, or allocation
  history.
- Multi-currency conversion, foreign-exchange treatment, approval workflows,
  recurring Journals, templates, attachments, imports, and automatic reversal.

## 4. Non-Negotiable Business Rules

1. Every reference belongs to exactly one party and organization. A Customer
   transfer can only move value from one active Customer to a different active
   Customer in the same organization and currency.
2. The source amount cannot exceed the source reference's available amount.
3. The transfer changes ownership between Customer subledgers; it does **not**
   create or alter a Bank/Cash balance. Its control-account Journal effect nets
   to zero.
4. A transfer has a dedicated controlled source type, such as
   `on_account_transfer`; it is not an ordinary manually selected Journal line.
5. The source reference, destination reference, both movement records, the
   transfer Journal, audit event, and idempotency result commit atomically.
6. The transferred destination reference can settle only the destination
   Customer's eligible Invoices. Existing Bank Portion and TDS allocation rules
   remain unchanged.
7. A later destination Customer receipt creates a **new Bank-origin** On
   Account reference. It must never automatically reverse a transfer.
8. Replacing a transfer is an explicit authorized action. It reverses only the
   allocations funded by that transferred reference, creates the opposite
   transfer Journal/movements, restores the source amount, and leaves the new
   Bank-origin reference available for normal use.
9. Posted records are append-only. Reversal creates linked compensating records
   rather than editing or deleting history.
10. Every protected operation must re-check permissions, tenant boundaries,
    versions, balances, and dependencies in its backend transaction.

## 5. Ownership and Integration Boundary

| Concern | Owning module/service | Journal integration responsibility |
| --- | --- | --- |
| On Account number, owner, currency, available amount, status/version | On Account | Consume; never calculate or update directly outside the On Account service |
| Immutable On Account movements | On Account | Request paired transfer/reversal movements through the contract and retain returned IDs |
| Customer Invoice allocation, Bank Portion, and TDS | On Account / Cash & Bank | Reuse unchanged; identify allocations funded by a transferred reference for replacement |
| Cash/Bank receipt | Cash & Bank | Select a valid later destination receipt only; never create or duplicate it |
| Journal header, lines, status, reversal link, audit lifecycle | Journal | Create/post the controlled transfer and its opposite replacement Journal |
| Ledger totals and Chart of Accounts history | Existing finance ledger | Show each posted Journal once and make transfer control-account effects reconcile to zero |

The Journal module must not write `party_unapplied_amounts`, On Account header
snapshots, Invoice balances, or allocation balances directly. It must use the
finalized On Account service/API contract.

## 6. Phase Names and Required Order

1. **Integration Baseline, Ownership Audit, and Contract Freeze**
2. **Journal–On Account Data and Service Contract Alignment**
3. **Customer-to-Customer Transfer Posting Orchestration**
4. **Dedicated Transfer Workspace and Cross-Module Traceability**
5. **Transferred-Reference Allocation, Statements, and Reconciliation**
6. **Explicit Payment Replacement and Dependent Reversal**
7. **Security, Concurrency, Full Regression, and Release Readiness**

The order is intentional. In particular, Phase 6 must not begin until transfer
posting, allocation traceability, and reversal dependencies are proven in the
merged branch.

## 6.1 Journal Requirement Traceability

| Journal requirement area | Integration phase(s) that prove it |
| --- | --- |
| Separate Journal and On Account ownership; no competing tables or balance rules | 1–2 |
| Existing Journal Draft/Post/Reverse lifecycle remains intact | 1, 7 |
| Dedicated `on_account_transfer` source type and controlled party-control account use | 2–3 |
| Same-organization, same-currency, distinct active Customer transfer validation | 2–3, 7 |
| Balanced party-aware Journal and no Cash/Bank duplication | 3, 7 |
| Journal workspace, permissions, details, source links, and read-only history | 4, 7 |
| Destination-only Invoice allocation and unchanged Bank Portion/TDS treatment | 5, 7 |
| Explicit later-payment replacement and dependent allocation reversal | 6–7 |
| Immutable audit trail, idempotency, locking, safe errors, and organization isolation | 2–3, 6–7 |
| Journal/ledger/statement/reconciliation correctness and release acceptance | 5, 7 |

---

## Phase 1 — Integration Baseline, Ownership Audit, and Contract Freeze

### Goal

Establish a known-safe merged baseline and agree the exact contract boundary
before either module changes cross-module financial data.

### Planned work

- Inventory the merged Journal and On Account routes, services, migrations,
  permissions, source-type mappings, navigation, and existing tests.
- Compare the implementation with the two source requirement documents and
  record every gap, duplicate responsibility, naming difference, and migration
  dependency.
- Confirm that the On Account branch remains authoritative for reference
  creation, balance snapshots, movement writes, allocation links, locking,
  idempotency, and reversal primitives.
- Confirm that the Journal branch remains authoritative for controlled transfer
  screens and Journal lifecycle. Disable or feature-gate any incomplete transfer
  actions until the contract is ready.
- Establish the approved source types, status vocabulary, control accounts,
  number formats, permission names, decimal precision, and link/navigation
  conventions used by both modules.
- Capture a reconciliation baseline for existing On Account references, Journal
  totals, customer balances, and Cash/Bank balances. No existing record is
  rewritten merely to prepare the integration.

### Exit criteria

- One signed-off contract map exists and identifies one owner for every write.
- No generic Journal route can alter On Account data.
- Existing Journal and On Account flows remain available and their baseline
  balances reconcile.

### Manual test handoff

1. Open existing On Account, Journal, Cash & Bank, Chart of Accounts, and
   Customer Statement pages.
2. Verify previously posted On Account references, movements, Journal entries,
   and Cash/Bank transactions remain visible and unchanged.
3. Verify an ordinary manual Journal cannot expose an On Account transfer path
   or party-control account as a free-form posting option.

## Phase 2 — Journal–On Account Data and Service Contract Alignment

### Goal

Provide the safe, typed integration contract needed by the Journal workflow
without duplicating On Account persistence or business rules.

### Planned work

- Add only additive, idempotent schema support that is demonstrably missing for
  transfer identity, source/destination references, paired movement IDs,
  Journal/line links, transfer status, replacement reference, reversal links,
  actor/timestamps, and idempotency keys.
- Finalize typed On Account operations for:
  - searching eligible open Customer references;
  - reading a reference/version and transfer dependency graph;
  - atomically transferring a source amount to a destination Customer; and
  - atomically replacing/reversing an eligible transfer.
- Ensure responses expose stable IDs plus safe display values: On Account
  number, Customer, currency, available amount, status, version, movement IDs,
  destination reference, Journal ID/number, and actionable typed errors.
- Add indexes and constraints for organization-scoped lookups, one active
  replacement chain, immutable links, positive amounts, same-customer block,
  unique/idempotent transfer effects, and no overdraw of source availability.
- Map controlled Journal source types and party-control accounts. Generic
  manual Journal posting must reject these transfer-only combinations.
- Preserve the existing `manual_journal` lifecycle for ordinary Draft/Post/
  Reverse records, but prohibit the ordinary Journal Reverse operation from
  directly reversing an `on_account_transfer`. That transfer has a distinct
  dependent replacement/reversal lifecycle in Phase 6.
- Standardize user-safe business errors for insufficient funds, stale version,
  duplicate request, tenant/currency mismatch, invalid party, and unsafe
  dependency state.

### Exit criteria

- Contract consumers can perform no direct table writes to On Account balances.
- Contract tests prove tenant, version, idempotency, and decimal precision
  behaviour.
- Repeated requests cannot create duplicate movement or Journal links.

### Manual test handoff

1. Use approved API/test tooling to search only eligible Customer references.
2. Confirm unavailable, fully applied, supplier, cross-organization, and
   currency-incompatible references are not eligible.
3. Send the same safe test request twice and confirm the result is idempotent.
4. Confirm business messages are readable and do not disclose SQL/table names.

## Phase 3 — Customer-to-Customer Transfer Posting Orchestration

### Goal

Post a balanced Customer-to-Customer On Account transfer atomically through the
dedicated Journal orchestration.

### Planned work

- Create a controlled transfer Draft/Post operation rather than extending the
  free-form manual Journal form.
- Require source Customer, source On Account reference and version,
  destination Customer, amount, entry date, narration/reason, actor, and a
  client idempotency key.
- Validate roles, organization, active parties, distinct Customers, matching
  currency, approved control account context, amount precision, and available
  balance inside the posting transaction.
- Post a balanced party-aware Journal using the approved customer-advance
  control account treatment. The general-ledger control-account net effect must
  be zero.
- Call the On Account transfer operation to create exactly one
  `journal_transfer_out` source movement and one linked
  `journal_transfer_in` destination movement. The destination gets a new
  Customer-owned transferred reference.
- Record transfer identity, Journal/line IDs, movement IDs, source and
  destination reference IDs, actor, timestamps, and audit events together.
- Roll back every change if Journal posting, movement creation, audit write, or
  final reconciliation fails.

### Exit criteria

- A successful transfer changes only the two related Customer On Account
  subledgers and creates a balanced Journal; Bank/Cash totals do not change.
- Source availability never becomes negative; destination ownership is correct.
- Concurrent post attempts produce a single transfer effect.

### Manual test handoff

1. Create an available Customer reference for Customer A and identify a
   different active Customer B in the same organization/currency.
2. Transfer a partial amount and verify source availability falls by that
   amount and B receives a new transferred reference for the same amount.
3. Verify the transfer Journal has equal Debit and Credit totals and both
   movement records link to it.
4. Verify Cash/Bank account balance and transaction count are unchanged.
5. Attempt an amount above available, zero/negative amount, same Customer,
   supplier destination, invalid currency, and unauthorized user; each must be
   rejected without side effects.

## Phase 4 — Dedicated Transfer Workspace and Cross-Module Traceability

### Goal

Provide a clear Finance/Admin workflow for transfers and make every linked
record navigable without exposing a generic Journal bypass.

### Planned work

- Add a distinct **On Account Transfer** action in the Journal workspace,
  permission-gated separately from ordinary manual Journal creation.
- Build guided source-reference and destination-Customer selection with current
  availability, currency, transfer amount, inline min/max validation, reason,
  confirmation, loading, and recoverable error states.
- Keep Customer and On Account selection out of the ordinary manual Journal
  account-line experience.
- Show controlled transfer Journal rows/details with source type, source and
  destination Customer/reference, amount, Journal status, movement history,
  source transaction, and links to On Account detail and Customer records.
- Add reciprocal links in On Account detail/movement history to the transfer
  Journal and its counterpart reference. Preserve existing record link colour,
  navigation, and 404-safe routing patterns.
- Clearly label a transferred reference and ensure its source Journal is
  read-only after posting.
- Do not show the ordinary **Reverse** action for a transfer Journal. Show the
  dedicated replacement action only when its eligibility conditions are met.

### Exit criteria

- Authorized users can create and inspect transfers through one guided path.
- Generic manual Journal users cannot fake the party-control transfer.
- Each view exposes working links to the appropriate detail page.

### Manual test handoff

1. Verify only Admin/Accountant sees the transfer action.
2. Complete one transfer and follow links from Journal → both On Account
   references → movement history → Journal/source transaction.
3. Verify posted transfer rows are read-only and no extra Back action duplicates
   standard application navigation.
4. Verify empty, loading, validation, insufficient-balance, and server-error
   states keep entered values where safely possible.

## Phase 5 — Transferred-Reference Allocation, Statements, and Reconciliation

### Goal

Use the transferred destination reference through the existing allocation flow
without changing established Invoice, TDS, statement, or reconciliation rules.

### Planned work

- Confirm the existing Customer On Account allocation selector includes an
  eligible transferred destination reference for its owner only.
- Enforce that a transferred reference can allocate only to that destination
  Customer's eligible Invoices; it must be invisible/rejected for the source
  Customer and every other Customer.
- Preserve the existing rule that only the Bank Portion reduces On Account
  availability; TDS settles the Invoice through its normal ledger treatment and
  does not consume On Account balance.
- Persist allocation-to-transfer/reference/movement relationships so dependent
  reversal can identify precisely which Invoice settlements must later be
  un-cleared.
- Add transfer increases/decreases and transferred-reference allocations to
  Customer statements, On Account details, reports, and reconciliation views.
- Reconcile reference snapshots, immutable movements, Customer totals, control
  account net effect, allocation rows, and Journal detail output.

### Exit criteria

- Destination Invoices can use the transferred reference normally.
- No other party can consume it, and TDS continues to follow the existing
  allocation semantics.
- Every allocation funded by a transferred reference is traceable.

### Manual test handoff

1. Allocate a transferred reference partially to one destination Invoice.
2. Allocate its remaining amount across one or more other destination Invoices.
3. Attempt allocation against the source Customer and another Customer; confirm
   it is blocked.
4. Apply a valid TDS scenario and verify only the Bank Portion reduces the
   transferred reference availability.
5. Verify statements, On Account movement history, Journal detail, and Invoice
   allocation history tell the same story and reconcile numerically.

## Phase 6 — Explicit Payment Replacement and Dependent Reversal

### Goal

Safely replace a prior transfer with a later destination-Customer Bank receipt
while preserving the entire audit trail and reversing only the linked effects.

### Planned work

- Provide a permission-gated **Replace Transfer With Payment** action only for
  an eligible posted Customer transfer.
- Treat this as the exclusive reversal path for a transfer. The generic Journal
  reversal endpoint/action must reject transfer source types because it cannot
  safely reverse downstream Customer allocations on its own.
- Require Finance to explicitly select a later Bank-origin On Account reference
  belonging to the destination Customer, with enough unused amount for the
  proposed replacement. Never infer the action from a new payment alone.
- Load and display the affected transfer, source/destination references,
  selected later receipt, allocation list, amount, and irreversible result
  before confirmation.
- In one transaction lock the original Journal, both transfer references,
  selected later Bank-origin reference, affected allocation links and Invoices,
  and relevant versions.
- Reverse/un-clear only the Invoice settlements funded by the transferred
  reference; restore their outstanding balances/statuses according to the
  existing allocation reversal primitives.
- Post the linked opposite transfer Journal and On Account reversal movements,
  restore source Customer availability, mark the transfer/replacement chain,
  and leave the later Bank-origin destination reference untouched and available.
- Persist links between original transfer, replacement payment reference,
  dependent allocation reversals, opposite Journal, reversal movements, actor,
  reason, and timestamps. Fail atomically with an actionable Finance-review
  message if a dependency cannot be safely restored.

### Exit criteria

- Replacement is explicit, atomic, idempotent, and leaves no partial balance or
  document-status change on failure.
- Original records remain visible and linked; Bank receipt is neither duplicated
  nor silently consumed by the reversal.

### Manual test handoff

1. Transfer Customer A value to Customer B and allocate the transferred
   reference against one or more B Invoices.
2. Record a separate Bank receipt for B and confirm no transfer changes happen
   automatically.
3. Use the explicit replacement action, select the later B receipt, and
   confirm only transfer-funded allocations are un-cleared, A's availability is
   restored, and B's Bank-origin reference remains available.
4. Verify original transfer, opposite Journal, movements, allocations, receipt,
   and audit history cross-link correctly.
5. Try a receipt for another Customer, insufficient later balance, an unrelated
   transfer, a stale page, and an incompatible downstream allocation; confirm
   each fails without partial changes.

## Phase 7 — Security, Concurrency, Full Regression, and Release Readiness

### Goal

Prove the merged implementation is reliable across Journal, On Account,
Cash/Bank, Invoices, Chart of Accounts, Customer Statements, permissions, and
production build/deployment paths.

### Planned work

- Complete automated unit, service/integration, database rollback,
  authorization, organization-isolation, idempotency, stale-version, and
  concurrency coverage for transfer and replacement.
- Run Journal regression for manual Draft/Edit/Post/Reverse and confirm the
  integration does not change generic Journal behaviour.
- Run On Account regression for Customer/Supplier advance creation, allocation,
  TDS, lists, details, links, pagination, statements, and migration data.
- Reconcile before/after balances for Customer subledgers, On Account snapshots,
  immutable movement totals, allocation bridges, Journal account ledger totals,
  and Cash/Bank balances.
- Verify source navigation, audit rendering, safe error messages, permissions,
  responsive UI, and production builds.
- Prepare release notes, migration/backout procedure, monitoring queries, and a
  post-release reconciliation checklist. A database backup and rollback plan
  must be approved before production migration.

### Exit criteria

- All required automated checks and manual scenarios pass against a test
  database.
- No duplicate financial effect appears in any reconciliation.
- Admin and Accountant can perform allowed actions; all other users are denied
  at both UI and API layers.
- Frontend and backend production builds pass and release/recovery steps are
  documented.

### Manual test handoff

1. Complete the end-to-end happy path from source Customer advance → transfer
   → destination allocation → later destination receipt → explicit replacement
   → source reallocation.
2. Repeat the highest-risk negative tests: duplicate submit, concurrent
   transfer/allocation, concurrent replacement, insufficient amount,
   same-party, tenant/currency mismatch, stale version, unsafe dependency, and
   unauthorized access.
3. Verify every affected list/detail/statement/reconciliation view and confirm
   Journal control-account net effect is zero and Cash/Bank effects occur once.
4. Confirm existing Supplier On Account and ordinary Journal functions are
   unchanged.

## 7. Required Cross-Phase Test Matrix

| Area | Mandatory proof |
| --- | --- |
| Accounting | Transfer Journal balances exactly; control account nets to zero; no duplicate Bank/Cash effect |
| Ownership | Source decreases, destination reference is Customer B-owned, and no other Customer can allocate it |
| Allocation/TDS | Bank Portion consumes On Account; TDS remains under existing allocation rules |
| Replacement | Explicit later receipt selection only; only transfer-funded allocations reverse; source is restored |
| Immutability | Posted Journals, movements, allocations, and original receipts remain visible and unchanged |
| Atomicity | Any failed transfer/replacement rolls back Journal, movement, allocation, document, snapshot, and audit writes together |
| Concurrency | Duplicate, stale, and competing allocation/transfer/replacement requests produce one safe result |
| Security | Admin/Accountant permissions, backend authorization, organization isolation, and safe errors all pass |
| Reporting | On Account detail, Customer Statement, Journal detail/list, ledger totals, and Cash/Bank reconciliation agree |

## 8. Decisions to Confirm Before Phase 2

These decisions do not change approved business outcomes but must be recorded
before integration code begins:

1. The exact existing customer-advance control account identifiers and whether
   a distinct transfer narration/reference format is required.
2. The final route/API names and the standard location for idempotency keys and
   optimistic-lock versions.
3. The exact transfer/replacement status labels displayed in Journal and On
   Account views.
4. Whether the Journal transfer feature is released behind a permission-only
   gate, a separate feature flag, or both during rollout.
5. The Finance-review message and operating procedure when a dependent
   allocation cannot safely be reversed.
6. Whether a financial-period lock already applies to transfer and replacement
   dates; if it does, the shared finance control must be used.

## 9. Definition of Done for This Integration Plan

The integration is complete only when all seven phases are approved and the
following are true:

- The Journal module uses the finalized On Account contract instead of direct
  balance/allocation writes.
- Customer-to-Customer transfers and explicit later-payment replacements meet
  the approved accounting, traceability, atomicity, and reversal rules.
- No excluded transfer type or generic manual Journal bypass is possible.
- Existing Cash/Bank, On Account, Invoice, TDS, Supplier, Chart of Accounts,
  Customer Statement, and Journal behaviour has passed regression testing.
- Production migration, release, reconciliation, and recovery procedures have
  been reviewed and approved.
