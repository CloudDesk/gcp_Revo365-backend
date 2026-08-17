import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createJournalDraftSchema,
  updateJournalDraftSchema,
} from "../schemas/finance.schema.js";
import {
  formatJournalNumber,
  normalizeJournalDraft,
} from "../utils/finance/journal.utils.js";
import { FinanceValidationError } from "../utils/finance/finance.utils.js";

describe("Journal Phase 4 foundation", () => {
  test("defines create and optimistic-concurrency update contracts", () => {
    assert.deepEqual(createJournalDraftSchema.required, [
      "entrydate",
      "description",
      "lines",
    ]);
    assert.ok(updateJournalDraftSchema.required.includes("version"));
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
});
