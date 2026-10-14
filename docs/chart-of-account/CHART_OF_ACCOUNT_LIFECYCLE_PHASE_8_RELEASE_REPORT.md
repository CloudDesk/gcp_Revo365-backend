# Chart of Account Lifecycle — Phase 8 Release Report

**Prepared:** 14 October 2026  
**Scope:** Permissions, regression verification, rollout readiness and monitoring  
**Current status:** Code, automated verification, manual acceptance and the
post-acceptance dev-database audit are complete. Application deployment and the
previously identified AR/AP reconciliation baseline remain release activities.

## 1. Implemented in Phase 8

- Added a deterministic concurrency contract test proving Direct Ledger posting
  and COA lifecycle changes both lock the Chart Account before the Cash/Bank
  account.
- Made the main backend test command terminate reliably after the complete
  Node test run.
- Removed an unused COA-list SQL bind parameter that shifted the status and
  period parameter positions.
- Added `monitor:chart-account-lifecycle`, a read-only audit-event monitor for
  activate, deactivate, delete, cascade and balance-rebuild events.
- Improved the finance report verifier so it closes its database pool, exits
  reliably, and prints the exact AR/AP reconciliation values on failure.
- Cleared the frontend hook-rule violations found by the full lint gate while
  preserving the existing purchase-order and invoice calculations.

No permission-set SQL was added or executed. Lifecycle visibility continues to
use the existing `chart_of_accounts.permissions.edit` and
`chart_of_accounts.permissions.delete` values, which the administrator will
maintain through the permission-set record.

## 2. Automated Verification Results

| Check | Result | Evidence |
| --- | --- | --- |
| Backend TypeScript build | PASS | `npm run build` |
| Complete backend test suite | PASS | 253 tests passed, 0 failed |
| Lifecycle-focused suite | PASS | Includes status, delete, CSV, balance rebuild and lock-order coverage |
| Frontend ESLint | PASS | `npm run lint`, zero warnings/errors |
| Frontend production build | PASS | TypeScript and Vite production build completed |
| Lifecycle schema verification | PASS | Columns, constraints, indexes and schema version verified on the configured dev DB |
| Trial Balance audit | PASS | Read-only audit for 1 Apr–13 Oct 2026, organization 1 |
| Profit & Loss audit | PASS | Same read-only audit window |
| Balance Sheet audit | PASS | Same read-only audit window |
| Dashboard equations/ageing | PARTIAL | Operational totals pass; AR/AP control-ledger reconciliation differs |
| Lifecycle audit monitor | PASS | Expected manual-test activate, deactivate, delete, cascade and balance-rebuild events are present |
| Manual COA lifecycle acceptance | PASS | Activate, deactivate, delete, filters, CSV workflow, permissions and blocked-reference behavior tested on 14 October 2026 |
| Post-acceptance database integrity audit | PASS | Inactive/deleted relationships, deletion batches and all Cash/Bank balances reconciled |

### 2.1 Post-acceptance dev-database evidence

Read-only queries were run against the configured dev database after manual
testing. Organization 1 contained one inactive non-deleted COA and two
soft-deleted COAs:

| COA | State | Related transaction/journal result |
| --- | --- | --- |
| `521 / QUEEN_LAND / Queensland` | Inactive, not deleted | No related transaction or journal rows |
| `472 / LAND / LAND` | Inactive and soft-deleted | One transaction and its journal are soft-deleted under the same deletion batch; affected Cash/Bank account `15` |
| `503 / QUEEN-LAND / queenland` | Inactive and soft-deleted | No related transaction or journal rows |

Integrity query results:

- Active Direct Ledger transactions remaining under inactive COAs: `0`.
- Live transactions remaining under deleted COAs: `0`.
- Live journals remaining under deleted COAs: `0`.
- Transaction or journal deletion-batch mismatches: `0`.
- Inactive Direct Ledger relationship/status/ownership mismatches: `0`.
- Active COAs retaining stale lifecycle-deactivation ownership: `0`.
- Cash/Bank current-balance mismatches against opening balance plus all active,
  posted, non-deleted transactions: `0`.

The audit log also contained the expected lifecycle evidence: one COA
activation, three COA deactivations, two COA deletions, two Direct Ledger
activations, four Direct Ledger deactivations, two Direct Ledger deletions and
four Cash/Bank balance rebuilds.

## 3. Open Release Gates

### 3.1 Permission records

Before enabling the UI, confirm the intended roles have:

- `chart_of_accounts.permissions.edit = true` for activate/deactivate access.
- `chart_of_accounts.permissions.delete = true` for preview/confirmed delete.

This is an administrative record update, not a database migration script.

### 3.2 Manual end-to-end acceptance — completed

Manual browser acceptance was completed on 14 October 2026. The activate,
deactivate and delete flows, downloaded CSVs, lifecycle filters, permission
controls, balance results, blocking references and mixed eligible/blocked
behavior were reported as passing. The read-only database evidence in section
2.1 confirms the resulting stored lifecycle state and balance invariants.

### 3.3 Existing dashboard reconciliation baseline

The following differences were recorded as the pre-lifecycle baseline before
manual lifecycle operations were exercised:

| Metric | Operational total | Ledger total | Variance |
| --- | ---: | ---: | ---: |
| Receivables | 6,524,764.06 | -1,315,722.19 | -7,840,486.25 |
| Payables | 4,161,586.00 | -3,079,133.00 | -7,240,719.00 |

Trial Balance, P&L, Balance Sheet and all document report audits passed. The
AR/AP control-account variances should be reconciled or explicitly accepted as
the pre-release baseline before production enablement; they must not be
attributed to the COA lifecycle feature without new evidence.

### 3.4 Deployment

No application deployment was performed in this implementation turn. The
configured dev database already contains and passes verification for
`20261013_chart_account_lifecycle_foundation_v1`.

## 4. Release Commands

Run from the backend repository:

```bash
npm run build
npm test
npm run verify:chart-account-lifecycle
npm run verify:finance-dashboard-reports -- 2026-04-01 2026-10-13 1
npm run monitor:chart-account-lifecycle -- 1 24
```

Run from the frontend repository:

```bash
npm run lint
npm run build
```

The finance dashboard/report command must return zero issues for the target
production organization or the approved baseline exception must be recorded.

## 5. Deployment Order

1. Take the normal finance database backup.
2. Verify the lifecycle migration on the target database.
3. Confirm role permission records.
4. Run backend tests and both frontend gates for the exact release commit.
5. Complete manual Scenarios A–D in dev/UAT.
6. Resolve or approve the AR/AP baseline variances.
7. Deploy backend before exposing the frontend lifecycle controls.
8. Deploy frontend.
9. Run read-only schema and finance reconciliation checks again.
10. Monitor lifecycle audit events and application errors during the release
    observation window.

## 6. Rollback Decision

Stop or roll back application enablement if any lifecycle action:

- changes a non-Direct-Ledger reference;
- restores a reversed or independently inactive entry;
- leaves Cash/Bank current balance or later running balances inconsistent;
- exposes a soft-deleted COA or transaction operationally;
- returns a CSV that does not represent the pre-delete state; or
- produces an unapproved new Trial Balance, P&L, Balance Sheet or dashboard
  reconciliation difference.

