import pool, { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  nowEpoch,
  resolveFinanceContext,
  toFinanceDateOnly,
} from "../utils/finance/finance.utils.js";
import {
  MANUAL_JOURNAL_SOURCE,
  NormalizedJournalDraft,
  formatJournalNumber,
  normalizeJournalDraft,
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
  reversalofid: row.reversalofid == null ? null : Number(row.reversalofid),
  entrydate: toFinanceDateOnly(row.entrydate) ?? row.entrydate,
  totaldebit: Number(row.totaldebit || 0),
  totalcredit: Number(row.totalcredit || 0),
  difference: Number(row.difference || 0),
  ismanual: row.sourcetype === MANUAL_JOURNAL_SOURCE,
  sourcelabel:
    row.sourcetype === MANUAL_JOURNAL_SOURCE
      ? "Manual Journal"
      : String(row.sourcetype || "System").replace(/_/g, " "),
});

export module journalService {
  export const list = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
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
    const fromdate = String(request.query?.fromdate || "").trim();
    const todate = String(request.query?.todate || "").trim();
    if (search) add("(je.journalnumber ILIKE ? OR je.reference ILIKE ? OR je.description ILIKE ?)", `%${search}%`);
    if (search) {
      const searchValue = values[values.length - 1];
      const position = values.length;
      conditions[conditions.length - 1] = `(je.journalnumber ILIKE $${position} OR je.reference ILIKE $${position} OR je.description ILIKE $${position})`;
    }
    if (status) add("je.status = ?", status);
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
      `SELECT je.*,
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
      `SELECT je.*,
         COALESCE(SUM(jl.debitamount), 0) AS totaldebit,
         COALESCE(SUM(jl.creditamount), 0) AS totalcredit,
         COALESCE(SUM(jl.debitamount), 0) - COALESCE(SUM(jl.creditamount), 0) AS difference
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl.journalentryid = je.id
       WHERE je.organizationid = $1 AND je.id = $2
       GROUP BY je.id`,
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
    return {
      ...serializeHeader(headerResult.rows[0]),
      lines: lineResult.rows.map((row: any) => ({
        ...row,
        id: Number(row.id),
        financeaccountid: Number(row.financeaccountid),
        debitamount: Number(row.debitamount || 0),
        creditamount: Number(row.creditamount || 0),
      })),
    };
  };

  export const createDraft = async (request: any) => {
    const { organizationId, actor } = resolveFinanceContext(request);
    const draft = normalizeJournalDraft(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await validateEligibleAccounts(client, organizationId, draft);
      const epoch = nowEpoch();
      const result = await client.query(
        `INSERT INTO journal_entries (
           organizationid, entrydate, sourcetype, sourceid, status, reference,
           description, createdby, createddate, modifiedby, modifieddate, version
         ) VALUES ($1, $2, $3, NULL, 'draft', $4, $5, $6, $7, $6, $7, 1)
         RETURNING *`,
        [
          organizationId,
          draft.entrydate,
          MANUAL_JOURNAL_SOURCE,
          draft.reference,
          draft.description,
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
        { journalnumber: journalNumber, totaldebit: draft.totaldebit, totalcredit: draft.totalcredit }
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
      const epoch = nowEpoch();
      await client.query(
        `UPDATE journal_entries
         SET entrydate = $1, reference = $2, description = $3,
             modifiedby = $4, modifieddate = $5, version = version + 1
         WHERE id = $6`,
        [draft.entrydate, draft.reference, draft.description, actor, epoch, journalId]
      );
      await client.query(`DELETE FROM journal_lines WHERE journalentryid = $1`, [journalId]);
      await insertLines(client, journalId, draft);
      await insertAuditEvent(client, organizationId, journalId, "draft_updated", actor, {
        previousversion: version,
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
}
