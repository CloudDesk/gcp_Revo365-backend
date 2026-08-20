import pool from "../database/postgres.js";
import {
  FinanceValidationError,
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
  applyRetailInvoiceAllocation,
  getCustomerReceiptInvoiceSourceMetadata,
  isEligibleCustomerReceiptInvoice,
} from "../utils/finance/retailReceipt.utils.js";
import { lockOnAccountReferences } from "./onAccountFoundation.service.js";
import { onAccountReferenceService } from "./onAccountReference.service.js";
import { retailReceiptFinanceService } from "./retailReceiptFinance.service.js";

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
      invoiceid: Number(row.documentid),
      invoicenumber: row.documentnumber,
      bankportion: toMoney(row.bankportion),
      tdsamount: toMoney(row.tdsamount),
      totalsettlement: toMoney(row.totalsettlement),
    })),
  };
};

export module customerOnAccountApplicationService {
  export const getApplicationContext = async (request: any) => {
    const reference = await onAccountReferenceService.getCustomerReference(request);
    const { organizationId } = resolveFinanceContext(request);
    const client = await pool.connect();
    try {
      const referenceResult = await client.query(
        `
        SELECT
          r.id,
          r.referencenumber,
          r.originalamount,
          r.usedamount,
          r.availableamount,
          r.status,
          r.createddate
        FROM on_account_references r
        WHERE r.organizationid = $1
          AND r.partytype = 'customer'
          AND r.partyid = $2
          AND r.status IN ('open', 'partially_applied')
          AND r.availableamount > 0
        ORDER BY r.createddate, r.id
        `,
        [organizationId, reference.customerid]
      );
      const invoices = await retailReceiptFinanceService.listOutstandingInvoices({
        ...request,
        params: { customerId: reference.customerid },
        query: { receiptmode: "all" },
      });
      return {
        customer: {
          id: reference.customerid,
          name: reference.customername,
          email: reference.customeremail,
          mobilenumber: reference.customermobile,
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
        invoices,
      };
    } finally {
      client.release();
    }
  };

  export const applyToInvoices = async (request: any) => {
    const { actor, organizationId } = resolveFinanceContext(request);
    const customerId = positiveId(request.body?.customerid, "customerid");
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
    const requestedInvoices = (request.body?.invoiceallocations || []).map(
      (item: any, index: number) => {
        const bankportion = requirePositiveMoney(
          item?.bankportion,
          `invoiceallocations[${index}].bankportion`
        );
        const tdsApplied = item?.tdsapplied === true;
        const tdsamount = toMoney(
          item?.tdsamount || 0,
          `invoiceallocations[${index}].tdsamount`
        );
        if (tdsamount < 0 || (tdsApplied && tdsamount <= 0)) {
          throw new FinanceValidationError(
            `invoiceallocations[${index}].tdsamount must be greater than zero when TDS is applied.`
          );
        }
        if (!tdsApplied && tdsamount !== 0) {
          throw new FinanceValidationError(
            `invoiceallocations[${index}].tdsamount must be zero when TDS is not applied.`
          );
        }
        return {
          invoiceid: positiveId(
            item?.invoiceid,
            `invoiceallocations[${index}].invoiceid`
          ),
          bankportion,
          tdsapplied: tdsApplied,
          tdsamount,
        };
      }
    );
    if (requestedReferences.length === 0 || requestedInvoices.length === 0) {
      throw new FinanceValidationError(
        "At least one On Account reference and one Invoice are required."
      );
    }
    const referenceIds = requestedReferences.map((item: any) => item.referenceid);
    const invoiceIds = requestedInvoices.map((item: any) => item.invoiceid);
    if (new Set(referenceIds).size !== referenceIds.length) {
      throw new FinanceValidationError("On Account references must be unique.");
    }
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new FinanceValidationError("Invoice allocations must be unique.");
    }
    const matrix = buildOnAccountApplicationMatrix(
      requestedReferences,
      requestedInvoices
    );
    const totalBankPortion = toMoney(
      requestedInvoices.reduce(
        (total: number, item: any) => total + item.bankportion,
        0
      )
    );
    const totalTdsAmount = toMoney(
      requestedInvoices.reduce(
        (total: number, item: any) => total + item.tdsamount,
        0
      )
    );
    const totalSettlement = toMoney(totalBankPortion + totalTdsAmount);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `customer-on-account-application:${organizationId}:${requestReference}`,
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
          reference.partytype !== "customer" ||
          Number(reference.partyid) !== customerId
        ) {
          throw new FinanceValidationError(
            "All selected On Account references must belong to the selected Customer."
          );
        }
        if (requested.amount > toMoney(reference.availableamount)) {
          throw new FinanceValidationError(
            `${reference.referencenumber} does not have enough available balance.`
          );
        }
      }

      const customerResult = await client.query(
        `SELECT id FROM users WHERE id = $1 LIMIT 1`,
        [customerId]
      );
      if (!customerResult.rows[0]) {
        throw new FinanceValidationError("The selected Customer was not found.");
      }

      const invoiceResult = await client.query(
        `
        SELECT
          r.*,
          linked_order.ordername AS linkedordername
        FROM revoinvoice r
        LEFT JOIN LATERAL (
          SELECT o.ordername
          FROM orders o
          WHERE o.orderid = r.orderid
          ORDER BY o.id
          LIMIT 1
        ) linked_order ON TRUE
        WHERE r.id = ANY($1::int[])
        ORDER BY r.id
        FOR UPDATE OF r
        `,
        [invoiceIds.slice().sort((a: number, b: number) => a - b)]
      );
      if (invoiceResult.rows.length !== invoiceIds.length) {
        throw new FinanceValidationError(
          "One or more selected Invoices were not found."
        );
      }
      const invoiceById = new Map(
        invoiceResult.rows.map((row: any) => [Number(row.id), row])
      );
      const preparedInvoices = requestedInvoices.map((requested: any) => {
        const invoice: any = invoiceById.get(requested.invoiceid);
        if (
          !invoice ||
          Number(invoice.customerid) !== customerId ||
          !isEligibleCustomerReceiptInvoice(invoice, "all")
        ) {
          throw new FinanceValidationError(
            "All selected Invoices must be eligible outstanding Invoices for the selected Customer."
          );
        }
        return {
          invoice,
          tdsapplied: requested.tdsapplied,
          ...applyRetailInvoiceAllocation(
            invoice,
            requested.bankportion,
            requested.tdsamount
          ),
        };
      });

      const accountResult = await client.query(
        `
        SELECT accountcode, id
        FROM finance_accounts
        WHERE organizationid = $1
          AND accountcode = ANY($2::text[])
          AND status = 'active'
        `,
        [
          organizationId,
          totalTdsAmount > 0
            ? ["SYS-CUSTOMER-ADVANCE", "SYS-AR", "SYS-TDS-RECEIVABLE"]
            : ["SYS-CUSTOMER-ADVANCE", "SYS-AR"],
        ]
      );
      const accounts = new Map(
        accountResult.rows.map((row: any) => [row.accountcode, Number(row.id)])
      );
      const advanceAccountId = accounts.get("SYS-CUSTOMER-ADVANCE");
      const receivableAccountId = accounts.get("SYS-AR");
      const tdsAccountId = accounts.get("SYS-TDS-RECEIVABLE");
      if (!advanceAccountId || !receivableAccountId) {
        throw new FinanceValidationError(
          "Customer Advance or Accounts Receivable system ledger is unavailable.",
          409,
          "ON_ACCOUNT_LEDGER_MISSING"
        );
      }
      if (totalTdsAmount > 0 && !tdsAccountId) {
        throw new FinanceValidationError(
          "TDS Receivable system ledger is unavailable.",
          409,
          "TDS_RECEIVABLE_LEDGER_MISSING"
        );
      }

      const epoch = nowEpoch();
      const journalIdResult = await client.query(
        `SELECT nextval(pg_get_serial_sequence('journal_entries', 'id')) AS id`
      );
      const journalId = Number(journalIdResult.rows[0].id);
      const defaultDescription = `Applied Customer On Account balance against ${preparedInvoices.length} Invoice${preparedInvoices.length === 1 ? "" : "s"}.`;
      const description = remarks || defaultDescription;
      await client.query(
        `
        INSERT INTO journal_entries (
          id, organizationid, entrydate, sourcetype, sourceid, status,
          description, createdby, postedby, createddate, posteddate
        )
        VALUES ($1, $2, $3, 'on_account_application', $1, 'posted', $4, $5, $5, $6, $6)
        `,
        [journalId, organizationId, applicationDate, description, actor, epoch]
      );
      const journalNumber = `JE-${String(journalId).padStart(8, "0")}`;
      await client.query(
        `UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`,
        [journalNumber, journalId]
      );
      await client.query(
        `
        INSERT INTO journal_lines (
          journalentryid, financeaccountid, partytype, partyid,
          debitamount, creditamount, description
        )
        VALUES
          ($1, $2, 'customer', $3, $4, 0, $5),
          ($1, $6, 'customer', $3, 0, $7, $5)
        `,
        [
          journalId,
          advanceAccountId,
          customerId,
          totalBankPortion,
          description,
          receivableAccountId,
          totalSettlement,
        ]
      );
      if (totalTdsAmount > 0) {
        await client.query(
          `
          INSERT INTO journal_lines (
            journalentryid, financeaccountid, partytype, partyid,
            debitamount, creditamount, description
          )
          VALUES ($1, $2, 'customer', $3, $4, 0, $5)
          `,
          [journalId, tdsAccountId, customerId, totalTdsAmount, description]
        );
      }

      const allocationRecords = [];
      for (let index = 0; index < matrix.length; index += 1) {
        const chunk = matrix[index];
        const reference: any = referenceById.get(chunk.referenceid);
        const invoice: any = invoiceById.get(chunk.invoiceid);
        const movementResult = await client.query(
          `
          INSERT INTO on_account_movements (
            organizationid, onaccountreferenceid, movementtype, direction,
            amount, journalentryid, idempotencykey, idempotencysequence,
            description, createdby, createddate
          )
          VALUES ($1, $2, 'document_allocation', 'decrease', $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
          `,
          [
            organizationId,
            chunk.referenceid,
            chunk.bankportion,
            journalId,
            requestReference,
            index + 1,
            `Applied ${reference.referencenumber} against Invoice ${invoice.invoicenumber}.`,
            actor,
            epoch,
          ]
        );
        const movementId = Number(movementResult.rows[0].id);
        const allocationResult = await client.query(
          `
          INSERT INTO on_account_document_allocations (
            organizationid, onaccountreferenceid, onaccountmovementid,
            documenttype, documentid, documentnumber, bankportion, tdsamount,
            totalsettlement, status, idempotencykey, idempotencysequence,
            createdby, createddate
          )
          VALUES ($1, $2, $3, 'sales_invoice', $4, $5, $6, $7, $8, 'applied', $9, $10, $11, $12)
          RETURNING id
          `,
          [
            organizationId,
            chunk.referenceid,
            movementId,
            chunk.invoiceid,
            invoice.invoicenumber,
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
          ...chunk,
          referencenumber: reference.referencenumber,
          invoicenumber: invoice.invoicenumber,
        });
      }

      const updatedReferences = [];
      for (const requested of requestedReferences) {
        const reference: any = referenceById.get(requested.referenceid);
        const usedAmount = toMoney(Number(reference.usedamount) + requested.amount);
        const availableAmount = toMoney(
          Number(reference.availableamount) - requested.amount
        );
        const status = deriveOnAccountStatus(
          reference.originalamount,
          usedAmount,
          availableAmount
        );
        await client.query(
          `
          UPDATE on_account_references
          SET usedamount = $1,
              availableamount = $2,
              status = $3,
              version = version + 1,
              modifiedby = $4,
              modifieddate = $5
          WHERE id = $6 AND organizationid = $7
          `,
          [
            usedAmount,
            availableAmount,
            status,
            actor,
            epoch,
            requested.referenceid,
            organizationId,
          ]
        );
        if (reference.legacyunappliedamountid) {
          await client.query(
            `
            UPDATE party_unapplied_amounts
            SET appliedamount = $1,
                remainingamount = $2,
                status = $3,
                modifiedby = $4,
                modifieddate = $5
            WHERE id = $6
            `,
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

      const updatedInvoices = [];
      for (const prepared of preparedInvoices) {
        const existingPayments = Array.isArray(prepared.invoice.paymentdata)
          ? prepared.invoice.paymentdata
          : [];
        const source = getCustomerReceiptInvoiceSourceMetadata(prepared.invoice);
        const paymentEntry = {
          id: existingPayments.length + 1,
          paymentamount: prepared.allocationAmount,
          tdsamount: prepared.tdsAmount,
          settlementamount: prepared.totalSettledAmount,
          paymentmethod: "on_account",
          paymentdate: epoch,
          transactionreference: journalNumber,
          providerpaymentid: null,
          providerorderid: null,
          transactionid: null,
          source: "finance_on_account_application",
          invoicesource: source?.source || null,
          status: "success",
          comments: remarks,
          journalentryid: journalId,
          onaccountallocationids: allocationRecords
            .filter((allocation) => allocation.invoiceid === Number(prepared.invoice.id))
            .map((allocation) => allocation.id),
        };
        await client.query(
          `
          UPDATE revoinvoice
          SET paymentdata = $1::jsonb,
              paidamount = $2,
              balanceamount = $3,
              paymentstatus = $4,
              lastpaymentdate = $5,
              modifieddate = $5
          WHERE id = $6
          `,
          [
            JSON.stringify([...existingPayments, paymentEntry]),
            prepared.paidAmount,
            prepared.balanceAmount,
            prepared.paymentStatus,
            epoch,
            prepared.invoice.id,
          ]
        );
        updatedInvoices.push({
          id: Number(prepared.invoice.id),
          invoicenumber: prepared.invoice.invoicenumber,
          paidamount: prepared.paidAmount,
          balanceamount: prepared.balanceAmount,
          paymentstatus: prepared.paymentStatus,
        });
      }

      await client.query(
        `
        INSERT INTO finance_audit_events (
          organizationid, entitytype, entityid, action, actor, eventdata, createddate
        )
        VALUES ($1, 'on_account_application', $2, 'customer_on_account_applied', $3, $4::jsonb, $5)
        `,
        [
          organizationId,
          journalId,
          actor,
          JSON.stringify({
            customerid: customerId,
            requestreference: requestReference,
            bankportion: totalBankPortion,
            tdsamount: totalTdsAmount,
            totalsettlement: totalSettlement,
            references: updatedReferences,
            invoices: updatedInvoices,
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
        invoices: updatedInvoices,
        allocations: allocationRecords,
      };
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") {
        const existing = await getExistingApplication(
          client,
          organizationId,
          requestReference
        );
        if (existing) return existing;
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
