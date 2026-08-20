import pool, { query } from "../database/postgres.js";

const expectedColumns: Record<string, string[]> = {
  journal_entries: [
    "id",
    "organizationid",
    "journalnumber",
    "entrydate",
    "sourcetype",
    "sourceid",
    "status",
    "reference",
    "description",
    "journalpurpose",
    "relatedjournalentryid",
    "reversalofid",
    "version",
  ],
  journal_lines: [
    "id",
    "journalentryid",
    "financeaccountid",
    "debitamount",
    "creditamount",
    "lineorder",
  ],
  on_account_references: [
    "id",
    "organizationid",
    "referencenumber",
    "partytype",
    "partyid",
    "currencycode",
    "sourcetype",
    "sourcebanktransactionid",
    "sourcejournalentryid",
    "originalamount",
    "usedamount",
    "availableamount",
    "status",
    "version",
  ],
  on_account_movements: [
    "id",
    "organizationid",
    "onaccountreferenceid",
    "movementtype",
    "direction",
    "amount",
    "journalentryid",
    "relatedmovementid",
    "idempotencykey",
    "idempotencysequence",
  ],
  on_account_document_allocations: [
    "id",
    "organizationid",
    "onaccountreferenceid",
    "onaccountmovementid",
    "documenttype",
    "documentid",
    "bankportion",
    "tdsamount",
    "totalsettlement",
    "status",
  ],
};

const requiredSchemaVersions = [
  "20260817_journal_module_foundation_v1",
  "20260818_journal_post_reverse_v1",
  "20260818_journal_related_accounting_entry_v1",
  "20260818_on_account_phase1_foundation_v1",
];

const approvedJournalPermissions = [
  "read",
  "create",
  "edit",
  "post",
  "reverse",
  "transfer",
  "replace",
];

const verify = async () => {
  const failures: string[] = [];

  const columnResult = await query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [Object.keys(expectedColumns)]
  );
  const actualColumns = new Map<string, Set<string>>();
  for (const row of columnResult.rows) {
    if (!actualColumns.has(row.table_name)) {
      actualColumns.set(row.table_name, new Set());
    }
    actualColumns.get(row.table_name)!.add(row.column_name);
  }
  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    const tableColumns = actualColumns.get(tableName);
    if (!tableColumns) {
      failures.push(`Missing baseline table: ${tableName}`);
      continue;
    }
    for (const column of columns) {
      if (!tableColumns.has(column)) {
        failures.push(`Missing baseline column: ${tableName}.${column}`);
      }
    }
  }

  const versionResult = await query(
    `SELECT version
     FROM finance_schema_versions
     WHERE version = ANY($1::text[])`,
    [requiredSchemaVersions]
  );
  const appliedVersions = new Set(
    versionResult.rows.map((row: any) => String(row.version))
  );
  for (const version of requiredSchemaVersions) {
    if (!appliedVersions.has(version)) {
      failures.push(`Missing baseline schema version: ${version}`);
    }
  }

  const permissionResult = await query(
    `SELECT LOWER(p.role) AS role, item->'permissions' AS permissions
     FROM permissions p
     CROSS JOIN LATERAL jsonb_array_elements(
       COALESCE(p.permissionset, '[]'::jsonb)
     ) item
     WHERE LOWER(p.role) IN ('admin', 'accountant')
       AND item->>'objectAPI' = 'journal'`
  );
  const permissionByRole = new Map(
    permissionResult.rows.map((row: any) => [row.role, row.permissions || {}])
  );
  for (const role of ["admin", "accountant"]) {
    const permissions: any = permissionByRole.get(role);
    if (!permissions) {
      failures.push(`Missing Journal permission resource for ${role}.`);
      continue;
    }
    for (const permission of approvedJournalPermissions) {
      if (permissions[permission] !== true) {
        failures.push(`Journal ${permission} permission is not enabled for ${role}.`);
      }
    }
    if (permissions.delete !== false) {
      failures.push(`Journal delete permission must remain disabled for ${role}.`);
    }
  }

  const reconciliationResult = await query(
    `SELECT COUNT(*)::integer AS mismatchcount
     FROM on_account_references reference
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(
         CASE movement.direction
           WHEN 'increase' THEN movement.amount
           ELSE -movement.amount
         END
       ), 0)::numeric(18, 2) AS movementbalance
       FROM on_account_movements movement
       WHERE movement.onaccountreferenceid = reference.id
     ) totals ON TRUE
     WHERE reference.originalamount <> reference.usedamount + reference.availableamount
        OR reference.availableamount <> totals.movementbalance`
  );
  if (Number(reconciliationResult.rows[0]?.mismatchcount || 0) > 0) {
    failures.push(
      `${reconciliationResult.rows[0].mismatchcount} On Account references fail the merged baseline reconciliation.`
    );
  }

  const manualBoundaryResult = await query(
    `SELECT COUNT(*)::integer AS invalidlinecount
     FROM journal_entries entry
     JOIN journal_lines line ON line.journalentryid = entry.id
     JOIN finance_accounts account ON account.id = line.financeaccountid
     WHERE entry.sourcetype = 'manual_journal'
       AND (
         account.organizationid <> entry.organizationid
         OR account.isusercreatedchartaccount IS DISTINCT FROM TRUE
         OR account.issystem IS DISTINCT FROM FALSE
         OR account.accountsubtype IN (
           'bank', 'cash', 'credit_card', 'payment_clearing',
           'customer_advance', 'supplier_advance'
         )
       )`
  );
  if (Number(manualBoundaryResult.rows[0]?.invalidlinecount || 0) > 0) {
    failures.push(
      `${manualBoundaryResult.rows[0].invalidlinecount} ordinary manual Journal lines bypass the approved account boundary.`
    );
  }

  const prematureIntegrationResult = await query(
    `SELECT
       (SELECT COUNT(*) FROM journal_entries
        WHERE sourcetype IN ('on_account_transfer', 'on_account_transfer_reversal'))::integer
         AS transferjournals,
       (SELECT COUNT(*) FROM on_account_movements
        WHERE movementtype IN ('journal_transfer_in', 'journal_transfer_out'))::integer
         AS transfermovements`
  );
  const premature = prematureIntegrationResult.rows[0] || {};
  if (
    Number(premature.transferjournals || 0) > 0 ||
    Number(premature.transfermovements || 0) > 0
  ) {
    failures.push(
      "Journal/On Account transfer records exist before the Phase 2 contract and Phase 3 posting orchestration are approved."
    );
  }

  if (failures.length > 0) {
    console.error("[Journal + On Account Phase 1] Baseline verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    "[Journal + On Account Phase 1] Merged schema, permissions, balances, manual-Journal boundary, and integration gate verified successfully."
  );
};

verify()
  .catch((error) => {
    console.error(
      "[Journal + On Account Phase 1] Baseline verification failed.",
      error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
