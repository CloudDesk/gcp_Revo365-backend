import pool from "../database/postgres.js";
import { FinanceValidationError, nowEpoch, requireIsoDate, resolveFinanceContext, toFinanceDateOnly } from "../utils/finance/finance.utils.js";
import { lockAndValidateSourceReference, createDestinationTransferReference, executeTransferOutbound, executeTransferInbound, requireTransferAmount } from "./onAccountTransfer.service.js";
import { formatJournalNumber } from "../utils/finance/journal.utils.js";
import { reverseTransferredCustomerAllocations } from "./customerOnAccountReversal.service.js";

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

type CustomerTransferIdentity = {
  sourceCustomerId: number;
  sourceReferenceId: number;
  destinationCustomerId: number;
  amount: number;
  currencyCode: string;
  entrydate: string;
  description: string;
  idempotencyKey: string;
};

const findExistingCustomerTransfer = async (
  client: QueryClient,
  organizationId: number,
  identity: CustomerTransferIdentity
) => {
  const result = await client.query(
    `SELECT
       j.id AS journalid,
       j.journalnumber,
       j.entrydate,
       j.description,
       source_movement.id AS sourcemovementid,
       source_movement.amount,
       source_reference.id AS sourcereferenceid,
       source_reference.partyid AS sourcecustomerid,
       source_reference.currencycode,
       destination_reference.id AS destinationreferenceid,
       destination_reference.partyid AS destinationcustomerid,
       destination_movement.id AS destinationmovementid
     FROM on_account_movements source_movement
     JOIN on_account_references source_reference
       ON source_reference.id = source_movement.onaccountreferenceid
      AND source_reference.organizationid = source_movement.organizationid
     JOIN journal_entries j
       ON j.id = source_movement.journalentryid
      AND j.organizationid = source_movement.organizationid
      AND j.sourcetype = 'on_account_transfer'
     LEFT JOIN on_account_references destination_reference
       ON destination_reference.organizationid = source_movement.organizationid
      AND destination_reference.sourcejournalentryid = j.id
      AND destination_reference.transferredfromreferenceid = source_reference.id
      AND destination_reference.sourcetype = 'on_account_transfer'
     LEFT JOIN on_account_movements destination_movement
       ON destination_movement.organizationid = source_movement.organizationid
      AND destination_movement.onaccountreferenceid = destination_reference.id
      AND destination_movement.movementtype = 'journal_transfer_in'
      AND destination_movement.journalentryid = j.id
     WHERE source_movement.organizationid = $1
       AND source_movement.movementtype = 'journal_transfer_out'
       AND source_movement.idempotencykey = $2
       AND source_movement.idempotencysequence = 1
     LIMIT 1`,
    [organizationId, `${identity.idempotencyKey}-out`]
  );
  const row = result.rows[0];
  if (!row) return null;

  const sameRequest =
    Number(row.sourcecustomerid) === identity.sourceCustomerId &&
    Number(row.sourcereferenceid) === identity.sourceReferenceId &&
    Number(row.destinationcustomerid) === identity.destinationCustomerId &&
    Number(row.amount) === identity.amount &&
    String(row.currencycode || "").toUpperCase() === identity.currencyCode &&
    toFinanceDateOnly(row.entrydate) === identity.entrydate &&
    String(row.description || "").trim() === identity.description;

  if (!sameRequest) {
    throw new FinanceValidationError(
      "This transfer request key was already used for different transfer details.",
      409,
      "TRANSFER_IDEMPOTENCY_CONFLICT"
    );
  }

  return {
    idempotent: true,
    journalId: Number(row.journalid),
    journalNumber: row.journalnumber,
    sourceReferenceId: Number(row.sourcereferenceid),
    destinationReferenceId: Number(row.destinationreferenceid),
    sourceMovementId: Number(row.sourcemovementid),
    destinationMovementId: Number(row.destinationmovementid),
    amount: Number(row.amount),
    currencyCode: row.currencycode,
  };
};

const validateCustomersExist = async (
  client: QueryClient,
  sourceCustomerId: number,
  destinationCustomerId: number
) => {
  const result = await client.query(
    `SELECT id
       FROM users
      WHERE id = ANY($1::bigint[])
      FOR SHARE`,
    [[sourceCustomerId, destinationCustomerId]]
  );
  if (result.rows.length !== 2) {
    throw new FinanceValidationError(
      "The selected source or destination customer was not found.",
      404,
      "TRANSFER_CUSTOMER_NOT_FOUND"
    );
  }
};

const customerDisplayNameSql = `COALESCE(
  NULLIF(CONCAT_WS(' ', NULLIF(TRIM(u.firstname), ''), NULLIF(TRIM(u.lastname), '')), ''),
  NULLIF(TRIM(u.useremail), ''),
  'Customer ' || u.id::text
)`;
const customerDisplayNameFor = (alias: string) => customerDisplayNameSql.split("u.").join(`${alias}.`);

export const getCustomerTransferContext = async (request: any) => {
  const { organizationId } = resolveFinanceContext(request);
  const lookup = String(request.query?.lookup || "").trim().toLowerCase();
  if (!new Set(["references", "customers"]).has(lookup)) {
    throw new FinanceValidationError(
      "lookup must be references or customers.",
      400,
      "TRANSFER_LOOKUP_INVALID"
    );
  }
  const search = String(request.query?.search || "").trim();
  if (search.length > 100) {
    throw new FinanceValidationError(
      "search must not exceed 100 characters.",
      400,
      "TRANSFER_LOOKUP_SEARCH_INVALID"
    );
  }
  const page = Math.max(Number(request.query?.page) || 1, 1);
  const count = Math.min(Math.max(Number(request.query?.count) || 10, 1), 50);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(count)) {
    throw new FinanceValidationError(
      "page and count must be whole numbers.",
      400,
      "TRANSFER_LOOKUP_PAGINATION_INVALID"
    );
  }
  const offset = (page - 1) * count;
  const pattern = `%${search}%`;

  if (lookup === "references") {
    const [recordsResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT r.id, r.referencenumber, r.partyid AS customerid,
                ${customerDisplayNameSql} AS customername,
                u.useremail AS customeremail, r.currencycode,
                r.originalamount, r.usedamount, r.availableamount, r.status, r.version
         FROM on_account_references r
         JOIN users u ON u.id = r.partyid
         WHERE r.organizationid = $1
           AND r.partytype = 'customer'
           AND r.status IN ('open', 'partially_applied')
           AND r.availableamount > 0
           AND ($2 = '' OR r.referencenumber ILIKE $3 OR ${customerDisplayNameSql} ILIKE $3 OR COALESCE(u.useremail, '') ILIKE $3)
         ORDER BY r.createddate DESC, r.id DESC
         LIMIT $4 OFFSET $5`,
        [organizationId, search, pattern, count, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::integer AS total
         FROM on_account_references r
         JOIN users u ON u.id = r.partyid
         WHERE r.organizationid = $1
           AND r.partytype = 'customer'
           AND r.status IN ('open', 'partially_applied')
           AND r.availableamount > 0
           AND ($2 = '' OR r.referencenumber ILIKE $3 OR ${customerDisplayNameSql} ILIKE $3 OR COALESCE(u.useremail, '') ILIKE $3)`,
        [organizationId, search, pattern]
      ),
    ]);
    return {
      lookup,
      records: recordsResult.rows.map((row: any) => ({
        ...row,
        id: Number(row.id),
        customerid: Number(row.customerid),
        version: Number(row.version),
        originalamount: Number(row.originalamount),
        usedamount: Number(row.usedamount),
        availableamount: Number(row.availableamount),
      })),
      total: Number(totalResult.rows[0]?.total || 0),
      page,
      count,
    };
  }

  const customerConditions = [
    `($1 = '' OR ${customerDisplayNameSql} ILIKE $2 OR COALESCE(u.useremail, '') ILIKE $2 OR COALESCE(u.usermobilenumber::text, '') ILIKE $2)`,
  ];
  const customerParams: any[] = [search, pattern];
  if (
    request.query?.excludeCustomerId != null &&
    String(request.query.excludeCustomerId).trim() !== ""
  ) {
    const excludeCustomerId = Number(request.query.excludeCustomerId);
    if (!Number.isSafeInteger(excludeCustomerId) || excludeCustomerId <= 0) {
      throw new FinanceValidationError(
        "A valid excludeCustomerId is required.",
        400,
        "TRANSFER_LOOKUP_EXCLUSION_INVALID"
      );
    }
    customerParams.push(excludeCustomerId);
    customerConditions.push(`u.id <> $${customerParams.length}`);
  }
  const recordParams = [...customerParams, count, offset];
  const [recordsResult, totalResult] = await Promise.all([
    pool.query(
      `SELECT u.id, ${customerDisplayNameSql} AS customername,
              u.useremail AS customeremail, u.usermobilenumber AS customermobile
       FROM users u
       WHERE ${customerConditions.join(" AND ")}
       ORDER BY customername, u.id
       LIMIT $${recordParams.length - 1} OFFSET $${recordParams.length}`,
      recordParams
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS total
       FROM users u
       WHERE ${customerConditions.join(" AND ")}`,
      customerParams
    ),
  ]);
  return {
    lookup,
    records: recordsResult.rows.map((row: any) => ({
      ...row,
      id: Number(row.id),
    })),
    total: Number(totalResult.rows[0]?.total || 0),
    page,
    count,
  };
};

export const getCustomerTransferReplacementContext = async (request: any) => {
  const { organizationId } = resolveFinanceContext(request);
  const journalId = Number(request.params?.journalId);
  if (!Number.isSafeInteger(journalId) || journalId <= 0) {
    throw new FinanceValidationError("A valid transfer Journal is required.");
  }
  const transferResult = await pool.query(
    `SELECT j.id AS journalid, j.journalnumber, j.version, j.status AS journalstatus,
            source_ref.id AS sourcereferenceid, source_ref.referencenumber AS sourcereferencenumber,
            source_ref.partyid AS sourcecustomerid, ${customerDisplayNameFor("source_user")} AS sourcecustomername,
            destination_ref.id AS destinationreferenceid, destination_ref.referencenumber AS destinationreferencenumber,
            destination_ref.partyid AS destinationcustomerid, destination_ref.currencycode,
            destination_ref.originalamount AS transferamount, destination_ref.status AS destinationstatus,
            destination_ref.createddate,
            ${customerDisplayNameFor("destination_user")} AS destinationcustomername,
            destination_ref.replacementreferenceid, destination_ref.reversaljournalentryid
       FROM journal_entries j
       JOIN on_account_references destination_ref
         ON destination_ref.organizationid = j.organizationid
        AND destination_ref.sourcejournalentryid = j.id
        AND destination_ref.sourcetype = 'on_account_transfer'
       JOIN on_account_references source_ref
         ON source_ref.organizationid = j.organizationid
        AND source_ref.id = destination_ref.transferredfromreferenceid
       JOIN users source_user ON source_user.id = source_ref.partyid
       JOIN users destination_user ON destination_user.id = destination_ref.partyid
       WHERE j.organizationid = $1 AND j.id = $2 AND j.sourcetype = 'on_account_transfer'
       LIMIT 1`,
    [organizationId, journalId]
  );
  const transfer = transferResult.rows[0];
  if (!transfer) throw new FinanceValidationError("Transfer Journal not found.", 404, "TRANSFER_NOT_FOUND");

  const [replacementResult, allocationResult] = await Promise.all([
    pool.query(
      `SELECT r.id, r.referencenumber, r.currencycode, r.availableamount, r.version,
              bt.transactionnumber, bt.transactiondate, bca.accountname, bca.bankname
       FROM on_account_references r
       JOIN bank_transactions bt
         ON bt.id = r.sourcebanktransactionid
        AND bt.organizationid = r.organizationid
        AND bt.partytype = 'customer'
        AND bt.partyid = r.partyid
        AND bt.postingstatus = 'posted'
       JOIN bank_cash_accounts bca
         ON bca.id = bt.bankcashaccountid
        AND bca.organizationid = r.organizationid
        AND bca.accounttype = 'bank'
       WHERE r.organizationid = $1
         AND r.partytype = 'customer'
         AND r.partyid = $2
         AND r.currencycode = $3
         AND r.sourcebanktransactionid IS NOT NULL
         AND r.transferredfromreferenceid IS NULL
         AND r.status IN ('open', 'partially_applied')
         AND r.availableamount >= $4
         AND r.createddate >= $5
       ORDER BY bt.transactiondate DESC, r.id DESC`,
      [organizationId, transfer.destinationcustomerid, transfer.currencycode, transfer.transferamount, transfer.createddate || 0]
    ),
    pool.query(
      `SELECT id, documentid, documentnumber, bankportion, tdsamount, totalsettlement, status
       FROM on_account_document_allocations
       WHERE organizationid = $1 AND onaccountreferenceid = $2 AND status = 'applied'
       ORDER BY createddate, id`,
      [organizationId, transfer.destinationreferenceid]
    ),
  ]);
  return {
    transfer: {
      ...transfer,
      journalid: Number(transfer.journalid), version: Number(transfer.version),
      sourcereferenceid: Number(transfer.sourcereferenceid), sourcecustomerid: Number(transfer.sourcecustomerid),
      destinationreferenceid: Number(transfer.destinationreferenceid), destinationcustomerid: Number(transfer.destinationcustomerid),
      transferamount: Number(transfer.transferamount),
    },
    references: replacementResult.rows.map((row: any) => ({ ...row, id: Number(row.id), version: Number(row.version), availableamount: Number(row.availableamount) })),
    allocations: allocationResult.rows.map((row: any) => ({ ...row, id: Number(row.id), documentid: Number(row.documentid), bankportion: Number(row.bankportion), tdsamount: Number(row.tdsamount), totalsettlement: Number(row.totalsettlement) })),
  };
};

/**
 * Orchestrates a Customer-to-Customer on-account transfer atomically.
 */
export const executeCustomerTransferOrchestration = async (request: any) => {
  const { organizationId, actor } = resolveFinanceContext(request);
  const payload = request.body;
  const sourceCustomerId = Number(payload.sourcecustomerid);
  const sourceReferenceId = Number(payload.sourcereferenceid);
  const sourceReferenceVersion = Number(payload.sourcereferenceversion);
  const destCustomerId = Number(payload.destinationcustomerid);
  const amount = requireTransferAmount(payload.amount);
  const currencyCode = String(payload.currencycode || "").trim().toUpperCase();
  const entrydate = requireIsoDate(payload.entrydate, "entrydate");
  const description = String(payload.description || "").trim();
  const idempotencyKey = String(payload.idempotencykey || "").trim();

  if (
    !Number.isSafeInteger(sourceCustomerId) ||
    sourceCustomerId <= 0 ||
    !Number.isSafeInteger(sourceReferenceId) ||
    sourceReferenceId <= 0 ||
    !Number.isSafeInteger(destCustomerId) ||
    destCustomerId <= 0
  ) {
    throw new FinanceValidationError(
      "Valid source customer, source reference, and destination customer are required.",
      400,
      "TRANSFER_IDENTIFIERS_INVALID"
    );
  }
  if (sourceCustomerId === destCustomerId) {
    throw new FinanceValidationError(
      "Cannot transfer to the same customer.",
      400,
      "TRANSFER_SAME_CUSTOMER"
    );
  }
  if (!Number.isSafeInteger(sourceReferenceVersion) || sourceReferenceVersion < 0) {
    throw new FinanceValidationError(
      "A valid source reference version is required.",
      400,
      "TRANSFER_SOURCE_VERSION_REQUIRED"
    );
  }
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new FinanceValidationError(
      "A valid three-letter currency code is required.",
      400,
      "TRANSFER_CURRENCY_INVALID"
    );
  }
  if (!description) {
    throw new FinanceValidationError(
      "A transfer reason or narration is required.",
      400,
      "TRANSFER_DESCRIPTION_REQUIRED"
    );
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    throw new FinanceValidationError(
      "A valid transfer request key is required.",
      400,
      "TRANSFER_IDEMPOTENCY_KEY_INVALID"
    );
  }

  const identity: CustomerTransferIdentity = {
    sourceCustomerId,
    sourceReferenceId,
    destinationCustomerId: destCustomerId,
    amount,
    currencyCode,
    entrydate,
    description,
    idempotencyKey,
  };

  const existingTransfer = await findExistingCustomerTransfer(
    pool,
    organizationId,
    identity
  );
  if (existingTransfer) return existingTransfer;
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await validateCustomersExist(client, sourceCustomerId, destCustomerId);
    
    // 1. Lock and validate source reference
    const sourceRef = await lockAndValidateSourceReference(
      client, 
      organizationId, 
      sourceReferenceId, 
      sourceCustomerId, 
      sourceReferenceVersion,
      currencyCode,
      amount
    );

    // 2. Fetch the 'customer_advance' control account
    const controlAccountResult = await client.query(
      `SELECT id FROM finance_accounts 
       WHERE organizationid = $1 AND accountsubtype = 'customer_advance' AND issystem = TRUE 
       LIMIT 1`,
      [organizationId]
    );
    if (!controlAccountResult.rows[0]) {
      throw new FinanceValidationError("System control account for Customer Advances not found.");
    }
    const customerAdvanceAccountId = Number(controlAccountResult.rows[0].id);

    // 3. Insert the Journal Entry
    const epoch = nowEpoch();
    const journalResult = await client.query(
      `INSERT INTO journal_entries (
         organizationid, entrydate, sourcetype, status, description, 
         journalpurpose, requestidempotencykey, createdby, createddate,
         modifiedby, modifieddate, version
       ) VALUES ($1, $2, 'on_account_transfer', 'posted', $3, 'reclassification', $4, $5, $6, $5, $6, 1)
       RETURNING id`,
      [organizationId, entrydate, description, idempotencyKey, actor, epoch]
    );
    const journalId = Number(journalResult.rows[0].id);
    const journalNumber = formatJournalNumber(journalId);
    await client.query(`UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`, [journalNumber, journalId]);

    // 4. Insert balanced Journal Lines (Net effect 0 on GL)
    await client.query(
      `INSERT INTO journal_lines (journalentryid, financeaccountid, partytype, partyid, debitamount, creditamount, description, lineorder)
       VALUES 
       ($1, $2, 'customer', $3, $4, 0, $5, 1),
       ($1, $2, 'customer', $6, 0, $4, $5, 2)`,
      [journalId, customerAdvanceAccountId, sourceCustomerId, amount, description, destCustomerId]
    );

    // 5. Execute On-Account Transfers
    const outboundResult = await executeTransferOutbound(
      client, organizationId, actor, sourceReferenceId, amount, journalId, idempotencyKey, description
    );
    
    const destReferenceId = await createDestinationTransferReference(
      client, organizationId, actor, destCustomerId, currencyCode, amount, sourceReferenceId, journalId
    );

    const inboundMovementId = await executeTransferInbound(
      client, organizationId, actor, destReferenceId, amount, journalId, outboundResult.sourceMovementId, idempotencyKey, description
    );

    // 6. Record Audit Event
    await client.query(
      `INSERT INTO finance_audit_events (organizationid, entitytype, entityid, action, actor, eventdata)
       VALUES ($1, 'journal_entry', $2, 'transfer_posted', $3, $4::jsonb)`,
      [
        organizationId, journalId, actor, 
        JSON.stringify({
          sourceReferenceId, destReferenceId, amount, destCustomerId,
          outboundMovementId: outboundResult.sourceMovementId, inboundMovementId
        })
      ]
    );

    await client.query("COMMIT");
    return {
      idempotent: false,
      journalId,
      journalNumber,
      sourceReferenceId,
      destinationReferenceId: Number(destReferenceId),
      sourceMovementId: Number(outboundResult.sourceMovementId),
      destinationMovementId: Number(inboundMovementId),
      amount,
      currencyCode: sourceRef.currencycode,
    };
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err instanceof FinanceValidationError) {
      throw err;
    }
    if (err?.code === "23505") {
      const concurrentTransfer = await findExistingCustomerTransfer(
        pool,
        organizationId,
        identity
      );
      if (concurrentTransfer) return concurrentTransfer;
      throw new FinanceValidationError(
        "This transfer request has already been processed.",
        409,
        "TRANSFER_DUPLICATE_REQUEST"
      );
    }
    throw new FinanceValidationError(
      "Unable to post the On Account transfer. No financial changes were saved.",
      500,
      "TRANSFER_FAILED"
    );
  } finally {
    client.release();
  }
};

/**
 * Replaces a customer transfer with a later bank-origin reference,
 * safely unwinding only the affected invoice allocations.
 */
export const replaceCustomerOnAccountTransfer = async (request: any) => {
  const { organizationId, actor } = resolveFinanceContext(request);
  const journalId = Number(request.params?.journalId);
  const payload = request.body;
  const version = Number(payload.version);
  const replacementReferenceId = Number(payload.replacementreferenceid);
  const reason = String(payload.reason || "").trim() || "Replacement of transfer";
  const idempotencyKey = String(payload.idempotencykey || "").trim();
  
  if (!Number.isSafeInteger(journalId) || journalId <= 0 || !Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(replacementReferenceId) || replacementReferenceId <= 0) {
    throw new FinanceValidationError("Valid Journal, version, and replacement reference are required.");
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    throw new FinanceValidationError("A valid replacement request key is required.", 400, "REPLACEMENT_IDEMPOTENCY_KEY_INVALID");
  }

  const existingResult = await pool.query(
    `SELECT reversal.id, reversal.journalnumber, destination.replacementreferenceid
       FROM journal_entries reversal
       JOIN on_account_references destination
         ON destination.organizationid = reversal.organizationid
        AND destination.reversaljournalentryid = reversal.id
       WHERE reversal.organizationid = $1
         AND reversal.sourcetype = 'on_account_transfer_reversal'
         AND reversal.requestidempotencykey = $2
       LIMIT 1`,
    [organizationId, idempotencyKey]
  );
  if (existingResult.rows[0]) {
    if (Number(existingResult.rows[0].replacementreferenceid) !== replacementReferenceId) {
      throw new FinanceValidationError("This replacement request key was already used for different details.", 409, "REPLACEMENT_IDEMPOTENCY_CONFLICT");
    }
    return { success: true, idempotent: true, reversaljournalid: Number(existingResult.rows[0].id), reversaljournalnumber: existingResult.rows[0].journalnumber };
  }
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // 1. Lock and Verify Journal
    const journalResult = await client.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND organizationid = $2 FOR UPDATE`,
      [journalId, organizationId]
    );
    const journal = journalResult.rows[0];
    if (!journal) throw new FinanceValidationError("Journal not found.");
    if (journal.sourcetype !== 'on_account_transfer' || journal.status !== 'posted') {
      throw new FinanceValidationError("Only a posted transfer Journal can be replaced.");
    }
    if (Number(journal.version) !== version) {
      throw new FinanceValidationError("The Journal changed after you opened it. Refresh and try again.");
    }
    const existingReversal = await client.query(`SELECT id FROM journal_entries WHERE organizationid = $1 AND reversalofid = $2 LIMIT 1`, [organizationId, journalId]);
    if (existingReversal.rows.length > 0) {
      throw new FinanceValidationError("This Journal has already been reversed.");
    }

    // 2. Locate References
    const destRefResult = await client.query(
      `SELECT * FROM on_account_references WHERE organizationid = $1 AND sourcejournalentryid = $2 AND sourcetype = 'on_account_transfer' FOR UPDATE`,
      [organizationId, journalId]
    );
    const destRef = destRefResult.rows[0];
    if (!destRef) throw new FinanceValidationError("Destination reference not found.");
    const sourceReferenceId = Number(destRef.transferredfromreferenceid);
    const destReferenceId = Number(destRef.id);
    const transferAmount = Number(destRef.originalamount);

    const sourceRefResult = await client.query(
      `SELECT * FROM on_account_references WHERE organizationid = $1 AND id = $2 FOR UPDATE`,
      [organizationId, sourceReferenceId]
    );
    const sourceRef = sourceRefResult.rows[0];
    if (!sourceRef) throw new FinanceValidationError("Source reference not found.");

    // 3. Verify Replacement Reference
    const replacementRefResult = await client.query(
      `SELECT r.*, bt.transactionnumber, bt.transactiondate, bca.accounttype
         FROM on_account_references r
         JOIN bank_transactions bt
           ON bt.id = r.sourcebanktransactionid
          AND bt.organizationid = r.organizationid
          AND bt.partytype = 'customer'
          AND bt.partyid = r.partyid
          AND bt.postingstatus = 'posted'
         JOIN bank_cash_accounts bca
           ON bca.id = bt.bankcashaccountid
          AND bca.organizationid = r.organizationid
          AND bca.accounttype = 'bank'
        WHERE r.organizationid = $1 AND r.id = $2
        FOR UPDATE OF r, bt, bca`,
      [organizationId, replacementReferenceId]
    );
    const replacementRef = replacementRefResult.rows[0];
    if (!replacementRef) throw new FinanceValidationError("Replacement reference not found.");
    if (replacementRef.partytype !== 'customer' || Number(replacementRef.partyid) !== Number(destRef.partyid)) {
      throw new FinanceValidationError("Replacement reference must belong to the destination customer.");
    }
    if (String(replacementRef.currencycode) !== String(destRef.currencycode)) throw new FinanceValidationError("Replacement reference currency must match the transfer.", 409, "REPLACEMENT_CURRENCY_MISMATCH");
    if (Number(replacementRef.createddate) < Number(destRef.createddate)) {
      throw new FinanceValidationError("Replacement must be a later Bank receipt for the destination customer.", 409, "REPLACEMENT_RECEIPT_NOT_LATER");
    }
    if (Number(replacementRef.availableamount) < transferAmount) {
      throw new FinanceValidationError(`Replacement reference does not have enough available balance to cover ${transferAmount}.`);
    }
    if (['reversed'].includes(replacementRef.status)) {
      throw new FinanceValidationError("Replacement reference is reversed.");
    }

    const unsupportedDependency = await client.query(
      `SELECT movementtype
         FROM on_account_movements
        WHERE organizationid = $1
          AND onaccountreferenceid = $2
          AND direction = 'decrease'
          AND movementtype <> 'document_allocation'
        LIMIT 1
        FOR UPDATE`,
      [organizationId, destReferenceId]
    );
    if (unsupportedDependency.rows[0]) {
      throw new FinanceValidationError(
        "This transfer has a downstream balance movement that cannot be safely replaced. Finance review is required.",
        409,
        "REPLACEMENT_UNSAFE_DEPENDENCY"
      );
    }

    const epoch = nowEpoch();
    const reversalEntryDate =
      toFinanceDateOnly(replacementRef.transactiondate) ??
      toFinanceDateOnly(new Date(epoch * 1000));
    if (!reversalEntryDate) {
      throw new FinanceValidationError(
        "A valid replacement receipt date is required.",
        409,
        "REPLACEMENT_DATE_INVALID"
      );
    }
    // 4. Create the opposite Journal before recording compensating movements.
    const reversalResult = await client.query(
      `INSERT INTO journal_entries (
         organizationid, entrydate, sourcetype, status, description, 
         journalpurpose, reversalofid, requestidempotencykey, createdby, createddate, modifiedby, modifieddate, version
       ) VALUES ($1, $2, 'on_account_transfer_reversal', 'posted', $3, 'reclassification', $4, $5, $6, $7, $6, $7, 1)
       RETURNING id`,
      [organizationId, reversalEntryDate, `Reversal of ${journal.journalnumber}: ${reason}`, journalId, idempotencyKey, actor, epoch]
    );
    const reversalId = Number(reversalResult.rows[0].id);
    const reversalNumber = formatJournalNumber(reversalId);
    await client.query(`UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`, [reversalNumber, reversalId]);

    // Reverse lines (swap debit and credit)
    const linesResult = await client.query(`SELECT * FROM journal_lines WHERE journalentryid = $1`, [journalId]);
    for (const line of linesResult.rows) {
       await client.query(
          `INSERT INTO journal_lines (journalentryid, financeaccountid, partytype, partyid, debitamount, creditamount, description, lineorder)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [reversalId, line.financeaccountid, line.partytype, line.partyid, line.creditamount, line.debitamount, line.description, line.lineorder]
       );
    }

    // 5. Reverse only the Invoice settlements funded by the transferred reference.
    const allocationReversal = await reverseTransferredCustomerAllocations(
      client, organizationId, destReferenceId, reversalId, actor, idempotencyKey
    );

    // 6. Restore the source and close the destination transfer reference.
    await client.query(
      `UPDATE on_account_references
       SET usedamount = usedamount - $1, availableamount = availableamount + $1, status = CASE WHEN availableamount + $1 = originalamount THEN 'open' ELSE 'partially_applied' END, version = version + 1, modifiedby = $2, modifieddate = $3
       WHERE id = $4 AND organizationid = $5`,
      [transferAmount, actor, epoch, sourceReferenceId, organizationId]
    );
    
    await client.query(
      `UPDATE on_account_references
       SET usedamount = originalamount, availableamount = 0, status = 'reversed',
           replacementreferenceid = $1, reversaljournalentryid = $2,
           version = version + 1, modifiedby = $3, modifieddate = $4
       WHERE id = $5 AND organizationid = $6`,
      [replacementReferenceId, reversalId, actor, epoch, destReferenceId, organizationId]
    );

    // Create a linked decrease on the destination and increase on the source.
    const destinationReversalMovement = await client.query(
      `INSERT INTO on_account_movements (
         organizationid, onaccountreferenceid, movementtype, direction,
         amount, journalentryid, idempotencykey, idempotencysequence,
         description, createdby, createddate
       ) VALUES ($1, $2, 'journal_transfer_reversal', 'decrease', $3, $4, $5, 1, $6, $7, $8)
       RETURNING id`,
      [organizationId, destReferenceId, transferAmount, reversalId, `${idempotencyKey}-transfer`, `Transfer replacement: ${reason}`, actor, epoch]
    );
    const sourceReversalMovement = await client.query(
      `INSERT INTO on_account_movements (
         organizationid, onaccountreferenceid, movementtype, direction,
         amount, journalentryid, relatedmovementid, idempotencykey,
         idempotencysequence, description, createdby, createddate
       ) VALUES ($1, $2, 'journal_transfer_reversal', 'increase', $3, $4, $5, $6, 2, $7, $8, $9)
       RETURNING id`,
      [organizationId, sourceReferenceId, transferAmount, reversalId,
       destinationReversalMovement.rows[0].id, `${idempotencyKey}-transfer`, `Transfer replacement: ${reason}`, actor, epoch]
    );
    
    // Original journal update
    await client.query(`UPDATE journal_entries SET version = version + 1, modifiedby = $1, modifieddate = $2 WHERE id = $3`, [actor, epoch, journalId]);

    // 7. Audit Events
    await client.query(
      `INSERT INTO finance_audit_events (organizationid, entitytype, entityid, action, actor, eventdata)
       VALUES ($1, 'journal_entry', $2, 'reversal_posted', $3, $4::jsonb),
              ($1, 'journal_entry', $5, 'reversed', $3, $6::jsonb),
              ($1, 'on_account_reference', $7, 'replaced_with_payment', $3, $8::jsonb)`,
      [
        organizationId, reversalId, actor, JSON.stringify({ originaljournalid: journalId, reason }),
        journalId, JSON.stringify({ reversaljournalid: reversalId, reason }),
        destReferenceId, JSON.stringify({ replacementReferenceId, reason, reversedAllocationIds: allocationReversal.reversedAllocationIds })
      ]
    );

    await client.query("COMMIT");
    return { success: true, idempotent: false, reversaljournalid: reversalId, reversaljournalnumber: reversalNumber, reversedallocationids: allocationReversal.reversedAllocationIds };
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err instanceof FinanceValidationError) throw err;
    if (err?.code === "23505") {
      const concurrent = await pool.query(
        `SELECT reversal.id, reversal.journalnumber, destination.replacementreferenceid
           FROM journal_entries reversal
           JOIN on_account_references destination
             ON destination.organizationid = reversal.organizationid
            AND destination.reversaljournalentryid = reversal.id
          WHERE reversal.organizationid = $1
            AND reversal.sourcetype = 'on_account_transfer_reversal'
            AND reversal.requestidempotencykey = $2
            AND reversal.reversalofid = $3
          LIMIT 1`,
        [organizationId, idempotencyKey, journalId]
      );
      if (concurrent.rows[0] && Number(concurrent.rows[0].replacementreferenceid) === replacementReferenceId) {
        return { success: true, idempotent: true, reversaljournalid: Number(concurrent.rows[0].id), reversaljournalnumber: concurrent.rows[0].journalnumber };
      }
      throw new FinanceValidationError("This replacement request has already been processed with different details.", 409, "REPLACEMENT_DUPLICATE_REQUEST");
    }
    console.error("Customer On Account transfer replacement failed", {
      journalId,
      replacementReferenceId,
      code: err?.code,
      constraint: err?.constraint,
      message: err?.message,
    });
    throw new FinanceValidationError("Unable to replace the transfer. No financial changes were saved.", 500, "REPLACEMENT_FAILED");
  } finally {
    client.release();
  }
};
