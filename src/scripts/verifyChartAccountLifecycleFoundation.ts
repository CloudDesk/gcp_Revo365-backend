import pool, { query } from "../database/postgres.js";

const REQUIRED_VERSION = "20261013_chart_account_lifecycle_foundation_v1";

const expectedColumns: Record<string, string[]> = {
  finance_accounts: [
    "isdeleted",
    "deletedby",
    "deleteddate",
    "deletionbatchid",
  ],
  bank_transactions: [
    "isdeleted",
    "deletedby",
    "deleteddate",
    "deletionbatchid",
    "deactivatedbychartaccountid",
    "deactivatedby",
    "deactivateddate",
  ],
  journal_entries: [
    "isdeleted",
    "deletedby",
    "deleteddate",
    "deletionbatchid",
    "deactivatedbychartaccountid",
    "deactivatedby",
    "deactivateddate",
  ],
};

const requiredIndexes = [
  "uq_finance_accounts_code_normalized",
  "uq_finance_chart_accounts_name_normalized",
  "idx_finance_chart_accounts_list",
  "idx_bank_transactions_chart_account_lifecycle",
  "idx_bank_transactions_deactivated_chart_account",
  "idx_journal_entries_deactivated_chart_account",
  "idx_finance_accounts_deletion_batch",
  "idx_bank_transactions_deletion_batch",
  "idx_journal_entries_deletion_batch",
];

const verify = async () => {
  const failures: string[] = [];
  const tableNames = Object.keys(expectedColumns);

  const columnResult = await query(
    `SELECT table_name, column_name, column_default, is_nullable
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    [tableNames]
  );
  const columnsByTable = new Map<string, Map<string, any>>();
  for (const row of columnResult.rows) {
    if (!columnsByTable.has(row.table_name)) {
      columnsByTable.set(row.table_name, new Map());
    }
    columnsByTable.get(row.table_name)!.set(row.column_name, row);
  }
  for (const [tableName, columns] of Object.entries(expectedColumns)) {
    for (const column of columns) {
      if (!columnsByTable.get(tableName)?.has(column)) {
        failures.push(`Missing lifecycle column: ${tableName}.${column}`);
      }
    }
    const deletedColumn = columnsByTable.get(tableName)?.get("isdeleted");
    if (
      deletedColumn &&
      (deletedColumn.is_nullable !== "NO" ||
        !String(deletedColumn.column_default || "").toLowerCase().includes("false"))
    ) {
      failures.push(`${tableName}.isdeleted must be NOT NULL with a FALSE default.`);
    }
  }

  const constraintResult = await query(
    `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
      WHERE (conrelid = 'bank_transactions'::regclass
             AND conname IN (
               'chk_bank_transactions_status',
               'fk_bank_transactions_deactivated_chart_account'
             ))
         OR (conrelid = 'journal_entries'::regclass
             AND conname IN (
               'chk_journal_entries_status',
               'fk_journal_entries_deactivated_chart_account'
             ))`
  );
  const constraints = new Map<string, string>(
    constraintResult.rows.map((row: any) => [
      String(row.conname),
      String(row.definition || "").toLowerCase(),
    ])
  );
  for (const constraintName of [
    "chk_bank_transactions_status",
    "chk_journal_entries_status",
  ]) {
    if (!constraints.get(constraintName)?.includes("inactive")) {
      failures.push(`${constraintName} must allow the inactive lifecycle state.`);
    }
  }
  for (const constraintName of [
    "fk_bank_transactions_deactivated_chart_account",
    "fk_journal_entries_deactivated_chart_account",
  ]) {
    const definition = constraints.get(constraintName) || "";
    if (
      !definition.includes("deactivatedbychartaccountid") ||
      !definition.includes("finance_accounts")
    ) {
      failures.push(`${constraintName} must reference finance_accounts.`);
    }
  }

  const indexResult = await query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = ANY($1::text[])`,
    [requiredIndexes]
  );
  const indexes = new Map<string, string>(
    indexResult.rows.map((row: any) => [
      String(row.indexname),
      String(row.indexdef || "").toLowerCase(),
    ])
  );
  for (const indexName of requiredIndexes) {
    if (!indexes.has(indexName)) {
      failures.push(`Missing lifecycle index: ${indexName}`);
    }
  }
  for (const indexName of [
    "uq_finance_accounts_code_normalized",
    "uq_finance_chart_accounts_name_normalized",
  ]) {
    const definition = indexes.get(indexName) || "";
    if (!definition.includes("unique") || !definition.includes("isdeleted")) {
      failures.push(`${indexName} must be unique only for non-deleted records.`);
    }
  }

  const versionResult = await query(
    `SELECT version
       FROM finance_schema_versions
      WHERE version = $1`,
    [REQUIRED_VERSION]
  );
  if (!versionResult.rows[0]) {
    failures.push(`Missing lifecycle schema version: ${REQUIRED_VERSION}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `[Chart Account Lifecycle Foundation Verification]\n${failures
        .map((failure) => `- ${failure}`)
        .join("\n")}`
    );
  }

  console.log(
    "[Chart Account Lifecycle Foundation Verification] Columns, constraints, indexes and schema version verified successfully."
  );
};

verify()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
