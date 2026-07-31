import { query } from "../database/postgres.js";

const expectedColumns: Record<string, string[]> = {
  finance_schema_versions: ["version", "description", "applieddate"],
  finance_accounts: [
    "id",
    "organizationid",
    "accountcode",
    "accountname",
    "accounttype",
    "accountsubtype",
    "currencycode",
    "status",
  ],
  bank_cash_accounts: [
    "id",
    "financeaccountid",
    "accounttype",
    "accountname",
    "openingbalance",
    "openingbalancedate",
    "currentbalance",
    "status",
    "isecommercedefault",
    "version",
  ],
  bank_transactions: [
    "id",
    "bankcashaccountid",
    "transactiondate",
    "entryside",
    "amount",
    "debitamount",
    "creditamount",
    "balanceafter",
    "postingstatus",
  ],
  bank_transaction_allocations: [
    "id",
    "banktransactionid",
    "documenttype",
    "documentid",
    "allocationamount",
    "tdssectionid",
    "tdsamount",
    "totalsettledamount",
  ],
  party_unapplied_amounts: [
    "id",
    "banktransactionid",
    "partytype",
    "partyid",
    "originalamount",
    "remainingamount",
  ],
  journal_entries: [
    "id",
    "journalnumber",
    "entrydate",
    "sourcetype",
    "sourceid",
    "status",
  ],
  journal_lines: [
    "id",
    "journalentryid",
    "financeaccountid",
    "debitamount",
    "creditamount",
  ],
  payment_account_mappings: [
    "id",
    "provider",
    "paymentmethod",
    "bankcashaccountid",
    "effectivefrom",
    "status",
  ],
  ecommerce_payment_finance_events: [
    "id",
    "provider",
    "paymentmethod",
    "sourcepaymentid",
    "merchanttransactionid",
    "primaryorderid",
    "customerid",
    "amount",
    "paymentdate",
    "status",
    "banktransactionid",
  ],
  tds_sections: [
    "id",
    "newcode",
    "natureofpayment",
    "rate",
  ],
  finance_audit_events: [
    "id",
    "entitytype",
    "entityid",
    "action",
    "eventdata",
    "createddate",
  ],
};

const verify = async () => {
  const result = await query(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
    `,
    [Object.keys(expectedColumns)]
  );

  const actual = new Map<string, Set<string>>();
  for (const row of result.rows) {
    if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
    actual.get(row.table_name)!.add(row.column_name);
  }

  const failures: string[] = [];
  for (const [table, columns] of Object.entries(expectedColumns)) {
    const actualColumns = actual.get(table);
    if (!actualColumns) {
      failures.push(`Missing table: ${table}`);
      continue;
    }
    for (const column of columns) {
      if (!actualColumns.has(column)) {
        failures.push(`Missing column: ${table}.${column}`);
      }
    }
  }

  const versionResult = await query(
    `
    SELECT version
    FROM finance_schema_versions
    WHERE version = ANY($1::text[])
    `,
    [
      [
        "20260730_cash_bank_account_foundation_v1",
        "20260730_cash_bank_duplicate_account_names_v1",
        "20260730_cash_bank_ecommerce_payments_v1",
        "20260730_cash_bank_standard_permissions_v1",
        "20260730_cash_bank_ecommerce_default_account_v1",
        "20260730_cash_bank_phase1_release_v1",
        "20260731_cash_bank_retail_receipts_v1",
      ],
    ]
  );
  if (versionResult.rows.length !== 7) {
    failures.push(
      "Missing the frozen Cash and Bank Phase 1 release, Retail Receipt migration, or one of their schema versions."
    );
  }

  const systemAccountResult = await query(
    `
    SELECT accountcode
    FROM finance_accounts
    WHERE organizationid = 1
      AND accountcode = ANY($1::text[])
      AND status = 'active'
    `,
    [
      [
        "SYS-OPENING-BALANCE",
        "SYS-AR",
        "SYS-AP",
        "SYS-CUSTOMER-ADVANCE",
        "SYS-SUPPLIER-ADVANCE",
        "SYS-TDS-RECEIVABLE",
        "SYS-TDS-PAYABLE",
      ],
    ]
  );
  if (systemAccountResult.rows.length !== 7) {
    failures.push(
      `Expected 7 active system accounts, found ${systemAccountResult.rows.length}.`
    );
  }

  const tdsSectionResult = await query(
    `
    SELECT newcode, natureofpayment, rate
    FROM tds_sections
    WHERE organizationid = 1
    ORDER BY newcode
    `
  );
  if (tdsSectionResult.rows.length !== 12) {
    failures.push(
      `Expected 12 seeded TDS sections, found ${tdsSectionResult.rows.length}.`
    );
  }

  const financePermissionResult = await query(
    `
    SELECT
      LOWER(p.role) AS role,
      permission_item->'permissions' AS permissions
    FROM permissions p
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(p.permissionset, '[]'::jsonb)
    ) permission_item
    WHERE LOWER(p.role) IN ('accountant', 'admin')
      AND permission_item->>'objectAPI' = 'cash_bank_account'
    ORDER BY LOWER(p.role)
    `
  );
  const financePermissionsAreValid =
    financePermissionResult.rows.length === 2 &&
    financePermissionResult.rows.every(
      (row) =>
        row.permissions?.read === true &&
        row.permissions?.create === true &&
        row.permissions?.edit === true &&
        row.permissions?.delete === false
    );
  if (!financePermissionsAreValid) {
    failures.push(
      "Admin and Accountant must have standard read/create/edit Cash and Bank permissions."
    );
  }

  const accountNameIndexResult = await query(
    `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname IN (
        'uq_bank_cash_accounts_name',
        'uq_finance_accounts_name',
        'idx_bank_cash_accounts_name',
        'idx_finance_accounts_name'
      )
    `
  );
  const accountNameIndexes = new Map(
    accountNameIndexResult.rows.map((row) => [row.indexname, row.indexdef])
  );
  const duplicateNamesAreAllowed =
    !accountNameIndexes.has("uq_bank_cash_accounts_name") &&
    !accountNameIndexes.has("uq_finance_accounts_name") &&
    accountNameIndexes.has("idx_bank_cash_accounts_name") &&
    accountNameIndexes.has("idx_finance_accounts_name");
  if (!duplicateNamesAreAllowed) {
    failures.push(
      "Cash/Bank and finance account names must use non-unique search indexes."
    );
  }

  const ecommerceDefaultIndexResult = await query(
    `
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'uq_bank_cash_accounts_ecommerce_default'
    LIMIT 1
    `
  );
  if (!ecommerceDefaultIndexResult.rows[0]) {
    failures.push(
      "Cash/Bank accounts must enforce one e-commerce default per organization."
    );
  }

  const ecommerceDefaultConstraintResult = await query(
    `
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'bank_cash_accounts'::regclass
      AND conname = 'chk_bank_cash_accounts_ecommerce_default_active'
    LIMIT 1
    `
  );
  const ecommerceDefaultConstraint = String(
    ecommerceDefaultConstraintResult.rows[0]?.definition || ""
  ).toLowerCase();
  if (
    !ecommerceDefaultConstraint.includes("accounttype") ||
    !ecommerceDefaultConstraint.includes("'bank'")
  ) {
    failures.push(
      "The e-commerce default must be restricted to an active Bank account."
    );
  }

  const retailAllocationIndexResult = await query(
    `
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'uq_bank_allocations_transaction_document'
    LIMIT 1
    `
  );
  if (!retailAllocationIndexResult.rows[0]) {
    failures.push(
      "Retail invoice allocations must enforce one active allocation per transaction and invoice."
    );
  }

  const ecommerceIdempotencyResult = await query(
    `
    SELECT
      EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'ecommerce_payment_finance_events'::regclass
          AND conname = 'uq_ecommerce_payment_finance_event'
      ) AS eventunique,
      EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'uq_bank_transactions_source_payment'
      ) AS transactionunique
    `
  );
  if (
    ecommerceIdempotencyResult.rows[0]?.eventunique !== true ||
    ecommerceIdempotencyResult.rows[0]?.transactionunique !== true
  ) {
    failures.push(
      "E-commerce payments must have event and Bank transaction idempotency controls."
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `[Finance Foundation Verification]\n${failures
        .map((failure) => `- ${failure}`)
        .join("\n")}`
    );
  }

  console.log(
    `[Finance Foundation Verification] Passed: frozen Phase 1 release, Retail Receipt controls, ${Object.keys(expectedColumns).length} tables, 7 system accounts, 12 TDS sections, and Admin/Accountant permissions.`
  );
};

verify().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
