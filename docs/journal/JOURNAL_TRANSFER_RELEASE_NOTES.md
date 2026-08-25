# Revo365 On-Account Transfer Integration Release Notes

## Features Delivered
- **Phase 1-4:** Standardized Journal architecture, movement auditing, and baseline integration framework.
- **Phase 5:** Support for complex Invoice Allocations involving Transferred On-Account balances. Re-routing Customer Statements to transparently display transferred amounts in the statement timeline without duplicating entries.
- **Phase 6:** Safe "Replace with Payment" workflow, allowing Customer On-Account transfers to be systematically unwound, un-clearing downstream invoice allocations, and seamlessly restoring the source customer balance via replacing the transfer with an actual collected bank receipt.

## Migration & Deployment Strategy
The backend code requires no database schema changes (using existing JSONB structures). However, you **must run the regression tests** and create a full database snapshot immediately prior to deployment.

```bash
# Snapshot the DB
pg_dump -U postgres -d revo365 -Fc > pre_release_backup.dump
```

## Backout / Rollback Procedure
If critical production flaws are found post-deployment:
1. Revert backend and frontend to the previous commit tags.
2. The core tables `journal_entries`, `journal_lines`, `on_account_references`, `on_account_movements`, and `finance_audit_events` are append-only or version-controlled. If corrupted transactions occurred during the bad deployment, the safest and only supported rollback mechanism is restoring from the `pre_release_backup.dump`.
3. If minimal bad data was created, an accountant can manually invoke "Reverse Journal" on any created transfer to neutralize its effect on the ledgers, but manual DB updates should be avoided due to the interconnected nature of Invoice allocations and TDS calculations.

## Monitoring & Integrity Queries

### 1. Monitor Transfer Volume
Run this query to track how many transfers are occurring:
```sql
SELECT
  COUNT(*) as transfer_count,
  SUM(amount) as total_volume_transferred
FROM on_account_movements
WHERE movementtype = 'journal_transfer_out';
```

### 2. Orphaned Reversal Check (Data Integrity)
Run this query to ensure no Transfer Reversals were orphaned without updating the replacement reference:
```sql
SELECT oam.id, oam.journalentryid, oar.status, oar.replacementreferenceid
FROM on_account_movements oam
JOIN on_account_references oar ON oam.onaccountreferenceid = oar.id
WHERE oam.movementtype = 'journal_transfer_reversal'
AND (oar.status != 'reversed' OR oar.replacementreferenceid IS NULL);
```
**Expected Result:** 0 rows. Any rows returned indicate a broken transaction boundary.

## Post-Release Verification Checklist
- [ ] Log in as an Administrator.
- [ ] Create a Draft manual journal and post it successfully.
- [ ] Process a test Customer Advance Receipt.
- [ ] Transfer ₹10 of the Advance to another Customer.
- [ ] Navigate to the destination customer and verify ₹10 is available.
- [ ] Allocate the ₹10 to an open Invoice.
- [ ] View the Customer Statement for both the Source and Destination customers to ensure the transfer appears correctly and the running balances are accurate.
