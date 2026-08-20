import { FinanceValidationError } from "../utils/finance/finance.utils.js";
import {
  formatOnAccountReferenceNumber,
  normalizeOnAccountPartyType,
  type OnAccountPartyType,
} from "../utils/finance/onAccount.utils.js";

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export const allocateOnAccountReferenceNumber = async (
  client: QueryClient,
  organizationId: number,
  partyType: OnAccountPartyType
): Promise<string> => {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new FinanceValidationError(
      "A valid organization is required for an On Account reference."
    );
  }
  const normalizedPartyType = normalizeOnAccountPartyType(partyType);
  const result = await client.query(
    `
    INSERT INTO on_account_reference_counters (
      organizationid,
      partytype,
      lastnumber,
      modifieddate
    )
    VALUES ($1, $2, 1, EXTRACT(EPOCH FROM NOW())::BIGINT)
    ON CONFLICT (organizationid, partytype)
    DO UPDATE SET
      lastnumber = on_account_reference_counters.lastnumber + 1,
      modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
    RETURNING lastnumber
    `,
    [organizationId, normalizedPartyType]
  );
  return formatOnAccountReferenceNumber(
    normalizedPartyType,
    result.rows[0]?.lastnumber
  );
};

export const lockOnAccountReferences = async (
  client: QueryClient,
  organizationId: number,
  referenceIds: number[]
) => {
  const normalizedIds = Array.from(
    new Set(
      referenceIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
    )
  ).sort((left, right) => left - right);
  if (normalizedIds.length !== referenceIds.length || normalizedIds.length === 0) {
    throw new FinanceValidationError(
      "At least one unique On Account reference is required."
    );
  }

  const result = await client.query(
    `
    SELECT *
    FROM on_account_references
    WHERE organizationid = $1
      AND id = ANY($2::bigint[])
    ORDER BY id
    FOR UPDATE
    `,
    [organizationId, normalizedIds]
  );
  if (result.rows.length !== normalizedIds.length) {
    throw new FinanceValidationError(
      "One or more On Account references were not found.",
      404,
      "ON_ACCOUNT_REFERENCE_NOT_FOUND"
    );
  }
  if (result.rows.some((row) => row.status === "reversed")) {
    throw new FinanceValidationError(
      "Reversed On Account references cannot be used.",
      409,
      "ON_ACCOUNT_REFERENCE_REVERSED"
    );
  }
  return result.rows;
};

export const findOnAccountMovementByIdempotency = async (
  client: QueryClient,
  organizationId: number,
  idempotencyKey: string,
  idempotencySequence = 1
) => {
  const normalizedKey = String(idempotencyKey || "").trim();
  if (!normalizedKey) {
    throw new FinanceValidationError("An idempotency key is required.");
  }
  const result = await client.query(
    `
    SELECT m.*, r.referencenumber, r.partytype, r.partyid
    FROM on_account_movements m
    JOIN on_account_references r
      ON r.id = m.onaccountreferenceid
     AND r.organizationid = m.organizationid
    WHERE m.organizationid = $1
      AND m.idempotencykey = $2
      AND m.idempotencysequence = $3
    LIMIT 1
    `,
    [organizationId, normalizedKey, idempotencySequence]
  );
  return result.rows[0] || null;
};

export const getOnAccountReferenceReconciliation = async (
  client: QueryClient,
  organizationId: number,
  referenceId: number
) => {
  const result = await client.query(
    `
    SELECT
      r.id,
      r.referencenumber,
      r.availableamount,
      COALESCE(
        SUM(
          CASE m.direction
            WHEN 'increase' THEN m.amount
            ELSE -m.amount
          END
        ),
        0
      )::numeric(18, 2) AS movementbalance
    FROM on_account_references r
    LEFT JOIN on_account_movements m
      ON m.onaccountreferenceid = r.id
     AND m.organizationid = r.organizationid
    WHERE r.organizationid = $1
      AND r.id = $2
    GROUP BY r.id, r.referencenumber, r.availableamount
    `,
    [organizationId, referenceId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new FinanceValidationError(
      "On Account reference was not found.",
      404,
      "ON_ACCOUNT_REFERENCE_NOT_FOUND"
    );
  }
  return {
    ...row,
    reconciled: Number(row.availableamount) === Number(row.movementbalance),
  };
};
