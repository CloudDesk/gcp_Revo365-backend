# Chart of Accounts Lifecycle Management Implementation Plan

**Document status:** Approved requirements and implementation plan  
**Prepared on:** 13 October 2026  
**Module:** Finance — Chart of Accounts, Cash & Bank, Transactions and Journals  
**Implementation repositories:** `gcp_Revo365-backend` and `GCP-Latest-Revo-Inventory`

## 1. Purpose

This document defines the implementation plan for adding complete lifecycle
management to user-created Chart of Accounts (COA) records. The change includes:

- Individual and bulk activation, deactivation and deletion.
- Active, inactive and all filters for Chart of Accounts.
- Cascading lifecycle changes to Direct Ledger Entries created through Cash &
  Bank.
- Correct recalculation of Cash/Bank balances and transaction running balances.
- Active and inactive transaction filters in the global Transactions page and
  individual Cash/Bank account transaction view.
- A pre-delete CSV report containing the affected data.
- Soft deletion using an `isdeleted` flag and immutable finance audit events.
- Protection for system accounts and COA records used outside the Direct Ledger
  workflow.

The plan is deliberately divided into ordered phases so that database,
backend, frontend and validation work can be implemented and reviewed without
temporarily exposing unsafe lifecycle actions.

## 2. Confirmed Business Decisions

The following decisions are confirmed and form the implementation contract.

1. Active COA records are the default records displayed and are the only COA
   records available for new postings or mappings.
2. Inactive COA records are available through an explicit `Inactive` filter and
   can be reactivated.
3. Deactivating a COA cascades only to Direct Ledger Entries created through
   Cash & Bank for that COA.
4. Cascaded Direct Ledger bank transactions and their journal entries become
   inactive and stop contributing to balances and reports.
5. Every affected Cash/Bank account is recalculated after activation,
   deactivation or deletion.
6. Reactivating a COA restores only the Direct Ledger transactions and journal
   entries that were deactivated by that COA lifecycle operation.
7. Deletion is implemented as a soft delete. The affected records remain in the
   database with `isdeleted = TRUE` for auditability but disappear from the
   operational application.
8. A confirmed delete generates a CSV snapshot of the COA and affected Direct
   Ledger data before the soft-delete changes are committed.
9. Records referenced by workflows other than Direct Ledger Entries are not
   automatically deleted. Such references block deletion and are reported to
   the user.
10. Deleted COA records cannot be reactivated through the normal application.
11. System and operational accounts cannot be activated, deactivated or
    deleted using the COA lifecycle functions.
12. Bulk activate, deactivate and delete operations are required.

## 3. Terminology

| Term | Meaning |
|---|---|
| Active COA | A user-created, non-system account with `status = 'active'` and `isdeleted = FALSE` |
| Inactive COA | A user-created, non-system account with `status = 'inactive'` and `isdeleted = FALSE` |
| Deleted COA | A user-created account with `isdeleted = TRUE`; it is unavailable to operational UI and posting APIs |
| Direct Ledger Entry | A Cash/Bank transaction with `allocationmethod = 'direct_ledger'`, a ledger counterparty and a journal generated from that bank transaction |
| Lifecycle-deactivated transaction | A Direct Ledger transaction made inactive specifically because its COA was deactivated |
| Active transaction | A non-deleted Cash/Bank transaction whose posting status is `posted` |
| Inactive transaction | A non-deleted Cash/Bank transaction whose posting status is `inactive` |
| Deletion batch | One confirmed single or bulk delete request, identified by a unique batch ID |

## 4. Current System Baseline

### 4.1 Existing Chart of Accounts behavior

The current application supports:

- Creating user-managed COA records.
- Renaming eligible user-created COA records.
- Listing records with search, category, account type, date and pagination
  controls.
- Returning `active` or `inactive` records through the backend `status` query
  parameter.
- Displaying an account status column.
- Showing account detail and posted ledger entries.

The current application does not provide:

- A status filter in the COA frontend.
- Activate or deactivate actions.
- Delete actions.
- Row selection or bulk lifecycle actions.
- Lifecycle cascading to Direct Ledger transactions.
- CSV-before-delete behavior.

### 4.2 Existing posting relationships

A Direct Ledger Entry currently creates:

1. One `bank_transactions` record.
2. One `journal_entries` record with source type `bank_transaction`.
3. Two `journal_lines` records:
   - The Cash/Bank finance-account side.
   - The selected COA counterparty side.
4. An update to `bank_cash_accounts.currentbalance`.
5. A stored `bank_transactions.balanceafter` value.

### 4.3 Existing balance rebuild support

The backend already contains a balance rebuild utility that:

- Starts from the Cash/Bank account opening balance.
- Selects posted transactions in chronological order.
- Recalculates every transaction's `balanceafter` value.
- Updates `bank_cash_accounts.currentbalance`.

This utility must be reused and extended so it consistently ignores inactive
and deleted transactions.

### 4.4 Existing protections

Database foreign keys currently prevent unsafe physical deletion of referenced
finance accounts. The new soft-delete workflow must add service-level reference
classification rather than removing these protections.

## 5. Target Lifecycle Rules

### 5.1 COA status matrix

| COA state | `status` | `isdeleted` | Listed by default | Available for posting | Can activate | Can deactivate | Can delete |
|---|---|---:|---:|---:|---:|---:|---:|
| Active | `active` | `FALSE` | Yes | Yes | No | Yes | Yes, subject to validation |
| Inactive | `inactive` | `FALSE` | No | No | Yes | No | Yes, subject to validation |
| Deleted | `inactive` | `TRUE` | No | No | No | No | No |

The `All` COA filter means active plus inactive records where
`isdeleted = FALSE`. It never includes deleted records.

### 5.2 Transaction status matrix

| Transaction state | `postingstatus` | `isdeleted` | Included in balance | Default list | Inactive filter | Can be lifecycle-reactivated |
|---|---|---:|---:|---:|---:|---:|
| Active | `posted` | `FALSE` | Yes | Yes | No | Not applicable |
| Inactive by COA | `inactive` | `FALSE` | No | No | Yes | Yes |
| Reversed | `reversed` | `FALSE` | No | No | No | No |
| Deleted by COA | `inactive` | `TRUE` | No | No | No | No |

### 5.3 Journal status matrix

| Journal state | `status` | `isdeleted` | Included in COA/report totals |
|---|---|---:|---:|
| Posted | `posted` | `FALSE` | Yes |
| Inactive by COA | `inactive` | `FALSE` | No |
| Reversed/draft | Existing status | `FALSE` | Existing behavior |
| Deleted by COA | `inactive` | `TRUE` | No |

## 6. Eligibility and Protection Rules

### 6.1 Eligible COA records

A lifecycle action is allowed only when all of the following are true:

- The record belongs to the current organization.
- `isusercreatedchartaccount = TRUE`.
- `issystem = FALSE`.
- `isdeleted = FALSE` before the operation.
- The caller has the required permission.

### 6.2 Direct Ledger records eligible for cascade

A bank transaction is eligible for lifecycle cascading only when all of the
following match:

- The transaction belongs to the current organization.
- `allocationmethod = 'direct_ledger'`.
- `partytype = 'ledger'`.
- `counterpartyaccountid` equals the affected COA ID.
- Its linked journal has `sourcetype = 'bank_transaction'`.
- The journal's `sourceid` identifies that bank transaction.
- The transaction is not reversed.
- The transaction has no operational allocations.

### 6.3 References that block deletion

Deletion must be blocked if the account is used by any non-Direct-Ledger
relationship, including but not limited to:

- Manual Journal lines.
- Supplier or Direct Expense Bills through `expenseaccountid`.
- Bank/Cash account ledger ownership.
- Reconciliation configuration.
- Payment-account or statutory mappings.
- TDS, GST or other system configuration.
- A bank transaction that is not a valid Direct Ledger Entry.
- Any future foreign-key reference not explicitly classified as cascade-safe.

Deactivation does not destroy these historical references. It stops future use
of the COA and only inactivates eligible Direct Ledger transactions.

### 6.4 Default-deny reference classification

The delete preview service must treat an unknown reference as blocking. New
finance features must be explicitly added to the reference-classification
logic before their COA relationships can participate in deletion.

## 7. Data Model and Migration Plan

### 7.1 `finance_accounts`

Add:

```sql
isdeleted BOOLEAN NOT NULL DEFAULT FALSE
deletedby VARCHAR(255)
deleteddate BIGINT
deletionbatchid UUID
```

Retain the existing `status` field. A deleted account must also be inactive.

Update uniqueness rules so deleted user-created accounts do not prevent reuse
of a name or optional code. Active and inactive non-deleted records must remain
unique within their organization.

### 7.2 `bank_transactions`

Add:

```sql
isdeleted BOOLEAN NOT NULL DEFAULT FALSE
deletedby VARCHAR(255)
deleteddate BIGINT
deletionbatchid UUID
deactivatedbychartaccountid BIGINT
deactivatedby VARCHAR(255)
deactivateddate BIGINT
```

Extend the posting-status constraint to allow `inactive` in addition to the
existing statuses.

`deactivatedbychartaccountid` is essential. Reactivation must restore only
transactions that the same COA lifecycle action previously deactivated.

### 7.3 `journal_entries`

Add:

```sql
isdeleted BOOLEAN NOT NULL DEFAULT FALSE
deletedby VARCHAR(255)
deleteddate BIGINT
deletionbatchid UUID
deactivatedbychartaccountid BIGINT
deactivatedby VARCHAR(255)
deactivateddate BIGINT
```

Extend the journal-status constraint to allow `inactive`.

### 7.4 `journal_lines`

No lifecycle flag is required initially. Journal lines inherit accounting
eligibility from their parent journal entry. They remain intact for audit and
reactivation.

All queries that aggregate journal lines must join the journal header and
require:

```sql
je.status = 'posted'
AND COALESCE(je.isdeleted, FALSE) = FALSE
```

### 7.5 Indexes

Add or update indexes for:

- COA listing by organization, status and `isdeleted`.
- Direct Ledger cascade lookup by organization, counterparty account,
  allocation method, posting status and `isdeleted`.
- Lifecycle reactivation lookup by `deactivatedbychartaccountid`.
- Deletion audit lookup by `deletionbatchid`.
- Partial normalized COA name/code uniqueness for non-deleted records.

### 7.6 Migration safety

The migration must:

- Be idempotent according to the repository's migration conventions.
- Default all existing records to non-deleted.
- Preserve all existing statuses and balances.
- Add constraints only after validating existing data.
- Record its version in `finance_schema_versions`.
- Include verification queries or a companion verification script.

## 8. Backend Service Design

### 8.1 Shared lifecycle service

Create a focused Chart of Accounts lifecycle service instead of expanding one
large handler with unrelated behavior. It should provide:

- Eligibility validation.
- Reference inspection and classification.
- Direct Ledger relationship resolution.
- Status transitions.
- Soft deletion.
- Cash/Bank account locking and balance rebuilding.
- Audit-event writing.
- CSV snapshot construction.
- Single and bulk orchestration.

### 8.2 Proposed API endpoints

| Method | Endpoint | Purpose | Permission |
|---|---|---|---|
| `GET` | `/finance/chart-of-accounts` | List active, inactive or all non-deleted COAs | `read` |
| `PATCH` | `/finance/chart-of-accounts/:accountId/status` | Activate or deactivate one COA | `edit` |
| `POST` | `/finance/chart-of-accounts/bulk-status` | Activate or deactivate selected COAs | `edit` |
| `POST` | `/finance/chart-of-accounts/delete-preview` | Validate references and return deletion impact | `delete` |
| `POST` | `/finance/chart-of-accounts/bulk-delete` | Confirm soft deletion and return CSV | `delete` |
| `GET` | `/finance/transactions` or existing route | Add transaction lifecycle-status filtering | Existing read permission |

Suggested status request:

```json
{
  "status": "inactive",
  "reason": "Duplicate ledger"
}
```

Suggested bulk-status request:

```json
{
  "accountids": [41, 42, 43],
  "status": "inactive",
  "reason": "Ledger cleanup"
}
```

Suggested preview request:

```json
{
  "accountids": [41, 42]
}
```

Suggested preview response:

```json
{
  "deletiontoken": "short-lived-signed-token",
  "expiresat": 1791881400,
  "summary": {
    "requested": 2,
    "deletable": 1,
    "blocked": 1,
    "directledgertransactions": 4,
    "affectedbankaccounts": 2
  },
  "accounts": [
    {
      "accountid": 41,
      "accountname": "Office Rent",
      "deletable": true,
      "directledgertransactions": 4,
      "blockingreferences": []
    },
    {
      "accountid": 42,
      "accountname": "Travel Expense",
      "deletable": false,
      "directledgertransactions": 0,
      "blockingreferences": [
        { "type": "manual_journal", "count": 2 }
      ]
    }
  ]
}
```

The confirmed delete request must send the preview token. The backend must
still repeat all validation inside the final transaction; the token does not
replace concurrency-safe validation.

### 8.3 List behavior

The COA list must accept:

- `status=active` — default.
- `status=inactive`.
- No status or `status=all` — all non-deleted records.

The list, count and summary-card queries must use the same lifecycle filter so
the displayed rows and totals agree.

All account selectors and posting validators must explicitly require:

```sql
status = 'active'
AND isusercreatedchartaccount = TRUE
AND isdeleted = FALSE
```

### 8.4 Transaction-list behavior

Expose a UI lifecycle filter with values:

- `active` — maps to `postingstatus = 'posted' AND isdeleted = FALSE`.
- `inactive` — maps to `postingstatus = 'inactive' AND isdeleted = FALSE`.
- `all` — active plus inactive, always excluding deleted records.

The status filter must combine with existing filters rather than replace them.
Examples:

```text
transactiontype=direct_ledger&status=inactive
sourcetype=manual&status=inactive
bankcashaccountid=12&status=active
```

Transaction count, debit summary, credit summary and rows must use identical
filters. Deleted transactions must never be returned by these operational
endpoints.

## 9. Lifecycle Algorithms

### 9.1 Deactivate one or more COAs

Execute the following in one database transaction:

1. Normalize and deduplicate the requested account IDs.
2. Load and lock eligible COA rows in ascending ID order.
3. Reject missing, cross-organization, system or deleted accounts.
4. Load eligible active Direct Ledger bank transactions for those COAs.
5. Resolve the linked journal entries and verify their relationship.
6. Collect affected Cash/Bank account IDs.
7. Lock affected `bank_cash_accounts` rows in ascending ID order.
8. Change COAs to `inactive`.
9. Change eligible bank transactions from `posted` to `inactive` and set
   `deactivatedbychartaccountid` plus actor/date metadata.
10. Change corresponding journal entries from `posted` to `inactive` with the
    same lifecycle metadata.
11. Rebuild every affected Cash/Bank account once.
12. Write COA, transaction and Cash/Bank balance audit events.
13. Commit and return per-account results.

Transactions already reversed, deleted or independently inactive must not be
modified.

### 9.2 Reactivate one or more COAs

Execute the following in one database transaction:

1. Load and lock eligible inactive, non-deleted COAs.
2. Load only non-deleted inactive bank transactions where
   `deactivatedbychartaccountid` matches the COA being activated.
3. Load and validate the corresponding inactive journal entries.
4. Lock affected Cash/Bank accounts in ascending ID order.
5. Change the COAs to `active`.
6. Restore eligible bank transactions to `posted` and clear deactivation
   metadata.
7. Restore eligible journal entries to `posted` and clear deactivation
   metadata.
8. Rebuild every affected Cash/Bank account once in chronological order.
9. Write audit events with balances before and after.
10. Commit and return per-account results.

Reactivation must not restore reversed transactions or records deactivated by
another workflow.

### 9.3 Preview deletion

The preview is read-only and must:

1. Validate permissions and organization ownership.
2. Classify every reference for every selected COA.
3. Separate cascade-safe Direct Ledger references from blocking references.
4. Count affected transactions, journals and Cash/Bank accounts.
5. Return clear blocking reasons.
6. Issue a short-lived signed confirmation token containing organization,
   actor, selected account IDs and a preview fingerprint.

### 9.4 Confirm soft deletion

Execute the following in one database transaction:

1. Validate the signed confirmation token and delete permission.
2. Lock selected COAs in ascending ID order.
3. Re-run reference classification.
4. Fail or exclude accounts whose reference state changed after preview.
5. Load all affected Direct Ledger transactions, journals and journal lines.
6. Lock affected Cash/Bank accounts in ascending ID order.
7. Construct the complete in-memory pre-delete snapshot.
8. Assign one UUID deletion-batch ID.
9. Set eligible bank transactions to `postingstatus = 'inactive'` and
   `isdeleted = TRUE` with deletion metadata.
10. Set linked journals to `status = 'inactive'` and `isdeleted = TRUE`.
11. Set the COA to `status = 'inactive'` and `isdeleted = TRUE`.
12. Rebuild every affected Cash/Bank account once.
13. Write immutable audit events, including before/after balances and the
    deletion-batch ID.
14. Commit.
15. Serialize and return the previously captured snapshot as a CSV download.

If any database operation or balance rebuild fails, roll back the complete
request. No COA, transaction or journal may be left in a partially changed
state.

### 9.5 Bulk partial-result policy

Recommended behavior:

- Preview all selected records.
- Show deletable and blocked accounts before confirmation.
- On confirmation, delete only the accounts confirmed as deletable.
- Return blocked/skipped accounts in the CSV with a reason.
- Revalidate every record during confirmation.

The UI must clearly state how many records will be deleted and how many will be
skipped. If strict all-or-nothing behavior is later preferred, it can be
enforced at the orchestration boundary without changing the underlying
eligibility rules.

## 10. Balance Recalculation Requirements

### 10.1 Rebuild input

The balance rebuild query must include only:

```sql
postingstatus = 'posted'
AND isdeleted = FALSE
```

### 10.2 Ordering

Recalculate transactions using deterministic chronological order:

1. `transactiondate ASC`
2. `posteddate ASC`
3. `id ASC`

### 10.3 Calculation

For each Cash/Bank account:

1. Begin with `openingbalance`.
2. Apply every eligible posted transaction in order.
3. Update each included transaction's `balanceafter`.
4. Update `bank_cash_accounts.currentbalance`.
5. Increment the account version.

Inactive or deleted transactions retain their original snapshot values for
audit but are not part of the active running-balance sequence. In the inactive
transaction UI, their Balance After field should be labelled as historical or
shown as `Excluded from active balance` to avoid implying it is the current
running balance.

### 10.4 Concurrency

- Lock COAs in ascending ID order.
- Lock Cash/Bank accounts in ascending ID order.
- Perform lifecycle updates and balance rebuilding in the same transaction.
- Use account versioning where the existing API already exposes versions.
- Revalidate transaction status after acquiring locks.

## 11. CSV Deletion Report

### 11.1 Download behavior

The confirmed delete endpoint returns:

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="chart-of-accounts-delete-<timestamp>.csv"
```

The frontend must process the response as a Blob, trigger the browser download
and refresh the COA/transaction views only after a successful response.

### 11.2 Required fields

The report must contain enough information to reconstruct what was affected:

- Deletion batch ID.
- Operation result: `deleted`, `blocked`, `skipped` or `failed`.
- Blocking reason, if applicable.
- COA ID, code, name, category, account subtype and description.
- COA status before deletion.
- Currency, creator, modifier and timestamps.
- COA total debit, total credit and ledger balance before deletion.
- Cash/Bank account ID, name and type.
- Cash/Bank balance before and after deletion.
- Bank transaction ID and number.
- Transaction date, entry side, amount, debit and credit.
- Original/historical balance after.
- Allocation method, source type, narration and remarks.
- Journal entry ID and journal number.
- Journal-line IDs, finance-account IDs, debit, credit and descriptions.
- Record creator/poster and timestamps.
- Deleted by and deletion timestamp.

Use standard CSV escaping for commas, quotes and line breaks. Include a UTF-8
BOM if required for reliable Microsoft Excel display.

### 11.3 Audit retention

The downloaded CSV is a user-facing report. It does not replace server-side
audit events. Audit events and soft-deleted rows remain the authoritative
internal record of the deletion.

## 12. Frontend Plan — Chart of Accounts

### 12.1 Status filter

Add a clear status control with:

- `Active` — default.
- `Inactive`.
- `All` — active and inactive, excluding deleted.

Changing status resets pagination and selected rows.

### 12.2 Row selection

Add:

- One checkbox per eligible row.
- Select all eligible rows on the current page.
- Selected-record count.
- Clear-selection action.
- Disabled selection for system/protected accounts.

Selection should not silently span hidden filters or pages unless the UI
explicitly communicates that behavior. The initial implementation should use
current-page selection for predictability.

### 12.3 Individual actions

Provide actions according to record state and permissions:

- Active record: `Deactivate`, `Delete`.
- Inactive record: `Activate`, `Delete`.
- Deleted record: not shown.
- System/protected record: no lifecycle actions.

The same actions should be available from the account-detail page.

### 12.4 Bulk action bar

When at least one row is selected, display:

- `Activate`.
- `Deactivate`.
- `Delete`.
- Selected count.
- `Clear selection`.

Disable actions that do not apply to the current status view where practical.
The backend remains authoritative and must validate mixed selections.

### 12.5 Confirmation dialogs

Deactivate confirmation must show:

- Number of selected COAs.
- Number of related Direct Ledger transactions.
- Number of affected Cash/Bank accounts.
- Warning that balances and reports will be recalculated.

Delete confirmation must show:

- Deletable and blocked COAs.
- Direct Ledger transaction count.
- Affected Cash/Bank account count.
- Confirmation that a CSV will be downloaded.
- Confirmation that deleted records cannot be reactivated in the application.

### 12.6 Results and errors

After an action:

- Refresh COA records and summary cards.
- Clear selection.
- Show a success, partial-success or failure message.
- For partial bulk results, identify blocked accounts and reasons.
- Do not show success until balance recalculation and transaction commit finish.

## 13. Frontend Plan — Transactions and Cash & Bank

### 13.1 Global Transactions page

In the filter row shown in reference image 1, add `Transaction Status` alongside
the existing Bank/Cash Account, Transaction Type and Entry Side controls.

Options:

- `Active` — default.
- `Inactive`.
- `All`.

Example administrative lookup:

```text
Transaction Type = Direct ledger entries
Transaction Status = Inactive
```

### 13.2 Cash/Bank account detail

In the Transaction Filters panel shown in reference image 3, add `Transaction
Status` alongside Entry Type and Source.

Example administrative lookup:

```text
Source = Manual
Transaction Status = Inactive
```

### 13.3 Transaction rows

- Show an `Inactive` badge for inactive records.
- Keep transaction and journal references available for audit inspection.
- Clearly identify historical balance-after values as excluded from the active
  Cash/Bank balance.
- Deleted transactions are not returned or displayed.

### 13.4 Totals

Debit cards, credit cards, pagination totals and displayed rows must use the
same status, source, type, account, entry-side, search and date filters.

## 14. Permissions

Recommended permission policy:

| Capability | Permission | Admin | Accountant | Other roles |
|---|---|---:|---:|---:|
| List active COAs | `read` | Yes | Yes | According to existing grants |
| View inactive COAs/transactions | `read` plus lifecycle visibility policy | Yes | Optional | No by default |
| Activate/deactivate | `edit` | Yes | Yes | No |
| Delete and download CSV | `delete` | Yes | No by default | No |
| Create COA | `create` | Existing policy | Existing policy | Existing policy |

The backend must enforce permissions even when the frontend hides controls.
Add a migration to grant delete permission only to approved roles.

## 15. Audit Requirements

Write finance audit events for:

- `chart_account_deactivated`.
- `chart_account_activated`.
- `chart_account_deleted`.
- `direct_ledger_deactivated_by_chart_account`.
- `direct_ledger_activated_by_chart_account`.
- `direct_ledger_deleted_by_chart_account`.
- `bank_cash_balance_rebuilt`.
- Bulk operation completion and partial results.

Audit event data should include:

- Organization and actor.
- COA and deletion-batch IDs.
- Affected transaction, journal and Cash/Bank account IDs.
- Previous and new statuses.
- Previous and new Cash/Bank balances.
- Reason supplied by the user.
- Counts and failure/blocking reasons.

## 16. Ordered Implementation Phases

### Phase 0 — Baseline and regression fixtures

**Goal:** Establish repeatable examples before changing lifecycle behavior.

**Status:** Completed on 13 October 2026.

Tasks:

- [x] Add test fixtures covering one COA used by Direct Ledger transactions in
      one Cash/Bank account.
- [x] Add fixtures covering one COA used across multiple Cash/Bank accounts.
- [x] Add fixtures for manual journals, expense bills and reconciliation
      references.
- [x] Record current Cash/Bank balance and COA ledger calculations.
- [x] Add a read-only reference-inspection test.

Exit criteria:

- Current behavior is reproducible in automated tests.
- Direct Ledger and blocking references are distinguishable.

### Phase 1 — Database lifecycle foundation

**Goal:** Add soft-delete and inactive transaction/journal states without
exposing UI actions.

**Status:** Completed in code on 13 October 2026; database migration remains to
be applied during deployment.

Tasks:

- [x] Add lifecycle columns to finance accounts, bank transactions and journals.
- [x] Extend status constraints with `inactive`.
- [x] Add lifecycle and partial uniqueness indexes.
- [x] Add migration/version records.
- [x] Add migration verification tests/scripts.

Exit criteria:

- Existing records remain non-deleted and unchanged.
- Backend builds and existing finance tests pass.
- Migration is safe to rerun.

### Phase 2 — Query hardening

**Goal:** Make every read and calculation explicitly lifecycle-aware before
records can become inactive or deleted.

**Status:** Completed in code on 13 October 2026; requires the Phase 1 database
migration before the updated backend is run.

Tasks:

- [x] Update COA lists, detail, selectors and validators.
- [x] Update journal-based reports and ledger summaries.
- [x] Update Cash/Bank lists, transaction summaries and dashboard queries.
- [x] Update supplier bill and Direct Ledger account validation.
- [x] Audit all `finance_accounts`, `journal_entries` and `bank_transactions`
      queries.
- [x] Add regression tests confirming deleted records cannot leak.

Exit criteria:

- Active behavior is unchanged.
- Deleted records are excluded by construction.
- Inactive records do not contribute to financial totals.

### Phase 3 — Reference inspection and lifecycle domain service

**Goal:** Build shared, tested lifecycle logic without UI exposure.

**Status:** Completed in code on 13 October 2026; no lifecycle mutation API is
exposed by this phase.

Tasks:

- [x] Implement account eligibility validation.
- [x] Implement Direct Ledger relationship resolution.
- [x] Implement default-deny blocking-reference inspection.
- [x] Implement deterministic row locking.
- [x] Integrate balance rebuilding.
- [x] Implement lifecycle audit helpers.

Exit criteria:

- Service can produce an accurate impact preview.
- Unknown or non-Direct-Ledger references block deletion.
- Concurrency ordering is deterministic.

### Phase 4 — Activate and deactivate backend APIs

**Goal:** Support safe individual and bulk status transitions.

**Status:** Completed in code on 13 October 2026; requires the Phase 1 database
migration before these endpoints are run.

Tasks:

- [x] Implement single status endpoint.
- [x] Implement bulk status endpoint.
- [x] Cascade transaction and journal status changes.
- [x] Rebuild affected Cash/Bank accounts once per operation.
- [x] Implement reactivation ownership using
      `deactivatedbychartaccountid`.
- [x] Add controller, schema, route and permission enforcement.

Implementation notes:

- Both endpoints use one transaction and deterministic COA/Cash-Bank lock
  ordering.
- Direct Ledger creation now uses the same COA-before-Cash/Bank lock order, so
  a new entry cannot race with account deactivation.
- Repeated requests for the target status return an unchanged result without
  touching transactions or balances.
- Reactivation selects only inactive records owned by the same COA lifecycle;
  reversed, deleted and independently inactive records remain untouched.
- Finance audit events cover account transitions, cascaded Direct Ledger
  transactions and journals, balance rebuilds, and completed bulk operations.

Exit criteria:

- Deactivation removes amounts from COA and Cash/Bank balances.
- Reactivation restores the same amounts.
- Repeated requests are idempotent or return a clear conflict.
- Reversed/independently inactive records are not restored.

### Phase 5 — Delete preview, soft delete and CSV

**Goal:** Implement confirmed, auditable deletion.

**Status:** Completed in code on 13 October 2026; requires the Phase 1 lifecycle
migration, an existing `chart_of_accounts.permissions.delete` grant, and a
deployment secret (`FINANCE_LIFECYCLE_TOKEN_SECRET`, with the existing finance
encryption key as a compatibility fallback) before runtime use.

Tasks:

- [x] Implement preview endpoint and signed confirmation token.
- [x] Implement final reference revalidation.
- [x] Capture complete pre-delete snapshot.
- [x] Apply soft deletion with batch metadata.
- [x] Rebuild affected balances.
- [x] Generate standards-compliant CSV.
- [x] Return per-account deleted/blocked/skipped results in the CSV.

Implementation notes:

- Preview tokens expire after five minutes and are signed for the organization,
  actor, selected account IDs, deletable IDs and exact reference fingerprint.
- Confirmation runs at serializable isolation, locks selected COAs and affected
  Cash/Bank accounts deterministically, and skips only the accounts whose
  fingerprint became stale while continuing safe accounts in the same batch.
- Unknown references, non-Direct-Ledger relationships, reversed/draft entries
  and Direct Ledger entries with operational allocations block that COA.
- Deletable COAs and their eligible Direct Ledger transactions/journals are
  soft-deleted under one deletion-batch UUID; blocked COAs remain unchanged.
- The response is a UTF-8 BOM CSV containing explicit accounting fields plus
  the complete captured transaction/journal/line JSON for audit reconstruction.
- No permission records are changed by this implementation. Delete access is
  controlled through the existing `chart_of_accounts.permissions.delete`
  value and remains enforced by both deletion endpoints.

Exit criteria:

- Deletable Direct Ledger COAs disappear operationally.
- Blocking references prevent deletion.
- CSV reflects the pre-delete state.
- Failed balance rebuild rolls back all changes.

### Phase 6 — COA frontend lifecycle controls

**Goal:** Expose status filters and safe actions in Chart of Accounts.

**Status:** Completed in code on 13 October 2026; runtime use requires the
Phase 1 database migration and the existing role permission records to grant
the intended `edit` and/or `delete` access.

Tasks:

- [x] Add Active/Inactive/All filter with Active default.
- [x] Add row and page selection.
- [x] Add bulk action bar.
- [x] Add individual detail-page actions.
- [x] Add impact/confirmation dialogs.
- [x] Add CSV Blob download handling.
- [x] Add permission-based visibility and disabled states.

Implementation notes:

- The list always sends an explicit lifecycle status and resets to `active`
  when filters are cleared.
- Selection is limited to eligible user-created, non-system accounts on the
  visible page and resets whenever the page or filter scope changes.
- Activate/deactivate controls require the existing `edit` permission; delete
  controls require the existing `delete` permission. No permission-set SQL or
  permission records are added or modified by Phase 6.
- Deletion loads the server preview before confirmation and displays deletable,
  blocked, Direct Ledger transaction and affected Cash/Bank account counts,
  plus per-account blocking reasons.
- Successful deletion downloads the backend CSV Blob using its response
  filename and reports deleted, blocked and skipped counts from response
  headers.
- The frontend production TypeScript/Vite build passed after implementation.

Exit criteria:

- Individual and bulk flows work end to end.
- Counts and summaries match filters.
- Selection resets safely when the visible scope changes.

### Phase 7 — Transaction-status frontend filters

**Goal:** Let authorized users inspect inactive Direct Ledger entries using the
existing transaction search patterns.

**Status:** Completed in code on 13 October 2026; runtime inactive history
requires the Phase 1 database migration and lifecycle-generated inactive
transactions from Phase 4.

Tasks:

- [x] Add Transaction Status to the global Transactions filter row.
- [x] Add Transaction Status to the Cash/Bank account filter panel.
- [x] Add inactive badges and historical-balance messaging.
- [x] Ensure Source/Transaction Type and status filters combine correctly.
- [x] Verify totals follow the complete filter set.

Implementation notes:

- Both transaction views send `status=active` by default and expose
  `inactive` and `all` options. Clearing filters restores `active`.
- The organization-wide view combines lifecycle status with Transaction Type,
  including `direct_ledger`; the Cash/Bank account view combines lifecycle
  status with Source, including `manual`.
- Debit and credit summary cards come from the backend summary query, which
  uses the same full filter conditions and always excludes soft-deleted rows.
- Inactive rows display an explicit badge. Their saved `balanceafter` value is
  labeled as historical in the tables and transaction details because it is a
  pre-deactivation snapshot, not the current Cash/Bank balance.
- A focused backend regression confirms active, inactive and all scopes plus
  the combined inactive/manual-source case. The frontend production build and
  targeted lint checks passed.

Exit criteria:

- Active is the default everywhere.
- Admin can find inactive Direct Ledger/manual-source transactions.
- Deleted transactions never appear.

### Phase 8 — Permissions, regression and rollout

**Goal:** Complete security validation and deploy safely.

Tasks:

- [ ] Apply role permission migration.
- [ ] Run backend unit/integration tests.
- [ ] Run frontend TypeScript build and lint.
- [ ] Perform manual end-to-end finance tests.
- [ ] Verify trial balance, profit and loss, balance sheet and dashboard totals.
- [ ] Verify concurrency with simultaneous posting and lifecycle requests.
- [ ] Deploy database migration before application code.
- [ ] Monitor lifecycle and balance-rebuild audit events.

Exit criteria:

- All automated and manual acceptance tests pass.
- Production roles have the intended permissions.
- No deleted/inactive amounts leak into active calculations.

## 17. Test Matrix

### 17.1 Backend functional tests

- [ ] Default COA list returns only active, non-deleted records.
- [ ] Inactive filter returns inactive, non-deleted records.
- [ ] All filter excludes deleted records.
- [ ] Deactivation cascades to eligible Direct Ledger transactions and journals.
- [ ] Deactivation does not alter manual Journals or unrelated records.
- [ ] Reactivation restores only lifecycle-deactivated records.
- [ ] Deactivation and reactivation rebuild one or multiple Cash/Bank accounts.
- [ ] Bulk operations deduplicate account IDs.
- [ ] System accounts and cross-organization accounts are rejected.
- [ ] Delete preview correctly separates cascade-safe and blocking references.
- [ ] Confirmed deletion requires a valid non-expired token.
- [ ] Final deletion revalidates references after preview.
- [ ] Soft-deleted records cannot be posted to or fetched operationally.
- [ ] A replacement account can reuse the allowed deleted name/code according
      to the final uniqueness policy.
- [ ] Audit events include complete lifecycle metadata.
- [ ] CSV escapes commas, quotes, Unicode and line breaks.

### 17.2 Balance tests

- [ ] Deactivating a debit Direct Ledger transaction updates current balance.
- [ ] Deactivating a credit Direct Ledger transaction updates current balance.
- [ ] Later transactions receive recalculated `balanceafter` values.
- [ ] Transactions on the same date use deterministic order.
- [ ] Reactivation restores the original mathematical result.
- [ ] Bulk changes rebuild each affected Cash/Bank account once.
- [ ] A forced rebuild error rolls back all lifecycle changes.

### 17.3 Reporting tests

- [ ] COA detail excludes inactive and deleted journal entries from totals.
- [ ] Trial Balance excludes inactive/deleted journal entries.
- [ ] Profit & Loss excludes inactive/deleted journal entries.
- [ ] Balance Sheet excludes inactive/deleted journal entries.
- [ ] Finance dashboard totals reconcile after each lifecycle action.

### 17.4 Frontend tests

- [ ] Active COA filter is selected by default.
- [ ] Inactive and All filters request the correct backend scope.
- [ ] Row selection and current-page select-all behave correctly.
- [ ] Confirmation preview displays impact counts and blockers.
- [ ] CSV downloads only after a successful confirmed delete.
- [ ] Global transaction status combines with Direct Ledger Transaction Type.
- [ ] Account transaction status combines with Manual Source.
- [ ] Inactive rows display a status badge.
- [ ] Deleted rows never appear.
- [ ] Unauthorized users cannot see or invoke restricted actions.

## 18. Manual Acceptance Scenarios

### Scenario A — Deactivate and reactivate one COA

1. Create a COA.
2. Post two Direct Ledger transactions against different Cash/Bank accounts.
3. Record COA and Cash/Bank balances.
4. Deactivate the COA.
5. Confirm it disappears from account selectors.
6. Confirm both transactions appear under `Inactive` filters.
7. Confirm COA and Cash/Bank balances exclude both transactions.
8. Reactivate the COA.
9. Confirm transactions and balances are restored.

### Scenario B — Delete a Direct-Ledger-only COA

1. Create a COA and post Direct Ledger transactions.
2. Start deletion and inspect the preview.
3. Confirm deletion.
4. Verify the CSV contains the account, transaction, journal and balance data.
5. Confirm the COA and deleted transactions do not appear in operational views.
6. Confirm Cash/Bank balances and later running balances are recalculated.
7. Confirm audit records and soft-deleted database rows remain.

### Scenario C — Block unsafe deletion

1. Create a COA referenced by a manual Journal or expense bill.
2. Request deletion.
3. Confirm the preview reports the blocking reference.
4. Confirm no record or balance changes.
5. Confirm deactivation remains available.

### Scenario D — Bulk mixed selection

1. Select active, inactive, deletable and blocked COAs.
2. Verify actions are permission controlled.
3. Preview deletion.
4. Confirm only eligible accounts are included for deletion.
5. Verify the CSV contains results and reasons for every selected account.
6. Verify each affected Cash/Bank account was rebuilt once.

## 19. Rollout and Recovery

### 19.1 Deployment order

1. Back up the finance database according to the normal release process.
2. Deploy and verify the database migration.
3. Deploy lifecycle-aware backend read/calculation changes.
4. Deploy lifecycle write APIs.
5. Deploy frontend controls and filters.
6. Apply role permission changes.
7. Run production read-only reconciliation checks.
8. Enable lifecycle actions for approved users.

### 19.2 Operational monitoring

Monitor:

- Lifecycle endpoint errors and response times.
- Balance rebuild failures.
- Preview-versus-confirmation conflicts.
- Counts of deleted, blocked and skipped records.
- Finance reconciliation differences after lifecycle actions.
- Unauthorized lifecycle requests.

### 19.3 Recovery

Because deletion is soft:

- Data remains available to administrators through controlled database/audit
  procedures.
- No normal UI restore action is included in this scope.
- Any emergency restoration must validate references and rebuild all affected
  Cash/Bank balances before the account is made operational.
- CSV files are user-facing evidence but are not the restoration mechanism.

## 20. Out of Scope

- Cascading deletion of manual Journals.
- Cascading deletion of supplier bills, invoices, GST, TDS or reconciliation
  records.
- User-facing restoration of deleted COAs.
- Editing historical transaction amounts during a lifecycle action.
- Physical database deletion of COAs or finance transactions.
- Automatically merging one COA into another.

## 21. Definition of Done

The feature is complete when:

- Active, Inactive and All COA filters work with Active as the default.
- Individual and bulk activate/deactivate/delete actions are permission-safe.
- Deactivation and activation cascade correctly to eligible Direct Ledger bank
  transactions and journals.
- Soft deletion removes records from every operational reference and selector.
- Non-Direct-Ledger references safely block deletion.
- Cash/Bank current balances and transaction running balances are correct after
  every operation.
- Global and per-account transaction views provide Active/Inactive/All status
  filters that combine with existing Transaction Type and Source filters.
- Confirmed deletion downloads a complete pre-delete CSV.
- Audit records preserve lifecycle history.
- All backend tests, frontend checks and finance reconciliation scenarios pass.
