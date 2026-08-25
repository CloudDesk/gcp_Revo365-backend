import { FinanceValidationError, nowEpoch } from "../utils/finance/finance.utils.js";
import { lockOnAccountReferences, allocateOnAccountReferenceNumber } from "./onAccountFoundation.service.js";
import { normalizeOnAccountPartyType } from "../utils/finance/onAccount.utils.js";

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

/**
 * Validates and locks the source reference for a transfer, ensuring it belongs to the 
 * correct customer, is in the correct currency, and has sufficient available balance.
 */
export const lockAndValidateSourceReference = async (
  client: QueryClient,
  organizationId: number,
  sourceReferenceId: number,
  expectedCustomerId: number,
  expectedCurrency: string,
  transferAmount: number
) => {
  const [sourceRef] = await lockOnAccountReferences(client, organizationId, [sourceReferenceId]);
  
  if (sourceRef.partytype !== 'customer' || Number(sourceRef.partyid) !== expectedCustomerId) {
    throw new FinanceValidationError("Source reference does not belong to the selected customer.");
  }
  if (sourceRef.currencycode !== expectedCurrency) {
    throw new FinanceValidationError(`Transfer must be in the same currency (${expectedCurrency}).`);
  }
  if (Number(sourceRef.availableamount) < transferAmount) {
    throw new FinanceValidationError("Source reference has insufficient available balance.");
  }
  if (['reversed', 'fully_applied'].includes(sourceRef.status)) {
    throw new FinanceValidationError("Source reference is no longer available for transfer.");
  }

  return sourceRef;
};

/**
 * Creates the destination customer reference for a transfer.
 */
export const createDestinationTransferReference = async (
  client: QueryClient,
  organizationId: number,
  actor: string,
  destinationCustomerId: number,
  currencyCode: string,
  amount: number,
  sourceReferenceId: number,
  journalEntryId: number
) => {
  const referenceNumber = await allocateOnAccountReferenceNumber(
    client,
    organizationId,
    "customer"
  );
  const now = nowEpoch();

  const result = await client.query(
    `INSERT INTO on_account_references (
       organizationid, referencenumber, partytype, partyid, currencycode,
       sourcetype, sourceid, sourcejournalentryid, transferredfromreferenceid,
       originalamount, usedamount, availableamount, status, version,
       createdby, modifiedby, createddate, modifieddate
     ) VALUES (
       $1, $2, 'customer', $3, $4, 
       'on_account_transfer', $5, $6, $7,
       $8, 0, $8, 'open', 1,
       $9, $9, $10, $10
     ) RETURNING id`,
    [
      organizationId,
      referenceNumber,
      destinationCustomerId,
      currencyCode,
      String(sourceReferenceId),
      journalEntryId,
      sourceReferenceId,
      amount,
      actor,
      now
    ]
  );
  return result.rows[0].id;
};

/**
 * Atomically decreases the source reference and records the outbound movement.
 */
export const executeTransferOutbound = async (
  client: QueryClient,
  organizationId: number,
  actor: string,
  sourceReferenceId: number,
  amount: number,
  journalEntryId: number,
  idempotencyKey: string,
  description: string
) => {
  const now = nowEpoch();
  const updateResult = await client.query(
    `UPDATE on_account_references
     SET usedamount = usedamount + $1,
         availableamount = availableamount - $1,
         status = CASE WHEN availableamount - $1 = 0 THEN 'fully_applied' ELSE 'partially_applied' END,
         version = version + 1,
         modifiedby = $2,
         modifieddate = $3
     WHERE organizationid = $4 AND id = $5
     RETURNING *`,
    [amount, actor, now, organizationId, sourceReferenceId]
  );

  const movementResult = await client.query(
    `INSERT INTO on_account_movements (
       organizationid, onaccountreferenceid, movementtype, direction,
       amount, journalentryid, idempotencykey, idempotencysequence,
       description, createdby, createddate
     ) VALUES (
       $1, $2, 'journal_transfer_out', 'decrease',
       $3, $4, $5, 1, $6, $7, $8
     ) RETURNING id`,
    [
      organizationId, sourceReferenceId, amount, journalEntryId,
      `${idempotencyKey}-out`, description, actor, now
    ]
  );
  
  return { updatedSource: updateResult.rows[0], sourceMovementId: movementResult.rows[0].id };
};

/**
 * Atomically records the inbound movement for the destination reference.
 */
export const executeTransferInbound = async (
  client: QueryClient,
  organizationId: number,
  actor: string,
  destinationReferenceId: number,
  amount: number,
  journalEntryId: number,
  sourceMovementId: number,
  idempotencyKey: string,
  description: string
) => {
  const now = nowEpoch();
  const movementResult = await client.query(
    `INSERT INTO on_account_movements (
       organizationid, onaccountreferenceid, movementtype, direction,
       amount, journalentryid, relatedmovementid, idempotencykey, idempotencysequence,
       description, createdby, createddate
     ) VALUES (
       $1, $2, 'journal_transfer_in', 'increase',
       $3, $4, $5, $6, 1, $7, $8, $9
     ) RETURNING id`,
    [
      organizationId, destinationReferenceId, amount, journalEntryId, sourceMovementId,
      `${idempotencyKey}-in`, description, actor, now
    ]
  );
  return movementResult.rows[0].id;
};
