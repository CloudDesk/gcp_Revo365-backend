import { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  requireIsoDate,
  resolveFinanceContext,
  toFinanceDateOnly,
  toMoney,
} from "../utils/finance/finance.utils.js";
import {
  buildOnAccountReadScope,
  isOnAccountReferenceReconciled,
  normalizeOnAccountStatusFilter,
} from "../utils/finance/onAccount.utils.js";

const positiveInteger = (
  value: unknown,
  fieldName: string,
  fallback?: number,
  maximum = Number.MAX_SAFE_INTEGER
) => {
  if ((value === undefined || value === null || value === "") && fallback) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new FinanceValidationError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
};

const optionalDate = (value: unknown, fieldName: string) => {
  if (value === undefined || value === null || value === "") return null;
  return requireIsoDate(value, fieldName);
};

const serializeReference = (row: any) => ({
  id: Number(row.id),
  referencenumber: row.referencenumber,
  partytype: row.partytype,
  customerid: Number(row.partyid),
  customername: row.customername,
  customeremail: row.customeremail || null,
  customermobile: row.customermobile || null,
  isbusinessuser: Boolean(row.isbusinessuser),
  currencycode: row.currencycode,
  sourcetype: row.sourcetype,
  sourceid: row.sourceid || null,
  originalamount: toMoney(row.originalamount),
  usedamount: toMoney(row.usedamount),
  availableamount: toMoney(row.availableamount),
  movementbalance: toMoney(row.movementbalance),
  movementcount: Number(row.movementcount || 0),
  reconciled: isOnAccountReferenceReconciled(
    row.availableamount,
    row.movementbalance
  ),
  status: row.status,
  version: Number(row.version || 0),
  createdby: row.createdby || null,
  modifiedby: row.modifiedby || null,
  createddate: Number(row.createddate || 0),
  modifieddate: Number(row.modifieddate || 0),
  banktransaction: row.banktransactionid
    ? {
        id: Number(row.banktransactionid),
        transactionnumber: row.transactionnumber || null,
        transactiondate:
          toFinanceDateOnly(row.transactiondate) || row.transactiondate || null,
        accountid: Number(row.bankcashaccountid),
        accountname: row.bankcashaccountname || null,
        sourcepaymentid: row.sourcepaymentid || null,
        merchanttransactionid: row.merchanttransactionid || null,
      }
    : null,
  journal: row.journalentryid
    ? {
        id: Number(row.journalentryid),
        journalnumber: row.journalnumber || null,
        entrydate: toFinanceDateOnly(row.journaldate) || row.journaldate || null,
      }
    : null,
});

const serializeSupplierReference = (row: any) => ({
  id: Number(row.id),
  referencenumber: row.referencenumber,
  partytype: row.partytype,
  supplierid: Number(row.partyid),
  suppliername: row.suppliername,
  supplieremail: row.supplieremail || null,
  suppliermobile: row.suppliermobile || null,
  suppliercode: row.suppliercode || null,
  currencycode: row.currencycode,
  sourcetype: row.sourcetype,
  sourceid: row.sourceid || null,
  originalamount: toMoney(row.originalamount),
  usedamount: toMoney(row.usedamount),
  availableamount: toMoney(row.availableamount),
  movementbalance: toMoney(row.movementbalance),
  movementcount: Number(row.movementcount || 0),
  reconciled: isOnAccountReferenceReconciled(
    row.availableamount,
    row.movementbalance
  ),
  status: row.status,
  version: Number(row.version || 0),
  createdby: row.createdby || null,
  modifiedby: row.modifiedby || null,
  createddate: Number(row.createddate || 0),
  modifieddate: Number(row.modifieddate || 0),
  banktransaction: row.banktransactionid
    ? {
        id: Number(row.banktransactionid),
        transactionnumber: row.transactionnumber || null,
        transactiondate:
          toFinanceDateOnly(row.transactiondate) || row.transactiondate || null,
        accountid: Number(row.bankcashaccountid),
        accountname: row.bankcashaccountname || null,
        sourcepaymentid: row.sourcepaymentid || null,
        merchanttransactionid: row.merchanttransactionid || null,
      }
    : null,
  journal: row.journalentryid
    ? {
        id: Number(row.journalentryid),
        journalnumber: row.journalnumber || null,
        entrydate: toFinanceDateOnly(row.journaldate) || row.journaldate || null,
      }
    : null,
});

const buildReferenceSelect = (conditions: string[]) => `
  WITH movement_totals AS (
    SELECT
      organizationid,
      onaccountreferenceid,
      COUNT(*)::int AS movementcount,
      COALESCE(
        SUM(CASE direction WHEN 'increase' THEN amount ELSE -amount END),
        0
      )::numeric(18, 2) AS movementbalance
    FROM on_account_movements
    GROUP BY organizationid, onaccountreferenceid
  )
  SELECT
    r.*,
    COALESCE(
      NULLIF(CONCAT_WS(' ', NULLIF(TRIM(u.firstname), ''), NULLIF(TRIM(u.lastname), '')), ''),
      NULLIF(TRIM(u.useremail), ''),
      'Customer ' || u.id::text
    ) AS customername,
    u.useremail AS customeremail,
    u.usermobilenumber AS customermobile,
    u.isbusinessuser,
    COALESCE(mt.movementcount, 0) AS movementcount,
    COALESCE(mt.movementbalance, 0) AS movementbalance,
    bt.id AS banktransactionid,
    bt.transactionnumber,
    bt.transactiondate,
    bt.bankcashaccountid,
    bt.sourcepaymentid,
    bt.merchanttransactionid,
    bca.accountname AS bankcashaccountname,
    j.id AS journalentryid,
    j.journalnumber,
    j.entrydate AS journaldate
  FROM on_account_references r
  JOIN users u ON u.id = r.partyid
  LEFT JOIN movement_totals mt
    ON mt.organizationid = r.organizationid
   AND mt.onaccountreferenceid = r.id
  LEFT JOIN bank_transactions bt
    ON bt.id = r.sourcebanktransactionid
   AND bt.organizationid = r.organizationid
  LEFT JOIN bank_cash_accounts bca
    ON bca.id = bt.bankcashaccountid
   AND bca.organizationid = r.organizationid
  LEFT JOIN journal_entries j
    ON j.id = r.sourcejournalentryid
   AND j.organizationid = r.organizationid
  WHERE ${conditions.join(" AND ")}
`;

const buildSupplierReferenceSelect = (conditions: string[]) => `
  WITH movement_totals AS (
    SELECT organizationid, onaccountreferenceid, COUNT(*)::int AS movementcount,
      COALESCE(SUM(CASE direction WHEN 'increase' THEN amount ELSE -amount END), 0)::numeric(18, 2) AS movementbalance
    FROM on_account_movements
    GROUP BY organizationid, onaccountreferenceid
  )
  SELECT
    r.*,
    COALESCE(NULLIF(TRIM(s.suppliername::text), ''), 'Supplier ' || s.id::text) AS suppliername,
    s.supplieremail AS supplieremail,
    s.supplierphonenumber AS suppliermobile,
    s.suppliercode AS suppliercode,
    COALESCE(mt.movementcount, 0) AS movementcount,
    COALESCE(mt.movementbalance, 0) AS movementbalance,
    bt.id AS banktransactionid, bt.transactionnumber, bt.transactiondate,
    bt.bankcashaccountid, bt.sourcepaymentid, bt.merchanttransactionid,
    bca.accountname AS bankcashaccountname,
    j.id AS journalentryid, j.journalnumber, j.entrydate AS journaldate
  FROM on_account_references r
  JOIN supplier s ON s.id = r.partyid
  LEFT JOIN movement_totals mt
    ON mt.organizationid = r.organizationid AND mt.onaccountreferenceid = r.id
  LEFT JOIN bank_transactions bt
    ON bt.id = r.sourcebanktransactionid AND bt.organizationid = r.organizationid
  LEFT JOIN bank_cash_accounts bca
    ON bca.id = bt.bankcashaccountid AND bca.organizationid = r.organizationid
  LEFT JOIN journal_entries j
    ON j.id = r.sourcejournalentryid AND j.organizationid = r.organizationid
  WHERE ${conditions.join(" AND ")}
`;

const loadMovements = async (organizationId: number, referenceId: number) => {
  const movementResult = await query(
    `
    SELECT m.*, bt.transactionnumber, bt.transactiondate,
      j.journalnumber, j.entrydate AS journaldate,
      COALESCE(oa.documenttype, a.documenttype) AS documenttype,
      COALESCE(oa.documentid, a.documentid) AS documentid,
      COALESCE(oa.documentnumber, a.documentnumber) AS documentnumber,
      purchase_document.id AS documentparentid,
      COALESCE(oa.bankportion, a.allocationamount) AS allocationamount,
      COALESCE(oa.tdsamount, a.tdsamount) AS tdsamount,
      COALESCE(oa.totalsettlement, a.totalsettledamount) AS totalsettledamount,
      rm.movementtype AS relatedmovementtype
    FROM on_account_movements m
    LEFT JOIN bank_transactions bt ON bt.id = m.banktransactionid AND bt.organizationid = m.organizationid
    LEFT JOIN journal_entries j ON j.id = m.journalentryid AND j.organizationid = m.organizationid
    LEFT JOIN bank_transaction_allocations a ON a.id = m.banktransactionallocationid
    LEFT JOIN on_account_document_allocations oa
      ON oa.onaccountmovementid = m.id AND oa.organizationid = m.organizationid AND oa.status = 'applied'
    LEFT JOIN LATERAL (
      SELECT po.id
      FROM poinvoice bill
      JOIN purchaseorder po ON po.ponumber = bill.ponumber
      WHERE COALESCE(oa.documenttype, a.documenttype) = 'purchase_bill'
        AND bill.id = COALESCE(oa.documentid, a.documentid)
      ORDER BY po.id DESC
      LIMIT 1
    ) purchase_document ON TRUE
    LEFT JOIN on_account_movements rm ON rm.id = m.relatedmovementid AND rm.organizationid = m.organizationid
    WHERE m.organizationid = $1 AND m.onaccountreferenceid = $2
    ORDER BY m.createddate ASC, m.id ASC
    `,
    [organizationId, referenceId]
  );
  return movementResult.rows.map((movement: any) => ({
    id: Number(movement.id), movementtype: movement.movementtype,
    direction: movement.direction, amount: toMoney(movement.amount),
    banktransactionid: movement.banktransactionid ? Number(movement.banktransactionid) : null,
    transactionnumber: movement.transactionnumber || null,
    transactiondate: toFinanceDateOnly(movement.transactiondate) || movement.transactiondate || null,
    journalentryid: movement.journalentryid ? Number(movement.journalentryid) : null,
    journalnumber: movement.journalnumber || null,
    journaldate: toFinanceDateOnly(movement.journaldate) || movement.journaldate || null,
    documenttype: movement.documenttype || null,
    documentid: movement.documentid ? Number(movement.documentid) : null,
    documentnumber: movement.documentnumber || null,
    documentparentid: movement.documentparentid ? Number(movement.documentparentid) : null,
    allocationamount: movement.allocationamount == null ? null : toMoney(movement.allocationamount),
    tdsamount: movement.tdsamount == null ? null : toMoney(movement.tdsamount),
    totalsettledamount: movement.totalsettledamount == null ? null : toMoney(movement.totalsettledamount),
    relatedmovementid: movement.relatedmovementid ? Number(movement.relatedmovementid) : null,
    relatedmovementtype: movement.relatedmovementtype || null,
    idempotencykey: movement.idempotencykey || null,
    idempotencysequence: Number(movement.idempotencysequence || 1),
    description: movement.description || null,
    createdby: movement.createdby || null,
    createddate: Number(movement.createddate || 0),
  }));
};

export module onAccountReferenceService {
  export const listCustomerReferences = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const page = positiveInteger(request.query?.page, "page", 1, 1_000_000);
    const count = positiveInteger(request.query?.count, "count", 10, 100);
    const search = String(request.query?.search || "").trim();
    const status = normalizeOnAccountStatusFilter(request.query?.status);
    const customerId = request.query?.customerid
      ? positiveInteger(request.query.customerid, "customerid")
      : null;
    const fromDate = optionalDate(request.query?.fromdate, "fromdate");
    const toDate = optionalDate(request.query?.todate, "todate");
    if (fromDate && toDate && fromDate > toDate) {
      throw new FinanceValidationError("fromdate cannot be later than todate.");
    }
    const { params, conditions } = buildOnAccountReadScope(organizationId, "customer");
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        r.referencenumber ILIKE $${params.length}
        OR r.sourceid ILIKE $${params.length}
        OR CONCAT_WS(' ', u.firstname, u.lastname) ILIKE $${params.length}
        OR u.useremail ILIKE $${params.length}
        OR u.usermobilenumber::text ILIKE $${params.length}
        OR bt.transactionnumber ILIKE $${params.length}
        OR bt.sourcepaymentid ILIKE $${params.length}
        OR bt.merchanttransactionid ILIKE $${params.length}
        OR j.journalnumber ILIKE $${params.length}
      )`);
    }
    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (customerId) {
      params.push(customerId);
      conditions.push(`r.partyid = $${params.length}`);
    }
    if (fromDate) {
      params.push(fromDate);
      conditions.push(
        `COALESCE(bt.transactiondate, TO_TIMESTAMP(r.createddate)::date) >= $${params.length}::date`
      );
    }
    if (toDate) {
      params.push(toDate);
      conditions.push(
        `COALESCE(bt.transactiondate, TO_TIMESTAMP(r.createddate)::date) <= $${params.length}::date`
      );
    }

    const baseSelect = buildReferenceSelect(conditions);
    const summaryResult = await query(
      `
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(originalamount), 0)::numeric(18, 2) AS originalamount,
        COALESCE(SUM(usedamount), 0)::numeric(18, 2) AS usedamount,
        COALESCE(SUM(availableamount), 0)::numeric(18, 2) AS availableamount,
        COUNT(DISTINCT partyid)::int AS customercount
      FROM (${baseSelect}) filtered_references
      `,
      params
    );
    const offset = (page - 1) * count;
    const recordParams = [...params, offset, count];
    const recordResult = await query(
      `
      ${baseSelect}
      ORDER BY r.createddate DESC, r.id DESC
      OFFSET $${params.length + 1} LIMIT $${params.length + 2}
      `,
      recordParams
    );
    const summary = summaryResult.rows[0] || {};
    return {
      records: recordResult.rows.map(serializeReference),
      total: Number(summary.total || 0),
      page,
      count,
      summary: {
        customercount: Number(summary.customercount || 0),
        originalamount: toMoney(summary.originalamount),
        usedamount: toMoney(summary.usedamount),
        availableamount: toMoney(summary.availableamount),
      },
    };
  };

  export const getCustomerReference = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const referenceId = positiveInteger(
      request.params?.referenceId,
      "referenceId"
    );
    const result = await query(
      buildReferenceSelect([
        "r.organizationid = $1",
        "r.partytype = 'customer'",
        "r.id = $2",
      ]),
      [organizationId, referenceId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new FinanceValidationError(
        "Customer On Account reference was not found.",
        404,
        "ON_ACCOUNT_REFERENCE_NOT_FOUND"
      );
    }

    const movementResult = await query(
      `
      SELECT
        m.*,
        bt.transactionnumber,
        bt.transactiondate,
        j.journalnumber,
        j.entrydate AS journaldate,
        COALESCE(oa.documenttype, a.documenttype) AS documenttype,
        COALESCE(oa.documentid, a.documentid) AS documentid,
        COALESCE(oa.documentnumber, a.documentnumber) AS documentnumber,
        COALESCE(oa.bankportion, a.allocationamount) AS allocationamount,
        COALESCE(oa.tdsamount, a.tdsamount) AS tdsamount,
        COALESCE(oa.totalsettlement, a.totalsettledamount) AS totalsettledamount,
        rm.movementtype AS relatedmovementtype
      FROM on_account_movements m
      LEFT JOIN bank_transactions bt
        ON bt.id = m.banktransactionid
       AND bt.organizationid = m.organizationid
      LEFT JOIN journal_entries j
        ON j.id = m.journalentryid
       AND j.organizationid = m.organizationid
      LEFT JOIN bank_transaction_allocations a
        ON a.id = m.banktransactionallocationid
      LEFT JOIN on_account_document_allocations oa
        ON oa.onaccountmovementid = m.id
       AND oa.organizationid = m.organizationid
       AND oa.status = 'applied'
      LEFT JOIN on_account_movements rm
        ON rm.id = m.relatedmovementid
       AND rm.organizationid = m.organizationid
      WHERE m.organizationid = $1
        AND m.onaccountreferenceid = $2
      ORDER BY m.createddate ASC, m.id ASC
      `,
      [organizationId, referenceId]
    );

    return {
      ...serializeReference(row),
      movements: movementResult.rows.map((movement: any) => ({
        id: Number(movement.id),
        movementtype: movement.movementtype,
        direction: movement.direction,
        amount: toMoney(movement.amount),
        banktransactionid: movement.banktransactionid
          ? Number(movement.banktransactionid)
          : null,
        transactionnumber: movement.transactionnumber || null,
        transactiondate:
          toFinanceDateOnly(movement.transactiondate) ||
          movement.transactiondate ||
          null,
        journalentryid: movement.journalentryid
          ? Number(movement.journalentryid)
          : null,
        journalnumber: movement.journalnumber || null,
        journaldate:
          toFinanceDateOnly(movement.journaldate) || movement.journaldate || null,
        documenttype: movement.documenttype || null,
        documentid: movement.documentid ? Number(movement.documentid) : null,
        documentnumber: movement.documentnumber || null,
        allocationamount: movement.allocationamount == null
          ? null
          : toMoney(movement.allocationamount),
        tdsamount:
          movement.tdsamount == null ? null : toMoney(movement.tdsamount),
        totalsettledamount:
          movement.totalsettledamount == null
            ? null
            : toMoney(movement.totalsettledamount),
        relatedmovementid: movement.relatedmovementid
          ? Number(movement.relatedmovementid)
          : null,
        relatedmovementtype: movement.relatedmovementtype || null,
        idempotencykey: movement.idempotencykey || null,
        idempotencysequence: Number(movement.idempotencysequence || 1),
        description: movement.description || null,
        createdby: movement.createdby || null,
        createddate: Number(movement.createddate || 0),
      })),
    };
  };

  export const listSupplierReferences = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const page = positiveInteger(request.query?.page, "page", 1, 1_000_000);
    const count = positiveInteger(request.query?.count, "count", 10, 100);
    const search = String(request.query?.search || "").trim();
    const status = normalizeOnAccountStatusFilter(request.query?.status);
    const supplierId = request.query?.supplierid
      ? positiveInteger(request.query.supplierid, "supplierid")
      : null;
    const fromDate = optionalDate(request.query?.fromdate, "fromdate");
    const toDate = optionalDate(request.query?.todate, "todate");
    if (fromDate && toDate && fromDate > toDate) {
      throw new FinanceValidationError("fromdate cannot be later than todate.");
    }

    const { params, conditions } = buildOnAccountReadScope(organizationId, "supplier");
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(
        r.referencenumber ILIKE $${params.length}
        OR r.sourceid ILIKE $${params.length}
        OR s.suppliername::text ILIKE $${params.length}
        OR s.supplieremail::text ILIKE $${params.length}
        OR s.supplierphonenumber::text ILIKE $${params.length}
        OR s.suppliercode::text ILIKE $${params.length}
        OR bt.transactionnumber ILIKE $${params.length}
        OR bt.sourcepaymentid ILIKE $${params.length}
        OR bt.merchanttransactionid ILIKE $${params.length}
        OR j.journalnumber ILIKE $${params.length}
      )`);
    }
    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (supplierId) {
      params.push(supplierId);
      conditions.push(`r.partyid = $${params.length}`);
    }
    if (fromDate) {
      params.push(fromDate);
      conditions.push(`COALESCE(bt.transactiondate, TO_TIMESTAMP(r.createddate)::date) >= $${params.length}::date`);
    }
    if (toDate) {
      params.push(toDate);
      conditions.push(`COALESCE(bt.transactiondate, TO_TIMESTAMP(r.createddate)::date) <= $${params.length}::date`);
    }

    const baseSelect = buildSupplierReferenceSelect(conditions);
    const summaryResult = await query(
      `SELECT COUNT(*)::int AS total,
        COALESCE(SUM(originalamount), 0)::numeric(18, 2) AS originalamount,
        COALESCE(SUM(usedamount), 0)::numeric(18, 2) AS usedamount,
        COALESCE(SUM(availableamount), 0)::numeric(18, 2) AS availableamount,
        COUNT(DISTINCT partyid)::int AS suppliercount
       FROM (${baseSelect}) filtered_references`,
      params
    );
    const offset = (page - 1) * count;
    const recordResult = await query(
      `${baseSelect}
       ORDER BY r.createddate DESC, r.id DESC
       OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
      [...params, offset, count]
    );
    const summary = summaryResult.rows[0] || {};
    return {
      records: recordResult.rows.map(serializeSupplierReference),
      total: Number(summary.total || 0), page, count,
      summary: {
        suppliercount: Number(summary.suppliercount || 0),
        originalamount: toMoney(summary.originalamount),
        usedamount: toMoney(summary.usedamount),
        availableamount: toMoney(summary.availableamount),
      },
    };
  };

  export const getSupplierReference = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const referenceId = positiveInteger(request.params?.referenceId, "referenceId");
    const result = await query(
      buildSupplierReferenceSelect([
        "r.organizationid = $1", "r.partytype = 'supplier'", "r.id = $2",
      ]),
      [organizationId, referenceId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new FinanceValidationError(
        "Supplier On Account reference was not found.", 404,
        "ON_ACCOUNT_REFERENCE_NOT_FOUND"
      );
    }
    return {
      ...serializeSupplierReference(row),
      movements: await loadMovements(organizationId, referenceId),
    };
  };
}
