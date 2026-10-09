import pool, { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  nowEpoch,
  resolveFinanceContext,
  toFinanceDateOnly,
} from "../utils/finance/finance.utils.js";
import {
  MANUAL_JOURNAL_SOURCE,
  MANUAL_JOURNAL_REVERSAL_SOURCE,
  NormalizedJournalDraft,
  formatJournalNumber,
  normalizeJournalDraft,
  normalizeJournalReversal,
} from "../utils/finance/journal.utils.js";

const RESTRICTED_MANUAL_ACCOUNT_SUBTYPES = [
  "bank",
  "cash",
  "credit_card",
  "payment_clearing",
];

const requireId = (value: unknown, fieldName: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FinanceValidationError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
};

const pagination = (request: any) => {
  const page = Math.max(1, Number(request.query?.page) || 1);
  const count = Math.min(100, Math.max(1, Number(request.query?.count) || 10));
  return { page, count, offset: (page - 1) * count };
};

const insertAuditEvent = async (
  client: any,
  organizationId: number,
  journalId: number,
  action: string,
  actor: string,
  eventData: Record<string, unknown>
) => {
  await client.query(
    `INSERT INTO finance_audit_events
      (organizationid, entitytype, entityid, action, actor, eventdata)
     VALUES ($1, 'journal_entry', $2, $3, $4, $5::jsonb)`,
    [organizationId, journalId, action, actor, JSON.stringify(eventData)]
  );
};

const validateEligibleAccounts = async (
  client: any,
  organizationId: number,
  draft: NormalizedJournalDraft
) => {
  const ids = Array.from(new Set(draft.lines.map((line) => line.financeaccountid)));
  const result = await client.query(
    `SELECT id
     FROM finance_accounts
     WHERE organizationid = $1
       AND id = ANY($2::bigint[])
       AND status = 'active'
       AND isusercreatedchartaccount = TRUE
       AND issystem = FALSE
       AND accountsubtype <> ALL($3::text[])`,
    [organizationId, ids, RESTRICTED_MANUAL_ACCOUNT_SUBTYPES]
  );
  if (result.rows.length !== ids.length) {
    throw new FinanceValidationError(
      "One or more selected accounts are not available for manual Journal posting."
    );
  }
};

const validateRelatedEntry = async (
  client: any,
  organizationId: number,
  relatedJournalEntryId: number | null,
  currentJournalId?: number
) => {
  if (relatedJournalEntryId == null) return null;
  if (currentJournalId && relatedJournalEntryId === currentJournalId) {
    throw new FinanceValidationError("A Journal cannot be related to itself.");
  }
  const result = await client.query(
    `SELECT related.id, related.journalnumber, related.status
     FROM journal_entries related
     WHERE related.id = $1
       AND related.organizationid = $2
       AND related.status = 'posted'
       AND EXISTS (
         SELECT 1
         FROM journal_lines related_line
         JOIN finance_accounts related_account
           ON related_account.id = related_line.financeaccountid
          AND related_account.organizationid = related.organizationid
         WHERE related_line.journalentryid = related.id
           AND related_account.isusercreatedchartaccount = TRUE
           AND related_account.issystem = FALSE
           AND related_account.accountsubtype <> ALL($3::text[])
       )
       AND NOT EXISTS (
         SELECT 1 FROM journal_entries reversal
         WHERE reversal.reversalofid = related.id
       )
     LIMIT 1`,
    [relatedJournalEntryId, organizationId, RESTRICTED_MANUAL_ACCOUNT_SUBTYPES]
  );
  if (!result.rows[0]) {
    throw new FinanceValidationError(
      "The related accounting entry is unavailable, unposted, or already reversed.",
      409,
      "RELATED_JOURNAL_ENTRY_UNAVAILABLE"
    );
  }
  return result.rows[0];
};

const insertLines = async (
  client: any,
  journalId: number,
  draft: NormalizedJournalDraft
) => {
  for (const line of draft.lines) {
    await client.query(
      `INSERT INTO journal_lines (
         journalentryid, financeaccountid, debitamount, creditamount,
         description, lineorder
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        journalId,
        line.financeaccountid,
        line.debitamount,
        line.creditamount,
        line.description,
        line.lineorder,
      ]
    );
  }
};

const serializeHeader = (row: any) => ({
  ...row,
  id: Number(row.id),
  sourceid: row.sourceid == null ? null : Number(row.sourceid),
  sourcetransactionid:
    row.sourcetransactionid == null ? null : Number(row.sourcetransactionid),
  sourcebankcashaccountid:
    row.sourcebankcashaccountid == null
      ? null
      : Number(row.sourcebankcashaccountid),
  reversalofid: row.reversalofid == null ? null : Number(row.reversalofid),
  reversedbyid: row.reversedbyid == null ? null : Number(row.reversedbyid),
  relatedjournalentryid:
    row.relatedjournalentryid == null ? null : Number(row.relatedjournalentryid),
  relatedsourcetransactionid:
    row.relatedsourcetransactionid == null
      ? null
      : Number(row.relatedsourcetransactionid),
  entrydate: toFinanceDateOnly(row.entrydate) ?? row.entrydate,
  relatedentrydate:
    toFinanceDateOnly(row.relatedentrydate) ?? row.relatedentrydate ?? null,
  totaldebit: Number(row.totaldebit || 0),
  totalcredit: Number(row.totalcredit || 0),
  difference: Number(row.difference || 0),
  relatedtotaldebit: Number(row.relatedtotaldebit || 0),
  relatedtotalcredit: Number(row.relatedtotalcredit || 0),
  status: row.reversedbyid == null ? row.status : "reversed",
  ismanual: row.sourcetype === MANUAL_JOURNAL_SOURCE,
  sourcelabel:
    row.sourcetype === MANUAL_JOURNAL_SOURCE
      ? "Manual Journal"
      : row.sourcetype === MANUAL_JOURNAL_REVERSAL_SOURCE
        ? "Journal Reversal"
      : String(row.sourcetype || "System").replace(/_/g, " "),
});

export module journalService {
  export const listRelatedEntries = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const search = String(request.query?.search || "").trim();
    const excludeJournalId = Number(request.query?.excludejournalid || 0);
    const values: any[] = [organizationId, RESTRICTED_MANUAL_ACCOUNT_SUBTYPES];
    const conditions = [
      "entry.organizationid = $1",
      "entry.status = 'posted'",
      `entry.sourcetype <> '${MANUAL_JOURNAL_REVERSAL_SOURCE}'`,
      `EXISTS (
        SELECT 1
        FROM journal_lines eligible_line
        JOIN finance_accounts eligible_account
          ON eligible_account.id = eligible_line.financeaccountid
         AND eligible_account.organizationid = entry.organizationid
        WHERE eligible_line.journalentryid = entry.id
          AND eligible_account.isusercreatedchartaccount = TRUE
          AND eligible_account.issystem = FALSE
          AND eligible_account.accountsubtype <> ALL($2::text[])
      )`,
      "NOT EXISTS (SELECT 1 FROM journal_entries reversal WHERE reversal.reversalofid = entry.id)",
    ];
    if (Number.isSafeInteger(excludeJournalId) && excludeJournalId > 0) {
      values.push(excludeJournalId);
      conditions.push(`entry.id <> $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      const position = values.length;
      conditions.push(`(
        entry.journalnumber ILIKE $${position}
        OR COALESCE(entry.reference, '') ILIKE $${position}
        OR entry.description ILIKE $${position}
        OR COALESCE(source_transaction.transactionnumber, '') ILIKE $${position}
        OR COALESCE(line_summary.accounts, '') ILIKE $${position}
      )`);
    }
    const result = await query(
      `SELECT entry.id, entry.journalnumber, entry.entrydate, entry.reference,
              entry.description, entry.sourcetype, entry.createdby,
              source_transaction.id AS sourcetransactionid,
              source_transaction.transactionnumber AS sourcereference,
              COALESCE(line_summary.totaldebit, 0) AS totaldebit,
              COALESCE(line_summary.totalcredit, 0) AS totalcredit,
              COALESCE(line_summary.accounts, '') AS accounts
       FROM journal_entries entry
       LEFT JOIN LATERAL (
         SELECT SUM(line.debitamount) AS totaldebit,
                SUM(line.creditamount) AS totalcredit,
                STRING_AGG(DISTINCT CONCAT(account.accountcode, ' — ', account.accountname), ', ') AS accounts
         FROM journal_lines line
         JOIN finance_accounts account ON account.id = line.financeaccountid
         WHERE line.journalentryid = entry.id
       ) line_summary ON TRUE
       LEFT JOIN bank_transactions source_transaction
         ON entry.sourcetype = 'bank_transaction'
        AND source_transaction.id = entry.sourceid
        AND source_transaction.organizationid = entry.organizationid
       WHERE ${conditions.join(" AND ")}
       ORDER BY entry.entrydate DESC, entry.id DESC
       LIMIT 50`,
      values
    );
    return result.rows.map((row: any) => ({
      id: Number(row.id),
      journalnumber: row.journalnumber,
      entrydate: toFinanceDateOnly(row.entrydate) ?? row.entrydate,
      reference: row.reference,
      description: row.description,
      sourcetype: row.sourcetype,
      sourcelabel:
        row.sourcetype === MANUAL_JOURNAL_SOURCE
          ? "Manual Journal"
          : row.sourcetype === MANUAL_JOURNAL_REVERSAL_SOURCE
            ? "Journal Reversal"
            : String(row.sourcetype || "System").replace(/_/g, " "),
      sourcetransactionid: row.sourcetransactionid == null ? null : Number(row.sourcetransactionid),
      sourcereference: row.sourcereference,
      totaldebit: Number(row.totaldebit || 0),
      totalcredit: Number(row.totalcredit || 0),
      accounts: row.accounts,
      createdby: row.createdby,
    }));
  };

  export const list = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const { page, count, offset } = pagination(request);
    const values: any[] = [organizationId];
    const conditions = ["je.organizationid = $1"];
    const add = (condition: string, value: unknown) => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };
    const search = String(request.query?.search || "").trim();
    const status = String(request.query?.status || "").trim().toLowerCase();
    const source = String(request.query?.source || "").trim().toLowerCase();
    const category = String(request.query?.category || "all").trim().toLowerCase();
    const createdByMe = String(request.query?.createdbyme || "").trim().toLowerCase() === "true";
    const fromdate = String(request.query?.fromdate || "").trim();
    const todate = String(request.query?.todate || "").trim();
    if (!["all", "manual", "system"].includes(category)) {
      throw new FinanceValidationError(
        "category must be all, manual, or system."
      );
    }
    if (category === "manual") {
      values.push([MANUAL_JOURNAL_SOURCE, MANUAL_JOURNAL_REVERSAL_SOURCE]);
      conditions.push(`je.sourcetype = ANY($${values.length}::text[])`);
    } else if (category === "system") {
      values.push([MANUAL_JOURNAL_SOURCE, MANUAL_JOURNAL_REVERSAL_SOURCE]);
      conditions.push(`je.sourcetype <> ALL($${values.length}::text[])`);
    }
    if (createdByMe) add("je.createdby = ?", actor);
    if (search) add("(je.journalnumber ILIKE ? OR je.reference ILIKE ? OR je.description ILIKE ?)", `%${search}%`);
    if (search) {
      const position = values.length;
      conditions[conditions.length - 1] = `(je.journalnumber ILIKE $${position} OR je.reference ILIKE $${position} OR je.description ILIKE $${position})`;
    }
    if (status === "reversed") {
      conditions.push(
        "EXISTS (SELECT 1 FROM journal_entries reversed WHERE reversed.reversalofid = je.id)"
      );
    } else if (status === "posted") {
      conditions.push(
        "je.status = 'posted' AND NOT EXISTS (SELECT 1 FROM journal_entries reversed WHERE reversed.reversalofid = je.id)"
      );
    } else if (status) {
      add("je.status = ?", status);
    }
    if (source) add("je.sourcetype = ?", source);
    if (fromdate) add("je.entrydate >= ?::date", fromdate);
    if (todate) add("je.entrydate <= ?::date", todate);
    const where = conditions.join(" AND ");

    const totalResult = await query(
      `SELECT COUNT(*)::integer AS total FROM journal_entries je WHERE ${where}`,
      values
    );
    const pageValues = [...values, count, offset];
    const rows = await query(
      `SELECT je.*, reversal.id AS reversedbyid,
         reversal.journalnumber AS reversedbyjournalnumber,
         source_transaction.id AS sourcetransactionid,
         source_transaction.transactionnumber AS sourcereference,
         CASE
           WHEN je.sourcetype = 'bank_account_opening' THEN je.sourceid
           ELSE source_transaction.bankcashaccountid
         END AS sourcebankcashaccountid,
         COALESCE(t.totaldebit, 0) AS totaldebit,
         COALESCE(t.totalcredit, 0) AS totalcredit,
         COALESCE(t.totaldebit, 0) - COALESCE(t.totalcredit, 0) AS difference
       FROM journal_entries je
       LEFT JOIN LATERAL (
         SELECT SUM(jl.debitamount) AS totaldebit,
                SUM(jl.creditamount) AS totalcredit
         FROM journal_lines jl
         WHERE jl.journalentryid = je.id
       ) t ON TRUE
       LEFT JOIN LATERAL (
         SELECT reversed.id, reversed.journalnumber
         FROM journal_entries reversed
         WHERE reversed.reversalofid = je.id
         ORDER BY reversed.id DESC
         LIMIT 1
       ) reversal ON TRUE
       LEFT JOIN bank_transactions source_transaction
         ON je.sourcetype = 'bank_transaction'
        AND source_transaction.id = je.sourceid
        AND source_transaction.organizationid = je.organizationid
       WHERE ${where}
       ORDER BY je.entrydate DESC, je.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      pageValues
    );
    return {
      records: rows.rows.map(serializeHeader),
      total: Number(totalResult.rows[0]?.total || 0),
      page,
      count,
    };
  };

  export const listEligibleAccounts = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const search = String(request.query?.search || "").trim();
    const values: any[] = [organizationId, RESTRICTED_MANUAL_ACCOUNT_SUBTYPES];
    let searchClause = "";
    if (search) {
      values.push(`%${search}%`);
      searchClause = `AND (accountname ILIKE $3 OR accountcode ILIKE $3)`;
    }
    const result = await query(
      `SELECT id, accountcode, accountname, accounttype, accountsubtype
       FROM finance_accounts
       WHERE organizationid = $1
         AND status = 'active'
         AND isusercreatedchartaccount = TRUE
         AND issystem = FALSE
         AND accountsubtype <> ALL($2::text[])
         ${searchClause}
       ORDER BY accountname ASC, id ASC
       LIMIT 200`,
      values
    );
    return result.rows.map((row: any) => ({ ...row, id: Number(row.id) }));
  };

  export const getById = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const journalId = requireId(request.params?.journalId, "journalId");
    const headerResult = await query(
      `SELECT je.*, reversal.id AS reversedbyid,
         reversal.journalnumber AS reversedbyjournalnumber,
         related.journalnumber AS relatedjournalnumber,
         related.entrydate AS relatedentrydate,
         related.description AS relateddescription,
         related.reference AS relatedreference,
         related.sourcetype AS relatedsourcetype,
         related_source.id AS relatedsourcetransactionid,
         related_source.transactionnumber AS relatedsourcereference,
         COALESCE(related_summary.totaldebit, 0) AS relatedtotaldebit,
         COALESCE(related_summary.totalcredit, 0) AS relatedtotalcredit,
         COALESCE(related_summary.accounts, '') AS relatedaccounts,
         source_transaction.id AS sourcetransactionid,
         source_transaction.transactionnumber AS sourcereference,
         CASE
           WHEN je.sourcetype = 'bank_account_opening' THEN je.sourceid
           ELSE source_transaction.bankcashaccountid
         END AS sourcebankcashaccountid,
         COALESCE(t.totaldebit, 0) AS totaldebit,
         COALESCE(t.totalcredit, 0) AS totalcredit,
         COALESCE(t.totaldebit, 0) - COALESCE(t.totalcredit, 0) AS difference
       FROM journal_entries je
       LEFT JOIN LATERAL (
         SELECT SUM(jl.debitamount) AS totaldebit,
                SUM(jl.creditamount) AS totalcredit
         FROM journal_lines jl
         WHERE jl.journalentryid = je.id
       ) t ON TRUE
       LEFT JOIN LATERAL (
         SELECT reversed.id, reversed.journalnumber
         FROM journal_entries reversed
         WHERE reversed.reversalofid = je.id
         ORDER BY reversed.id DESC
         LIMIT 1
       ) reversal ON TRUE
       LEFT JOIN bank_transactions source_transaction
         ON je.sourcetype = 'bank_transaction'
        AND source_transaction.id = je.sourceid
        AND source_transaction.organizationid = je.organizationid
       LEFT JOIN journal_entries related
         ON related.id = je.relatedjournalentryid
        AND related.organizationid = je.organizationid
       LEFT JOIN bank_transactions related_source
         ON related.sourcetype = 'bank_transaction'
        AND related_source.id = related.sourceid
        AND related_source.organizationid = related.organizationid
       LEFT JOIN LATERAL (
         SELECT SUM(line.debitamount) AS totaldebit,
                SUM(line.creditamount) AS totalcredit,
                STRING_AGG(DISTINCT CONCAT(account.accountcode, ' — ', account.accountname), ', ') AS accounts
         FROM journal_lines line
         JOIN finance_accounts account ON account.id = line.financeaccountid
         WHERE line.journalentryid = related.id
       ) related_summary ON TRUE
       WHERE je.organizationid = $1 AND je.id = $2
       LIMIT 1`,
      [organizationId, journalId]
    );
    if (!headerResult.rows[0]) {
      throw new FinanceValidationError("Journal not found.", 404, "JOURNAL_NOT_FOUND");
    }
    const lineResult = await query(
      `SELECT jl.id, jl.financeaccountid, jl.description, jl.debitamount,
              jl.creditamount, jl.lineorder, fa.accountcode, fa.accountname,
              fa.accounttype, fa.accountsubtype
       FROM journal_lines jl
       JOIN finance_accounts fa ON fa.id = jl.financeaccountid
       WHERE jl.journalentryid = $1
       ORDER BY jl.lineorder ASC, jl.id ASC`,
      [journalId]
    );
    const auditResult = await query(
      `SELECT id, action, actor, eventdata, createddate
       FROM finance_audit_events
       WHERE organizationid = $1
         AND entitytype = 'journal_entry'
         AND entityid = $2
       ORDER BY createddate DESC, id DESC`,
      [organizationId, journalId]
    );
    const transferResult = await query(
      `SELECT source_ref.id AS sourcereferenceid,
              source_ref.referencenumber AS sourcereferencenumber,
              source_ref.partyid AS sourcecustomerid,
              COALESCE(NULLIF(CONCAT_WS(' ', source_user.firstname, source_user.lastname), ''), source_user.useremail, 'Customer ' || source_user.id::text) AS sourcecustomername,
              destination_ref.id AS destinationreferenceid,
              destination_ref.referencenumber AS destinationreferencenumber,
              destination_ref.partyid AS destinationcustomerid,
              COALESCE(NULLIF(CONCAT_WS(' ', destination_user.firstname, destination_user.lastname), ''), destination_user.useremail, 'Customer ' || destination_user.id::text) AS destinationcustomername,
              destination_ref.originalamount AS transferamount,
              destination_ref.currencycode,
              destination_ref.status AS destinationstatus,
              destination_ref.replacementreferenceid,
              replacement_ref.referencenumber AS replacementreferencenumber,
              destination_ref.reversaljournalentryid,
              source_movement.id AS sourcemovementid,
              destination_movement.id AS destinationmovementid
       FROM on_account_references destination_ref
       JOIN on_account_references source_ref
         ON source_ref.id = destination_ref.transferredfromreferenceid
        AND source_ref.organizationid = destination_ref.organizationid
       JOIN users source_user ON source_user.id = source_ref.partyid
       JOIN users destination_user ON destination_user.id = destination_ref.partyid
       LEFT JOIN on_account_references replacement_ref
         ON replacement_ref.id = destination_ref.replacementreferenceid
        AND replacement_ref.organizationid = destination_ref.organizationid
       LEFT JOIN on_account_movements source_movement
         ON source_movement.organizationid = destination_ref.organizationid
        AND source_movement.onaccountreferenceid = source_ref.id
        AND source_movement.journalentryid = $2
        AND source_movement.movementtype = 'journal_transfer_out'
       LEFT JOIN on_account_movements destination_movement
         ON destination_movement.organizationid = destination_ref.organizationid
        AND destination_movement.onaccountreferenceid = destination_ref.id
        AND destination_movement.journalentryid = $2
        AND destination_movement.movementtype = 'journal_transfer_in'
       WHERE destination_ref.organizationid = $1
         AND destination_ref.sourcejournalentryid = $2
         AND destination_ref.sourcetype = 'on_account_transfer'
       LIMIT 1`,
      [organizationId, journalId]
    );
    const transfer = transferResult.rows[0];
    return {
      ...serializeHeader(headerResult.rows[0]),
      lines: lineResult.rows.map((row: any) => ({
        ...row,
        id: Number(row.id),
        financeaccountid: Number(row.financeaccountid),
        debitamount: Number(row.debitamount || 0),
        creditamount: Number(row.creditamount || 0),
      })),
      auditevents: auditResult.rows.map((row: any) => ({
        id: Number(row.id),
        action: row.action,
        actor: row.actor,
        eventdata: row.eventdata && typeof row.eventdata === "object"
          ? row.eventdata
          : {},
        createddate: Number(row.createddate),
      })),
      transfer: transfer ? {
        ...transfer,
        sourcereferenceid: Number(transfer.sourcereferenceid),
        sourcecustomerid: Number(transfer.sourcecustomerid),
        destinationreferenceid: Number(transfer.destinationreferenceid),
        destinationcustomerid: Number(transfer.destinationcustomerid),
        transferamount: Number(transfer.transferamount),
        replacementreferenceid: transfer.replacementreferenceid == null ? null : Number(transfer.replacementreferenceid),
        reversaljournalentryid: transfer.reversaljournalentryid == null ? null : Number(transfer.reversaljournalentryid),
        sourcemovementid: transfer.sourcemovementid == null ? null : Number(transfer.sourcemovementid),
        destinationmovementid: transfer.destinationmovementid == null ? null : Number(transfer.destinationmovementid),
      } : null,
    };
  };

  export const createDraft = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const draft = normalizeJournalDraft(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await validateEligibleAccounts(client, organizationId, draft);
      await validateRelatedEntry(client, organizationId, draft.relatedjournalentryid);
      const epoch = nowEpoch();
      const result = await client.query(
        `INSERT INTO journal_entries (
           organizationid, entrydate, sourcetype, sourceid, status, reference,
           description, journalpurpose, relatedjournalentryid,
           createdby, createddate, modifiedby, modifieddate, version
         ) VALUES ($1, $2, $3, NULL, 'draft', $4, $5, $6, $7, $8, $9, $8, $9, 1)
         RETURNING *`,
        [
          organizationId,
          draft.entrydate,
          MANUAL_JOURNAL_SOURCE,
          draft.reference,
          draft.description,
          draft.journalpurpose,
          draft.relatedjournalentryid,
          actor,
          epoch,
        ]
      );
      const journal = result.rows[0];
      const journalNumber = formatJournalNumber(Number(journal.id));
      await client.query(
        `UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`,
        [journalNumber, journal.id]
      );
      await insertLines(client, Number(journal.id), draft);
      await insertAuditEvent(
        client,
        organizationId,
        Number(journal.id),
        "draft_created",
        actor,
        { journalnumber: journalNumber, journalpurpose: draft.journalpurpose,
          relatedjournalentryid: draft.relatedjournalentryid,
          totaldebit: draft.totaldebit, totalcredit: draft.totalcredit }
      );
      await client.query("COMMIT");
      request.params = { journalId: journal.id };
      return await getById(request);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  export const updateDraft = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const journalId = requireId(request.params?.journalId, "journalId");
    const version = requireId(request.body?.version, "version");
    const draft = normalizeJournalDraft(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT * FROM journal_entries
         WHERE id = $1 AND organizationid = $2
         FOR UPDATE`,
        [journalId, organizationId]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new FinanceValidationError("Journal not found.", 404, "JOURNAL_NOT_FOUND");
      }
      if (current.sourcetype !== MANUAL_JOURNAL_SOURCE || current.status !== "draft") {
        throw new FinanceValidationError("Only a manual Draft can be edited.", 409, "JOURNAL_NOT_EDITABLE");
      }
      if (Number(current.version) !== version) {
        throw new FinanceValidationError(
          "The Journal changed after you opened it. Refresh and try again.",
          409,
          "JOURNAL_VERSION_CONFLICT"
        );
      }
      await validateEligibleAccounts(client, organizationId, draft);
      await validateRelatedEntry(client, organizationId, draft.relatedjournalentryid, journalId);
      const epoch = nowEpoch();
      await client.query(
        `UPDATE journal_entries
         SET entrydate = $1, reference = $2, description = $3,
             journalpurpose = $4, relatedjournalentryid = $5,
             modifiedby = $6, modifieddate = $7, version = version + 1
         WHERE id = $8`,
        [draft.entrydate, draft.reference, draft.description,
          draft.journalpurpose, draft.relatedjournalentryid,
          actor, epoch, journalId]
      );
      await client.query(`DELETE FROM journal_lines WHERE journalentryid = $1`, [journalId]);
      await insertLines(client, journalId, draft);
      await insertAuditEvent(client, organizationId, journalId, "draft_updated", actor, {
        previousversion: version,
        journalpurpose: draft.journalpurpose,
        relatedjournalentryid: draft.relatedjournalentryid,
        totaldebit: draft.totaldebit,
        totalcredit: draft.totalcredit,
      });
      await client.query("COMMIT");
      return await getById(request);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  export const postDraft = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const journalId = requireId(request.params?.journalId, "journalId");
    const version = requireId(request.body?.version, "version");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT * FROM journal_entries
         WHERE id = $1 AND organizationid = $2
         FOR UPDATE`,
        [journalId, organizationId]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new FinanceValidationError("Journal not found.", 404, "JOURNAL_NOT_FOUND");
      }
      if (current.sourcetype !== MANUAL_JOURNAL_SOURCE || current.status !== "draft") {
        throw new FinanceValidationError("Only a manual Draft can be posted.", 409, "JOURNAL_NOT_POSTABLE");
      }
      if (Number(current.version) !== version) {
        throw new FinanceValidationError(
          "The Journal changed after you opened it. Refresh and try again.",
          409,
          "JOURNAL_VERSION_CONFLICT"
        );
      }
      const totalsResult = await client.query(
        `SELECT COUNT(*)::integer AS linecount,
                COALESCE(SUM(debitamount), 0) AS totaldebit,
                COALESCE(SUM(creditamount), 0) AS totalcredit
         FROM journal_lines
         WHERE journalentryid = $1`,
        [journalId]
      );
      const totals = totalsResult.rows[0];
      await validateRelatedEntry(
        client,
        organizationId,
        current.relatedjournalentryid == null ? null : Number(current.relatedjournalentryid),
        journalId
      );
      if (Number(totals.linecount) < 2) {
        throw new FinanceValidationError("At least two Journal lines are required before posting.");
      }
      const debitCents = Math.round(Number(totals.totaldebit) * 100);
      const creditCents = Math.round(Number(totals.totalcredit) * 100);
      if (debitCents <= 0 || debitCents !== creditCents) {
        throw new FinanceValidationError(
          "Total Debit and Total Credit must be equal before posting.",
          409,
          "JOURNAL_NOT_BALANCED"
        );
      }
      const eligibleResult = await client.query(
        `SELECT COUNT(DISTINCT jl.financeaccountid)::integer AS eligiblecount,
                (COUNT(DISTINCT jl.financeaccountid) FILTER (
                  WHERE fa.id IS NOT NULL
                    AND fa.status = 'active'
                    AND fa.isusercreatedchartaccount = TRUE
                    AND fa.issystem = FALSE
                    AND fa.accountsubtype <> ALL($3::text[])
                ))::integer AS validcount
         FROM journal_lines jl
         LEFT JOIN finance_accounts fa
           ON fa.id = jl.financeaccountid AND fa.organizationid = $2
         WHERE jl.journalentryid = $1`,
        [journalId, organizationId, RESTRICTED_MANUAL_ACCOUNT_SUBTYPES]
      );
      const eligibility = eligibleResult.rows[0];
      if (Number(eligibility?.eligiblecount || 0) !== Number(eligibility?.validcount || 0)) {
        throw new FinanceValidationError(
          "One or more Journal accounts are no longer eligible for posting.",
          409,
          "JOURNAL_ACCOUNT_INELIGIBLE"
        );
      }
      const epoch = nowEpoch();
      await client.query(
        `UPDATE journal_entries
         SET status = 'posted', postedby = $1, posteddate = $2,
             modifiedby = $1, modifieddate = $2, version = version + 1
         WHERE id = $3`,
        [actor, epoch, journalId]
      );
      await insertAuditEvent(client, organizationId, journalId, "posted", actor, {
        version,
        totaldebit: debitCents / 100,
        totalcredit: creditCents / 100,
      });
      await client.query("COMMIT");
      return await getById(request);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  export const reversePosted = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const journalId = requireId(request.params?.journalId, "journalId");
    const version = requireId(request.body?.version, "version");
    const reversal = normalizeJournalReversal(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT * FROM journal_entries
         WHERE id = $1 AND organizationid = $2
         FOR UPDATE`,
        [journalId, organizationId]
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new FinanceValidationError("Journal not found.", 404, "JOURNAL_NOT_FOUND");
      }
      if (current.sourcetype !== MANUAL_JOURNAL_SOURCE || current.status !== "posted") {
        throw new FinanceValidationError(
          "Only a posted manual Journal can be reversed from this workspace.",
          409,
          "JOURNAL_NOT_REVERSIBLE"
        );
      }
      if (Number(current.version) !== version) {
        throw new FinanceValidationError(
          "The Journal changed after you opened it. Refresh and try again.",
          409,
          "JOURNAL_VERSION_CONFLICT"
        );
      }
      if (reversal.reversaldate < toFinanceDateOnly(current.entrydate)!) {
        throw new FinanceValidationError(
          "Reversal Date cannot be earlier than the original Entry Date."
        );
      }
      const existingResult = await client.query(
        `SELECT id FROM journal_entries WHERE reversalofid = $1 LIMIT 1`,
        [journalId]
      );
      if (existingResult.rows[0]) {
        throw new FinanceValidationError(
          "This Journal has already been reversed.",
          409,
          "JOURNAL_ALREADY_REVERSED"
        );
      }
      const linesResult = await client.query(
        `SELECT financeaccountid, partytype, partyid, debitamount,
                creditamount, description, lineorder
         FROM journal_lines
         WHERE journalentryid = $1
         ORDER BY lineorder ASC, id ASC`,
        [journalId]
      );
      if (linesResult.rows.length < 2) {
        throw new FinanceValidationError("The original Journal has no reversible lines.");
      }
      const epoch = nowEpoch();
      const reversalResult = await client.query(
        `INSERT INTO journal_entries (
           organizationid, entrydate, sourcetype, sourceid, status, reference,
           description, reversalofid, createdby, postedby, createddate,
           posteddate, modifiedby, modifieddate, version
         ) VALUES ($1, $2, $3, $4, 'posted', $5, $6, $4, $7, $7, $8, $8, $7, $8, 1)
         RETURNING id`,
        [
          organizationId,
          reversal.reversaldate,
          MANUAL_JOURNAL_REVERSAL_SOURCE,
          journalId,
          `Reversal of ${current.journalnumber}`,
          `Reversal of ${current.journalnumber}: ${reversal.reason}`,
          actor,
          epoch,
        ]
      );
      const reversalId = Number(reversalResult.rows[0].id);
      const reversalNumber = formatJournalNumber(reversalId);
      await client.query(
        `UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`,
        [reversalNumber, reversalId]
      );
      for (const line of linesResult.rows) {
        await client.query(
          `INSERT INTO journal_lines (
             journalentryid, financeaccountid, partytype, partyid,
             debitamount, creditamount, description, lineorder
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            reversalId,
            line.financeaccountid,
            line.partytype,
            line.partyid,
            line.creditamount,
            line.debitamount,
            line.description,
            line.lineorder,
          ]
        );
      }
      await client.query(
        `UPDATE journal_entries
         SET modifiedby = $1, modifieddate = $2, version = version + 1
         WHERE id = $3`,
        [actor, epoch, journalId]
      );
      await insertAuditEvent(client, organizationId, journalId, "reversed", actor, {
        reversaljournalid: reversalId,
        reversaljournalnumber: reversalNumber,
        reversaldate: reversal.reversaldate,
        reason: reversal.reason,
      });
      await insertAuditEvent(client, organizationId, reversalId, "reversal_posted", actor, {
        originaljournalid: journalId,
        originaljournalnumber: current.journalnumber,
        reason: reversal.reason,
      });
      await client.query("COMMIT");
      request.params = { journalId: reversalId };
      return await getById(request);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}
