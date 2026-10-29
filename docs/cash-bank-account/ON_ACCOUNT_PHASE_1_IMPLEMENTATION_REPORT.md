# On Account Of — Phase 1 Implementation Report

## Status

**Phase 1 — On Account Base Setup, Database Foundation, and Legacy Migration**
is implemented in source and ready for manual verification in a development/test
database.

The migration was not automatically executed against the configured database
because the repository is currently configured for a non-local database. The
reviewer must choose the intended development/test environment before running
the migration.

No Customer or Supplier On Account UI workflow is introduced in this phase.

## Implemented Scope

- Organization-scoped Customer and Supplier On Account reference counters
- Stable reference formats: `OA-C-00000001` and `OA-S-00000001`
- On Account reference header with party, currency, source, balance snapshots,
  lifecycle, version, and audit information
- Append-only On Account movement ledger
- On Account-to-Invoice/Bill allocation bridge foundation
- Database constraints for ownership types, monetary values, lifecycle, and
  idempotency
- Database triggers protecting posted movement history and reference identity
- Legacy `party_unapplied_amounts` backfill without deleting or replacing legacy
  data
- Legacy opening movements equal to the current unused/available amount
- Shared reference-number, locking, idempotency, status, TDS, and reconciliation
  helpers
- A read-only Phase 1 verification command
- Automated unit and regression coverage

## Database Objects

- `on_account_reference_counters`
- `on_account_references`
- `on_account_movements`
- `on_account_document_allocations`
- `prevent_on_account_movement_mutation()`
- `protect_on_account_reference_identity()`
- `trg_prevent_on_account_movement_mutation`
- `trg_protect_on_account_reference_identity`
- Schema version: `20260818_on_account_phase1_foundation_v1`

## Compatibility Boundary

- Existing receipt and payment services continue using their current behavior.
- Existing statement readers are not switched in Phase 1.
- `party_unapplied_amounts` remains intact for backward compatibility.
- Existing Bank transactions and Journals are not rewritten.
- Phase 2 will introduce the first new posting workflow.

## Automated Verification Completed

```text
npx tsc --noEmit
npm test
```

Result:

```text
106 tests passed
0 tests failed
```

The test suite includes seven On Account Phase 1 tests covering reference
formatting, lifecycle derivation, movement reconciliation, TDS separation,
counter allocation, stable locking, and idempotency lookup.

## Manual Testing Prerequisites

1. Use a development or test database, not Production.
2. Take a database backup or snapshot before applying migrations.
3. Confirm the backend `.env` points to the intended environment.
4. Open a terminal in `gcp_Revo365-backend`.

## Manual Test 1 — Build and automated regression

Run:

```powershell
npx tsc --noEmit
npm test
```

Expected:

- TypeScript completes without an error.
- All tests pass.
- No existing finance test fails.

## Manual Test 2 — Apply the migration

Run only after confirming the target development/test database:

```powershell
npm run migrate:dev
```

Expected:

- Every migration reports `applied successfully`.
- `20260818_on_account_phase1_foundation.sql` reports success.
- The command ends with `[Migrations] Completed successfully.`

The migration runner is idempotent. Running it a second time should also finish
successfully without creating duplicate references or movements.

## Manual Test 3 — Run the Phase 1 database verifier

Run:

```powershell
npm run verify:on-account-foundation
```

Expected:

```text
[On Account Phase 1] Schema, legacy migration, immutability, and balances verified successfully.
```

This command checks:

- Required tables and columns
- Phase 1 schema version
- Immutability triggers
- Legacy migration coverage
- Legacy-to-new balance equality
- Movement-to-reference reconciliation
- Duplicate reference numbers

## Manual Test 4 — Inspect migrated references

In the development/test database, run:

```sql
SELECT
    r.referencenumber,
    r.partytype,
    r.partyid,
    r.originalamount,
    r.usedamount,
    r.availableamount,
    r.status,
    r.sourcebanktransactionid,
    r.legacyunappliedamountid
FROM on_account_references r
ORDER BY r.organizationid, r.partytype, r.createddate, r.id;
```

Expected:

- Customer references begin with `OA-C-`.
- Supplier references begin with `OA-S-`.
- `originalamount = usedamount + availableamount`.
- Unused legacy records are `open`.
- Partially used legacy records are `partially_applied`.
- Fully used legacy records are `fully_applied`.
- Reversed legacy records remain `reversed`.
- Source and legacy IDs point to the original records.

If the environment contains no legacy unapplied records, an empty result is
valid in Phase 1.

## Manual Test 5 — Compare legacy and migrated balances

Run:

```sql
SELECT
    u.id AS legacy_id,
    r.referencenumber,
    u.originalamount AS legacy_original,
    r.originalamount AS new_original,
    u.appliedamount AS legacy_used,
    r.usedamount AS new_used,
    u.remainingamount AS legacy_available,
    r.availableamount AS new_available
FROM party_unapplied_amounts u
LEFT JOIN on_account_references r
  ON r.legacyunappliedamountid = u.id
ORDER BY u.id;
```

Expected:

- Every legacy row has one reference number.
- Every legacy and new amount pair matches.
- No existing legacy row was changed or deleted.

## Manual Test 6 — Verify movement reconciliation

Run:

```sql
SELECT
    r.referencenumber,
    r.availableamount,
    COALESCE(
        SUM(
            CASE m.direction
                WHEN 'increase' THEN m.amount
                ELSE -m.amount
            END
        ),
        0
    ) AS movement_balance
FROM on_account_references r
LEFT JOIN on_account_movements m
  ON m.onaccountreferenceid = r.id
 AND m.organizationid = r.organizationid
GROUP BY r.id, r.referencenumber, r.availableamount
ORDER BY r.referencenumber;
```

Expected:

- `availableamount` equals `movement_balance` for every row.
- Legacy references with available balances have a `legacy_opening` movement.

## Manual Test 7 — Verify migration idempotency

Record the counts:

```sql
SELECT
    (SELECT COUNT(*) FROM on_account_references) AS reference_count,
    (SELECT COUNT(*) FROM on_account_movements) AS movement_count;
```

Run the migration again:

```powershell
npm run migrate:dev
npm run verify:on-account-foundation
```

Run the count query again.

Expected:

- Reference count is unchanged.
- Movement count is unchanged.
- Verification still passes.

## Manual Test 8 — Existing application regression

Start the backend and frontend normally, then verify:

1. Open Cash & Bank Accounts.
2. Open an existing account and its Transactions tab.
3. Open Customer Statements.
4. Open Supplier-related Bill/payment screens.
5. If safe test data is available, complete one existing Invoice receipt and one
   existing Supplier Bill payment using the current document-based flows.

Expected:

- Existing pages load normally.
- Existing transactions and balances remain unchanged.
- Existing document-based payment flows behave exactly as before.
- No new On Account action is visible yet; that begins in Phase 2.

## Approval Gate

After the migration, verifier, and regression checks pass, provide explicit
approval before **Phase 2 — Customer Advance Payment Creation** begins.
