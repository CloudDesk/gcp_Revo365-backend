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
    "requestidempotencykey",
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
  "20260825_journal_on_account_transfer_contract_v1",
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

  const transferIntegrityResult = await query(
    `SELECT COUNT(*)::integer AS mismatchcount
       FROM journal_entries journal
       LEFT JOIN on_account_references destination
         ON destination.organizationid = journal.organizationid
        AND destination.sourcejournalentryid = journal.id
        AND destination.sourcetype = 'on_account_transfer'
       LEFT JOIN on_account_movements outbound
         ON outbound.organizationid = journal.organizationid
        AND outbound.journalentryid = journal.id
        AND outbound.movementtype = 'journal_transfer_out'
       LEFT JOIN on_account_movements inbound
         ON inbound.organizationid = journal.organizationid
        AND inbound.journalentryid = journal.id
        AND inbound.movementtype = 'journal_transfer_in'
       WHERE journal.sourcetype = 'on_account_transfer'
         AND (destination.id IS NULL OR outbound.id IS NULL OR inbound.id IS NULL
              OR outbound.amount <> inbound.amount
              OR inbound.relatedmovementid <> outbound.id)`
  );
  if (Number(transferIntegrityResult.rows[0]?.mismatchcount || 0) > 0) {
    failures.push(`${transferIntegrityResult.rows[0].mismatchcount} transfer Journals have missing or mismatched reference/movement links.`);
  }

  const balanceResult = await query(
    `SELECT COUNT(*)::integer AS mismatchcount
       FROM journal_entries journal
       JOIN LATERAL (
         SELECT COALESCE(SUM(line.debitamount), 0) AS debit,
                COALESCE(SUM(line.creditamount), 0) AS credit
           FROM journal_lines line WHERE line.journalentryid = journal.id
       ) totals ON TRUE
       WHERE journal.sourcetype IN ('on_account_transfer', 'on_account_transfer_reversal')
         AND totals.debit <> totals.credit`
  );
  if (Number(balanceResult.rows[0]?.mismatchcount || 0) > 0) {
    failures.push(`${balanceResult.rows[0].mismatchcount} transfer or replacement Journals are unbalanced.`);
  }

  const reversalIntegrityResult = await query(
    `SELECT COUNT(*)::integer AS mismatchcount
       FROM journal_entries reversal
       LEFT JOIN journal_entries original
         ON original.id = reversal.reversalofid
        AND original.organizationid = reversal.organizationid
       LEFT JOIN on_account_references destination
         ON destination.reversaljournalentryid = reversal.id
        AND destination.organizationid = reversal.organizationid
       WHERE reversal.sourcetype = 'on_account_transfer_reversal'
         AND (original.sourcetype <> 'on_account_transfer'
              OR destination.status <> 'reversed'
              OR destination.replacementreferenceid IS NULL)`
  );
  if (Number(reversalIntegrityResult.rows[0]?.mismatchcount || 0) > 0) {
    failures.push(`${reversalIntegrityResult.rows[0].mismatchcount} transfer replacements have incomplete linkage.`);
  }

  if (failures.length > 0) {
    console.error("[Journal + On Account Phase 1] Baseline verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    "[Journal + On Account] Schema, permissions, balances, transfer pairs, replacements, and manual-Journal boundary verified successfully."
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
