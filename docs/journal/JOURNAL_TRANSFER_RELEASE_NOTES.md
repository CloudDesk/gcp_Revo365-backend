# Journal and On Account Integration Release Notes

## Delivered scope

- Guided Customer-to-Customer transfer using an eligible, versioned On Account reference.
- Balanced, party-aware system Journal with paired immutable transfer movements.
- Separate Manual, System-Generated, and All Journal views.
- Cross-links among Journal details, source/destination On Account references, movements, and replacement records.
- Destination-customer Invoice allocation through the existing On Account/TDS flow.
- Explicit replacement with a later destination-customer Bank-origin reference.
- Atomic un-clearing of only transfer-funded Invoice allocations, paired replacement movements, restored source availability, idempotency, and audit links.
- Customer Statement support for original and compensating transfer movements.

## Required migration

Run all migrations before deploying application code. The integration specifically requires:

- `20260819_journal_on_account_phase2.sql`
- `20260825_journal_on_account_transfer_contract.sql`

The latter expands the immutable movement constraint and adds the Journal request-idempotency column/index. Do not deploy the new backend before this migration is applied.

## Pre-release procedure

1. Take and verify a restorable database backup.
2. Run `npm run migrate` using the target release artifact and target environment configuration.
3. Run `npm run verify:journal-on-account-baseline`.
4. Run backend tests/build and frontend type-check/build.
5. Complete the approved end-to-end and negative manual test matrix.

## Backout procedure

If the migration succeeds but application validation fails, stop transfer/replacement access and redeploy the previous application build. Do not drop the additive column, index, or expanded constraint while transfer records may exist. If a posted financial effect is incorrect, do not use a generic Journal reverse or manual SQL update; isolate the organization and record IDs, preserve evidence, and restore the approved backup or use a reviewed compensating-accounting procedure.

## Monitoring queries

Run the verifier first. For focused operational checks:

```sql
SELECT j.id, j.journalnumber, SUM(l.debitamount) AS debit, SUM(l.creditamount) AS credit
FROM journal_entries j
JOIN journal_lines l ON l.journalentryid = j.id
WHERE j.sourcetype IN ('on_account_transfer', 'on_account_transfer_reversal')
GROUP BY j.id, j.journalnumber
HAVING SUM(l.debitamount) <> SUM(l.creditamount);
```

```sql
SELECT reversal.id, reversal.journalnumber
FROM journal_entries reversal
LEFT JOIN on_account_references destination
  ON destination.organizationid = reversal.organizationid
 AND destination.reversaljournalentryid = reversal.id
WHERE reversal.sourcetype = 'on_account_transfer_reversal'
  AND (destination.status <> 'reversed' OR destination.replacementreferenceid IS NULL);
```

Both queries must return zero rows.

## Post-release reconciliation

- Source availability decreases once on transfer and is restored once on replacement.
- Destination transferred reference is owned by the selected destination Customer.
- Transfer and replacement Journals each balance to zero.
- Cash/Bank transaction count and balance do not change during transfer or replacement.
- The selected later Bank-origin reference remains unchanged and available.
- Reversed allocations remain in history; affected Invoices reopen by the exact settlement funded by the transferred reference.
- Customer statements show the original transfer and compensating replacement with correct signs.
