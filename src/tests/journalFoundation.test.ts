import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  createJournalDraftSchema,
  postJournalSchema,
  reverseJournalSchema,
  updateJournalDraftSchema,
} from "../schemas/finance.schema.js";
import {
  formatJournalNumber,
  normalizeJournalDraft,
  normalizeJournalReversal,
} from "../utils/finance/journal.utils.js";
import { FinanceValidationError } from "../utils/finance/finance.utils.js";
import { requireJournalPermission } from "../services/financeAccess.service.js";
import pool from "../database/postgres.js";
import { deriveCustomerPaymentStatus } from "../utils/finance/customerStatement.utils.js";
import { accessScopeService } from "../services/accessScope.service.js";
import { isValidJournalAttachmentContent } from "../services/journal.service.js";

describe("Journal Phase 4 foundation", () => {
  test("defines create and optimistic-concurrency update contracts", () => {
    assert.deepEqual(createJournalDraftSchema.required, [
      "entrydate",
      "journalpurpose",
      "description",
      "lines",
    ]);
    assert.ok(updateJournalDraftSchema.required.includes("version"));
    assert.deepEqual(postJournalSchema.required, ["version"]);
    assert.deepEqual(reverseJournalSchema.required, [
      "version",
      "reversaldate",
      "reason",
    ]);
  });

  test("normalizes a balanced two-line draft in stable line order", () => {
    const draft = normalizeJournalDraft({
      entrydate: "2026-08-17",
      journalpurpose: "accrual",
      reference: "ACCRUAL-AUG",
      description: "August salary accrual",
      lines: [
        { financeaccountid: 11, debitamount: 30000, creditamount: 0 },
        { financeaccountid: 12, debitamount: 0, creditamount: 30000 },
      ],
    });
    assert.equal(draft.totaldebit, 30000);
    assert.equal(draft.totalcredit, 30000);
    assert.equal(draft.difference, 0);
    assert.deepEqual(draft.lines.map((line) => line.lineorder), [1, 2]);
    assert.equal(draft.journalpurpose, "accrual");
    assert.equal(draft.relatedjournalentryid, null);
  });

  test("requires an explicit Journal purpose instead of silently defaulting", () => {
    assert.throws(
      () => normalizeJournalDraft({
        entrydate: "2026-10-21",
        description: "Missing purpose",
        lines: [
          { financeaccountid: 11, debitamount: 100, creditamount: 0 },
          { financeaccountid: 12, debitamount: 0, creditamount: 100 },
        ],
      }),
      (error: unknown) =>
        error instanceof FinanceValidationError &&
        error.message === "journalpurpose is required."
    );
  });

  test("normalizes optional customer and supplier contacts on Journal lines", () => {
    const draft = normalizeJournalDraft({
      entrydate: "2026-10-20",
      journalpurpose: "general",
      description: "Party-linked control account adjustment",
      lines: [
        { financeaccountid: 11, partytype: "customer", partyid: 41, debitamount: 250, creditamount: 0 },
        { financeaccountid: 12, debitamount: 0, creditamount: 250 },
      ],
    });
    assert.equal(draft.lines[0].partytype, "customer");
    assert.equal(draft.lines[0].partyid, 41);
    assert.equal(draft.lines[1].partytype, null);
    assert.equal(draft.lines[1].partyid, null);
    assert.throws(
      () => normalizeJournalDraft({
        entrydate: "2026-10-20",
        journalpurpose: "general",
        description: "Incomplete Contact",
        lines: [
          { financeaccountid: 11, partytype: "customer", debitamount: 250, creditamount: 0 },
          { financeaccountid: 12, debitamount: 0, creditamount: 250 },
        ],
      }),
      FinanceValidationError
    );
  });

  test("requires a structured related entry for reclassification and correction", () => {
    const lines = [
      { financeaccountid: 11, debitamount: 10000, creditamount: 0 },
      { financeaccountid: 12, debitamount: 0, creditamount: 10000 },
    ];
    const draft = normalizeJournalDraft({
      entrydate: "2026-08-18",
      journalpurpose: "reclassification",
      relatedjournalentryid: 72,
      description: "Move Rent to Salary Expenses",
      lines,
    });
    assert.equal(draft.journalpurpose, "reclassification");
    assert.equal(draft.relatedjournalentryid, 72);
    assert.throws(
      () => normalizeJournalDraft({
        entrydate: "2026-08-18",
        journalpurpose: "correction",
        description: "Missing source",
        lines,
      }),
      FinanceValidationError
    );
  });

  test("rejects an unbalanced Draft before it can be saved", () => {
    assert.throws(() => normalizeJournalDraft({
        entrydate: "2026-08-17",
        journalpurpose: "accrual",
        description: "Work in progress",
        lines: [
          { financeaccountid: 11, debitamount: 100, creditamount: 0 },
          { financeaccountid: 12, debitamount: 0, creditamount: 75 },
        ],
      }),
      (error: unknown) =>
        error instanceof FinanceValidationError &&
        error.code === "JOURNAL_NOT_BALANCED"
    );
  });

  test("rejects invalid line sides and over-precision money", () => {
    const base = {
      entrydate: "2026-08-17",
      journalpurpose: "general",
      description: "Invalid draft",
    };
    assert.throws(
      () => normalizeJournalDraft({
        ...base,
        lines: [
          { financeaccountid: 11, debitamount: 100, creditamount: 10 },
          { financeaccountid: 12, debitamount: 0, creditamount: 90 },
        ],
      }),
      FinanceValidationError
    );
    assert.throws(
      () => normalizeJournalDraft({
        ...base,
        lines: [
          { financeaccountid: 11, debitamount: 100.001, creditamount: 0 },
          { financeaccountid: 12, debitamount: 0, creditamount: 100 },
        ],
      }),
      FinanceValidationError
    );
  });

  test("formats Journal numbers using the existing finance convention", () => {
    assert.equal(formatJournalNumber(42), "JE-00000042");
  });

  test("normalizes a dated Journal reversal reason", () => {
    assert.deepEqual(
      normalizeJournalReversal({
        reversaldate: "2026-08-18",
        reason: "  Incorrect expense classification  ",
      }),
      {
        reversaldate: "2026-08-18",
        reason: "Incorrect expense classification",
      }
    );
    assert.throws(
      () => normalizeJournalReversal({ reversaldate: "2026-08-18", reason: " " }),
      FinanceValidationError
    );
  });

  test("uses the explicit Journal permission for every role", async (t) => {
    const grants: Record<string, Record<string, boolean>> = {
      admin: { read: true, reverse: true },
      accountant: { read: true, reverse: true },
      viewer: { read: true, reverse: false },
    };
    t.mock.method(pool, "query", async (_sql: string, params: string[]) => ({
      rows: grants[params[0]] ? [{ permissions: grants[params[0]] }] : [],
    }));

    for (const role of ["admin", "accountant"]) {
      let replyUsed = false;
      await requireJournalPermission("reverse")(
        { session: { role } },
        {
          status: () => {
            replyUsed = true;
            return { send: () => undefined };
          },
        }
      );
      assert.equal(replyUsed, false);
    }

    let deniedStatus = 0;
    let deniedPayload: any;
    await requireJournalPermission("reverse")(
      { session: { role: "viewer" } },
      {
        status: (status: number) => {
          deniedStatus = status;
          return {
            send: (payload: any) => {
              deniedPayload = payload;
            },
          };
        },
      }
    );
    assert.equal(deniedStatus, 403);
    assert.equal(deniedPayload.error.code, "JOURNAL_ACCESS_DENIED");

    const readReply = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      send() { return this; },
    };
    await requireJournalPermission("read")(
      { session: { role: "viewer" } },
      readReply,
    );
    assert.equal(readReply.statusCode, 200);
  });

  test("allows accrual and general entries without a related entry", () => {
    const accrual = normalizeJournalDraft({
      entrydate: "2026-08-20",
      description: "Salary expense accrual before bank payment",
      journalpurpose: "accrual",
      lines: [
        { financeaccountid: 101, debitamount: 100000, creditamount: 0 },
        { financeaccountid: 102, debitamount: 0, creditamount: 100000 },
      ],
    });
    assert.equal(accrual.journalpurpose, "accrual");
    assert.equal(accrual.relatedjournalentryid, null);
    assert.equal(accrual.totaldebit, 100000);
    assert.equal(accrual.totalcredit, 100000);
    assert.equal(accrual.difference, 0);

    const general = normalizeJournalDraft({
      entrydate: "2026-08-20",
      description: "Non-cash asset adjustment",
      journalpurpose: "general",
      lines: [
        { financeaccountid: 201, debitamount: 5000, creditamount: 0 },
        { financeaccountid: 202, debitamount: 0, creditamount: 5000 },
      ],
    });
    assert.equal(general.journalpurpose, "general");
    assert.equal(general.relatedjournalentryid, null);
  });

  test("rejects negative amounts, empty lines, and lines without accounts", () => {
    assert.throws(
      () => normalizeJournalDraft({
        entrydate: "2026-08-20",
        description: "Negative amount test",
        lines: [
          { financeaccountid: 101, debitamount: -100, creditamount: 0 },
          { financeaccountid: 102, debitamount: 0, creditamount: 100 },
        ],
      }),
      FinanceValidationError
    );

    assert.throws(
      () => normalizeJournalDraft({
        entrydate: "2026-08-20",
        description: "Missing account test",
        lines: [
          { debitamount: 100, creditamount: 0 },
          { financeaccountid: 102, debitamount: 0, creditamount: 100 },
        ],
      }),
      FinanceValidationError
    );
  });

  test("uses adjusted balances for Paid, Pending, and credit-balance statuses", () => {
    assert.equal(deriveCustomerPaymentStatus({ invoiceCount: 0, invoiceAmount: 0, adjustedBalance: 0 }), "no_invoices");
    assert.equal(deriveCustomerPaymentStatus({ invoiceCount: 1, invoiceAmount: 1180, adjustedBalance: 0 }), "paid");
    assert.equal(deriveCustomerPaymentStatus({ invoiceCount: 1, invoiceAmount: 1180, adjustedBalance: -100 }), "paid");
    assert.equal(deriveCustomerPaymentStatus({ invoiceCount: 1, invoiceAmount: 1180, adjustedBalance: 500 }), "partially_paid");
    assert.equal(deriveCustomerPaymentStatus({ invoiceCount: 1, invoiceAmount: 1180, adjustedBalance: 1180 }), "pending");
  });

  test("keeps Journal uploads and customer document reads behind hardened contracts", () => {
    const routes = readFileSync(new URL("../routes/routes.ts", import.meta.url), "utf8");
    const journalService = readFileSync(new URL("../services/journal.service.ts", import.meta.url), "utf8");
    const statementService = readFileSync(new URL("../services/customerStatement.service.ts", import.meta.url), "utf8");
    assert.match(routes, /journalAttachmentUpload/);
    assert.doesNotMatch(journalService, /request\.headers\?\.host/);
    assert.match(journalService, /isValidJournalAttachmentContent/);
    assert.match(journalService, /canVendorAccessCustomer\(request, customerId\)/);
    assert.match(statementService, /canVendorAccessCustomer\(request, customerId\)/);
    assert.match(statementService, /FINANCE_INVOICE_NOT_FOUND/);
  });

  test("validates Journal attachment bytes instead of trusting the filename", () => {
    assert.equal(isValidJournalAttachmentContent(Buffer.from("%PDF-1.7\n"), ".pdf"), true);
    assert.equal(isValidJournalAttachmentContent(Buffer.from("not a pdf"), ".pdf"), false);
    assert.equal(isValidJournalAttachmentContent(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ".png"), true);
    assert.equal(isValidJournalAttachmentContent(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), ".png"), false);
    assert.equal(isValidJournalAttachmentContent(Buffer.from("Account,Debit,Credit\nCash,100,0"), ".csv"), true);
    assert.equal(isValidJournalAttachmentContent(Buffer.from([0x00, 0x01, 0x02]), ".csv"), false);
  });

  test("preserves unrestricted customer access for Admin and Accountant roles", async () => {
    assert.equal(await accessScopeService.canVendorAccessCustomer({ session: { role: "Admin", id: 1 } }, 999), true);
    assert.equal(await accessScopeService.canVendorAccessCustomer({ session: { role: "Accountant", id: 2 } }, 999), true);
    for (const role of ["Admin", "Accountant"]) {
      const whereClauses: string[] = [];
      const queryParams: any[] = [];
      const nextIndex = await accessScopeService.appendVendorBusinessCustomerScope(
        { session: { role, id: 1 } }, whereClauses, queryParams, 1
      );
      assert.equal(nextIndex, 1);
      assert.deepEqual(whereClauses, []);
      assert.deepEqual(queryParams, []);
    }
  });
});
