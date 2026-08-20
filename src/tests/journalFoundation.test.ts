import assert from "node:assert/strict";
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

describe("Journal Phase 4 foundation", () => {
  test("defines create and optimistic-concurrency update contracts", () => {
    assert.deepEqual(createJournalDraftSchema.required, [
      "entrydate",
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
    assert.equal(draft.journalpurpose, "general");
    assert.equal(draft.relatedjournalentryid, null);
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

  test("allows an unbalanced Draft without treating it as posted", () => {
    const draft = normalizeJournalDraft({
      entrydate: "2026-08-17",
      description: "Work in progress",
      lines: [
        { financeaccountid: 11, debitamount: 100, creditamount: 0 },
        { financeaccountid: 12, debitamount: 0, creditamount: 75 },
      ],
    });
    assert.equal(draft.difference, 25);
  });

  test("rejects invalid line sides and over-precision money", () => {
    const base = {
      entrydate: "2026-08-17",
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

  test("grants full Journal capability only to Admin and Accountant roles", async () => {
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
    await requireJournalPermission("read")(
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
});
