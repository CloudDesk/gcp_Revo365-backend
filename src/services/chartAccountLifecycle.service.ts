import {
  FinanceValidationError,
  nowEpoch,
  resolveFinanceContext,
  toMoney,
} from "../utils/finance/finance.utils.js";
import { rebuildBankCashAccountBalances } from "../utils/finance/bankTransactionBalance.utils.js";
import pool from "../database/postgres.js";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  FINANCE_ENCRYPTION_KEY,
  FINANCE_LIFECYCLE_TOKEN_SECRET,
} from "../config/config.js";

export type LifecycleDbClient = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export type LifecycleBlockingReference = {
  type: string;
  count: number;
  ids?: number[];
  detail?: string;
};

export type ChartAccountLifecycleImpact = {
  accountid: number;
  accountcode: string | null;
  accountname: string;
  status: string;
  deletable: boolean;
  cascadeSafe: {
    bankTransactionIds: number[];
    journalEntryIds: number[];
    journalLineIds: number[];
    bankCashAccountIds: number[];
  };
  blockingReferences: LifecycleBlockingReference[];
};

type LifecycleAccount = {
  id: number;
  organizationid: number;
  accountcode: string | null;
  accountname: string;
  accounttype: string;
  accountsubtype: string;
  status: string;
  issystem: boolean;
  isusercreatedchartaccount: boolean;
  isdeleted: boolean;
};

const handledFinanceAccountReferences = new Set([
  "public.bank_cash_accounts.financeaccountid",
  "public.journal_lines.financeaccountid",
  "public.bank_transactions.counterpartyaccountid",
  "public.bank_transactions.deactivatedbychartaccountid",
  "public.bank_transaction_allocations.tdsaccountid",
  "public.poinvoice.expenseaccountid",
  "public.finance_m4_reconciliation_runs.arcounterpartaccountid",
  "public.finance_m4_reconciliation_runs.apcounterpartaccountid",
  "public.journal_entries.deactivatedbychartaccountid",
]);

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

export const normalizeChartAccountLifecycleIds = (values: unknown): number[] => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new FinanceValidationError(
      "Select at least one Chart of Accounts record.",
      400,
      "CHART_ACCOUNT_SELECTION_REQUIRED"
    );
  }
  const normalized = values.map(Number);
  if (normalized.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new FinanceValidationError(
      "Every Chart of Accounts id must be a positive integer.",
      400,
      "CHART_ACCOUNT_ID_INVALID"
    );
  }
  return [...new Set(normalized)].sort((left, right) => left - right);
};

export const lockEligibleChartAccounts = async (
  client: LifecycleDbClient,
  organizationId: number,
  values: unknown,
  allowedStatuses: string[] = ["active", "inactive"]
): Promise<LifecycleAccount[]> => {
  const accountIds = normalizeChartAccountLifecycleIds(values);
  const result = await client.query(
    `SELECT id, organizationid, accountcode, accountname, accounttype,
            accountsubtype, status, issystem, isusercreatedchartaccount, isdeleted
       FROM finance_accounts
      WHERE organizationid = $1
        AND id = ANY($2::bigint[])
      ORDER BY id ASC
      FOR UPDATE`,
    [organizationId, accountIds]
  );
  const accounts = result.rows.map((row) => ({ ...row, id: Number(row.id) }));
  if (accounts.length !== accountIds.length) {
    throw new FinanceValidationError(
      "One or more Chart of Accounts records were not found in this organization.",
      404,
      "CHART_ACCOUNT_NOT_FOUND"
    );
  }
  const invalid = accounts.find(
    (account) =>
      account.isdeleted === true ||
      account.issystem === true ||
      account.isusercreatedchartaccount !== true ||
      !allowedStatuses.includes(String(account.status))
  );
  if (invalid) {
    throw new FinanceValidationError(
      `Chart account ${invalid.id} is protected, deleted, or ineligible for this lifecycle operation.`,
      409,
      "CHART_ACCOUNT_LIFECYCLE_INELIGIBLE"
    );
  }
  return accounts;
};

const addBlockingReference = (
  impact: ChartAccountLifecycleImpact,
  type: string,
  ids: number[] = [],
  count = ids.length,
  detail?: string
) => {
  if (count <= 0) return;
  const existing = impact.blockingReferences.find(
    (reference) => reference.type === type && reference.detail === detail
  );
  if (existing) {
    existing.count += count;
    existing.ids = [...new Set([...(existing.ids || []), ...ids])].sort((a, b) => a - b);
  } else {
    impact.blockingReferences.push({
      type,
      count,
      ...(ids.length ? { ids: [...new Set(ids)].sort((a, b) => a - b) } : {}),
      ...(detail ? { detail } : {}),
    });
  }
};

const referenceTypeForJournal = (sourceType: unknown) => {
  const normalized = String(sourceType || "unknown").trim().toLowerCase();
  return normalized === "manual_journal" || normalized === "manual_journal_reversal"
    ? "manual_journal"
    : "journal_reference";
};

export const inspectChartAccountReferences = async (
  client: LifecycleDbClient,
  organizationId: number,
  accounts: LifecycleAccount[]
): Promise<ChartAccountLifecycleImpact[]> => {
  const accountIds = accounts.map((account) => account.id).sort((a, b) => a - b);
  const impacts = new Map<number, ChartAccountLifecycleImpact>(
    accounts.map((account) => [
      account.id,
      {
        accountid: account.id,
        accountcode: account.accountcode,
        accountname: account.accountname,
        status: account.status,
        deletable: false,
        cascadeSafe: {
          bankTransactionIds: [],
          journalEntryIds: [],
          journalLineIds: [],
          bankCashAccountIds: [],
        },
        blockingReferences: [],
      },
    ])
  );

  const transactionResult = await client.query(
    `SELECT bt.id, bt.counterpartyaccountid AS accountid, bt.bankcashaccountid,
            bt.journalentryid, bt.partytype, bt.allocationmethod, bt.postingstatus,
            je.id AS resolvedjournalid, je.organizationid AS journalorganizationid,
            je.sourcetype AS journalsourcetype, je.sourceid AS journalsourceid,
            je.status AS journalstatus, je.isdeleted AS journalisdeleted,
            COALESCE(lines.targetlinecount, 0)::integer AS targetlinecount,
            COALESCE(lines.banklinecount, 0)::integer AS banklinecount,
            COALESCE(allocations.allocationcount, 0)::integer AS allocationcount
       FROM bank_transactions bt
       LEFT JOIN journal_entries je ON je.id = bt.journalentryid
       LEFT JOIN bank_cash_accounts bca
         ON bca.id = bt.bankcashaccountid
        AND bca.organizationid = bt.organizationid
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE jl.financeaccountid = bt.counterpartyaccountid) AS targetlinecount,
                COUNT(*) FILTER (WHERE jl.financeaccountid = bca.financeaccountid) AS banklinecount
           FROM journal_lines jl
          WHERE jl.journalentryid = je.id
       ) lines ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::integer AS allocationcount
           FROM bank_transaction_allocations allocation
          WHERE allocation.banktransactionid = bt.id
            AND allocation.status = 'applied'
       ) allocations ON TRUE
      WHERE bt.organizationid = $1
        AND bt.counterpartyaccountid = ANY($2::bigint[])
        AND bt.isdeleted = FALSE
      ORDER BY bt.counterpartyaccountid ASC, bt.id ASC`,
    [organizationId, accountIds]
  );

  const safeJournalIdsByAccount = new Map<number, Set<number>>();
  for (const row of transactionResult.rows) {
    const accountId = Number(row.accountid);
    const impact = impacts.get(accountId);
    if (!impact) continue;
    const transactionId = Number(row.id);
    const journalId = Number(row.resolvedjournalid);
    const isDirectLedger =
      row.partytype === "ledger" && row.allocationmethod === "direct_ledger";
    const relationshipIsValid =
      isDirectLedger &&
      Number.isSafeInteger(journalId) &&
      Number(row.journalentryid) === journalId &&
      Number(row.journalorganizationid) === organizationId &&
      row.journalsourcetype === "bank_transaction" &&
      Number(row.journalsourceid) === transactionId &&
      row.journalstatus === row.postingstatus &&
      row.journalisdeleted !== true &&
      Number(row.targetlinecount) > 0 &&
      Number(row.banklinecount) > 0 &&
      ["posted", "inactive"].includes(String(row.postingstatus)) &&
      Number(row.allocationcount || 0) === 0;
    if (!isDirectLedger) {
      addBlockingReference(impact, "non_direct_ledger_transaction", [transactionId]);
    } else if (!relationshipIsValid) {
      addBlockingReference(impact, "invalid_direct_ledger_relationship", [transactionId]);
    } else {
      impact.cascadeSafe.bankTransactionIds.push(transactionId);
      impact.cascadeSafe.journalEntryIds.push(journalId);
      impact.cascadeSafe.bankCashAccountIds.push(Number(row.bankcashaccountid));
      const accountJournals = safeJournalIdsByAccount.get(accountId) || new Set<number>();
      accountJournals.add(journalId);
      safeJournalIdsByAccount.set(accountId, accountJournals);
    }
  }

  const allSafeJournalIds = [
    ...new Set([...safeJournalIdsByAccount.values()].flatMap((ids) => [...ids])),
  ].sort((left, right) => left - right);
  if (allSafeJournalIds.length > 0) {
    const safeLineResult = await client.query(
      `SELECT id AS lineid, journalentryid
         FROM journal_lines
        WHERE journalentryid = ANY($1::bigint[])
        ORDER BY journalentryid ASC, id ASC`,
      [allSafeJournalIds]
    );
    for (const row of safeLineResult.rows) {
      const journalId = Number(row.journalentryid);
      for (const [accountId, journalIds] of safeJournalIdsByAccount) {
        if (journalIds.has(journalId)) {
          impacts.get(accountId)?.cascadeSafe.journalLineIds.push(Number(row.lineid));
        }
      }
    }
  }

  const journalResult = await client.query(
    `SELECT jl.id AS lineid, jl.financeaccountid AS accountid,
            je.id AS journalentryid, je.sourcetype
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journalentryid
      WHERE jl.financeaccountid = ANY($1::bigint[])
        AND je.organizationid = $2
        AND je.isdeleted = FALSE
      ORDER BY jl.financeaccountid ASC, je.id ASC, jl.id ASC`,
    [accountIds, organizationId]
  );
  for (const row of journalResult.rows) {
    const impact = impacts.get(Number(row.accountid));
    if (!impact) continue;
    const lineId = Number(row.lineid);
    const journalId = Number(row.journalentryid);
    if (!safeJournalIdsByAccount.get(Number(row.accountid))?.has(journalId)) {
      addBlockingReference(
        impact,
        referenceTypeForJournal(row.sourcetype),
        [lineId],
        1,
        String(row.sourcetype || "unknown")
      );
    }
  }

  const knownReferenceResult = await client.query(
    `SELECT 'bank_cash_account'::text AS referencetype, financeaccountid AS accountid, id
       FROM bank_cash_accounts
      WHERE financeaccountid = ANY($1::bigint[])
     UNION ALL
     SELECT 'expense_bill', expenseaccountid, id
       FROM poinvoice
      WHERE expenseaccountid = ANY($1::bigint[])
     UNION ALL
     SELECT 'tds_mapping', tdsaccountid, id
       FROM bank_transaction_allocations
      WHERE tdsaccountid = ANY($1::bigint[])
     UNION ALL
     SELECT 'reconciliation_setting', arcounterpartaccountid, id
       FROM finance_m4_reconciliation_runs
      WHERE arcounterpartaccountid = ANY($1::bigint[])
     UNION ALL
     SELECT 'reconciliation_setting', apcounterpartaccountid, id
       FROM finance_m4_reconciliation_runs
      WHERE apcounterpartaccountid = ANY($1::bigint[])
     UNION ALL
     SELECT 'bank_transaction_lifecycle_owner', deactivatedbychartaccountid, id
       FROM bank_transactions
      WHERE deactivatedbychartaccountid = ANY($1::bigint[])
        AND isdeleted = FALSE
     UNION ALL
     SELECT 'journal_lifecycle_owner', deactivatedbychartaccountid, id
       FROM journal_entries
      WHERE deactivatedbychartaccountid = ANY($1::bigint[])
        AND isdeleted = FALSE
      ORDER BY accountid ASC, referencetype ASC, id ASC`,
    [accountIds]
  );
  for (const row of knownReferenceResult.rows) {
    const impact = impacts.get(Number(row.accountid));
    if (!impact) continue;
    const referenceType = String(row.referencetype);
    const referenceId = Number(row.id);
    if (
      (referenceType === "bank_transaction_lifecycle_owner" &&
        impact.cascadeSafe.bankTransactionIds.includes(referenceId)) ||
      (referenceType === "journal_lifecycle_owner" &&
        impact.cascadeSafe.journalEntryIds.includes(referenceId))
    ) {
      continue;
    }
    addBlockingReference(impact, referenceType, [referenceId]);
  }

  const foreignKeyResult = await client.query(
    `SELECT source_namespace.nspname AS schemaname,
            source_table.relname AS tablename,
            source_attribute.attname AS columnname
       FROM pg_constraint constraint_row
       JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
       JOIN pg_namespace source_namespace ON source_namespace.oid = source_table.relnamespace
       JOIN LATERAL UNNEST(constraint_row.conkey) WITH ORDINALITY source_key(attnum, position) ON TRUE
       JOIN LATERAL UNNEST(constraint_row.confkey) WITH ORDINALITY target_key(attnum, position)
         ON target_key.position = source_key.position
       JOIN pg_attribute source_attribute
         ON source_attribute.attrelid = source_table.oid
        AND source_attribute.attnum = source_key.attnum
      WHERE constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'finance_accounts'::regclass
        AND ARRAY_LENGTH(constraint_row.conkey, 1) = 1
        AND ARRAY_LENGTH(constraint_row.confkey, 1) = 1
      ORDER BY source_namespace.nspname, source_table.relname, source_attribute.attname`,
    []
  );
  for (const reference of foreignKeyResult.rows) {
    const tableName = String(reference.tablename);
    const columnName = String(reference.columnname);
    const schemaName = String(reference.schemaname);
    if (handledFinanceAccountReferences.has(`${schemaName}.${tableName}.${columnName}`)) continue;
    const unexpectedResult = await client.query(
      `SELECT ${quoteIdentifier(columnName)}::bigint AS accountid, COUNT(*)::integer AS total
         FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}
        WHERE ${quoteIdentifier(columnName)} = ANY($1::bigint[])
        GROUP BY ${quoteIdentifier(columnName)}
        ORDER BY ${quoteIdentifier(columnName)}`,
      [accountIds]
    );
    for (const row of unexpectedResult.rows) {
      const impact = impacts.get(Number(row.accountid));
      if (impact) {
        addBlockingReference(
          impact,
          "foreign_key_reference",
          [],
          Number(row.total),
          `${schemaName}.${tableName}.${columnName}`
        );
      }
    }
  }

  return [...impacts.values()].map((impact) => {
    for (const key of Object.keys(impact.cascadeSafe) as Array<keyof typeof impact.cascadeSafe>) {
      impact.cascadeSafe[key] = [...new Set(impact.cascadeSafe[key])].sort((a, b) => a - b);
    }
    impact.blockingReferences.sort((left, right) =>
      `${left.type}:${left.detail || ""}`.localeCompare(`${right.type}:${right.detail || ""}`)
    );
    impact.deletable = impact.blockingReferences.length === 0;
    return impact;
  });
};

export const buildChartAccountLifecycleImpact = async (
  client: LifecycleDbClient,
  organizationId: number,
  values: unknown,
  options: { lockAccounts?: boolean; allowedStatuses?: string[] } = {}
) => {
  const accountIds = normalizeChartAccountLifecycleIds(values);
  let accounts: LifecycleAccount[];
  if (options.lockAccounts === false) {
    const result = await client.query(
      `SELECT id, organizationid, accountcode, accountname, accounttype,
              accountsubtype, status, issystem, isusercreatedchartaccount, isdeleted
         FROM finance_accounts
        WHERE organizationid = $1
          AND id = ANY($2::bigint[])
        ORDER BY id ASC`,
      [organizationId, accountIds]
    );
    accounts = result.rows.map((row) => ({ ...row, id: Number(row.id) }));
    if (accounts.length !== accountIds.length) {
      throw new FinanceValidationError("One or more Chart of Accounts records were not found in this organization.", 404, "CHART_ACCOUNT_NOT_FOUND");
    }
    const invalid = accounts.find((account) => account.isdeleted === true || account.issystem === true || account.isusercreatedchartaccount !== true || !(options.allowedStatuses || ["active", "inactive"]).includes(String(account.status)));
    if (invalid) throw new FinanceValidationError(`Chart account ${invalid.id} is protected, deleted, or ineligible for this lifecycle operation.`, 409, "CHART_ACCOUNT_LIFECYCLE_INELIGIBLE");
  } else {
    accounts = await lockEligibleChartAccounts(
      client,
      organizationId,
      accountIds,
      options.allowedStatuses
    );
  }
  return inspectChartAccountReferences(client, organizationId, accounts);
};

export const lockLifecycleBankCashAccounts = async (
  client: LifecycleDbClient,
  organizationId: number,
  values: unknown
) => {
  if (Array.isArray(values) && values.length === 0) return [];
  const accountIds = normalizeChartAccountLifecycleIds(values);
  const result = await client.query(
    `SELECT *
       FROM bank_cash_accounts
      WHERE organizationid = $1
        AND id = ANY($2::bigint[])
      ORDER BY id ASC
      FOR UPDATE`,
    [organizationId, accountIds]
  );
  if (result.rows.length !== accountIds.length) {
    throw new FinanceValidationError(
      "One or more affected Cash/Bank accounts were not found.",
      409,
      "BANK_CASH_ACCOUNT_LIFECYCLE_MISSING"
    );
  }
  return result.rows.sort((left, right) => Number(left.id) - Number(right.id));
};

export const rebuildLifecycleBankCashAccounts = async (
  client: LifecycleDbClient,
  bankCashAccounts: any[],
  actor: string,
  epoch = nowEpoch()
) => {
  const results = [];
  const uniqueAccounts = [
    ...new Map(bankCashAccounts.map((account) => [Number(account.id), account])).values(),
  ].sort((left, right) => Number(left.id) - Number(right.id));
  for (const account of uniqueAccounts) {
    const before = Number(account.currentbalance);
    const rebuilt = await rebuildBankCashAccountBalances(client, account, actor, epoch);
    results.push({
      bankCashAccountId: Number(account.id),
      before,
      after: rebuilt.currentBalance,
      balances: rebuilt.balances,
    });
  }
  return results;
};

export type LifecycleAuditEvent = {
  entitytype: string;
  entityid: number;
  action: string;
  eventdata?: Record<string, unknown>;
};

export const writeChartAccountLifecycleAuditEvents = async (
  client: LifecycleDbClient,
  organizationId: number,
  actor: string,
  events: LifecycleAuditEvent[],
  epoch = nowEpoch()
) => {
  const ordered = [...events].sort(
    (left, right) =>
      left.entitytype.localeCompare(right.entitytype) || left.entityid - right.entityid
  );
  for (const event of ordered) {
    await client.query(
      `INSERT INTO finance_audit_events
        (organizationid, entitytype, entityid, action, actor, eventdata, createddate)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        organizationId,
        event.entitytype,
        event.entityid,
        event.action,
        actor,
        JSON.stringify(event.eventdata || {}),
        epoch,
      ]
    );
  }
};

export type ChartAccountLifecycleStatus = "active" | "inactive";

const normalizeLifecycleStatus = (value: unknown): ChartAccountLifecycleStatus => {
  const status = String(value || "").trim().toLowerCase();
  if (status !== "active" && status !== "inactive") {
    throw new FinanceValidationError(
      "status must be active or inactive.",
      400,
      "CHART_ACCOUNT_STATUS_INVALID"
    );
  }
  return status;
};

const normalizeLifecycleReason = (value: unknown) => {
  const reason = String(value || "").trim();
  if (reason.length > 500) {
    throw new FinanceValidationError(
      "reason must not exceed 500 characters.",
      400,
      "CHART_ACCOUNT_LIFECYCLE_REASON_INVALID"
    );
  }
  return reason || null;
};

const loadLifecycleDirectLedgerRows = async (
  client: LifecycleDbClient,
  organizationId: number,
  accountIds: number[],
  targetStatus: ChartAccountLifecycleStatus
) => {
  if (accountIds.length === 0) return [];
  const activation = targetStatus === "active";
  const result = await client.query(
    `SELECT bt.id, bt.organizationid, bt.counterpartyaccountid,
            bt.deactivatedbychartaccountid, bt.bankcashaccountid,
            bt.journalentryid, bt.partytype, bt.allocationmethod,
            bt.postingstatus, bt.isdeleted,
            je.id AS resolvedjournalid, je.organizationid AS journalorganizationid,
            je.sourcetype AS journalsourcetype, je.sourceid AS journalsourceid,
            je.status AS journalstatus, je.isdeleted AS journalisdeleted,
            je.deactivatedbychartaccountid AS journaldeactivatedbychartaccountid,
            COALESCE(lines.targetlinecount, 0)::integer AS targetlinecount,
            COALESCE(lines.banklinecount, 0)::integer AS banklinecount
       FROM bank_transactions bt
       LEFT JOIN journal_entries je ON je.id = bt.journalentryid
       LEFT JOIN bank_cash_accounts bca
         ON bca.id = bt.bankcashaccountid
        AND bca.organizationid = bt.organizationid
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE jl.financeaccountid = bt.counterpartyaccountid) AS targetlinecount,
                COUNT(*) FILTER (WHERE jl.financeaccountid = bca.financeaccountid) AS banklinecount
           FROM journal_lines jl
          WHERE jl.journalentryid = je.id
       ) lines ON TRUE
      WHERE bt.organizationid = $1
        AND ${activation ? "bt.deactivatedbychartaccountid" : "bt.counterpartyaccountid"} = ANY($2::bigint[])
        AND bt.partytype = 'ledger'
        AND bt.allocationmethod = 'direct_ledger'
        AND bt.postingstatus = $3
        AND bt.isdeleted = FALSE
      ORDER BY ${activation ? "bt.deactivatedbychartaccountid" : "bt.counterpartyaccountid"} ASC, bt.id ASC`,
    [organizationId, accountIds, activation ? "inactive" : "posted"]
  );

  for (const row of result.rows) {
    const ownerAccountId = Number(
      activation ? row.deactivatedbychartaccountid : row.counterpartyaccountid
    );
    const transactionId = Number(row.id);
    const journalId = Number(row.resolvedjournalid);
    const relationshipIsValid =
      accountIds.includes(ownerAccountId) &&
      Number(row.counterpartyaccountid) === ownerAccountId &&
      row.partytype === "ledger" &&
      row.allocationmethod === "direct_ledger" &&
      Number.isSafeInteger(journalId) &&
      Number(row.journalentryid) === journalId &&
      Number(row.journalorganizationid) === organizationId &&
      row.journalsourcetype === "bank_transaction" &&
      Number(row.journalsourceid) === transactionId &&
      row.journalstatus === row.postingstatus &&
      row.journalisdeleted !== true &&
      Number(row.targetlinecount) > 0 &&
      Number(row.banklinecount) > 0 &&
      (activation
        ? Number(row.journaldeactivatedbychartaccountid) === ownerAccountId
        : row.deactivatedbychartaccountid == null &&
          row.journaldeactivatedbychartaccountid == null);
    if (!relationshipIsValid) {
      throw new FinanceValidationError(
        `Direct Ledger transaction ${transactionId} has an invalid lifecycle relationship.`,
        409,
        "DIRECT_LEDGER_LIFECYCLE_RELATIONSHIP_INVALID"
      );
    }
  }
  return result.rows;
};

const assertNoOrphanedLifecycleJournals = async (
  client: LifecycleDbClient,
  organizationId: number,
  accountIds: number[],
  rows: any[]
) => {
  if (accountIds.length === 0) return;
  const result = await client.query(
    `SELECT id
       FROM journal_entries
      WHERE organizationid = $1
        AND deactivatedbychartaccountid = ANY($2::bigint[])
        AND status = 'inactive'
        AND isdeleted = FALSE
      ORDER BY deactivatedbychartaccountid ASC, id ASC`,
    [organizationId, accountIds]
  );
  const transactionJournalIds = new Set(rows.map((row) => Number(row.resolvedjournalid)));
  const orphan = result.rows.find((row) => !transactionJournalIds.has(Number(row.id)));
  if (orphan) {
    throw new FinanceValidationError(
      `Lifecycle-owned Journal ${orphan.id} is not linked to an eligible Direct Ledger transaction.`,
      409,
      "DIRECT_LEDGER_LIFECYCLE_JOURNAL_ORPHANED"
    );
  }
};

export const changeChartAccountStatusWithClient = async (
  client: LifecycleDbClient,
  input: {
    organizationId: number;
    actor: string;
    accountIds: unknown;
    status: unknown;
    reason?: unknown;
    epoch?: number;
  }
) => {
  const targetStatus = normalizeLifecycleStatus(input.status);
  const reason = normalizeLifecycleReason(input.reason);
  const epoch = input.epoch ?? nowEpoch();
  const accountIds = normalizeChartAccountLifecycleIds(input.accountIds);
  const accounts = await lockEligibleChartAccounts(client, input.organizationId, accountIds);
  const sourceStatus: ChartAccountLifecycleStatus = targetStatus === "active" ? "inactive" : "active";
  const transitioningAccounts = accounts.filter((account) => account.status === sourceStatus);
  const transitioningIds = transitioningAccounts.map((account) => account.id);
  const directLedgerRows = await loadLifecycleDirectLedgerRows(
    client,
    input.organizationId,
    transitioningIds,
    targetStatus
  );
  if (targetStatus === "active") {
    await assertNoOrphanedLifecycleJournals(
      client,
      input.organizationId,
      transitioningIds,
      directLedgerRows
    );
  }

  const bankCashAccountIds = [
    ...new Set(directLedgerRows.map((row) => Number(row.bankcashaccountid))),
  ].sort((left, right) => left - right);
  const bankCashAccounts = await lockLifecycleBankCashAccounts(
    client,
    input.organizationId,
    bankCashAccountIds
  );
  const transactionIds = directLedgerRows.map((row) => Number(row.id));
  const journalIds = directLedgerRows.map((row) => Number(row.resolvedjournalid));

  if (transitioningIds.length > 0) {
    const accountUpdate = await client.query(
      `UPDATE finance_accounts
          SET status = $1, modifiedby = $2, modifieddate = $3
        WHERE organizationid = $4
          AND id = ANY($5::bigint[])
          AND status = $6
          AND isdeleted = FALSE
        RETURNING id`,
      [targetStatus, input.actor, epoch, input.organizationId, transitioningIds, sourceStatus]
    );
    if (accountUpdate.rows.length !== transitioningIds.length) {
      throw new FinanceValidationError(
        "One or more Chart of Accounts records changed during the lifecycle operation.",
        409,
        "CHART_ACCOUNT_LIFECYCLE_CONFLICT"
      );
    }
  }

  if (transactionIds.length > 0) {
    const transactionUpdate = targetStatus === "inactive"
      ? await client.query(
          `UPDATE bank_transactions
              SET postingstatus = 'inactive', deactivatedbychartaccountid = counterpartyaccountid,
                  deactivatedby = $1, deactivateddate = $2
            WHERE organizationid = $3 AND id = ANY($4::bigint[])
              AND postingstatus = 'posted' AND isdeleted = FALSE
            RETURNING id`,
          [input.actor, epoch, input.organizationId, transactionIds]
        )
      : await client.query(
          `UPDATE bank_transactions
              SET postingstatus = 'posted', deactivatedbychartaccountid = NULL,
                  deactivatedby = NULL, deactivateddate = NULL
            WHERE organizationid = $1 AND id = ANY($2::bigint[])
              AND postingstatus = 'inactive' AND isdeleted = FALSE
            RETURNING id`,
          [input.organizationId, transactionIds]
        );
    if (transactionUpdate.rows.length !== transactionIds.length) {
      throw new FinanceValidationError(
        "One or more Direct Ledger transactions changed during the lifecycle operation.",
        409,
        "DIRECT_LEDGER_LIFECYCLE_CONFLICT"
      );
    }

  }

  // Journals carry an account-specific lifecycle owner, so update them one at
  // a time in transaction order rather than applying one owner to a bulk set.
  for (const row of directLedgerRows) {
    const accountId = Number(
      targetStatus === "active" ? row.deactivatedbychartaccountid : row.counterpartyaccountid
    );
    const journalId = Number(row.resolvedjournalid);
    const journalUpdate = targetStatus === "inactive"
      ? await client.query(
          `UPDATE journal_entries
              SET status = 'inactive', deactivatedbychartaccountid = $1,
                  deactivatedby = $2, deactivateddate = $3
            WHERE organizationid = $4 AND id = $5
              AND status = 'posted' AND isdeleted = FALSE
            RETURNING id`,
          [accountId, input.actor, epoch, input.organizationId, journalId]
        )
      : await client.query(
          `UPDATE journal_entries
              SET status = 'posted', deactivatedbychartaccountid = NULL,
                  deactivatedby = NULL, deactivateddate = NULL
            WHERE organizationid = $1 AND id = $2
              AND status = 'inactive' AND isdeleted = FALSE
            RETURNING id`,
          [input.organizationId, journalId]
        );
    if (journalUpdate.rows.length !== 1) {
      throw new FinanceValidationError(
        `Journal ${journalId} changed during the lifecycle operation.`,
        409,
        "DIRECT_LEDGER_LIFECYCLE_CONFLICT"
      );
    }
  }

  const rebuiltAccounts = await rebuildLifecycleBankCashAccounts(
    client,
    bankCashAccounts,
    input.actor,
    epoch
  );
  const events: LifecycleAuditEvent[] = [];
  for (const account of transitioningAccounts) {
    const ownedRows = directLedgerRows.filter((row) =>
      Number(targetStatus === "active" ? row.deactivatedbychartaccountid : row.counterpartyaccountid) === account.id
    );
    events.push({
      entitytype: "finance_account",
      entityid: account.id,
      action: targetStatus === "active" ? "chart_account_activated" : "chart_account_deactivated",
      eventdata: {
        previousstatus: sourceStatus,
        status: targetStatus,
        reason,
        banktransactionids: ownedRows.map((row) => Number(row.id)),
        journalentryids: ownedRows.map((row) => Number(row.resolvedjournalid)),
      },
    });
  }
  for (const row of directLedgerRows) {
    events.push({
      entitytype: "bank_transaction",
      entityid: Number(row.id),
      action: targetStatus === "active"
        ? "direct_ledger_activated_by_chart_account"
        : "direct_ledger_deactivated_by_chart_account",
      eventdata: { chartaccountid: Number(row.counterpartyaccountid), reason },
    });
    events.push({
      entitytype: "journal_entry",
      entityid: Number(row.resolvedjournalid),
      action: targetStatus === "active"
        ? "direct_ledger_activated_by_chart_account"
        : "direct_ledger_deactivated_by_chart_account",
      eventdata: { chartaccountid: Number(row.counterpartyaccountid), reason },
    });
  }
  for (const rebuilt of rebuiltAccounts) {
    events.push({
      entitytype: "bank_cash_account",
      entityid: rebuilt.bankCashAccountId,
      action: "bank_cash_balance_rebuilt",
      eventdata: { before: rebuilt.before, after: rebuilt.after, reason },
    });
  }
  if (accounts.length > 1 && transitioningAccounts.length > 0) {
    events.push({
      entitytype: "chart_account_bulk_operation",
      entityid: accounts[0].id,
      action: "chart_account_bulk_status_completed",
      eventdata: {
        accountids: accounts.map((account) => account.id),
        changedaccountids: transitioningAccounts.map((account) => account.id),
        status: targetStatus,
        reason,
        transactionsaffected: transactionIds.length,
        journalsaffected: journalIds.length,
        bankaccountsrebuilt: rebuiltAccounts.length,
      },
    });
  }
  await writeChartAccountLifecycleAuditEvents(
    client,
    input.organizationId,
    input.actor,
    events,
    epoch
  );

  const rowsByAccount = new Map<number, any[]>();
  for (const row of directLedgerRows) {
    const accountId = Number(
      targetStatus === "active" ? row.deactivatedbychartaccountid : row.counterpartyaccountid
    );
    rowsByAccount.set(accountId, [...(rowsByAccount.get(accountId) || []), row]);
  }
  return {
    status: targetStatus,
    changed: transitioningAccounts.length,
    unchanged: accounts.length - transitioningAccounts.length,
    transactionsaffected: transactionIds.length,
    journalsaffected: journalIds.length,
    bankaccountsrebuilt: rebuiltAccounts.length,
    accounts: accounts.map((account) => {
      const rows = rowsByAccount.get(account.id) || [];
      return {
        accountid: account.id,
        accountname: account.accountname,
        previousstatus: account.status,
        status: targetStatus,
        changed: account.status !== targetStatus,
        transactionsaffected: rows.length,
        journalsaffected: rows.length,
        bankcashaccountids: [...new Set(rows.map((row) => Number(row.bankcashaccountid)))].sort((a, b) => a - b),
      };
    }),
  };
};

// Give administrators enough time to inspect the downloaded CSV. The final
// delete still revalidates every reference fingerprint before changing data.
const DELETE_PREVIEW_TTL_SECONDS = 30 * 60;

const deletionCsvFilenameTimestamp = (epoch: number) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epoch * 1000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}${values.month}${values.year}${values.hour}${values.minute}`;
};

type ChartAccountDeletionTokenPayload = {
  version: 1;
  organizationid: number;
  actor: string;
  accountids: number[];
  deletableids: number[];
  fingerprint: string;
  accountfingerprints: Record<string, string>;
  issuedat: number;
  expiresat: number;
  nonce: string;
};

const requireDeletionTokenSecret = (provided?: string) => {
  const secret = provided || FINANCE_LIFECYCLE_TOKEN_SECRET || FINANCE_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new FinanceValidationError(
      "Chart of Accounts deletion token secret is not configured.",
      500,
      "CHART_ACCOUNT_DELETE_TOKEN_SECRET_MISSING"
    );
  }
  return secret;
};

const encodeTokenPart = (value: string) => Buffer.from(value, "utf8").toString("base64url");

export const fingerprintChartAccountDeletionImpact = (
  impacts: ChartAccountLifecycleImpact[]
) => createHash("sha256").update(JSON.stringify(
  [...impacts]
    .sort((left, right) => left.accountid - right.accountid)
    .map((impact) => ({
      accountid: impact.accountid,
      accountcode: impact.accountcode,
      accountname: impact.accountname,
      status: impact.status,
      deletable: impact.deletable,
      cascadeSafe: impact.cascadeSafe,
      blockingReferences: impact.blockingReferences,
    }))
)).digest("hex");

export const signChartAccountDeletionToken = (
  payload: ChartAccountDeletionTokenPayload,
  secret?: string
) => {
  const encodedPayload = encodeTokenPart(JSON.stringify(payload));
  const unsignedToken = `v1.${encodedPayload}`;
  const signature = createHmac("sha256", requireDeletionTokenSecret(secret))
    .update(unsignedToken)
    .digest("base64url");
  return `${unsignedToken}.${signature}`;
};

export const verifyChartAccountDeletionToken = (
  token: unknown,
  context: { organizationId: number; actor: string; now?: number; secret?: string }
): ChartAccountDeletionTokenPayload => {
  const normalized = String(token || "").trim();
  const parts = normalized.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new FinanceValidationError(
      "The deletion confirmation token is invalid.",
      400,
      "CHART_ACCOUNT_DELETE_TOKEN_INVALID"
    );
  }
  const unsignedToken = `${parts[0]}.${parts[1]}`;
  const expected = Uint8Array.from(Buffer.from(
    createHmac("sha256", requireDeletionTokenSecret(context.secret))
      .update(unsignedToken)
      .digest("base64url")
  ));
  const received = Uint8Array.from(Buffer.from(parts[2]));
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new FinanceValidationError(
      "The deletion confirmation token is invalid.",
      400,
      "CHART_ACCOUNT_DELETE_TOKEN_INVALID"
    );
  }

  let payload: ChartAccountDeletionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new FinanceValidationError(
      "The deletion confirmation token is invalid.",
      400,
      "CHART_ACCOUNT_DELETE_TOKEN_INVALID"
    );
  }
  const now = context.now ?? nowEpoch();
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.version !== 1 ||
    payload.organizationid !== context.organizationId ||
    payload.actor !== context.actor ||
    !Array.isArray(payload.accountids) ||
    !Array.isArray(payload.deletableids) ||
    !payload.fingerprint ||
    !payload.accountfingerprints ||
    typeof payload.accountfingerprints !== "object" ||
    !Number.isSafeInteger(payload.expiresat)
  ) {
    throw new FinanceValidationError(
      "The deletion confirmation token does not match this user or organization.",
      403,
      "CHART_ACCOUNT_DELETE_TOKEN_CONTEXT_MISMATCH"
    );
  }
  if (payload.expiresat <= now) {
    throw new FinanceValidationError(
      "The deletion confirmation token has expired. Preview the deletion again.",
      409,
      "CHART_ACCOUNT_DELETE_TOKEN_EXPIRED"
    );
  }
  payload.accountids = normalizeChartAccountLifecycleIds(payload.accountids);
  payload.deletableids = payload.deletableids.length
    ? normalizeChartAccountLifecycleIds(payload.deletableids)
    : [];
  if (payload.accountids.some((accountId) =>
    typeof payload.accountfingerprints[String(accountId)] !== "string"
  )) {
    throw new FinanceValidationError(
      "The deletion confirmation token is invalid.",
      400,
      "CHART_ACCOUNT_DELETE_TOKEN_INVALID"
    );
  }
  return payload;
};

export const previewChartAccountDeletionWithClient = async (
  client: LifecycleDbClient,
  input: {
    organizationId: number;
    actor: string;
    accountIds: unknown;
    now?: number;
    tokenSecret?: string;
  }
) => {
  const accountIds = normalizeChartAccountLifecycleIds(input.accountIds);
  const impacts = await buildChartAccountLifecycleImpact(
    client,
    input.organizationId,
    accountIds,
    { lockAccounts: false }
  );
  const issuedAt = input.now ?? nowEpoch();
  const expiresAt = issuedAt + DELETE_PREVIEW_TTL_SECONDS;
  const deletableIds = impacts
    .filter((impact) => impact.deletable)
    .map((impact) => impact.accountid);
  const fingerprint = fingerprintChartAccountDeletionImpact(impacts);
  const deletionToken = signChartAccountDeletionToken(
    {
      version: 1,
      organizationid: input.organizationId,
      actor: input.actor,
      accountids: accountIds,
      deletableids: deletableIds,
      fingerprint,
      accountfingerprints: Object.fromEntries(
        impacts.map((impact) => [
          String(impact.accountid),
          fingerprintChartAccountDeletionImpact([impact]),
        ])
      ),
      issuedat: issuedAt,
      expiresat: expiresAt,
      nonce: randomUUID(),
    },
    input.tokenSecret
  );
  return {
    deletiontoken: deletionToken,
    expiresat: expiresAt,
    summary: {
      requested: impacts.length,
      deletable: deletableIds.length,
      blocked: impacts.length - deletableIds.length,
      directledgertransactions: impacts.reduce(
        (total, impact) => total + impact.cascadeSafe.bankTransactionIds.length,
        0
      ),
      affectedbankaccounts: new Set(
        impacts.flatMap((impact) => impact.cascadeSafe.bankCashAccountIds)
      ).size,
    },
    accounts: impacts,
  };
};

type ChartAccountDeletionSnapshot = {
  accounts: any[];
  bankTransactions: any[];
  journalEntries: any[];
  journalLines: any[];
};

const loadChartAccountDeletionSnapshot = async (
  client: LifecycleDbClient,
  organizationId: number,
  requestedAccountIds: number[],
  deletableImpacts: ChartAccountLifecycleImpact[]
): Promise<ChartAccountDeletionSnapshot> => {
  const transactionIds = [...new Set(deletableImpacts.flatMap(
    (impact) => impact.cascadeSafe.bankTransactionIds
  ))].sort((left, right) => left - right);
  const journalIds = [...new Set(deletableImpacts.flatMap(
    (impact) => impact.cascadeSafe.journalEntryIds
  ))].sort((left, right) => left - right);
  const accounts = await client.query(
    `SELECT f.*,
            COALESCE(totals.totaldebit, 0) AS totaldebit,
            COALESCE(totals.totalcredit, 0) AS totalcredit
       FROM finance_accounts f
       LEFT JOIN LATERAL (
         SELECT SUM(jl.debitamount) AS totaldebit,
                SUM(jl.creditamount) AS totalcredit
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journalentryid
          WHERE jl.financeaccountid = f.id
            AND je.organizationid = f.organizationid
            AND je.status = 'posted'
            AND je.isdeleted = FALSE
       ) totals ON TRUE
      WHERE f.organizationid = $1
        AND f.id = ANY($2::bigint[])
      ORDER BY f.id ASC`,
    [organizationId, requestedAccountIds]
  );
  const bankTransactions = transactionIds.length
    ? await client.query(
        `SELECT bt.*, bca.accountname AS bankcashaccountname,
                bca.accounttype AS bankcashaccounttype,
                bca.currentbalance AS bankbalancebefore
           FROM bank_transactions bt
           JOIN bank_cash_accounts bca
             ON bca.id = bt.bankcashaccountid
            AND bca.organizationid = bt.organizationid
          WHERE bt.organizationid = $1
            AND bt.id = ANY($2::bigint[])
          ORDER BY bt.counterpartyaccountid ASC, bt.id ASC`,
        [organizationId, transactionIds]
      )
    : { rows: [] };
  const journalEntries = journalIds.length
    ? await client.query(
        `SELECT * FROM journal_entries
          WHERE organizationid = $1
            AND id = ANY($2::bigint[])
          ORDER BY id ASC`,
        [organizationId, journalIds]
      )
    : { rows: [] };
  const journalLines = journalIds.length
    ? await client.query(
        `SELECT * FROM journal_lines
          WHERE journalentryid = ANY($1::bigint[])
          ORDER BY journalentryid ASC, id ASC`,
        [journalIds]
      )
    : { rows: [] };
  return {
    accounts: accounts.rows,
    bankTransactions: bankTransactions.rows,
    journalEntries: journalEntries.rows,
    journalLines: journalLines.rows,
  };
};

const csvValue = (value: unknown) => {
  if (value == null) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const normalized = typeof value === "string" && /^[=+\-@\t]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
};

const deletionCsvColumns = [
  "deletionbatchid", "operationresult", "blockingreason", "accountid",
  "accountcode", "accountname", "accounttype", "accountsubtype", "description",
  "accountstatusbefore", "currencycode", "accountcreatedby", "accountmodifiedby",
  "accountcreateddate", "accountmodifieddate", "totaldebit", "totalcredit",
  "ledgerbalance", "bankcashaccountid", "bankcashaccountname", "bankcashaccounttype",
  "bankbalancebefore", "bankbalanceafter", "banktransactionid", "transactionnumber",
  "transactiondate", "entryside", "amount", "debit", "credit",
  "historicalbalanceafter", "allocationmethod", "sourcetype", "narration", "remarks",
  "journalentryid", "journalnumber", "journallineid", "linefinanceaccountid",
  "linedebit", "linecredit", "linedescription", "recordcreatedby", "recordpostedby",
  "recordcreateddate", "recordposteddate", "deletedby", "deleteddate", "datajson",
] as const;

export const buildChartAccountDeletionCsv = (input: {
  deletionBatchId: string;
  actor: string;
  epoch: number;
  impacts: ChartAccountLifecycleImpact[];
  snapshot: ChartAccountDeletionSnapshot;
  rebuiltAccounts: Array<{ bankCashAccountId: number; before: number; after: number }>;
  deletedAccountIds?: number[];
  skippedReasons?: Map<number, string>;
  operationMode?: "delete" | "preview";
}) => {
  const accountRows = new Map(input.snapshot.accounts.map((row) => [Number(row.id), row]));
  const journalRows = new Map(input.snapshot.journalEntries.map((row) => [Number(row.id), row]));
  const linesByJournal = new Map<number, any[]>();
  for (const line of input.snapshot.journalLines) {
    const journalId = Number(line.journalentryid);
    linesByJournal.set(journalId, [...(linesByJournal.get(journalId) || []), line]);
  }
  const balances = new Map(input.rebuiltAccounts.map((row) => [row.bankCashAccountId, row]));
  const csvRows: Record<string, unknown>[] = [];

  const baseForAccount = (impact: ChartAccountLifecycleImpact, result: string) => {
    const account = accountRows.get(impact.accountid) || {};
    const debit = Number(account.totaldebit || 0);
    const credit = Number(account.totalcredit || 0);
    const normalDebit = ["asset", "expense"].includes(String(account.accounttype));
    return {
      deletionbatchid: input.deletionBatchId,
      operationresult: result,
      accountid: impact.accountid,
      accountcode: account.accountcode ?? impact.accountcode,
      accountname: account.accountname ?? impact.accountname,
      accounttype: account.accounttype,
      accountsubtype: account.accountsubtype,
      description: account.description,
      accountstatusbefore: impact.status,
      currencycode: account.currencycode,
      accountcreatedby: account.createdby,
      accountmodifiedby: account.modifiedby,
      accountcreateddate: account.createddate,
      accountmodifieddate: account.modifieddate,
      totaldebit: debit,
      totalcredit: credit,
      ledgerbalance: toMoney(normalDebit ? debit - credit : credit - debit, "ledgerbalance"),
      deletedby: result === "deleted" ? input.actor : "",
      deleteddate: result === "deleted" ? input.epoch : "",
    };
  };

  for (const impact of [...input.impacts].sort((left, right) => left.accountid - right.accountid)) {
    const skippedReason = input.skippedReasons?.get(impact.accountid);
    if (skippedReason) {
      csvRows.push({
        ...baseForAccount(impact, "skipped"),
        blockingreason: skippedReason,
        datajson: accountRows.get(impact.accountid) || {},
      });
      continue;
    }
    const isDeleted = input.deletedAccountIds
      ? input.deletedAccountIds.includes(impact.accountid)
      : impact.deletable;
    if (!isDeleted) {
      const blockers = impact.blockingReferences.length ? impact.blockingReferences : [{ type: "blocked", count: 1 }];
      for (const blocker of blockers) {
        csvRows.push({
          ...baseForAccount(impact, "blocked"),
          blockingreason: `${blocker.type}${blocker.detail ? `: ${blocker.detail}` : ""} (${blocker.count})`,
          datajson: blocker,
        });
      }
      continue;
    }
    const transactions = input.snapshot.bankTransactions.filter(
      (row) => Number(row.counterpartyaccountid) === impact.accountid
    );
    const eligibleResult = input.operationMode === "preview"
      ? "preview_deletable"
      : "deleted";
    if (transactions.length === 0) {
      csvRows.push({
        ...baseForAccount(impact, eligibleResult),
        datajson: accountRows.get(impact.accountid) || {},
      });
      continue;
    }
    for (const transaction of transactions) {
      const journal = journalRows.get(Number(transaction.journalentryid)) || {};
      const lines = linesByJournal.get(Number(journal.id)) || [null];
      const balance = balances.get(Number(transaction.bankcashaccountid));
      for (const line of lines) {
        csvRows.push({
          ...baseForAccount(impact, eligibleResult),
          bankcashaccountid: transaction.bankcashaccountid,
          bankcashaccountname: transaction.bankcashaccountname,
          bankcashaccounttype: transaction.bankcashaccounttype,
          bankbalancebefore: balance?.before ?? transaction.bankbalancebefore,
          bankbalanceafter:
            input.operationMode === "preview" ? "" : balance?.after,
          banktransactionid: transaction.id,
          transactionnumber: transaction.transactionnumber,
          transactiondate: transaction.transactiondate,
          entryside: transaction.entryside,
          amount: transaction.amount,
          debit: transaction.entryside === "debit" ? transaction.amount : 0,
          credit: transaction.entryside === "credit" ? transaction.amount : 0,
          historicalbalanceafter: transaction.balanceafter,
          allocationmethod: transaction.allocationmethod,
          sourcetype: journal.sourcetype,
          narration: transaction.entryname ?? journal.description,
          remarks: transaction.remarks,
          journalentryid: journal.id,
          journalnumber: journal.journalnumber,
          journallineid: line?.id,
          linefinanceaccountid: line?.financeaccountid,
          linedebit: line?.debitamount,
          linecredit: line?.creditamount,
          linedescription: line?.description,
          recordcreatedby: transaction.createdby ?? journal.createdby,
          recordpostedby: journal.postedby,
          recordcreateddate: transaction.createddate ?? journal.createddate,
          recordposteddate: transaction.posteddate ?? journal.posteddate,
          datajson: { transaction, journal, journalLine: line },
        });
      }
    }
  }
  const csv = [
    deletionCsvColumns.join(","),
    ...csvRows.map((row) => deletionCsvColumns.map((column) => csvValue(row[column])).join(",")),
  ].join("\r\n");
  return `\uFEFF${csv}\r\n`;
};

export const exportChartAccountDeletionPreviewWithClient = async (
  client: LifecycleDbClient,
  input: {
    organizationId: number;
    actor: string;
    deletionToken: unknown;
    epoch?: number;
    tokenSecret?: string;
  }
) => {
  const epoch = input.epoch ?? nowEpoch();
  const token = verifyChartAccountDeletionToken(input.deletionToken, {
    organizationId: input.organizationId,
    actor: input.actor,
    now: epoch,
    secret: input.tokenSecret,
  });
  const impacts = await buildChartAccountLifecycleImpact(
    client,
    input.organizationId,
    token.accountids,
    { lockAccounts: false }
  );
  if (fingerprintChartAccountDeletionImpact(impacts) !== token.fingerprint) {
    throw new FinanceValidationError(
      "Account or reference state changed after preview. Refresh the preview before downloading.",
      409,
      "CHART_ACCOUNT_DELETE_PREVIEW_CHANGED"
    );
  }
  const deletableImpacts = impacts.filter(
    (impact) => impact.deletable && token.deletableids.includes(impact.accountid)
  );
  const snapshot = await loadChartAccountDeletionSnapshot(
    client,
    input.organizationId,
    token.accountids,
    deletableImpacts
  );
  const csv = buildChartAccountDeletionCsv({
    deletionBatchId: `preview-${token.nonce}`,
    actor: input.actor,
    epoch,
    impacts,
    snapshot,
    rebuiltAccounts: [],
    operationMode: "preview",
  });
  const filenameTimestamp = deletionCsvFilenameTimestamp(epoch);
  return {
    csv,
    filename: `${filenameTimestamp}-chart-of-accounts-delete-preview.csv`,
    summary: {
      requested: impacts.length,
      deletable: deletableImpacts.length,
      blocked: impacts.length - deletableImpacts.length,
    },
  };
};

export const deleteChartAccountsWithClient = async (
  client: LifecycleDbClient,
  input: {
    organizationId: number;
    actor: string;
    deletionToken: unknown;
    reason?: unknown;
    epoch?: number;
    tokenSecret?: string;
  }
) => {
  const epoch = input.epoch ?? nowEpoch();
  const reason = normalizeLifecycleReason(input.reason);
  const token = verifyChartAccountDeletionToken(input.deletionToken, {
    organizationId: input.organizationId,
    actor: input.actor,
    now: epoch,
    secret: input.tokenSecret,
  });
  const impacts = await buildChartAccountLifecycleImpact(
    client,
    input.organizationId,
    token.accountids,
    { lockAccounts: true }
  );
  const skippedReasons = new Map<number, string>();
  const deletableImpacts = impacts.filter((impact) => {
    const previewFingerprint = token.accountfingerprints[String(impact.accountid)];
    const unchanged = previewFingerprint === fingerprintChartAccountDeletionImpact([impact]);
    const wasConfirmedDeletable = token.deletableids.includes(impact.accountid);
    if (!unchanged) {
      skippedReasons.set(
        impact.accountid,
        "Account or reference state changed after preview; preview again before deletion."
      );
      return false;
    }
    if (impact.deletable && !wasConfirmedDeletable) {
      skippedReasons.set(
        impact.accountid,
        "Account was not confirmed as deletable in the preview."
      );
      return false;
    }
    return impact.deletable && wasConfirmedDeletable;
  });
  const deletableIds = deletableImpacts.map((impact) => impact.accountid);
  const transactionIds = [...new Set(deletableImpacts.flatMap(
    (impact) => impact.cascadeSafe.bankTransactionIds
  ))].sort((left, right) => left - right);
  const journalIds = [...new Set(deletableImpacts.flatMap(
    (impact) => impact.cascadeSafe.journalEntryIds
  ))].sort((left, right) => left - right);
  const bankCashAccountIds = [...new Set(deletableImpacts.flatMap(
    (impact) => impact.cascadeSafe.bankCashAccountIds
  ))].sort((left, right) => left - right);
  const bankCashAccounts = await lockLifecycleBankCashAccounts(
    client,
    input.organizationId,
    bankCashAccountIds
  );
  const snapshot = await loadChartAccountDeletionSnapshot(
    client,
    input.organizationId,
    token.accountids,
    deletableImpacts
  );
  const deletionBatchId = randomUUID();

  if (transactionIds.length > 0) {
    const result = await client.query(
      `UPDATE bank_transactions
          SET postingstatus = 'inactive', isdeleted = TRUE,
              deletedby = $1, deleteddate = $2, deletionbatchid = $3,
              deactivatedbychartaccountid = counterpartyaccountid,
              deactivatedby = COALESCE(deactivatedby, $1),
              deactivateddate = COALESCE(deactivateddate, $2)
        WHERE organizationid = $4
          AND id = ANY($5::bigint[])
          AND isdeleted = FALSE
        RETURNING id`,
      [input.actor, epoch, deletionBatchId, input.organizationId, transactionIds]
    );
    if (result.rows.length !== transactionIds.length) {
      throw new FinanceValidationError(
        "One or more Direct Ledger transactions changed during deletion.",
        409,
        "CHART_ACCOUNT_DELETE_CONFLICT"
      );
    }
  }
  // Journals are updated individually because lifecycle ownership is per COA.
  for (const impact of deletableImpacts) {
    for (const journalId of impact.cascadeSafe.journalEntryIds) {
      const result = await client.query(
        `UPDATE journal_entries
            SET status = 'inactive', isdeleted = TRUE,
                deletedby = $1, deleteddate = $2, deletionbatchid = $3,
                deactivatedbychartaccountid = $4,
                deactivatedby = COALESCE(deactivatedby, $1),
                deactivateddate = COALESCE(deactivateddate, $2)
          WHERE organizationid = $5
            AND id = $6
            AND isdeleted = FALSE
          RETURNING id`,
        [input.actor, epoch, deletionBatchId, impact.accountid, input.organizationId, journalId]
      );
      if (result.rows.length !== 1) {
        throw new FinanceValidationError(
          `Journal ${journalId} changed during deletion.`,
          409,
          "CHART_ACCOUNT_DELETE_CONFLICT"
        );
      }
    }
  }

  if (deletableIds.length > 0) {
    const result = await client.query(
      `UPDATE finance_accounts
          SET status = 'inactive', isdeleted = TRUE,
              deletedby = $1, deleteddate = $2, deletionbatchid = $3,
              modifiedby = $1, modifieddate = $2
        WHERE organizationid = $4
          AND id = ANY($5::bigint[])
          AND isdeleted = FALSE
        RETURNING id`,
      [input.actor, epoch, deletionBatchId, input.organizationId, deletableIds]
    );
    if (result.rows.length !== deletableIds.length) {
      throw new FinanceValidationError(
        "One or more Chart of Accounts records changed during deletion.",
        409,
        "CHART_ACCOUNT_DELETE_CONFLICT"
      );
    }
  }

  const rebuiltAccounts = await rebuildLifecycleBankCashAccounts(
    client,
    bankCashAccounts,
    input.actor,
    epoch
  );
  const events: LifecycleAuditEvent[] = [];
  for (const impact of deletableImpacts) {
    events.push({
      entitytype: "finance_account",
      entityid: impact.accountid,
      action: "chart_account_deleted",
      eventdata: {
        deletionbatchid: deletionBatchId,
        reason,
        banktransactionids: impact.cascadeSafe.bankTransactionIds,
        journalentryids: impact.cascadeSafe.journalEntryIds,
        bankcashaccountids: impact.cascadeSafe.bankCashAccountIds,
      },
    });
    for (const transactionId of impact.cascadeSafe.bankTransactionIds) {
      events.push({
        entitytype: "bank_transaction",
        entityid: transactionId,
        action: "direct_ledger_deleted_by_chart_account",
        eventdata: { deletionbatchid: deletionBatchId, chartaccountid: impact.accountid, reason },
      });
    }
    for (const journalId of impact.cascadeSafe.journalEntryIds) {
      events.push({
        entitytype: "journal_entry",
        entityid: journalId,
        action: "direct_ledger_deleted_by_chart_account",
        eventdata: { deletionbatchid: deletionBatchId, chartaccountid: impact.accountid, reason },
      });
    }
  }
  for (const rebuilt of rebuiltAccounts) {
    events.push({
      entitytype: "bank_cash_account",
      entityid: rebuilt.bankCashAccountId,
      action: "bank_cash_balance_rebuilt",
      eventdata: {
        deletionbatchid: deletionBatchId,
        before: rebuilt.before,
        after: rebuilt.after,
        reason,
      },
    });
  }
  events.push({
    entitytype: "chart_account_bulk_operation",
    entityid: token.accountids[0],
    action: "chart_account_bulk_delete_completed",
    eventdata: {
      deletionbatchid: deletionBatchId,
      requestedaccountids: token.accountids,
      deletedaccountids: deletableIds,
      blockedaccountids: impacts
        .filter((impact) => !skippedReasons.has(impact.accountid) && !impact.deletable)
        .map((impact) => impact.accountid),
      skippedaccountids: [...skippedReasons.keys()],
      reason,
    },
  });
  await writeChartAccountLifecycleAuditEvents(
    client,
    input.organizationId,
    input.actor,
    events,
    epoch
  );

  const csv = buildChartAccountDeletionCsv({
    deletionBatchId,
    actor: input.actor,
    epoch,
    impacts,
    snapshot,
    rebuiltAccounts,
    deletedAccountIds: deletableIds,
    skippedReasons,
  });
  const filenameTimestamp = deletionCsvFilenameTimestamp(epoch);
  return {
    csv,
    filename: `${filenameTimestamp}-chart-of-accounts-delete-result.csv`,
    summary: {
      deletionbatchid: deletionBatchId,
      requested: impacts.length,
      deleted: deletableIds.length,
      blocked: impacts.filter(
        (impact) => !skippedReasons.has(impact.accountid) && !impact.deletable
      ).length,
      skipped: skippedReasons.size,
      transactionsdeleted: transactionIds.length,
      journalsdeleted: journalIds.length,
      bankaccountsrebuilt: rebuiltAccounts.length,
    },
  };
};

export module chartAccountLifecycleService {
  export const changeStatus = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const accountId = Number(request.params?.accountId);
    const accountIds = request.body?.accountids || [accountId];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await changeChartAccountStatusWithClient(client, {
        organizationId,
        actor,
        accountIds,
        status: request.body?.status,
        reason: request.body?.reason,
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  export const previewDeletion = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    return previewChartAccountDeletionWithClient(pool, {
      organizationId,
      actor,
      accountIds: request.body?.accountids,
    });
  };

  export const exportDeletionPreview = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    return exportChartAccountDeletionPreviewWithClient(pool, {
      organizationId,
      actor,
      deletionToken: request.body?.deletiontoken,
    });
  };

  export const deleteAccounts = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await deleteChartAccountsWithClient(client, {
        organizationId,
        actor,
        deletionToken: request.body?.deletiontoken,
        reason: request.body?.reason,
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}
