import {
  FinanceValidationError,
  requireIsoDate,
} from "./finance.utils.js";

export const MANUAL_JOURNAL_SOURCE = "manual_journal";
export const MANUAL_JOURNAL_REVERSAL_SOURCE = "manual_journal_reversal";

export type NormalizedJournalLine = {
  financeaccountid: number;
  description: string | null;
  debitamount: number;
  creditamount: number;
  lineorder: number;
};

export type NormalizedJournalDraft = {
  entrydate: string;
  reference: string | null;
  description: string;
  journalpurpose: "general" | "accrual" | "reclassification" | "correction";
  relatedjournalentryid: number | null;
  lines: NormalizedJournalLine[];
  totaldebit: number;
  totalcredit: number;
  difference: number;
};

const normalizeText = (
  value: unknown,
  fieldName: string,
  required: boolean,
  maxLength: number
) => {
  const normalized = value == null ? "" : String(value).trim();
  if (required && !normalized) {
    throw new FinanceValidationError(`${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new FinanceValidationError(
      `${fieldName} must not exceed ${maxLength} characters.`
    );
  }
  return normalized || null;
};

const requireJournalMoney = (value: unknown, fieldName: string) => {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new FinanceValidationError(`${fieldName} must be zero or greater.`);
  }
  const cents = Math.round(parsed * 100);
  if (Math.abs(parsed * 100 - cents) > 1e-8) {
    throw new FinanceValidationError(
      `${fieldName} must not contain more than two decimal places.`
    );
  }
  return cents / 100;
};

export const normalizeJournalDraft = (
  payload: any
): NormalizedJournalDraft => {
  const entrydate = requireIsoDate(payload?.entrydate, "entrydate");
  const reference = normalizeText(payload?.reference, "reference", false, 255);
  const description = normalizeText(
    payload?.description,
    "description",
    true,
    2000
  )!;
  const journalpurpose = String(payload?.journalpurpose || "general") as NormalizedJournalDraft["journalpurpose"];
  if (!["general", "accrual", "reclassification", "correction"].includes(journalpurpose)) {
    throw new FinanceValidationError(
      "journalpurpose must be general, accrual, reclassification, or correction."
    );
  }
  const submittedRelatedId = payload?.relatedjournalentryid;
  const relatedjournalentryid = submittedRelatedId == null || submittedRelatedId === ""
    ? null
    : Number(submittedRelatedId);
  if (relatedjournalentryid !== null && (!Number.isSafeInteger(relatedjournalentryid) || relatedjournalentryid <= 0)) {
    throw new FinanceValidationError("relatedjournalentryid must be a positive integer.");
  }
  if (["reclassification", "correction"].includes(journalpurpose) && relatedjournalentryid === null) {
    throw new FinanceValidationError(
      "A related posted accounting entry is required for reclassification or correction."
    );
  }
  const submittedLines = Array.isArray(payload?.lines) ? payload.lines : [];
  if (submittedLines.length < 2) {
    throw new FinanceValidationError("At least two Journal lines are required.");
  }
  if (submittedLines.length > 100) {
    throw new FinanceValidationError("A Journal cannot contain more than 100 lines.");
  }

  let totalDebitCents = 0;
  let totalCreditCents = 0;
  const lines = submittedLines.map((line: any, index: number) => {
    const financeaccountid = Number(line?.financeaccountid);
    if (!Number.isSafeInteger(financeaccountid) || financeaccountid <= 0) {
      throw new FinanceValidationError(
        `A valid Account is required for Journal line ${index + 1}.`
      );
    }
    const debitamount = requireJournalMoney(
      line?.debitamount,
      `Debit on Journal line ${index + 1}`
    );
    const creditamount = requireJournalMoney(
      line?.creditamount,
      `Credit on Journal line ${index + 1}`
    );
    if ((debitamount > 0 && creditamount > 0) || (debitamount === 0 && creditamount === 0)) {
      throw new FinanceValidationError(
        `Enter either Debit or Credit for Journal line ${index + 1}.`
      );
    }
    totalDebitCents += Math.round(debitamount * 100);
    totalCreditCents += Math.round(creditamount * 100);
    return {
      financeaccountid,
      description: normalizeText(
        line?.description,
        `description on Journal line ${index + 1}`,
        false,
        2000
      ),
      debitamount,
      creditamount,
      lineorder: index + 1,
    };
  });

  return {
    entrydate,
    reference,
    description,
    journalpurpose,
    relatedjournalentryid,
    lines,
    totaldebit: totalDebitCents / 100,
    totalcredit: totalCreditCents / 100,
    difference: (totalDebitCents - totalCreditCents) / 100,
  };
};

export const formatJournalNumber = (id: number) =>
  `JE-${String(id).padStart(8, "0")}`;

export const normalizeJournalReversal = (payload: any) => ({
  reversaldate: requireIsoDate(payload?.reversaldate, "reversaldate"),
  reason: normalizeText(payload?.reason, "reason", true, 2000)!,
});
