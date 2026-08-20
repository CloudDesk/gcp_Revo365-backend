import { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  requireIsoDate,
  resolveFinanceContext,
  toFinanceDateOnly,
  toMoney,
} from "../utils/finance/finance.utils.js";
import {
  calculateOnAccountAvailableFromMovements,
  normalizeOnAccountPartyType,
  summarizeOnAccountStatement,
} from "../utils/finance/onAccount.utils.js";

const positiveId = (value: unknown, fieldName: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FinanceValidationError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
};

export module onAccountStatementService {
  export const getPartyStatement = async (
    request: any,
    partyTypeValue: unknown,
    partyIdValue: unknown
  ) => {
    const { organizationId } = resolveFinanceContext(request);
    const partytype = normalizeOnAccountPartyType(partyTypeValue);
    const partyid = positiveId(partyIdValue, `${partytype}Id`);
    const fromdate = request.query?.fromdate
      ? requireIsoDate(request.query.fromdate, "fromdate")
      : null;
    const todate = request.query?.todate
      ? requireIsoDate(request.query.todate, "todate")
      : null;
    if (fromdate && todate && fromdate > todate) {
      throw new FinanceValidationError("From Date cannot be later than To Date.");
    }

    const result = await query(
      `
      SELECT
        r.id AS referenceid,
        r.referencenumber,
        r.originalamount,
        r.usedamount,
        r.availableamount,
        r.status AS referencestatus,
        r.createddate AS referencecreateddate,
        m.id AS movementid,
        m.movementtype,
        m.direction,
        m.amount,
        m.banktransactionid,
        bt.transactionnumber,
        bt.transactiondate,
        bt.bankcashaccountid,
        account.accountname AS bankcashaccountname,
        m.journalentryid,
        journal.journalnumber,
        journal.entrydate AS journaldate,
        m.description,
        m.createdby,
        m.createddate,
        allocation.id AS allocationid,
        allocation.documenttype,
        allocation.documentid,
        allocation.documentnumber,
        purchase_document.id AS documentparentid,
        allocation.bankportion,
        allocation.tdsamount,
        allocation.totalsettlement,
        COALESCE(
          bt.transactiondate,
          journal.entrydate,
          TO_TIMESTAMP(m.createddate)::date
        ) AS eventdate
      FROM on_account_references r
      JOIN on_account_movements m
        ON m.onaccountreferenceid = r.id
       AND m.organizationid = r.organizationid
      LEFT JOIN bank_transactions bt
        ON bt.id = m.banktransactionid
       AND bt.organizationid = r.organizationid
      LEFT JOIN bank_cash_accounts account
        ON account.id = bt.bankcashaccountid
       AND account.organizationid = r.organizationid
      LEFT JOIN journal_entries journal
        ON journal.id = m.journalentryid
       AND journal.organizationid = r.organizationid
      LEFT JOIN on_account_document_allocations allocation
        ON allocation.onaccountmovementid = m.id
       AND allocation.organizationid = r.organizationid
       AND allocation.status = 'applied'
      LEFT JOIN LATERAL (
        SELECT po.id
        FROM poinvoice bill
        JOIN purchaseorder po ON po.ponumber = bill.ponumber
        WHERE allocation.documenttype = 'purchase_bill'
          AND bill.id = allocation.documentid
        ORDER BY po.id DESC
        LIMIT 1
      ) purchase_document ON TRUE
      WHERE r.organizationid = $1
        AND r.partytype = $2
        AND r.partyid = $3
      ORDER BY eventdate, m.createddate, m.id
      `,
      [organizationId, partytype, partyid]
    );

    const rows = result.rows;
    const references = new Map<number, any>();
    for (const row of rows) {
      const id = Number(row.referenceid);
      if (!references.has(id)) {
        references.set(id, {
          id,
          referencenumber: row.referencenumber,
          originalamount: toMoney(row.originalamount),
          usedamount: toMoney(row.usedamount),
          availableamount: toMoney(row.availableamount),
          status: row.referencestatus,
          movements: [],
          allocationbankportion: 0,
        });
      }
      const reference = references.get(id);
      reference.movements.push({
        direction: row.direction,
        amount: toMoney(row.amount),
      });
      if (row.allocationid) {
        reference.allocationbankportion = toMoney(
          reference.allocationbankportion + Number(row.bankportion || 0)
        );
      }
    }

    const referenceRows = Array.from(references.values()).map((reference) => {
      const movementbalance = calculateOnAccountAvailableFromMovements(
        reference.movements
      );
      const documentdecreases = toMoney(
        rows
          .filter(
            (row) =>
              Number(row.referenceid) === reference.id &&
              row.movementtype === "document_allocation" &&
              row.direction === "decrease"
          )
          .reduce((sum, row) => sum + Number(row.amount || 0), 0)
      );
      return {
        id: reference.id,
        referencenumber: reference.referencenumber,
        originalamount: reference.originalamount,
        usedamount: reference.usedamount,
        availableamount: reference.availableamount,
        status: reference.status,
        movementbalance,
        allocationbankportion: reference.allocationbankportion,
        reconciled:
          toMoney(reference.usedamount + reference.availableamount) ===
            reference.originalamount &&
          movementbalance === reference.availableamount &&
          documentdecreases === reference.allocationbankportion,
      };
    });

    const statementSummary = summarizeOnAccountStatement(
      rows.map((row: any) => ({
        ...row,
        eventdate: String(toFinanceDateOnly(row.eventdate) || row.eventdate),
      })),
      fromdate,
      todate
    );
    const periodIds = new Set(
      statementSummary.period.map((movement: any) => Number(movement.movementid))
    );
    const periodRows = rows.filter((row: any) => periodIds.has(Number(row.movementid)));
    const currentavailable = toMoney(
      referenceRows.reduce((sum, row) => sum + row.availableamount, 0)
    );
    const currentused = toMoney(
      referenceRows.reduce((sum, row) => sum + row.usedamount, 0)
    );
    const currentoriginal = toMoney(
      referenceRows.reduce((sum, row) => sum + row.originalamount, 0)
    );

    return {
      partytype,
      partyid,
      records: periodRows.map((row: any) => ({
        id: Number(row.movementid),
        referenceid: Number(row.referenceid),
        referencenumber: row.referencenumber,
        eventdate: toFinanceDateOnly(row.eventdate) || row.eventdate,
        movementtype: row.movementtype,
        direction: row.direction,
        amount: toMoney(row.amount),
        banktransactionid: row.banktransactionid ? Number(row.banktransactionid) : null,
        transactionnumber: row.transactionnumber || null,
        bankcashaccountid: row.bankcashaccountid ? Number(row.bankcashaccountid) : null,
        bankcashaccountname: row.bankcashaccountname || null,
        journalentryid: row.journalentryid ? Number(row.journalentryid) : null,
        journalnumber: row.journalnumber || null,
        documenttype: row.documenttype || null,
        documentid: row.documentid ? Number(row.documentid) : null,
        documentnumber: row.documentnumber || null,
        documentparentid: row.documentparentid ? Number(row.documentparentid) : null,
        bankportion: row.bankportion == null ? null : toMoney(row.bankportion),
        tdsamount: row.tdsamount == null ? null : toMoney(row.tdsamount),
        totalsettlement: row.totalsettlement == null
          ? null
          : toMoney(row.totalsettlement),
        description: row.description || null,
        createdby: row.createdby || null,
        createddate: Number(row.createddate || 0),
      })),
      references: referenceRows,
      summary: {
        openingavailable: statementSummary.openingavailable,
        increases: statementSummary.increases,
        decreases: statementSummary.decreases,
        tdssettled: statementSummary.tdssettled,
        closingavailable: statementSummary.closingavailable,
        currentoriginal,
        currentused,
        currentavailable,
        referencecount: referenceRows.length,
        movementcount: periodRows.length,
      },
      reconciliation: {
        reconciled:
          referenceRows.every((reference) => reference.reconciled) &&
          currentoriginal === toMoney(currentused + currentavailable),
        referencecount: referenceRows.length,
        reconciledreferencecount: referenceRows.filter((row) => row.reconciled).length,
        currentoriginal,
        currentused,
        currentavailable,
      },
    };
  };
}
