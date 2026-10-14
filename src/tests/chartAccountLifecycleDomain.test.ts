import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  buildChartAccountLifecycleImpact,
  buildChartAccountDeletionCsv,
  changeChartAccountStatusWithClient,
  deleteChartAccountsWithClient,
  exportChartAccountDeletionPreviewWithClient,
  fingerprintChartAccountDeletionImpact,
  inspectChartAccountReferences,
  lockEligibleChartAccounts,
  lockLifecycleBankCashAccounts,
  normalizeChartAccountLifecycleIds,
  previewChartAccountDeletionWithClient,
  rebuildLifecycleBankCashAccounts,
  signChartAccountDeletionToken,
  verifyChartAccountDeletionToken,
  writeChartAccountLifecycleAuditEvents,
} from "../services/chartAccountLifecycle.service.js";
import {
  bulkChartAccountStatusSchema,
  chartAccountBulkDeleteSchema,
  chartAccountDeleteExportSchema,
  chartAccountDeletePreviewSchema,
  chartAccountStatusSchema,
} from "../schemas/finance.schema.js";
import { FinanceValidationError } from "../utils/finance/finance.utils.js";

const lifecycleAccount = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  organizationid: 7,
  accountcode: `ACCOUNT-${id}`,
  accountname: `Account ${id}`,
  accounttype: "expense",
  accountsubtype: "expense",
  status: "active",
  issystem: false,
  isusercreatedchartaccount: true,
  isdeleted: false,
  ...overrides,
});

describe("Chart of Accounts lifecycle Phase 3 domain service", () => {
  test("normalizes, deduplicates, and sorts lifecycle account ids", () => {
    assert.deepEqual(normalizeChartAccountLifecycleIds([42, "41", 42]), [41, 42]);
    assert.throws(
      () => normalizeChartAccountLifecycleIds([]),
      (error: any) =>
        error instanceof FinanceValidationError &&
        error.code === "CHART_ACCOUNT_SELECTION_REQUIRED"
    );
    assert.throws(() => normalizeChartAccountLifecycleIds([1, "bad"]), /positive integer/);
  });

  test("locks eligible user-created accounts in deterministic id order", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const client = {
      query: async (sql: string, params?: any[]) => {
        calls.push({ sql, params });
        return { rows: [lifecycleAccount(41), lifecycleAccount(42)] };
      },
    };
    const accounts = await lockEligibleChartAccounts(client, 7, [42, 41]);
    assert.deepEqual(accounts.map((account) => account.id), [41, 42]);
    assert.deepEqual(calls[0].params, [7, [41, 42]]);
    assert.match(calls[0].sql, /ORDER BY id ASC\s+FOR UPDATE/);
  });

  test("rejects system, deleted, and cross-organization account selections", async () => {
    const protectedClient = {
      query: async () => ({ rows: [lifecycleAccount(41, { issystem: true })] }),
    };
    await assert.rejects(
      () => lockEligibleChartAccounts(protectedClient, 7, [41]),
      (error: any) => error.code === "CHART_ACCOUNT_LIFECYCLE_INELIGIBLE"
    );
    const missingClient = { query: async () => ({ rows: [] }) };
    await assert.rejects(
      () => lockEligibleChartAccounts(missingClient, 7, [41]),
      (error: any) => error.code === "CHART_ACCOUNT_NOT_FOUND"
    );
  });

  test("builds an impact preview and blocks known plus future references by default", async () => {
    const client = {
      query: async (sql: string) => {
        if (/FROM finance_accounts/.test(sql)) {
          return { rows: [lifecycleAccount(41), lifecycleAccount(42)] };
        }
        if (/FROM bank_transactions bt/.test(sql)) {
          return {
            rows: [
              {
                id: 501,
                accountid: 41,
                bankcashaccountid: 11,
                journalentryid: 701,
                partytype: "ledger",
                allocationmethod: "direct_ledger",
                postingstatus: "posted",
                resolvedjournalid: 701,
                journalorganizationid: 7,
                journalsourcetype: "bank_transaction",
                journalsourceid: 501,
                journalstatus: "posted",
                journalisdeleted: false,
                targetlinecount: 1,
                banklinecount: 1,
              },
            ],
          };
        }
        if (/FROM journal_lines\s+WHERE journalentryid/.test(sql)) {
          return {
            rows: [
              { lineid: 901, journalentryid: 701 },
              { lineid: 902, journalentryid: 701 },
            ],
          };
        }
        if (/SELECT jl\.id AS lineid/.test(sql)) {
          return {
            rows: [
              { lineid: 901, accountid: 41, journalentryid: 701, sourcetype: "bank_transaction" },
              { lineid: 905, accountid: 42, journalentryid: 703, sourcetype: "manual_journal" },
            ],
          };
        }
        if (sql.includes("'bank_cash_account'::text AS referencetype")) {
          return { rows: [{ referencetype: "expense_bill", accountid: 42, id: 801 }] };
        }
        if (/FROM pg_constraint/.test(sql)) {
          return {
            rows: [
              { schemaname: "public", tablename: "poinvoice", columnname: "expenseaccountid" },
              { schemaname: "public", tablename: "future_finance_links", columnname: "accountid" },
            ],
          };
        }
        if (/future_finance_links/.test(sql)) {
          return { rows: [{ accountid: 42, total: 3 }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const impacts = await buildChartAccountLifecycleImpact(client, 7, [42, 41], {
      lockAccounts: false,
    });
    assert.deepEqual(impacts[0].cascadeSafe, {
      bankTransactionIds: [501],
      journalEntryIds: [701],
      journalLineIds: [901, 902],
      bankCashAccountIds: [11],
    });
    assert.equal(impacts[0].deletable, true);
    assert.equal(impacts[1].deletable, false);
    assert.deepEqual(
      impacts[1].blockingReferences.map(({ type, count }) => ({ type, count })),
      [
        { type: "expense_bill", count: 1 },
        { type: "foreign_key_reference", count: 3 },
        { type: "manual_journal", count: 1 },
      ]
    );
  });

  test("treats malformed Direct Ledger relationships as blockers", async () => {
    const account = lifecycleAccount(41);
    const client = {
      query: async (sql: string) => {
        if (/FROM bank_transactions bt/.test(sql)) {
          return {
            rows: [{
              id: 501, accountid: 41, bankcashaccountid: 11, journalentryid: 701,
              partytype: "ledger", allocationmethod: "direct_ledger", postingstatus: "posted",
              resolvedjournalid: 701, journalorganizationid: 7, journalsourcetype: "manual_journal",
              journalsourceid: 501, journalstatus: "posted", journalisdeleted: false,
              targetlinecount: 1, banklinecount: 1,
            }],
          };
        }
        if (/FROM journal_lines jl/.test(sql) || sql.includes("'bank_cash_account'::text AS referencetype") || /FROM pg_constraint/.test(sql)) {
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const [impact] = await inspectChartAccountReferences(client, 7, [account] as any);
    assert.equal(impact.deletable, false);
    assert.deepEqual(impact.blockingReferences[0], {
      type: "invalid_direct_ledger_relationship",
      count: 1,
      ids: [501],
    });
  });

  test("blocks Direct Ledger transactions with operational allocations", async () => {
    const client = {
      query: async (sql: string) => {
        if (/FROM bank_transactions bt/.test(sql)) {
          return { rows: [{
            id: 501, accountid: 41, bankcashaccountid: 11, journalentryid: 701,
            partytype: "ledger", allocationmethod: "direct_ledger", postingstatus: "posted",
            resolvedjournalid: 701, journalorganizationid: 7, journalsourcetype: "bank_transaction",
            journalsourceid: 501, journalstatus: "posted", journalisdeleted: false,
            targetlinecount: 1, banklinecount: 1, allocationcount: 1,
          }] };
        }
        if (/FROM journal_lines jl/.test(sql) || sql.includes("'bank_cash_account'::text AS referencetype") || /FROM pg_constraint/.test(sql)) {
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const [impact] = await inspectChartAccountReferences(client, 7, [lifecycleAccount(41)] as any);
    assert.equal(impact.deletable, false);
    assert.equal(impact.blockingReferences[0].type, "invalid_direct_ledger_relationship");
  });

  test("locks and rebuilds affected Cash/Bank accounts once in ascending order", async () => {
    const lockCalls: Array<{ sql: string; params?: any[] }> = [];
    const lockClient = {
      query: async (sql: string, params?: any[]) => {
        lockCalls.push({ sql, params });
        return { rows: [{ id: 11 }, { id: 12 }] };
      },
    };
    const locked = await lockLifecycleBankCashAccounts(lockClient, 7, [12, 11, 12]);
    assert.deepEqual(locked.map((account) => account.id), [11, 12]);
    assert.deepEqual(lockCalls[0].params, [7, [11, 12]]);
    assert.match(lockCalls[0].sql, /ORDER BY id ASC\s+FOR UPDATE/);

    const transactionReads: number[] = [];
    const rebuildClient = {
      query: async (sql: string, params?: any[]) => {
        if (/FROM bank_transactions/.test(sql)) transactionReads.push(Number(params?.[0]));
        return { rows: [] };
      },
    };
    const rebuilt = await rebuildLifecycleBankCashAccounts(
      rebuildClient,
      [
        { id: 12, openingbalance: 200, openingbalancedate: "2026-01-01", currentbalance: 250 },
        { id: 11, openingbalance: 100, openingbalancedate: "2026-01-01", currentbalance: 125 },
        { id: 12, openingbalance: 200, openingbalancedate: "2026-01-01", currentbalance: 250 },
      ],
      "admin@example.com",
      1_791_849_600
    );
    assert.deepEqual(transactionReads, [11, 12]);
    assert.deepEqual(rebuilt.map((item) => item.bankCashAccountId), [11, 12]);
    assert.deepEqual(rebuilt.map((item) => item.after), [100, 200]);
  });

  test("writes immutable lifecycle audit events in deterministic order", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const client = {
      query: async (sql: string, params?: any[]) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };
    await writeChartAccountLifecycleAuditEvents(
      client,
      7,
      "admin@example.com",
      [
        { entitytype: "finance_account", entityid: 42, action: "previewed" },
        { entitytype: "bank_cash_account", entityid: 12, action: "balance_rebuilt" },
        { entitytype: "finance_account", entityid: 41, action: "previewed" },
      ],
      1_791_849_600
    );
    assert.deepEqual(
      calls.map((call) => [call.params?.[1], call.params?.[2]]),
      [["bank_cash_account", 12], ["finance_account", 41], ["finance_account", 42]]
    );
    assert.ok(calls.every((call) => /INSERT INTO finance_audit_events/.test(call.sql)));
  });
});

const phase5Impact = (overrides: Record<string, unknown> = {}) => ({
  accountid: 41,
  accountcode: "EXP-041",
  accountname: "Office, Rent",
  status: "active",
  deletable: true,
  cascadeSafe: {
    bankTransactionIds: [501],
    journalEntryIds: [701],
    journalLineIds: [901, 902],
    bankCashAccountIds: [11],
  },
  blockingReferences: [],
  ...overrides,
});

describe("Chart of Accounts lifecycle Phase 5 deletion", () => {
  const tokenSecret = "phase-5-test-secret-with-at-least-32-characters";
  const epoch = 1_791_849_600;

  test("signs short-lived tokens and rejects tampering, expiry, and cross-organization use", () => {
    const impact = phase5Impact() as any;
    const token = signChartAccountDeletionToken({
      version: 1,
      organizationid: 7,
      actor: "admin@example.com",
      accountids: [41],
      deletableids: [41],
      fingerprint: fingerprintChartAccountDeletionImpact([impact]),
      accountfingerprints: { "41": fingerprintChartAccountDeletionImpact([impact]) },
      issuedat: epoch,
      expiresat: epoch + 300,
      nonce: "test-nonce",
    }, tokenSecret);
    assert.equal(verifyChartAccountDeletionToken(token, {
      organizationId: 7, actor: "admin@example.com", now: epoch, secret: tokenSecret,
    }).accountids[0], 41);
    assert.throws(
      () => verifyChartAccountDeletionToken(`${token.slice(0, -1)}x`, {
        organizationId: 7, actor: "admin@example.com", now: epoch, secret: tokenSecret,
      }),
      (error: any) => error.code === "CHART_ACCOUNT_DELETE_TOKEN_INVALID"
    );
    assert.throws(
      () => verifyChartAccountDeletionToken(token, {
        organizationId: 8, actor: "admin@example.com", now: epoch, secret: tokenSecret,
      }),
      (error: any) => error.code === "CHART_ACCOUNT_DELETE_TOKEN_CONTEXT_MISMATCH"
    );
    assert.throws(
      () => verifyChartAccountDeletionToken(token, {
        organizationId: 7, actor: "admin@example.com", now: epoch + 301, secret: tokenSecret,
      }),
      (error: any) => error.code === "CHART_ACCOUNT_DELETE_TOKEN_EXPIRED"
    );
  });

  test("previews deletable accounts and binds the signed token to that exact impact", async () => {
    const client = {
      query: async (sql: string) => {
        if (/FROM finance_accounts/.test(sql)) return { rows: [lifecycleAccount(41)] };
        if (/SELECT bt\.id, bt\.counterpartyaccountid AS accountid/.test(sql)) return { rows: [] };
        if (/SELECT jl\.id AS lineid/.test(sql)) return { rows: [] };
        if (sql.includes("'bank_cash_account'::text AS referencetype") || /FROM pg_constraint/.test(sql)) {
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const preview = await previewChartAccountDeletionWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      accountIds: [41],
      now: epoch,
      tokenSecret,
    });
    assert.deepEqual(preview.summary, {
      requested: 1,
      deletable: 1,
      blocked: 0,
      directledgertransactions: 0,
      affectedbankaccounts: 0,
    });
    assert.equal(preview.expiresat, epoch + 30 * 60);
    const payload = verifyChartAccountDeletionToken(preview.deletiontoken, {
      organizationId: 7,
      actor: "admin@example.com",
      now: epoch,
      secret: tokenSecret,
    });
    assert.deepEqual(payload.deletableids, [41]);
    assert.equal(payload.fingerprint, fingerprintChartAccountDeletionImpact(preview.accounts));
  });

  test("downloads a pre-delete CSV without mutating any finance data", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (/SELECT f\.\*/.test(sql)) {
          return { rows: [lifecycleAccount(41, { description: "Review first" })] };
        }
        if (/FROM finance_accounts/.test(sql)) return { rows: [lifecycleAccount(41)] };
        if (/SELECT bt\.id, bt\.counterpartyaccountid AS accountid/.test(sql)) return { rows: [] };
        if (/SELECT jl\.id AS lineid/.test(sql)) return { rows: [] };
        if (sql.includes("'bank_cash_account'::text AS referencetype") || /FROM pg_constraint/.test(sql)) {
          return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const preview = await previewChartAccountDeletionWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      accountIds: [41],
      now: epoch,
      tokenSecret,
    });
    const result = await exportChartAccountDeletionPreviewWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      deletionToken: preview.deletiontoken,
      epoch,
      tokenSecret,
    });

    assert.match(result.filename, /^\d{12}-chart-of-accounts-delete-preview\.csv$/);
    assert.match(result.csv, /preview_deletable/);
    assert.match(result.csv, /Review first/);
    assert.equal(calls.some((sql) => /\b(?:UPDATE|DELETE|INSERT)\b/i.test(sql)), false);
  });

  test("skips an account whose state changed after preview without blocking the batch", async () => {
    const previewImpact = phase5Impact({
      accountcode: "ACCOUNT-41",
      accountname: "Account 41",
      cascadeSafe: { bankTransactionIds: [], journalEntryIds: [], journalLineIds: [], bankCashAccountIds: [] },
    }) as any;
    const token = signChartAccountDeletionToken({
      version: 1,
      organizationid: 7,
      actor: "admin@example.com",
      accountids: [41],
      deletableids: [41],
      fingerprint: fingerprintChartAccountDeletionImpact([previewImpact]),
      accountfingerprints: { "41": fingerprintChartAccountDeletionImpact([previewImpact]) },
      issuedat: epoch,
      expiresat: epoch + 300,
      nonce: "stale-test",
    }, tokenSecret);
    const client = {
      query: async (sql: string) => {
        if (/FROM finance_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [lifecycleAccount(41, { status: "inactive" })] };
        }
        if (/SELECT bt\.id, bt\.counterpartyaccountid AS accountid/.test(sql)) return { rows: [] };
        if (/SELECT jl\.id AS lineid/.test(sql)) return { rows: [] };
        if (sql.includes("'bank_cash_account'::text AS referencetype") || /FROM pg_constraint/.test(sql)) {
          return { rows: [] };
        }
        if (/SELECT f\.\*/.test(sql)) {
          return { rows: [lifecycleAccount(41, { status: "inactive" })] };
        }
        if (/INSERT INTO finance_audit_events/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const result = await deleteChartAccountsWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      deletionToken: token,
      epoch,
      tokenSecret,
    });
    assert.equal(result.summary.deleted, 0);
    assert.equal(result.summary.blocked, 0);
    assert.equal(result.summary.skipped, 1);
    assert.match(result.csv, /skipped/);
  });

  test("soft deletes eligible data, rebuilds balances, audits, and returns the pre-delete CSV", async () => {
    const impact = phase5Impact() as any;
    const token = signChartAccountDeletionToken({
      version: 1,
      organizationid: 7,
      actor: "admin@example.com",
      accountids: [41],
      deletableids: [41],
      fingerprint: fingerprintChartAccountDeletionImpact([impact]),
      accountfingerprints: { "41": fingerprintChartAccountDeletionImpact([impact]) },
      issuedat: epoch,
      expiresat: epoch + 300,
      nonce: "delete-test",
    }, tokenSecret);
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const client = {
      query: async (sql: string, params?: any[]) => {
        calls.push({ sql, params });
        if (/FROM finance_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [lifecycleAccount(41, { accountcode: "EXP-041", accountname: "Office, Rent" })] };
        }
        if (/SELECT bt\.id, bt\.counterpartyaccountid AS accountid/.test(sql)) {
          return { rows: [{
            id: 501, accountid: 41, bankcashaccountid: 11, journalentryid: 701,
            partytype: "ledger", allocationmethod: "direct_ledger", postingstatus: "posted",
            resolvedjournalid: 701, journalorganizationid: 7, journalsourcetype: "bank_transaction",
            journalsourceid: 501, journalstatus: "posted", journalisdeleted: false,
            targetlinecount: 1, banklinecount: 1, allocationcount: 0,
          }] };
        }
        if (/SELECT id AS lineid, journalentryid/.test(sql)) {
          return { rows: [{ lineid: 901, journalentryid: 701 }, { lineid: 902, journalentryid: 701 }] };
        }
        if (/SELECT jl\.id AS lineid/.test(sql)) {
          return { rows: [{ lineid: 902, accountid: 41, journalentryid: 701, sourcetype: "bank_transaction" }] };
        }
        if (sql.includes("'bank_cash_account'::text AS referencetype") || /FROM pg_constraint/.test(sql)) {
          return { rows: [] };
        }
        if (/FROM bank_cash_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [{
            id: 11, organizationid: 7, accountname: "HDFC", accounttype: "bank",
            openingbalance: 10_000, openingbalancedate: "2026-01-01", currentbalance: 7_000,
          }] };
        }
        if (/SELECT f\.\*/.test(sql)) {
          return { rows: [{
            ...lifecycleAccount(41, { accountcode: "EXP-041", accountname: "Office, Rent" }),
            currencycode: "INR", description: "Monthly rent", createdby: "admin@example.com",
            createddate: epoch - 100, totaldebit: 3_000, totalcredit: 0,
          }] };
        }
        if (/SELECT bt\.\*, bca\.accountname/.test(sql)) {
          return { rows: [{
            id: 501, counterpartyaccountid: 41, bankcashaccountid: 11, journalentryid: 701,
            transactionnumber: "BT-00000501", transactiondate: "2026-09-03", entryside: "credit",
            amount: 3_000, balanceafter: 7_000, allocationmethod: "direct_ledger",
            bankcashaccountname: "HDFC", bankcashaccounttype: "bank", entryname: "September rent",
            createdby: "admin@example.com", createddate: epoch - 50,
          }] };
        }
        if (/SELECT \* FROM journal_entries/.test(sql)) {
          return { rows: [{
            id: 701, journalnumber: "JE-00000701", sourcetype: "bank_transaction",
            status: "posted", description: "September rent", createdby: "admin@example.com",
            postedby: "admin@example.com", createddate: epoch - 50, posteddate: epoch - 50,
          }] };
        }
        if (/SELECT \* FROM journal_lines/.test(sql)) {
          return { rows: [
            { id: 901, journalentryid: 701, financeaccountid: 11, debitamount: 0, creditamount: 3_000, description: "Bank" },
            { id: 902, journalentryid: 701, financeaccountid: 41, debitamount: 3_000, creditamount: 0, description: "Rent, \"September\"" },
          ] };
        }
        if (/UPDATE bank_transactions[\s\S]*isdeleted = TRUE/.test(sql)) return { rows: [{ id: 501 }] };
        if (/UPDATE journal_entries[\s\S]*isdeleted = TRUE/.test(sql)) return { rows: [{ id: 701 }] };
        if (/UPDATE finance_accounts[\s\S]*isdeleted = TRUE/.test(sql)) return { rows: [{ id: 41 }] };
        if (/FROM bank_transactions\s+WHERE bankcashaccountid/.test(sql)) return { rows: [] };
        if (/UPDATE bank_cash_accounts/.test(sql) || /INSERT INTO finance_audit_events/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const result = await deleteChartAccountsWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      deletionToken: token,
      reason: "Duplicate ledger",
      epoch,
      tokenSecret,
    });
    assert.equal(result.summary.deleted, 1);
    assert.equal(result.summary.transactionsdeleted, 1);
    assert.equal(result.summary.journalsdeleted, 1);
    assert.equal(result.summary.bankaccountsrebuilt, 1);
    assert.match(result.filename, /^\d{12}-chart-of-accounts-delete-result\.csv$/);
    assert.ok(result.csv.startsWith("\uFEFFdeletionbatchid,"));
    assert.match(result.csv, /Office, Rent/);
    assert.ok(result.csv.includes('"Rent, ""September"""'));
    assert.ok(calls.some((call) => /UPDATE finance_accounts[\s\S]*isdeleted = TRUE/.test(call.sql)));
    assert.ok(calls.some((call) => call.params?.[3] === "chart_account_deleted"));
    const bankUpdate = calls.find((call) => /UPDATE bank_cash_accounts/.test(call.sql));
    assert.equal(bankUpdate?.params?.[0], 10_000);
  });

  test("produces standards-compliant blocked CSV rows without losing commas or line breaks", () => {
    const csv = buildChartAccountDeletionCsv({
      deletionBatchId: "batch-1",
      actor: "admin@example.com",
      epoch,
      impacts: [phase5Impact({
        deletable: false,
        blockingReferences: [{ type: "manual_journal", count: 1, detail: "line, one\nline two" }],
        cascadeSafe: { bankTransactionIds: [], journalEntryIds: [], journalLineIds: [], bankCashAccountIds: [] },
      }) as any],
      snapshot: { accounts: [lifecycleAccount(41, { accountname: "Office, Rent" })], bankTransactions: [], journalEntries: [], journalLines: [] },
      rebuiltAccounts: [],
    });
    assert.ok(csv.startsWith("\uFEFF"));
    assert.match(csv, /"manual_journal: line, one\nline two \(1\)"/);
    assert.match(csv, /blocked/);
  });

  test("publishes preview and confirmed-delete contracts behind delete permission", () => {
    assert.deepEqual(chartAccountDeletePreviewSchema.required, ["accountids"]);
    assert.deepEqual(chartAccountDeleteExportSchema.required, ["deletiontoken"]);
    assert.deepEqual(chartAccountBulkDeleteSchema.required, ["deletiontoken"]);
    const routes = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
    assert.match(routes, /\/finance\/chart-of-accounts\/delete-preview/);
    assert.match(routes, /\/finance\/chart-of-accounts\/delete-preview-csv/);
    assert.match(routes, /\/finance\/chart-of-accounts\/bulk-delete/);
    assert.equal(
      routes.match(/requireFinancePermission\('delete', 'chart_of_accounts'\)/g)?.length,
      3
    );
  });
});

const directLedgerLifecycleRow = (overrides: Record<string, unknown> = {}) => ({
  id: 501,
  organizationid: 7,
  counterpartyaccountid: 41,
  deactivatedbychartaccountid: null,
  bankcashaccountid: 11,
  journalentryid: 701,
  partytype: "ledger",
  allocationmethod: "direct_ledger",
  postingstatus: "posted",
  isdeleted: false,
  resolvedjournalid: 701,
  journalorganizationid: 7,
  journalsourcetype: "bank_transaction",
  journalsourceid: 501,
  journalstatus: "posted",
  journalisdeleted: false,
  journaldeactivatedbychartaccountid: null,
  targetlinecount: 1,
  banklinecount: 1,
  ...overrides,
});

describe("Chart of Accounts lifecycle Phase 4 status transitions", () => {
  test("keeps Direct Ledger posting and lifecycle changes on the same COA-before-Bank lock order", () => {
    const financeAccountSource = readFileSync(
      new URL("../services/financeAccount.service.ts", import.meta.url),
      "utf8"
    );
    const directLedgerStart = financeAccountSource.indexOf(
      "export const postDirectLedgerTransaction"
    );
    const directLedgerEnd = financeAccountSource.indexOf(
      "export const listBankTransactions",
      directLedgerStart
    );
    const directLedgerSource = financeAccountSource.slice(
      directLedgerStart,
      directLedgerEnd
    );
    const chartAccountLock = directLedgerSource.indexOf("FROM finance_accounts");
    const bankAccountLock = directLedgerSource.indexOf("FROM bank_cash_accounts");

    assert.ok(chartAccountLock >= 0, "Direct Ledger must lock its Chart Account");
    assert.ok(bankAccountLock >= 0, "Direct Ledger must lock its Cash/Bank account");
    assert.ok(
      chartAccountLock < bankAccountLock,
      "Direct Ledger must lock the Chart Account before the Cash/Bank account"
    );
    assert.match(
      directLedgerSource.slice(chartAccountLock, bankAccountLock),
      /FOR UPDATE/
    );
    assert.match(directLedgerSource.slice(bankAccountLock), /FOR UPDATE OF b/);

    const lifecycleSource = readFileSync(
      new URL("../services/chartAccountLifecycle.service.ts", import.meta.url),
      "utf8"
    );
    const statusStart = lifecycleSource.indexOf(
      "export const changeChartAccountStatusWithClient"
    );
    const statusEnd = lifecycleSource.indexOf(
      "type ChartAccountDeletionSnapshot",
      statusStart
    );
    const statusSource = lifecycleSource.slice(statusStart, statusEnd);
    assert.ok(
      statusSource.indexOf("lockEligibleChartAccounts") <
        statusSource.indexOf("lockLifecycleBankCashAccounts"),
      "Lifecycle status changes must lock Chart Accounts before Cash/Bank accounts"
    );
  });

  test("deactivates Direct Ledger postings and rebuilds the affected Bank account", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const client = {
      query: async (sql: string, params?: any[]) => {
        calls.push({ sql, params });
        if (/FROM finance_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [lifecycleAccount(41)] };
        }
        if (/FROM bank_transactions bt/.test(sql)) {
          return { rows: [directLedgerLifecycleRow()] };
        }
        if (/FROM bank_cash_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return {
            rows: [{
              id: 11,
              organizationid: 7,
              openingbalance: 10_000,
              openingbalancedate: "2026-01-01",
              currentbalance: 7_000,
            }],
          };
        }
        if (/UPDATE finance_accounts/.test(sql)) return { rows: [{ id: 41 }] };
        if (/UPDATE bank_transactions[\s\S]*postingstatus = 'inactive'/.test(sql)) {
          return { rows: [{ id: 501 }] };
        }
        if (/UPDATE journal_entries/.test(sql)) return { rows: [{ id: 701 }] };
        if (/FROM bank_transactions\s+WHERE bankcashaccountid/.test(sql)) return { rows: [] };
        if (/UPDATE bank_cash_accounts/.test(sql)) return { rows: [] };
        if (/INSERT INTO finance_audit_events/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const result = await changeChartAccountStatusWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      accountIds: [41],
      status: "inactive",
      reason: "Duplicate account",
      epoch: 1_791_849_600,
    });

    assert.deepEqual(
      {
        status: result.status,
        changed: result.changed,
        transactionsaffected: result.transactionsaffected,
        journalsaffected: result.journalsaffected,
        bankaccountsrebuilt: result.bankaccountsrebuilt,
      },
      {
        status: "inactive",
        changed: 1,
        transactionsaffected: 1,
        journalsaffected: 1,
        bankaccountsrebuilt: 1,
      }
    );
    const transactionUpdate = calls.find((call) =>
      /UPDATE bank_transactions[\s\S]*postingstatus = 'inactive'/.test(call.sql)
    );
    assert.ok(transactionUpdate);
    assert.match(transactionUpdate.sql, /deactivatedbychartaccountid = counterpartyaccountid/);
    const bankUpdate = calls.find((call) => /UPDATE bank_cash_accounts/.test(call.sql));
    assert.equal(bankUpdate?.params?.[0], 10_000);
  });

  test("reactivates only records owned by the Chart Account lifecycle", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const lifecycleRow = directLedgerLifecycleRow({
      deactivatedbychartaccountid: 41,
      postingstatus: "inactive",
      journalstatus: "inactive",
      journaldeactivatedbychartaccountid: 41,
    });
    const client = {
      query: async (sql: string, params?: any[]) => {
        calls.push({ sql, params });
        if (/FROM finance_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [lifecycleAccount(41, { status: "inactive" })] };
        }
        if (/FROM bank_transactions bt/.test(sql)) return { rows: [lifecycleRow] };
        if (/FROM journal_entries/.test(sql)) return { rows: [{ id: 701 }] };
        if (/FROM bank_cash_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return {
            rows: [{
              id: 11,
              organizationid: 7,
              openingbalance: 10_000,
              openingbalancedate: "2026-01-01",
              currentbalance: 10_000,
            }],
          };
        }
        if (/UPDATE finance_accounts/.test(sql)) return { rows: [{ id: 41 }] };
        if (/UPDATE bank_transactions[\s\S]*postingstatus = 'posted'/.test(sql)) {
          return { rows: [{ id: 501 }] };
        }
        if (/UPDATE journal_entries/.test(sql)) return { rows: [{ id: 701 }] };
        if (/FROM bank_transactions\s+WHERE bankcashaccountid/.test(sql)) {
          return {
            rows: [{
              id: 501,
              transactiondate: "2026-09-03",
              entryside: "credit",
              amount: 3_000,
            }],
          };
        }
        if (/UPDATE bank_transactions SET balanceafter/.test(sql)) return { rows: [] };
        if (/UPDATE bank_cash_accounts/.test(sql)) return { rows: [] };
        if (/INSERT INTO finance_audit_events/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const result = await changeChartAccountStatusWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      accountIds: [41],
      status: "active",
      epoch: 1_791_849_600,
    });

    assert.equal(result.changed, 1);
    assert.equal(result.transactionsaffected, 1);
    const lifecycleRead = calls.find((call) => /FROM bank_transactions bt/.test(call.sql));
    assert.match(lifecycleRead?.sql || "", /bt\.deactivatedbychartaccountid = ANY/);
    const transactionUpdate = calls.find((call) =>
      /UPDATE bank_transactions[\s\S]*postingstatus = 'posted'/.test(call.sql)
    );
    assert.match(transactionUpdate?.sql || "", /deactivatedbychartaccountid = NULL/);
    const bankUpdate = calls.find((call) => /UPDATE bank_cash_accounts/.test(call.sql));
    assert.equal(bankUpdate?.params?.[0], 7_000);
  });

  test("does not restore independently inactive or reversed records", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (/FROM finance_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [lifecycleAccount(41, { status: "inactive" })] };
        }
        if (/FROM bank_transactions bt/.test(sql) || /FROM journal_entries/.test(sql)) {
          return { rows: [] };
        }
        if (/UPDATE finance_accounts/.test(sql)) return { rows: [{ id: 41 }] };
        if (/INSERT INTO finance_audit_events/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const result = await changeChartAccountStatusWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      accountIds: [41],
      status: "active",
    });
    assert.equal(result.transactionsaffected, 0);
    assert.equal(result.bankaccountsrebuilt, 0);
    assert.equal(calls.some((sql) => /SET postingstatus = 'posted'/.test(sql)), false);
  });

  test("treats a repeated status request as an idempotent no-op", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (/FROM finance_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [lifecycleAccount(41, { status: "inactive" })] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const result = await changeChartAccountStatusWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      accountIds: [41],
      status: "inactive",
    });
    assert.equal(result.changed, 0);
    assert.equal(result.unchanged, 1);
    assert.equal(calls.length, 1);
  });

  test("processes a bulk status change in sorted order and records its completion", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const client = {
      query: async (sql: string, params?: any[]) => {
        calls.push({ sql, params });
        if (/FROM finance_accounts[\s\S]*FOR UPDATE/.test(sql)) {
          return { rows: [lifecycleAccount(41), lifecycleAccount(42)] };
        }
        if (/FROM bank_transactions bt/.test(sql)) return { rows: [] };
        if (/UPDATE finance_accounts/.test(sql)) {
          return { rows: [{ id: 41 }, { id: 42 }] };
        }
        if (/INSERT INTO finance_audit_events/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };

    const result = await changeChartAccountStatusWithClient(client, {
      organizationId: 7,
      actor: "admin@example.com",
      accountIds: [42, 41],
      status: "inactive",
    });
    assert.equal(result.changed, 2);
    assert.deepEqual(result.accounts.map((account) => account.accountid), [41, 42]);
    assert.deepEqual(calls[0].params, [7, [41, 42]]);
    assert.ok(
      calls.some(
        (call) =>
          /INSERT INTO finance_audit_events/.test(call.sql) &&
          call.params?.[3] === "chart_account_bulk_status_completed"
      )
    );
  });

  test("publishes strict single and bulk API contracts with edit permission", () => {
    assert.deepEqual(chartAccountStatusSchema.required, ["status"]);
    assert.deepEqual(bulkChartAccountStatusSchema.required, ["accountids", "status"]);
    assert.equal(bulkChartAccountStatusSchema.properties.accountids.maxItems, 200);
    const routes = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
    assert.match(routes, /\/finance\/chart-of-accounts\/:accountId\/status/);
    assert.match(routes, /\/finance\/chart-of-accounts\/bulk-status/);
    assert.ok(
      routes.match(/requireFinancePermission\('edit', 'chart_of_accounts'\)/g)?.length! >= 3
    );
  });
});
