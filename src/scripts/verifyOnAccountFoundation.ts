import pool, { query } from "../database/postgres.js";

const expectedColumns: Record<string, string[]> = {
  on_account_reference_counters: [
    "organizationid",
    "partytype",
    "lastnumber",
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
    "legacyunappliedamountid",
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

const verify = async () => {
  const failures: string[] = [];
  const columnResult = await query(
    `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
    `,
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
      failures.push(`Missing table: ${tableName}`);
      continue;
    }
    for (const column of columns) {
      if (!tableColumns.has(column)) {
        failures.push(`Missing column: ${tableName}.${column}`);
      }
    }
  }

  const versionResult = await query(
    `
    SELECT 1
    FROM finance_schema_versions
    WHERE version = '20260818_on_account_phase1_foundation_v1'
    `
  );
  if (versionResult.rows.length !== 1) {
    failures.push("Missing On Account Phase 1 schema version.");
  }

  const triggerResult = await query(
    `
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_schema = current_schema()
      AND trigger_name IN (
        'trg_prevent_on_account_movement_mutation',
        'trg_protect_on_account_reference_identity'
      )
    GROUP BY trigger_name
    `
  );
  if (triggerResult.rows.length !== 2) {
    failures.push("Missing one or more On Account immutability triggers.");
  }

  const legacyResult = await query(
    `
    SELECT
      COUNT(*) FILTER (WHERE r.id IS NULL)::integer AS missingreferences,
      COUNT(*) FILTER (
        WHERE r.id IS NOT NULL
          AND (
            r.originalamount <> u.originalamount
            OR r.usedamount <> u.appliedamount
            OR r.availableamount <> u.remainingamount
            OR r.partytype <> u.partytype
            OR r.partyid <> u.partyid
          )
      )::integer AS mismatchedreferences
    FROM party_unapplied_amounts u
    LEFT JOIN on_account_references r
      ON r.legacyunappliedamountid = u.id
    `
  );
  const legacySummary = legacyResult.rows[0];
  if (Number(legacySummary?.missingreferences) > 0) {
    failures.push(
      `${legacySummary.missingreferences} legacy unapplied rows have no On Account reference.`
    );
  }
  if (Number(legacySummary?.mismatchedreferences) > 0) {
    failures.push(
      `${legacySummary.mismatchedreferences} migrated references do not match legacy balances.`
    );
  }

  const reconciliationResult = await query(
    `
    SELECT COUNT(*)::integer AS mismatchcount
    FROM (
      SELECT
        r.id,
        r.availableamount,
        COALESCE(
          SUM(
            CASE m.direction
              WHEN 'increase' THEN m.amount
              ELSE -m.amount
            END
          ),
          0
        ) AS movementbalance
      FROM on_account_references r
      LEFT JOIN on_account_movements m
        ON m.onaccountreferenceid = r.id
       AND m.organizationid = r.organizationid
      GROUP BY r.id, r.availableamount
    ) balances
    WHERE availableamount <> movementbalance
    `
  );
  if (Number(reconciliationResult.rows[0]?.mismatchcount) > 0) {
    failures.push(
      `${reconciliationResult.rows[0].mismatchcount} On Account references fail movement reconciliation.`
    );
  }

  const duplicateResult = await query(
    `
    SELECT COUNT(*)::integer AS duplicatecount
    FROM (
      SELECT organizationid, referencenumber
      FROM on_account_references
      GROUP BY organizationid, referencenumber
      HAVING COUNT(*) > 1
    ) duplicates
    `
  );
  if (Number(duplicateResult.rows[0]?.duplicatecount) > 0) {
    failures.push("Duplicate organization-scoped On Account references found.");
  }

  const snapshotResult = await query(
    `
    SELECT COUNT(*)::integer AS mismatchcount
    FROM on_account_references
    WHERE originalamount <> usedamount + availableamount
       OR originalamount <= 0
       OR usedamount < 0
       OR availableamount < 0
    `
  );
  if (Number(snapshotResult.rows[0]?.mismatchcount) > 0) {
    failures.push(
      `${snapshotResult.rows[0].mismatchcount} On Account references fail snapshot reconciliation.`
    );
  }

  const allocationResult = await query(
    `
    SELECT COUNT(*)::integer AS mismatchcount
    FROM (
      SELECT
        r.id,
        COALESCE(SUM(a.bankportion) FILTER (WHERE a.status = 'applied'), 0) AS allocated,
        COALESCE(SUM(m.amount) FILTER (
          WHERE m.movementtype = 'document_allocation'
            AND m.direction = 'decrease'
        ), 0) AS movementdecreases
      FROM on_account_references r
      LEFT JOIN on_account_movements m
        ON m.onaccountreferenceid = r.id
       AND m.organizationid = r.organizationid
      LEFT JOIN on_account_document_allocations a
        ON a.onaccountmovementid = m.id
       AND a.organizationid = r.organizationid
      GROUP BY r.id
    ) totals
    WHERE allocated <> movementdecreases
    `
  );
  if (Number(allocationResult.rows[0]?.mismatchcount) > 0) {
    failures.push(
      `${allocationResult.rows[0].mismatchcount} On Account references fail allocation-bridge reconciliation.`
    );
  }

  const partyAggregateResult = await query(
    `
    SELECT COUNT(*)::integer AS mismatchcount
    FROM (
      SELECT
        r.organizationid,
        r.partytype,
        r.partyid,
        SUM(r.availableamount) AS referenceavailable,
        COALESCE(SUM(movement.available), 0) AS movementavailable
      FROM on_account_references r
      LEFT JOIN LATERAL (
        SELECT SUM(CASE m.direction WHEN 'increase' THEN m.amount ELSE -m.amount END) AS available
        FROM on_account_movements m
        WHERE m.organizationid = r.organizationid
          AND m.onaccountreferenceid = r.id
      ) movement ON TRUE
      GROUP BY r.organizationid, r.partytype, r.partyid
    ) totals
    WHERE referenceavailable <> movementavailable
    `
  );
  if (Number(partyAggregateResult.rows[0]?.mismatchcount) > 0) {
    failures.push(
      `${partyAggregateResult.rows[0].mismatchcount} party aggregates fail reference-to-movement reconciliation.`
    );
  }

  const auditResult = await query(
    `
    SELECT
      (SELECT COUNT(*) FROM on_account_references
       WHERE createdby IS NULL OR TRIM(createdby) = '' OR createddate <= 0)::integer
        AS referenceissues,
      (SELECT COUNT(*) FROM on_account_movements
       WHERE createdby IS NULL OR TRIM(createdby) = '' OR createddate <= 0)::integer
        AS movementissues,
      (SELECT COUNT(*) FROM on_account_document_allocations
       WHERE createdby IS NULL OR TRIM(createdby) = '' OR createddate <= 0)::integer
        AS allocationissues
    `
  );
  const audit = auditResult.rows[0] || {};
  if (Number(audit.referenceissues) + Number(audit.movementissues) + Number(audit.allocationissues) > 0) {
    failures.push(
      `On Account audit metadata is incomplete: ${audit.referenceissues || 0} references, ${audit.movementissues || 0} movements, ${audit.allocationissues || 0} allocations.`
    );
  }

  if (failures.length > 0) {
    console.error("[On Account Release] Verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    "[On Account Release] Schema, migration, immutability, audit, reference, movement, allocation, and party balances verified successfully."
  );
};

verify()
  .catch((error) => {
    console.error("[On Account Release] Verification failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
