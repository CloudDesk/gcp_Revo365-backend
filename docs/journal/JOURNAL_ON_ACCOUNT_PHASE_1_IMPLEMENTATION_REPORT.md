# Journal and On Account Integration — Phase 1 Implementation Report

## Status

Phase 1, **Integration Baseline, Ownership Audit, and Contract Freeze**, is
implemented. No transfer, replacement, schema mutation, or new end-user
financial workflow is introduced in this phase.

The next phase must not start until the reviewer completes the manual tests and
gives explicit approval.

## Baseline Audit Result

### Journal baseline

- The merged backend exposes the completed Journal list, detail, eligible
  account lookup, related-entry lookup, Draft create/update, Post, and linked
  Reverse endpoints.
- Ordinary Journals use `manual_journal`; linked ordinary reversals use
  `manual_journal_reversal`.
- Ordinary Journal Draft/Post/Reverse operations accept only their own source
  type and lifecycle state.
- Eligible ordinary Journal accounts are limited to active, user-created,
  non-system Chart of Accounts records. Bank, Cash, credit-card, and payment
  clearing subtypes are additionally restricted.
- Customer/Supplier advance control accounts are system accounts and are not
  exposed through the ordinary Journal account selector.
- Admin and Accountant are the approved Journal roles. Delete remains disabled.

### On Account baseline

- Stable Customer and Supplier references, immutable movements, allocation
  bridges, versioned balance snapshots, and read/detail/statement services are
  present.
- Customer advance, Customer Invoice allocation/TDS, Supplier advance,
  Supplier Bill allocation/TDS, statements, reconciliation, and audit remain
  owned by the completed On Account implementation.
- On Account reference identity and movement history remain protected by the
  existing database constraints and triggers.

### Frozen integration boundary

| Concern | Owner after Phase 1 |
| --- | --- |
| Reference identity, ownership, balance, status/version | On Account |
| Immutable movements and allocation links | On Account |
| Invoice allocation, Bank Portion, TDS, and dependent allocation reversal primitives | On Account |
| Actual receipts/payments | Cash & Bank |
| Journal headers, lines, list/detail, Draft/Post/Reverse | Journal |
| Future Customer transfer/replacement orchestration and UI | Journal consuming the On Account contract |

The Journal module must not directly update `party_unapplied_amounts`, On
Account snapshots, Invoice balances, or allocation balances. A generic manual
Journal is not an alternative way to transfer On Account value.

## Integration Gate

The audit confirmed that the merged branch currently exposes no Journal On
Account transfer/replacement API or frontend action. This is the correct Phase
1 state. Transfer functionality remains gated until:

1. Phase 2 freezes and implements the typed Journal-to-On-Account contract.
2. Phase 3 implements the atomic transfer posting orchestration.
3. The reviewer approves each phase in sequence.

## Repeatable Verification

The following read-only baseline verifier was added:

```text
npm run verify:journal-on-account-baseline
```

It checks:

- Required Journal and On Account baseline tables/columns
- Required merged migration versions
- Admin/Accountant Journal permissions, including future transfer/replace
  capabilities, while keeping delete disabled
- On Account snapshot-to-movement reconciliation
- Absence of restricted/system account lines in ordinary manual Journals
- Absence of premature transfer Journals or transfer movements before later
  phases are approved

The verifier does not insert, update, or delete financial data.

## Phase 2 Gap Register

The following items are intentionally left for Phase 2 and are not Phase 1
defects:

- Typed eligible Customer/reference search contract for transfer use
- `on_account_transfer` and transfer-reversal source mappings
- `journal_transfer_out` and `journal_transfer_in` movement support
- Transfer identity and source/destination relationship persistence
- Journal-line party/reference/transfer-role integration fields where required
- Atomic transfer and replacement service contracts
- Transfer-specific typed errors, optimistic locking, and idempotency inputs
- Explicit guard preventing the ordinary Reverse action from reversing a
  transfer Journal after that source type exists

## Automated Verification Performed

- Backend TypeScript build
- Backend automated test suite: 136 passed, 0 failed
- Frontend production build
- Database-backed merged baseline verification
- Static route/service/UI audit confirming no premature integration exposure
- Documentation diff validation

The database-backed verifier completed successfully against the configured
development database.

## Manual Test Handoff

### Preconditions

- Use a development/test environment, not production.
- Have one Admin or Accountant login and one non-finance login available.
- Record the current Cash/Bank balance, Customer/Supplier On Account totals, and
  Chart of Accounts balances before posting a test Journal.

### Steps

1. Open **Journals**, **On Account**, **Cash & Bank Accounts**, **Chart of
   Accounts**, one **Customer Statement**, and one **Supplier Statement**.
   Confirm every page loads without a server or browser error.
2. In Journals, open **Create Journal** and inspect the Account selector.
   Confirm Customer Advances, Supplier Advances, Bank, Cash, credit-card, and
   payment-clearing system accounts are not selectable in an ordinary Journal.
3. Save an unbalanced manual Journal as Draft. Confirm it remains Draft and
   does not change Chart of Accounts, Cash/Bank, Customer/Supplier, Invoice,
   Bill, or On Account balances.
4. Complete and post a balanced non-cash test Journal using two eligible
   user-created accounts. Confirm Debit equals Credit, the Journal appears once,
   and only the selected Chart of Accounts ledgers change.
5. Confirm the posted Journal did not create a Cash/Bank transaction and did
   not create or change an On Account reference or movement.
6. Reverse the posted manual Journal. Confirm a new linked opposite Journal is
   created, both records remain visible, and their combined ledger effect is
   zero. Confirm a second Reverse attempt is unavailable/rejected.
7. Review one Customer and one Supplier On Account reference. Confirm reference
   number, original/used/available totals, source transaction, movement history,
   allocation links, and statements still reconcile.
8. Confirm there is no **On Account Transfer** or **Replace Transfer With
   Payment** action yet in Journals or On Account. These actions belong to later
   approved phases.
9. Sign in with the non-finance user and attempt to open Journals. Confirm the
   menu/action is hidden or access is denied. Repeat with Admin/Accountant and
   confirm approved Journal access works.
10. From the backend directory, run:

    ```text
    npm run verify:journal-on-account-baseline
    ```

    Expected result:

    ```text
    [Journal + On Account Phase 1] Merged schema, permissions, balances, manual-Journal boundary, and integration gate verified successfully.
    ```

Record the date, tester, environment, and result before approving Phase 2.
