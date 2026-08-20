import pool from "../database/postgres.js";
import {
  FinanceValidationError,
  formatTdsSectionDisplayName,
  nowEpoch,
  requireIsoDate,
  requirePositiveMoney,
  resolveFinanceContext,
  toMoney,
} from "../utils/finance/finance.utils.js";
import {
  buildOnAccountApplicationMatrix,
  deriveOnAccountStatus,
} from "../utils/finance/onAccount.utils.js";
import {
  applySupplierBillAllocation,
  assertSupplierTdsMapping,
  isSupplierBillOpen,
  resolveSupplierBillStatus,
} from "../utils/finance/supplierBill.utils.js";
import { lockOnAccountReferences } from "./onAccountFoundation.service.js";
import { onAccountReferenceService } from "./onAccountReference.service.js";
import { supplierPaymentFinanceService } from "./supplierPaymentFinance.service.js";

const positiveId = (value: unknown, fieldName: string) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new FinanceValidationError(`${fieldName} must be a positive integer.`);
  }
  return id;
};

const normalizeText = (
  value: unknown,
  fieldName: string,
  required: boolean,
  maximum: number
) => {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) {
    throw new FinanceValidationError(`${fieldName} is required.`);
  }
  if (normalized.length > maximum) {
    throw new FinanceValidationError(
      `${fieldName} must not exceed ${maximum} characters.`
    );
  }
  return normalized || null;
};

const parsePaymentData = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getExistingApplication = async (
  client: any,
  organizationId: number,
  requestReference: string
) => {
  const result = await client.query(
    `
    SELECT
      a.*,
      r.referencenumber,
      m.journalentryid,
      j.journalnumber,
      j.entrydate
    FROM on_account_document_allocations a
    JOIN on_account_references r
      ON r.id = a.onaccountreferenceid
     AND r.organizationid = a.organizationid
    JOIN on_account_movements m
      ON m.id = a.onaccountmovementid
     AND m.organizationid = a.organizationid
    LEFT JOIN journal_entries j
      ON j.id = m.journalentryid
     AND j.organizationid = a.organizationid
    WHERE a.organizationid = $1
      AND a.idempotencykey = $2
      AND a.documenttype = 'purchase_bill'
      AND a.status = 'applied'
    ORDER BY a.idempotencysequence, a.id
    `,
    [organizationId, requestReference]
  );
  if (result.rows.length === 0) return null;
  const rows = result.rows;
  return {
    idempotent: true,
    requestreference: requestReference,
    journalentryid: Number(rows[0].journalentryid),
    journalnumber: rows[0].journalnumber,
    applicationdate: rows[0].entrydate,
    bankportion: toMoney(
      rows.reduce((total: number, row: any) => total + Number(row.bankportion), 0)
    ),
    tdsamount: toMoney(
      rows.reduce((total: number, row: any) => total + Number(row.tdsamount), 0)
    ),
    totalsettlement: toMoney(
      rows.reduce((total: number, row: any) => total + Number(row.totalsettlement), 0)
    ),
    allocations: rows.map((row: any) => ({
      id: Number(row.id),
      referenceid: Number(row.onaccountreferenceid),
      referencenumber: row.referencenumber,
      billid: Number(row.documentid),
      billnumber: row.documentnumber,
      bankportion: toMoney(row.bankportion),
      tdsamount: toMoney(row.tdsamount),
      totalsettlement: toMoney(row.totalsettlement),
    })),
  };
};

export module supplierOnAccountApplicationService {
  export const getApplicationContext = async (request: any) => {
    const reference = await onAccountReferenceService.getSupplierReference(request);
    const { organizationId } = resolveFinanceContext(request);
    const client = await pool.connect();
    try {
      const referenceResult = await client.query(
        `
        SELECT id, referencenumber, originalamount, usedamount,
               availableamount, status, createddate
        FROM on_account_references
        WHERE organizationid = $1
          AND partytype = 'supplier'
          AND partyid = $2
          AND status IN ('open', 'partially_applied')
          AND availableamount > 0
        ORDER BY createddate, id
        `,
        [organizationId, reference.supplierid]
      );
      const bills = await supplierPaymentFinanceService.listOutstandingBills({
        ...request,
        params: { supplierId: reference.supplierid },
      });
      const tdsResult = await client.query(
        `
        SELECT id, newcode, natureofpayment, rate
        FROM tds_sections
        WHERE organizationid = $1
        ORDER BY newcode, id
        `,
        [organizationId]
      );
      return {
        supplier: {
          id: reference.supplierid,
          name: reference.suppliername,
          code: reference.suppliercode,
          email: reference.supplieremail,
          mobilenumber: reference.suppliermobile,
        },
        selectedreferenceid: reference.id,
        references: referenceResult.rows.map((row: any) => ({
          id: Number(row.id),
          referencenumber: row.referencenumber,
          originalamount: toMoney(row.originalamount),
          usedamount: toMoney(row.usedamount),
          availableamount: toMoney(row.availableamount),
          status: row.status,
          createddate: Number(row.createddate),
        })),
        bills,
        tdssections: tdsResult.rows.map((row: any) => ({
          id: Number(row.id),
          newcode: row.newcode,
          natureofpayment: row.natureofpayment,
          rate: row.rate,
          displayname: formatTdsSectionDisplayName(
            row.natureofpayment,
            row.newcode,
            row.rate
          ),
        })),
      };
    } finally {
      client.release();
    }
  };

  export const applyToBills = async (request: any) => {
    const { actor, organizationId } = resolveFinanceContext(request);
    const supplierId = positiveId(request.body?.supplierid, "supplierid");
    const applicationDate = requireIsoDate(
      request.body?.applicationdate,
      "applicationdate"
    );
    const requestReference = normalizeText(
      request.body?.requestreference,
      "requestreference",
      true,
      100
    )!;
    const remarks = normalizeText(request.body?.remarks, "remarks", false, 2000);
    const requestedReferences = (request.body?.referenceallocations || []).map(
      (item: any, index: number) => ({
        referenceid: positiveId(
          item?.referenceid,
          `referenceallocations[${index}].referenceid`
        ),
        amount: requirePositiveMoney(
          item?.amount,
          `referenceallocations[${index}].amount`
        ),
      })
    );
    const requestedBills = (request.body?.billallocations || []).map(
      (item: any, index: number) => {
        const bankportion = requirePositiveMoney(
          item?.bankportion,
          `billallocations[${index}].bankportion`
        );
        const tdsapplied = item?.tdsapplied === true;
        const tdsamount = toMoney(
          item?.tdsamount || 0,
          `billallocations[${index}].tdsamount`
        );
        const tdssectionid =
          item?.tdssectionid == null ? null : Number(item.tdssectionid);
        assertSupplierTdsMapping(tdsapplied, tdsamount, tdssectionid);
        if (tdsapplied && tdsamount <= 0) {
          throw new FinanceValidationError(
            `billallocations[${index}].tdsamount must be greater than zero when TDS is applied.`
          );
        }
        return {
          billid: positiveId(item?.billid, `billallocations[${index}].billid`),
          bankportion,
          tdsapplied,
          tdsamount,
          tdssectionid,
        };
      }
    );
    if (requestedReferences.length === 0 || requestedBills.length === 0) {
      throw new FinanceValidationError(
        "At least one On Account reference and one Bill are required."
      );
    }
    const referenceIds = requestedReferences.map((item: any) => item.referenceid);
    const billIds = requestedBills.map((item: any) => item.billid);
    if (new Set(referenceIds).size !== referenceIds.length) {
      throw new FinanceValidationError("On Account references must be unique.");
    }
    if (new Set(billIds).size !== billIds.length) {
      throw new FinanceValidationError("Bill allocations must be unique.");
    }
    const matrix = buildOnAccountApplicationMatrix(
      requestedReferences,
      requestedBills.map((item: any) => ({
        invoiceid: item.billid,
        bankportion: item.bankportion,
        tdsamount: item.tdsamount,
      }))
    ).map((item) => ({ ...item, billid: item.invoiceid }));
    const totalBankPortion = toMoney(
      requestedBills.reduce((total: number, item: any) => total + item.bankportion, 0)
    );
    const totalTdsAmount = toMoney(
      requestedBills.reduce((total: number, item: any) => total + item.tdsamount, 0)
    );
    const totalSettlement = toMoney(totalBankPortion + totalTdsAmount);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `supplier-on-account-application:${organizationId}:${requestReference}`,
      ]);
      const existing = await getExistingApplication(
        client,
        organizationId,
        requestReference
      );
      if (existing) {
        await client.query("COMMIT");
        return existing;
      }

      const references = await lockOnAccountReferences(
        client,
        organizationId,
        referenceIds
      );
      const referenceById = new Map(
        references.map((row: any) => [Number(row.id), row])
      );
      for (const requested of requestedReferences) {
        const reference: any = referenceById.get(requested.referenceid);
        if (
          !reference ||
          reference.partytype !== "supplier" ||
          Number(reference.partyid) !== supplierId
        ) {
          throw new FinanceValidationError(
            "All selected On Account references must belong to the selected Supplier."
          );
        }
        if (requested.amount > toMoney(reference.availableamount)) {
          throw new FinanceValidationError(
            `${reference.referencenumber} does not have enough available balance.`
          );
        }
      }

      const supplierResult = await client.query(
        `SELECT id FROM supplier WHERE id = $1 AND COALESCE(isdeleted, FALSE) = FALSE`,
        [supplierId]
      );
      if (!supplierResult.rows[0]) {
        throw new FinanceValidationError("The selected Supplier was not found.");
      }

      const billResult = await client.query(
        `
        SELECT
          bill.*,
          COALESCE((
            SELECT SUM(allocation.totalsettledamount)
            FROM bank_transaction_allocations allocation
            JOIN bank_transactions bank_tx
              ON bank_tx.id = allocation.banktransactionid
            WHERE allocation.documenttype = 'purchase_bill'
              AND allocation.documentid = bill.id
              AND allocation.status = 'applied'
              AND bank_tx.postingstatus = 'posted'
          ), 0) AS finance_settled_amount,
          linked_po.supplierid
        FROM poinvoice bill
        JOIN LATERAL (
          SELECT po.supplierid
          FROM purchaseorder po
          WHERE po.ponumber = bill.ponumber
          ORDER BY po.id DESC
          LIMIT 1
        ) linked_po ON TRUE
        WHERE bill.id = ANY($1::int[])
        ORDER BY bill.id
        FOR UPDATE OF bill
        `,
        [billIds.slice().sort((a: number, b: number) => a - b)]
      );
      if (billResult.rows.length !== billIds.length) {
        throw new FinanceValidationError("One or more selected Bills were not found.");
      }
      const billById = new Map(
        billResult.rows.map((row: any) => [Number(row.id), row])
      );
      const preparedBills = requestedBills.map((requested: any) => {
        const bill: any = billById.get(requested.billid);
        if (
          !bill ||
          Number(bill.supplierid) !== supplierId ||
          !isSupplierBillOpen(bill)
        ) {
          throw new FinanceValidationError(
            "All selected Bills must be eligible outstanding Bills for the selected Supplier."
          );
        }
        return {
          bill,
          ...requested,
          ...applySupplierBillAllocation(
            bill,
            requested.bankportion,
            requested.tdsamount
          ),
        };
      });

      const accountCodes = totalTdsAmount > 0
        ? ["SYS-SUPPLIER-ADVANCE", "SYS-AP", "SYS-TDS-PAYABLE"]
        : ["SYS-SUPPLIER-ADVANCE", "SYS-AP"];
      const accountResult = await client.query(
        `SELECT accountcode, id FROM finance_accounts
         WHERE organizationid = $1 AND accountcode = ANY($2::text[])
           AND status = 'active'`,
        [organizationId, accountCodes]
      );
      const accounts = new Map(
        accountResult.rows.map((row: any) => [row.accountcode, Number(row.id)])
      );
      const advanceAccountId = accounts.get("SYS-SUPPLIER-ADVANCE");
      const payableAccountId = accounts.get("SYS-AP");
      const tdsAccountId = accounts.get("SYS-TDS-PAYABLE");
      if (!advanceAccountId || !payableAccountId) {
        throw new FinanceValidationError(
          "Supplier Advance or Accounts Payable system ledger is unavailable.",
          409,
          "ON_ACCOUNT_LEDGER_MISSING"
        );
      }
      if (totalTdsAmount > 0 && !tdsAccountId) {
        throw new FinanceValidationError(
          "TDS Payable system ledger is unavailable.",
          409,
          "TDS_PAYABLE_LEDGER_MISSING"
        );
      }

      const tdsSectionIds = Array.from(new Set(
        requestedBills
          .filter((item: any) => item.tdsapplied)
          .map((item: any) => item.tdssectionid)
      ));
      const tdsSectionById = new Map<number, any>();
      if (tdsSectionIds.length > 0) {
        const sectionResult = await client.query(
          `SELECT id, newcode, natureofpayment, rate FROM tds_sections
           WHERE organizationid = $1 AND id = ANY($2::bigint[])`,
          [organizationId, tdsSectionIds]
        );
        for (const row of sectionResult.rows) tdsSectionById.set(Number(row.id), row);
        if (tdsSectionById.size !== tdsSectionIds.length) {
          throw new FinanceValidationError(
            "One or more selected TDS sections are unavailable."
          );
        }
      }

      const epoch = nowEpoch();
      const journalResult = await client.query(
        `INSERT INTO journal_entries (
           organizationid, entrydate, sourcetype, sourceid, status,
           description, createdby, postedby, createddate, posteddate
         ) VALUES ($1, $2, 'on_account_application', 0, 'posted', $3, $4, $4, $5, $5)
         RETURNING id`,
        [
          organizationId,
          applicationDate,
          remarks || `Applied Supplier On Account balance against ${preparedBills.length} Bill${preparedBills.length === 1 ? "" : "s"}.`,
          actor,
          epoch,
        ]
      );
      const journalId = Number(journalResult.rows[0].id);
      const journalNumber = `JE-${String(journalId).padStart(8, "0")}`;
      const description = remarks || `Applied Supplier On Account balance against ${preparedBills.length} Bill${preparedBills.length === 1 ? "" : "s"}.`;
      await client.query(
        `UPDATE journal_entries SET journalnumber = $1, sourceid = $2 WHERE id = $2`,
        [journalNumber, journalId]
      );
      await client.query(
        `INSERT INTO journal_lines (
           journalentryid, financeaccountid, partytype, partyid,
           debitamount, creditamount, description
         ) VALUES
           ($1, $2, 'supplier', $3, $4, 0, $5),
           ($1, $6, 'supplier', $3, 0, $7, $5)`,
        [
          journalId,
          payableAccountId,
          supplierId,
          totalSettlement,
          description,
          advanceAccountId,
          totalBankPortion,
        ]
      );
      if (totalTdsAmount > 0) {
        await client.query(
          `INSERT INTO journal_lines (
             journalentryid, financeaccountid, partytype, partyid,
             debitamount, creditamount, description
           ) VALUES ($1, $2, 'supplier', $3, 0, $4, $5)`,
          [journalId, tdsAccountId, supplierId, totalTdsAmount, description]
        );
      }

      const allocationRecords = [];
      for (let index = 0; index < matrix.length; index += 1) {
        const chunk: any = matrix[index];
        const reference: any = referenceById.get(chunk.referenceid);
        const bill: any = billById.get(chunk.billid);
        const movementResult = await client.query(
          `INSERT INTO on_account_movements (
             organizationid, onaccountreferenceid, movementtype, direction,
             amount, journalentryid, idempotencykey, idempotencysequence,
             description, createdby, createddate
           ) VALUES ($1, $2, 'document_allocation', 'decrease', $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            organizationId,
            chunk.referenceid,
            chunk.bankportion,
            journalId,
            requestReference,
            index + 1,
            `Applied ${reference.referencenumber} against Bill ${bill.invoicenumber}.`,
            actor,
            epoch,
          ]
        );
        const movementId = Number(movementResult.rows[0].id);
        const allocationResult = await client.query(
          `INSERT INTO on_account_document_allocations (
             organizationid, onaccountreferenceid, onaccountmovementid,
             documenttype, documentid, documentnumber, bankportion, tdsamount,
             totalsettlement, status, idempotencykey, idempotencysequence,
             createdby, createddate
           ) VALUES ($1, $2, $3, 'purchase_bill', $4, $5, $6, $7, $8,
                     'applied', $9, $10, $11, $12)
           RETURNING id`,
          [
            organizationId,
            chunk.referenceid,
            movementId,
            chunk.billid,
            bill.invoicenumber,
            chunk.bankportion,
            chunk.tdsamount,
            chunk.totalsettlement,
            requestReference,
            index + 1,
            actor,
            epoch,
          ]
        );
        allocationRecords.push({
          id: Number(allocationResult.rows[0].id),
          movementid: movementId,
          referenceid: chunk.referenceid,
          referencenumber: reference.referencenumber,
          billid: chunk.billid,
          billnumber: bill.invoicenumber,
          bankportion: chunk.bankportion,
          tdsamount: chunk.tdsamount,
          totalsettlement: chunk.totalsettlement,
        });
      }

      const updatedReferences = [];
      for (const requested of requestedReferences) {
        const reference: any = referenceById.get(requested.referenceid);
        const usedAmount = toMoney(Number(reference.usedamount) + requested.amount);
        const availableAmount = toMoney(Number(reference.availableamount) - requested.amount);
        const status = deriveOnAccountStatus(
          reference.originalamount,
          usedAmount,
          availableAmount
        );
        await client.query(
          `UPDATE on_account_references
           SET usedamount = $1, availableamount = $2, status = $3,
               version = version + 1, modifiedby = $4, modifieddate = $5
           WHERE id = $6 AND organizationid = $7`,
          [usedAmount, availableAmount, status, actor, epoch, requested.referenceid, organizationId]
        );
        if (reference.legacyunappliedamountid) {
          await client.query(
            `UPDATE party_unapplied_amounts
             SET appliedamount = $1, remainingamount = $2, status = $3,
                 modifiedby = $4, modifieddate = $5
             WHERE id = $6`,
            [
              usedAmount,
              availableAmount,
              availableAmount === 0 ? "fully_applied" : "open",
              actor,
              epoch,
              reference.legacyunappliedamountid,
            ]
          );
        }
        updatedReferences.push({
          id: requested.referenceid,
          referencenumber: reference.referencenumber,
          usedamount: usedAmount,
          availableamount: availableAmount,
          status,
        });
      }

      const updatedBills = [];
      for (const prepared of preparedBills) {
        const section = prepared.tdssectionid
          ? tdsSectionById.get(prepared.tdssectionid)
          : null;
        const statutorySnapshot = section
          ? {
              adjustmenttype: "tds_payable",
              id: Number(section.id),
              newcode: section.newcode,
              natureofpayment: section.natureofpayment,
              rate: section.rate,
              displayname: formatTdsSectionDisplayName(
                section.natureofpayment,
                section.newcode,
                section.rate
              ),
            }
          : null;
        const existingPayments = parsePaymentData(prepared.bill.paymentdata);
        const paymentEntry = {
          id: existingPayments.length + 1,
          paymentamount: prepared.allocationAmount,
          tdsamount: prepared.tdsAmount,
          tdssectionid: prepared.tdssectionid,
          tdssection: statutorySnapshot,
          adjustmenttype: section ? "tds_payable" : null,
          settlementamount: prepared.totalSettledAmount,
          paymentmethod: "on_account",
          paymentdate: epoch,
          transactionreference: journalNumber,
          source: "finance_supplier_on_account_application",
          status: "success",
          comments: remarks,
          journalentryid: journalId,
          onaccountallocationids: allocationRecords
            .filter((allocation: any) => allocation.billid === Number(prepared.bill.id))
            .map((allocation: any) => allocation.id),
        };
        const billStatus = resolveSupplierBillStatus(
          prepared.bill,
          prepared.balanceAmount,
          epoch
        );
        await client.query(
          `UPDATE poinvoice
           SET paymentdata = $1::jsonb, balanceamount = $2,
               invoicestatus = $3, modifieddate = $4
           WHERE id = $5`,
          [
            JSON.stringify([...existingPayments, paymentEntry]),
            prepared.balanceAmount,
            billStatus,
            epoch,
            prepared.bill.id,
          ]
        );
        updatedBills.push({
          id: Number(prepared.bill.id),
          invoicenumber: prepared.bill.invoicenumber,
          settledamount: prepared.settledAmount,
          balanceamount: prepared.balanceAmount,
          invoicestatus: billStatus,
        });
      }

      await client.query(
        `INSERT INTO finance_audit_events (
           organizationid, entitytype, entityid, action, actor, eventdata, createddate
         ) VALUES ($1, 'on_account_application', $2,
                   'supplier_on_account_applied', $3, $4::jsonb, $5)`,
        [
          organizationId,
          journalId,
          actor,
          JSON.stringify({
            supplierid: supplierId,
            requestreference: requestReference,
            bankportion: totalBankPortion,
            tdsamount: totalTdsAmount,
            totalsettlement: totalSettlement,
            references: updatedReferences,
            bills: updatedBills,
            allocations: allocationRecords,
          }),
          epoch,
        ]
      );

      await client.query("COMMIT");
      return {
        idempotent: false,
        requestreference: requestReference,
        journalentryid: journalId,
        journalnumber: journalNumber,
        applicationdate: applicationDate,
        bankportion: totalBankPortion,
        tdsamount: totalTdsAmount,
        totalsettlement: totalSettlement,
        references: updatedReferences,
        bills: updatedBills,
        allocations: allocationRecords,
      };
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}
