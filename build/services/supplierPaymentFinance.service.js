import pool, { query } from "../database/postgres.js";
import { FinanceValidationError, calculateAvailableBalance, formatTdsSectionDisplayName, nowEpoch, requireIsoDate, requirePositiveMoney, resolveFinanceContext, toFinanceDateOnly, toMoney, } from "../utils/finance/finance.utils.js";
import { applySupplierBillAllocation, getSupplierBillPaymentState, isSupplierBillOpen, resolveSupplierBillStatus, } from "../utils/finance/supplierBill.utils.js";
import { FINANCE_SOURCE_TYPES, resolveAgainstDocumentSourceId, } from "../utils/finance/financeSource.utils.js";
const normalizeText = (value, fieldName, required = false, maxLength = 255) => {
    const normalized = String(value ?? "").trim();
    if (required && !normalized) {
        throw new FinanceValidationError(`${fieldName} is required.`);
    }
    if (normalized.length > maxLength) {
        throw new FinanceValidationError(`${fieldName} must not exceed ${maxLength} characters.`);
    }
    return normalized || null;
};
const parsePaymentData = (value) => {
    if (Array.isArray(value))
        return value;
    if (typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const epochToIndiaDate = (value) => {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0)
        return null;
    const milliseconds = raw > 10000000000 ? raw : raw * 1000;
    return new Date(milliseconds + 5.5 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
};
const selectSupplierBills = `
  SELECT
    bill.*,
    linked_po.supplierid,
    supplier.suppliername,
    supplier.supplieremail,
    supplier.supplierphonenumber,
    supplier.suppliercode
  FROM poinvoice bill
  JOIN LATERAL (
    SELECT po.supplierid
    FROM purchaseorder po
    WHERE po.ponumber = bill.ponumber
    ORDER BY po.id DESC
    LIMIT 1
  ) linked_po ON TRUE
  JOIN supplier ON supplier.id = linked_po.supplierid
  WHERE COALESCE(supplier.isdeleted, FALSE) = FALSE
`;
const serializeOutstandingBill = (row) => {
    const state = getSupplierBillPaymentState(row);
    return {
        id: Number(row.id),
        invoicenumber: row.invoicenumber,
        ponumber: row.ponumber,
        invoiceurl: row.invoiceurl,
        supplierid: Number(row.supplierid),
        suppliername: row.suppliername,
        invoicedate: epochToIndiaDate(row.invoicedate || row.createddate),
        paymentduedate: epochToIndiaDate(row.paymentduedate),
        invoiceamount: state.invoiceAmount,
        settledamount: state.settledAmount,
        outstandingamount: state.outstandingAmount,
        invoicestatus: row.invoicestatus || "in_progress",
        iscreditpayment: row.iscreditpayment === true,
    };
};
const getExistingPayment = async (client, organizationId, requestReference) => {
    const result = await client.query(`
    SELECT
      t.*,
      j.journalnumber,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'billid', a.documentid,
              'documenttype', a.documenttype,
              'invoicenumber', a.documentnumber,
              'invoiceurl', bill.invoiceurl,
              'allocationamount', a.allocationamount,
              'tdsapplied', a.tdsapplied,
              'tdssectionid', a.tdssectionid,
              'tdssection', CASE
                WHEN a.tdssectionid IS NOT NULL THEN a.statutorysnapshot
                ELSE NULL
              END,
              'adjustmenttype', a.statutorysnapshot->>'adjustmenttype',
              'tdsamount', a.tdsamount,
              'totalsettledamount', a.totalsettledamount,
              'status', a.status
            )
            ORDER BY a.id
          )
          FROM bank_transaction_allocations a
          LEFT JOIN poinvoice bill
            ON bill.id = a.documentid
           AND a.documenttype = 'purchase_bill'
          WHERE a.banktransactionid = t.id
            AND a.status = 'applied'
        ),
        '[]'::jsonb
      ) AS allocations
    FROM bank_transactions t
    LEFT JOIN journal_entries j ON j.id = t.journalentryid
    WHERE t.organizationid = $1
      AND t.sourcetype = $2
      AND t.sourcepaymentid = $3
      AND t.postingstatus <> 'reversed'
    LIMIT 1
    `, [
        organizationId,
        FINANCE_SOURCE_TYPES.supplierBillPayment,
        requestReference,
    ]);
    const row = result.rows[0];
    return row
        ? {
            ...row,
            transactiondate: toFinanceDateOnly(row.transactiondate) ?? row.transactiondate,
        }
        : null;
};
export var supplierPaymentFinanceService;
(function (supplierPaymentFinanceService) {
    supplierPaymentFinanceService.listSuppliers = async (request) => {
        const search = String(request.query?.search || "").trim().toLowerCase();
        const result = await query(`${selectSupplierBills}
       ORDER BY COALESCE(bill.invoicedate, bill.createddate) ASC, bill.id ASC
       LIMIT 5000`);
        const suppliers = new Map();
        for (const row of result.rows) {
            if (!isSupplierBillOpen(row))
                continue;
            const state = getSupplierBillPaymentState(row);
            const supplierId = Number(row.supplierid);
            if (!Number.isSafeInteger(supplierId) || supplierId <= 0)
                continue;
            const supplier = suppliers.get(supplierId) || {
                id: supplierId,
                name: row.suppliername || `Supplier ${supplierId}`,
                email: row.supplieremail || null,
                mobilenumber: row.supplierphonenumber || null,
                suppliercode: row.suppliercode || null,
                outstandingbillcount: 0,
                totaloutstanding: 0,
            };
            supplier.outstandingbillcount += 1;
            supplier.totaloutstanding = toMoney(supplier.totaloutstanding + state.outstandingAmount);
            suppliers.set(supplierId, supplier);
        }
        return Array.from(suppliers.values())
            .filter((supplier) => {
            if (!search)
                return true;
            return [
                supplier.name,
                supplier.email,
                supplier.mobilenumber,
                supplier.suppliercode,
            ].some((value) => String(value || "").toLowerCase().includes(search));
        })
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, 50);
    };
    supplierPaymentFinanceService.listOutstandingBills = async (request) => {
        const supplierId = Number(request.params?.supplierId);
        if (!Number.isSafeInteger(supplierId) || supplierId <= 0) {
            throw new FinanceValidationError("A valid supplierId is required.");
        }
        const result = await query(`${selectSupplierBills}
       AND linked_po.supplierid = $1
       ORDER BY COALESCE(bill.invoicedate, bill.createddate) ASC, bill.id ASC`, [supplierId]);
        return result.rows
            .filter(isSupplierBillOpen)
            .map(serializeOutstandingBill)
            .filter((bill) => bill.outstandingamount > 0);
    };
    supplierPaymentFinanceService.postPayment = async (request) => {
        const { actor, organizationId } = resolveFinanceContext(request);
        const accountId = Number(request.params?.accountId);
        const supplierId = Number(request.body?.supplierid);
        if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            throw new FinanceValidationError("A valid accountId is required.");
        }
        if (!Number.isSafeInteger(supplierId) || supplierId <= 0) {
            throw new FinanceValidationError("A valid supplierid is required.");
        }
        const transactionDate = requireIsoDate(request.body?.transactiondate, "transactiondate");
        const amount = requirePositiveMoney(request.body?.amount);
        const remarks = normalizeText(request.body?.remarks, "remarks", false, 2000);
        const requestReference = normalizeText(request.body?.requestreference, "requestreference", true, 100);
        const requestedAllocations = Array.isArray(request.body?.allocations)
            ? request.body.allocations
            : [];
        if (requestedAllocations.length === 0) {
            throw new FinanceValidationError("At least one supplier bill allocation is required.");
        }
        const normalizedAllocations = requestedAllocations.map((item) => {
            const billId = Number(item?.billid);
            const allocationAmount = requirePositiveMoney(item?.allocationamount, "allocationamount");
            const tdsApplied = item?.tdsapplied === true;
            const tdsAmount = toMoney(item?.tdsamount ?? 0, "tdsamount");
            const tdsSectionId = item?.tdssectionid == null ? null : Number(item.tdssectionid);
            if (tdsAmount < 0) {
                throw new FinanceValidationError("TDS Payable amount cannot be negative.");
            }
            if (tdsApplied) {
                if (tdsAmount <= 0) {
                    throw new FinanceValidationError("TDS Payable amount must be greater than zero when TDS is applied.");
                }
                if (!Number.isSafeInteger(tdsSectionId) ||
                    Number(tdsSectionId) <= 0) {
                    throw new FinanceValidationError("A valid TDS section is required when TDS Payable is applied.");
                }
            }
            else if (tdsAmount !== 0 || tdsSectionId !== null) {
                throw new FinanceValidationError("TDS amount and section must be empty when TDS is not applied.");
            }
            return {
                billId,
                allocationAmount,
                tdsApplied,
                tdsAmount,
                tdsSectionId,
            };
        });
        const billIds = normalizedAllocations.map((item) => item.billId);
        if (billIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
            new Set(billIds).size !== billIds.length) {
            throw new FinanceValidationError("Bill allocations must contain unique valid bill IDs.");
        }
        const allocationTotal = toMoney(normalizedAllocations.reduce((total, item) => total + item.allocationAmount, 0));
        if (allocationTotal !== amount) {
            throw new FinanceValidationError("Payment amount must equal the total supplier bill allocation.");
        }
        const totalTdsAmount = toMoney(normalizedAllocations.reduce((total, item) => total + item.tdsAmount, 0));
        const totalSettlementAmount = toMoney(amount + totalTdsAmount);
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const existingPayment = await getExistingPayment(client, organizationId, requestReference);
            if (existingPayment) {
                await client.query("COMMIT");
                return existingPayment;
            }
            const accountResult = await client.query(`
        SELECT *
        FROM bank_cash_accounts
        WHERE id = $1
          AND organizationid = $2
        FOR UPDATE
        `, [accountId, organizationId]);
            const account = accountResult.rows[0];
            if (!account) {
                throw new FinanceValidationError("Bank/Cash account was not found.", 404, "BANK_CASH_ACCOUNT_NOT_FOUND");
            }
            if (account.status !== "active") {
                throw new FinanceValidationError("Payments can only be posted from an active Bank/Cash account.");
            }
            const supplierResult = await client.query(`
        SELECT id, suppliername, supplieremail, supplierphonenumber, suppliercode
        FROM supplier
        WHERE id = $1
          AND COALESCE(isdeleted, FALSE) = FALSE
        LIMIT 1
        `, [supplierId]);
            const supplier = supplierResult.rows[0];
            if (!supplier) {
                throw new FinanceValidationError("The selected supplier was not found.");
            }
            const supplierName = String(supplier.suppliername || "").trim() ||
                `Supplier ${supplierId}`;
            const billResult = await client.query(`
        SELECT
          bill.*,
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
        FOR UPDATE OF bill
        `, [billIds]);
            if (billResult.rows.length !== billIds.length) {
                throw new FinanceValidationError("One or more selected supplier bills were not found.");
            }
            const billById = new Map(billResult.rows.map((row) => [Number(row.id), row]));
            const preparedAllocations = normalizedAllocations.map((item) => {
                const bill = billById.get(item.billId);
                if (!bill ||
                    Number(bill.supplierid) !== supplierId ||
                    !isSupplierBillOpen(bill)) {
                    throw new FinanceValidationError("All selected bills must be eligible outstanding bills for the selected supplier.");
                }
                return {
                    bill,
                    ...item,
                    ...applySupplierBillAllocation(bill, item.allocationAmount, item.tdsAmount),
                };
            });
            const latestTransactionResult = await client.query(`
        SELECT transactiondate
        FROM bank_transactions
        WHERE bankcashaccountid = $1
          AND postingstatus = 'posted'
        ORDER BY transactiondate DESC, posteddate DESC, id DESC
        LIMIT 1
        `, [accountId]);
            const latestTransactionDate = toFinanceDateOnly(latestTransactionResult.rows[0]?.transactiondate);
            if (latestTransactionDate && transactionDate < latestTransactionDate) {
                throw new FinanceValidationError("Backdated transactions are not enabled in the foundation release.");
            }
            const accountsPayableResult = await client.query(`
        SELECT id
        FROM finance_accounts
        WHERE organizationid = $1
          AND accountcode = 'SYS-AP'
          AND status = 'active'
        LIMIT 1
        `, [organizationId]);
            const accountsPayableId = Number(accountsPayableResult.rows[0]?.id);
            if (!Number.isSafeInteger(accountsPayableId)) {
                throw new FinanceValidationError("Accounts Payable system ledger is unavailable.", 409, "ACCOUNTS_PAYABLE_LEDGER_MISSING");
            }
            let tdsPayableAccountId = null;
            const tdsSectionById = new Map();
            if (totalTdsAmount > 0) {
                const tdsPayableResult = await client.query(`
          SELECT id
          FROM finance_accounts
          WHERE organizationid = $1
            AND accountcode = 'SYS-TDS-PAYABLE'
            AND status = 'active'
          LIMIT 1
          `, [organizationId]);
                tdsPayableAccountId = Number(tdsPayableResult.rows[0]?.id);
                if (!Number.isSafeInteger(tdsPayableAccountId)) {
                    throw new FinanceValidationError("TDS Payable system ledger is unavailable.", 409, "TDS_PAYABLE_LEDGER_MISSING");
                }
                const tdsSectionIds = Array.from(new Set(preparedAllocations
                    .map((item) => item.tdsSectionId)
                    .filter((id) => id !== null)));
                const tdsSectionResult = await client.query(`
          SELECT id, newcode, natureofpayment, rate
          FROM tds_sections
          WHERE organizationid = $1
            AND id = ANY($2::bigint[])
          `, [organizationId, tdsSectionIds]);
                for (const section of tdsSectionResult.rows) {
                    tdsSectionById.set(Number(section.id), section);
                }
                if (tdsSectionById.size !== tdsSectionIds.length) {
                    throw new FinanceValidationError("One or more selected TDS sections are unavailable.");
                }
            }
            const balanceAfter = calculateAvailableBalance(account.currentbalance, "credit", amount);
            const epoch = nowEpoch();
            const defaultRemarks = preparedAllocations.length === 1
                ? `Supplier payment against bill ${preparedAllocations[0].bill.invoicenumber}`
                : `Supplier payment allocated across ${preparedAllocations.length} bills`;
            const paymentRemarks = remarks || defaultRemarks;
            const sourceId = resolveAgainstDocumentSourceId(preparedAllocations.map((allocation) => allocation.bill.ponumber || allocation.bill.invoicenumber), requestReference);
            const bankTransactionResult = await client.query(`
        INSERT INTO bank_transactions (
          organizationid,
          bankcashaccountid,
          transactiondate,
          partytype,
          partyid,
          partyname,
          counterpartyaccountid,
          entryside,
          amount,
          debitamount,
          creditamount,
          balanceafter,
          allocationmethod,
          sourcetype,
          sourceid,
          sourcepaymentid,
          remarks,
          postingstatus,
          entrymode,
          createdby,
          postedby,
          createddate,
          posteddate
        )
        VALUES (
          $1, $2, $3, 'supplier', $4, $5, $6, 'credit',
          $7, 0, $7, $8, 'against_document', $9, $10, $11,
          $12, 'posted', 'manual', $13, $13, $14, $14
        )
        RETURNING *
        `, [
                organizationId,
                accountId,
                transactionDate,
                supplierId,
                supplierName,
                accountsPayableId,
                amount,
                balanceAfter,
                FINANCE_SOURCE_TYPES.supplierBillPayment,
                sourceId,
                requestReference,
                paymentRemarks,
                actor,
                epoch,
            ]);
            const bankTransaction = bankTransactionResult.rows[0];
            const transactionNumber = `BT-${String(bankTransaction.id).padStart(8, "0")}`;
            const journalResult = await client.query(`
        INSERT INTO journal_entries (
          organizationid,
          entrydate,
          sourcetype,
          sourceid,
          status,
          description,
          createdby,
          postedby,
          createddate,
          posteddate
        )
        VALUES (
          $1, $2, 'bank_transaction', $3, 'posted',
          $4, $5, $5, $6, $6
        )
        RETURNING *
        `, [
                organizationId,
                transactionDate,
                bankTransaction.id,
                paymentRemarks,
                actor,
                epoch,
            ]);
            const journalEntry = journalResult.rows[0];
            const journalNumber = `JE-${String(journalEntry.id).padStart(8, "0")}`;
            await client.query(`
        INSERT INTO journal_lines (
          journalentryid,
          financeaccountid,
          partytype,
          partyid,
          debitamount,
          creditamount,
          description
        )
        VALUES
          ($1, $2, 'supplier', $3, $4, 0, $5),
          ($1, $6, 'supplier', $3, 0, $7, $5)
        `, [
                journalEntry.id,
                accountsPayableId,
                supplierId,
                totalSettlementAmount,
                paymentRemarks,
                account.financeaccountid,
                amount,
            ]);
            if (totalTdsAmount > 0) {
                await client.query(`
          INSERT INTO journal_lines (
            journalentryid,
            financeaccountid,
            partytype,
            partyid,
            debitamount,
            creditamount,
            description
          )
          VALUES ($1, $2, 'supplier', $3, 0, $4, $5)
          `, [
                    journalEntry.id,
                    tdsPayableAccountId,
                    supplierId,
                    totalTdsAmount,
                    paymentRemarks,
                ]);
            }
            const allocationRecords = [];
            for (const allocation of preparedAllocations) {
                const tdsSection = allocation.tdsSectionId
                    ? tdsSectionById.get(allocation.tdsSectionId)
                    : null;
                const statutorySnapshot = allocation.tdsApplied
                    ? {
                        adjustmenttype: "tds_payable",
                        id: Number(tdsSection.id),
                        newcode: tdsSection.newcode,
                        natureofpayment: tdsSection.natureofpayment,
                        rate: tdsSection.rate,
                        displayname: formatTdsSectionDisplayName(tdsSection.natureofpayment, tdsSection.newcode, tdsSection.rate),
                    }
                    : {};
                const allocationResult = await client.query(`
          INSERT INTO bank_transaction_allocations (
            banktransactionid,
            documenttype,
            documentid,
            documentnumber,
            allocationamount,
            tdsapplied,
            tdssectionid,
            tdsaccountid,
            tdsamount,
            totalsettledamount,
            statutorysnapshot,
            status,
            createdby,
            createddate
          )
          VALUES (
            $1, 'purchase_bill', $2, $3, $4, $5, $6, $7, $8, $9,
            $10::jsonb, 'applied', $11, $12
          )
          RETURNING *
          `, [
                    bankTransaction.id,
                    allocation.bill.id,
                    allocation.bill.invoicenumber,
                    allocation.allocationAmount,
                    allocation.tdsApplied,
                    allocation.tdsSectionId,
                    allocation.tdsApplied ? tdsPayableAccountId : null,
                    allocation.tdsAmount,
                    allocation.totalSettledAmount,
                    JSON.stringify(statutorySnapshot),
                    actor,
                    epoch,
                ]);
                const allocationRecord = allocationResult.rows[0];
                allocationRecords.push({
                    id: Number(allocationRecord.id),
                    billid: Number(allocation.bill.id),
                    documenttype: "purchase_bill",
                    invoicenumber: allocation.bill.invoicenumber,
                    ponumber: allocation.bill.ponumber,
                    invoiceurl: allocation.bill.invoiceurl || null,
                    allocationamount: allocation.allocationAmount,
                    tdsapplied: allocation.tdsApplied,
                    tdssectionid: allocation.tdsSectionId,
                    tdssection: allocation.tdsApplied ? statutorySnapshot : null,
                    adjustmenttype: allocation.tdsApplied ? "tds_payable" : null,
                    tdsamount: allocation.tdsAmount,
                    totalsettledamount: allocation.totalSettledAmount,
                    status: "applied",
                });
                const existingPayments = parsePaymentData(allocation.bill.paymentdata);
                const paymentEntry = {
                    id: existingPayments.length + 1,
                    paymentamount: allocation.allocationAmount,
                    tdsamount: allocation.tdsAmount,
                    tdssectionid: allocation.tdsSectionId,
                    tdssection: allocation.tdsApplied ? statutorySnapshot : null,
                    adjustmenttype: allocation.tdsApplied ? "tds_payable" : null,
                    settlementamount: allocation.totalSettledAmount,
                    paymentmethod: account.accounttype === "cash" ? "cash" : "bank_transfer",
                    paymentdate: epoch,
                    transactionreference: transactionNumber,
                    source: "finance_supplier_bill_payment",
                    status: "success",
                    comments: remarks,
                    banktransactionid: Number(bankTransaction.id),
                    allocationid: Number(allocationRecord.id),
                };
                const invoiceStatus = resolveSupplierBillStatus(allocation.bill, allocation.balanceAmount, epoch);
                await client.query(`
          UPDATE poinvoice
          SET paymentdata = $1::jsonb,
              balanceamount = $2,
              invoicestatus = $3,
              modifieddate = $4
          WHERE id = $5
          `, [
                    JSON.stringify([...existingPayments, paymentEntry]),
                    allocation.balanceAmount,
                    invoiceStatus,
                    epoch,
                    allocation.bill.id,
                ]);
            }
            await client.query(`UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`, [journalNumber, journalEntry.id]);
            await client.query(`
        UPDATE bank_transactions
        SET transactionnumber = $1,
            journalentryid = $2
        WHERE id = $3
        `, [transactionNumber, journalEntry.id, bankTransaction.id]);
            await client.query(`
        UPDATE bank_cash_accounts
        SET currentbalance = $1,
            version = version + 1,
            modifiedby = $2,
            modifieddate = $3
        WHERE id = $4
        `, [balanceAfter, actor, epoch, accountId]);
            await client.query(`
        INSERT INTO finance_audit_events (
          organizationid,
          entitytype,
          entityid,
          action,
          actor,
          eventdata,
          createddate
        )
        VALUES (
          $1, 'bank_transaction', $2, 'supplier_bill_payment_posted',
          $3, $4::jsonb, $5
        )
        `, [
                organizationId,
                bankTransaction.id,
                actor,
                JSON.stringify({
                    transactionnumber: transactionNumber,
                    supplierid: supplierId,
                    amount,
                    tdsamount: totalTdsAmount,
                    totalsettledamount: totalSettlementAmount,
                    previousbalance: toMoney(account.currentbalance),
                    balanceafter: balanceAfter,
                    allocations: allocationRecords,
                    journalentryid: Number(journalEntry.id),
                }),
                epoch,
            ]);
            await client.query("COMMIT");
            return {
                ...bankTransaction,
                transactiondate: transactionDate,
                transactionnumber: transactionNumber,
                journalentryid: Number(journalEntry.id),
                journalnumber: journalNumber,
                allocations: allocationRecords,
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            if (error?.code === "23505") {
                const existingPayment = await getExistingPayment(client, organizationId, requestReference);
                if (existingPayment)
                    return existingPayment;
            }
            throw error;
        }
        finally {
            client.release();
        }
    };
})(supplierPaymentFinanceService || (supplierPaymentFinanceService = {}));
//# sourceMappingURL=supplierPaymentFinance.service.js.map