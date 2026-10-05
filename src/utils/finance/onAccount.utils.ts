import {
  FinanceValidationError,
  requirePositiveMoney,
  toMoney,
} from "./finance.utils.js";

export type OnAccountPartyType = "customer" | "supplier";
export type OnAccountDirection = "increase" | "decrease";
export type OnAccountStatus =
  | "open"
  | "partially_applied"
  | "fully_applied"
  | "reversed";
export type OnAccountAllocationMethod = "against_document" | "on_account";

export const resolveOnAccountAllocationMethod = (
  value: unknown
): OnAccountAllocationMethod => {
  const normalized = String(value ?? "against_document")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "against_document") {
    return "against_document";
  }
  if (normalized === "on_account") return "on_account";
  throw new FinanceValidationError(
    "allocationmethod must be against_document or on_account."
  );
};

export type OnAccountMovementAmount = {
  direction: OnAccountDirection;
  amount: unknown;
};

export const normalizeOnAccountStatusFilter = (
  value: unknown
): OnAccountStatus | null => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "open" ||
    normalized === "partially_applied" ||
    normalized === "fully_applied" ||
    normalized === "reversed"
  ) {
    return normalized;
  }
  throw new FinanceValidationError(
    "status must be open, partially_applied, fully_applied, or reversed."
  );
};

export const isOnAccountReferenceReconciled = (
  availableAmount: unknown,
  movementBalance: unknown
) => toMoney(availableAmount) === toMoney(movementBalance);

export const normalizeOnAccountPartyType = (
  value: unknown
): OnAccountPartyType => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized !== "customer" && normalized !== "supplier") {
    throw new FinanceValidationError(
      "partytype must be customer or supplier."
    );
  }
  return normalized;
};

export const buildOnAccountReadScope = (
  organizationId: unknown,
  partyType: unknown
) => {
  const normalizedOrganizationId = Number(organizationId);
  if (!Number.isSafeInteger(normalizedOrganizationId) || normalizedOrganizationId <= 0) {
    throw new FinanceValidationError("organizationId must be a positive integer.");
  }
  const normalizedPartyType = normalizeOnAccountPartyType(partyType);
  return {
    params: [normalizedOrganizationId] as unknown[],
    conditions: [
      "r.organizationid = $1",
      `r.partytype = '${normalizedPartyType}'`,
    ],
  };
};

export const formatOnAccountReferenceNumber = (
  partyType: unknown,
  sequence: unknown
): string => {
  const normalizedPartyType = normalizeOnAccountPartyType(partyType);
  const normalizedSequence = Number(sequence);
  if (
    !Number.isSafeInteger(normalizedSequence) ||
    normalizedSequence <= 0
  ) {
    throw new FinanceValidationError(
      "On Account reference sequence must be a positive integer."
    );
  }

  return `OA-${normalizedPartyType === "customer" ? "C" : "S"}-${String(
    normalizedSequence
  ).padStart(8, "0")}`;
};

export const deriveOnAccountStatus = (
  originalAmount: unknown,
  usedAmount: unknown,
  availableAmount: unknown,
  reversed = false
): OnAccountStatus => {
  const original = requirePositiveMoney(originalAmount, "originalamount");
  const used = toMoney(usedAmount, "usedamount");
  const available = toMoney(availableAmount, "availableamount");

  if (used < 0 || available < 0 || toMoney(used + available) !== original) {
    throw new FinanceValidationError(
      "On Account amounts must satisfy originalamount = usedamount + availableamount."
    );
  }
  if (reversed) return "reversed";
  if (available === 0) return "fully_applied";
  if (used > 0) return "partially_applied";
  return "open";
};

export const calculateOnAccountAvailableFromMovements = (
  movements: OnAccountMovementAmount[]
): number =>
  toMoney(
    movements.reduce((balance, movement, index) => {
      const direction = String(movement?.direction || "")
        .trim()
        .toLowerCase();
      if (direction !== "increase" && direction !== "decrease") {
        throw new FinanceValidationError(
          `movements[${index}].direction must be increase or decrease.`
        );
      }
      const amount = requirePositiveMoney(
        movement.amount,
        `movements[${index}].amount`
      );
      return direction === "increase" ? balance + amount : balance - amount;
    }, 0),
    "availableamount"
  );

export const assertOnAccountMovementBalance = (
  availableAmount: unknown,
  movements: OnAccountMovementAmount[]
): number => {
  const expected = toMoney(availableAmount, "availableamount");
  const calculated = calculateOnAccountAvailableFromMovements(movements);
  if (calculated !== expected) {
    throw new FinanceValidationError(
      `On Account movement balance ${calculated.toFixed(
        2
      )} does not match available amount ${expected.toFixed(2)}.`,
      409,
      "ON_ACCOUNT_RECONCILIATION_FAILED"
    );
  }
  return calculated;
};

export const validateOnAccountSettlementAmounts = (
  bankPortion: unknown,
  tdsAmount: unknown
) => {
  const normalizedBankPortion = requirePositiveMoney(
    bankPortion,
    "bankportion"
  );
  const normalizedTdsAmount = toMoney(tdsAmount, "tdsamount");
  if (normalizedTdsAmount < 0) {
    throw new FinanceValidationError("tdsamount cannot be negative.");
  }

  return {
    bankportion: normalizedBankPortion,
    tdsamount: normalizedTdsAmount,
    totalsettlement: toMoney(
      normalizedBankPortion + normalizedTdsAmount,
      "totalsettlement"
    ),
  };
};

export type OnAccountReferenceApplication = {
  referenceid: number;
  amount: number;
};

export type OnAccountInvoiceApplication = {
  invoiceid: number;
  bankportion: number;
  tdsamount: number;
};

export type OnAccountApplicationChunk = {
  referenceid: number;
  invoiceid: number;
  bankportion: number;
  tdsamount: number;
  totalsettlement: number;
};

const moneyToCents = (value: unknown, fieldName: string) =>
  Math.round(requirePositiveMoney(value, fieldName) * 100);

export const buildOnAccountApplicationMatrix = (
  references: OnAccountReferenceApplication[],
  invoices: OnAccountInvoiceApplication[]
): OnAccountApplicationChunk[] => {
  if (!Array.isArray(references) || references.length === 0) {
    throw new FinanceValidationError(
      "At least one On Account reference allocation is required."
    );
  }
  if (!Array.isArray(invoices) || invoices.length === 0) {
    throw new FinanceValidationError(
      "At least one Invoice allocation is required."
    );
  }

  const remainingReferences = references.map((reference, index) => ({
    referenceid: Number(reference.referenceid),
    cents: moneyToCents(
      reference.amount,
      `referenceallocations[${index}].amount`
    ),
  }));
  const invoiceRows = invoices.map((invoice, index) => ({
    invoiceid: Number(invoice.invoiceid),
    cents: moneyToCents(
      invoice.bankportion,
      `invoiceallocations[${index}].bankportion`
    ),
    tdsamount: toMoney(
      invoice.tdsamount || 0,
      `invoiceallocations[${index}].tdsamount`
    ),
  }));
  const referenceTotal = remainingReferences.reduce(
    (total, reference) => total + reference.cents,
    0
  );
  const invoiceTotal = invoiceRows.reduce(
    (total, invoice) => total + invoice.cents,
    0
  );
  if (referenceTotal !== invoiceTotal) {
    throw new FinanceValidationError(
      "Selected On Account amount must equal the total Invoice bank portion."
    );
  }

  const chunks: OnAccountApplicationChunk[] = [];
  let referenceIndex = 0;
  for (const invoice of invoiceRows) {
    let remainingInvoice = invoice.cents;
    let firstChunk = true;
    while (remainingInvoice > 0) {
      const reference = remainingReferences[referenceIndex];
      if (!reference) {
        throw new FinanceValidationError(
          "Selected On Account amount is insufficient for the Invoice allocations."
        );
      }
      const appliedCents = Math.min(reference.cents, remainingInvoice);
      const tdsAmount = firstChunk ? invoice.tdsamount : 0;
      const bankPortion = appliedCents / 100;
      chunks.push({
        referenceid: reference.referenceid,
        invoiceid: invoice.invoiceid,
        bankportion: bankPortion,
        tdsamount: tdsAmount,
        totalsettlement: toMoney(bankPortion + tdsAmount),
      });
      firstChunk = false;
      reference.cents -= appliedCents;
      remainingInvoice -= appliedCents;
      if (reference.cents === 0) referenceIndex += 1;
    }
  }
  if (remainingReferences.some((reference) => reference.cents !== 0)) {
    throw new FinanceValidationError(
      "Selected On Account amount exceeds the Invoice bank portions."
    );
  }
  return chunks;
};

export type OnAccountStatementMovement = OnAccountMovementAmount & {
  eventdate: string;
  tdsamount?: unknown;
};

export const summarizeOnAccountStatement = (
  movements: OnAccountStatementMovement[],
  fromDate?: string | null,
  toDate?: string | null
) => {
  if (fromDate && toDate && fromDate > toDate) {
    throw new FinanceValidationError("From Date cannot be later than To Date.");
  }
  const normalized = movements.map((movement, index) => {
    const direction = String(movement?.direction || "").toLowerCase();
    if (direction !== "increase" && direction !== "decrease") {
      throw new FinanceValidationError(
        `movements[${index}].direction must be increase or decrease.`
      );
    }
    const eventdate = String(movement?.eventdate || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventdate)) {
      throw new FinanceValidationError(
        `movements[${index}].eventdate must use YYYY-MM-DD.`
      );
    }
    return {
      ...movement,
      direction: direction as OnAccountDirection,
      eventdate,
      amount: requirePositiveMoney(movement.amount, `movements[${index}].amount`),
      tdsamount: toMoney(movement.tdsamount || 0),
    };
  });
  const signed = (movement: typeof normalized[number]) =>
    movement.direction === "increase" ? movement.amount : -movement.amount;
  const before = normalized.filter(
    (movement) => Boolean(fromDate) && movement.eventdate < fromDate!
  );
  const period = normalized.filter(
    (movement) =>
      (!fromDate || movement.eventdate >= fromDate) &&
      (!toDate || movement.eventdate <= toDate)
  );
  const through = normalized.filter(
    (movement) => !toDate || movement.eventdate <= toDate
  );
  return {
    openingavailable: toMoney(before.reduce((sum, movement) => sum + signed(movement), 0)),
    increases: toMoney(period.filter((movement) => movement.direction === "increase").reduce((sum, movement) => sum + movement.amount, 0)),
    decreases: toMoney(period.filter((movement) => movement.direction === "decrease").reduce((sum, movement) => sum + movement.amount, 0)),
    tdssettled: toMoney(period.reduce((sum, movement) => sum + movement.tdsamount, 0)),
    closingavailable: toMoney(through.reduce((sum, movement) => sum + signed(movement), 0)),
    period,
  };
};
