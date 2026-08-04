import pool, { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  calculateAvailableBalance,
  nowEpoch,
  requireIsoDate,
  requirePositiveMoney,
  resolveFinanceContext,
  toFinanceDateOnly,
  toMoney,
} from "../utils/finance/finance.utils.js";
import {
  applyRetailInvoiceAllocation,
  getRetailInvoicePaymentState,
  isRetailStoreInvoice,
} from "../utils/finance/retailReceipt.utils.js";
import {
  FINANCE_SOURCE_TYPES,
  getRetailReceiptSourceTypes,
  resolveAgainstDocumentSourceId,
} from "../utils/finance/financeSource.utils.js";

const RETAIL_SOURCE_TYPE = FINANCE_SOURCE_TYPES.retailReceipt;
const RETAIL_SOURCE_TYPES = getRetailReceiptSourceTypes();

const normalizeText = (
  value: unknown,
  fieldName: string,
  required = false,
  maxLength = 255
) => {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) {
    throw new FinanceValidationError(`${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new FinanceValidationError(
      `${fieldName} must not exceed ${maxLength} characters.`
    );
  }
  return normalized || null;
};

const buildCustomerName = (row: any) => {
  const fullName = [row?.firstname, row?.lastname]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  return (
    fullName ||
    String(row?.customername || "").trim() ||
    String(row?.useremail || "").trim() ||
    `Customer ${row?.customerid || row?.id}`
  );
};

const epochToIndiaDate = (value: unknown): string | null => {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const milliseconds = raw > 10_000_000_000 ? raw : raw * 1000;
  return new Date(milliseconds + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
};

const selectRetailInvoices = `
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
  WHERE r.customerid = $1
    AND LOWER(COALESCE(r.invoicefor, '')) = 'product'
    AND LOWER(COALESCE(r.paymentstatus, 'pending')) <> 'paid'
    AND (
      LOWER(COALESCE(linked_order.ordername, '')) = 'storepurchase'
      OR LOWER(COALESCE(r.invoicedata->>'ordername', '')) = 'storepurchase'
    )
`;

const serializeOutstandingInvoice = (row: any) => {
  const state = getRetailInvoicePaymentState(row);
  return {
    id: Number(row.id),
    invoicenumber: row.invoicenumber,
    orderid: row.orderid,
    customerid: Number(row.customerid),
    customername: row.customername,
    invoicedate: epochToIndiaDate(row.invoicedate || row.createddate),
    invoiceamount: state.invoiceAmount,
    paidamount: state.paidAmount,
    outstandingamount: state.outstandingAmount,
    paymentstatus:
      state.outstandingAmount === 0
        ? "paid"
        : state.paidAmount > 0
          ? "partially_paid"
          : "pending",
  };
};

const getExistingReceipt = async (
  client: any,
  organizationId: number,
  requestReference: string
) => {
  const result = await client.query(
    `
    SELECT
      t.*,
      j.journalnumber,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'invoiceid', a.documentid,
              'invoicenumber', a.documentnumber,
              'invoiceurl', r.invoiceurl,
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
          LEFT JOIN revoinvoice r
            ON r.id = a.documentid
           AND a.documenttype = 'sales_invoice'
          WHERE a.banktransactionid = t.id
            AND a.status = 'applied'
        ),
        '[]'::jsonb
      ) AS allocations
    FROM bank_transactions t
    LEFT JOIN journal_entries j ON j.id = t.journalentryid
    WHERE t.organizationid = $1
      AND t.sourcetype = ANY($2::text[])
      AND t.sourcepaymentid = $3
      AND t.postingstatus <> 'reversed'
    LIMIT 1
    `,
    [organizationId, RETAIL_SOURCE_TYPES, requestReference]
  );
  const row = result.rows[0];
  return row
    ? {
        ...row,
        transactiondate:
          toFinanceDateOnly(row.transactiondate) ?? row.transactiondate,
      }
    : null;
};

export module retailReceiptFinanceService {
  export const listCustomers = async (request: any) => {
    const search = String(request.query?.search || "").trim().toLowerCase();
    const invoiceResult = await query(
      `
      SELECT
        r.*,
        linked_order.ordername AS linkedordername,
        u.firstname,
        u.lastname,
        u.useremail,
        u.usermobilenumber
      FROM revoinvoice r
      JOIN users u ON u.id = r.customerid
      LEFT JOIN LATERAL (
        SELECT o.ordername
        FROM orders o
        WHERE o.orderid = r.orderid
        ORDER BY o.id
        LIMIT 1
      ) linked_order ON TRUE
      WHERE LOWER(COALESCE(r.invoicefor, '')) = 'product'
        AND LOWER(COALESCE(r.paymentstatus, 'pending')) <> 'paid'
        AND (
          LOWER(COALESCE(linked_order.ordername, '')) = 'storepurchase'
          OR LOWER(COALESCE(r.invoicedata->>'ordername', '')) = 'storepurchase'
        )
      ORDER BY r.id DESC
      LIMIT 2000
      `
    );

    const customers = new Map<number, any>();
    for (const row of invoiceResult.rows) {
      if (!isRetailStoreInvoice(row)) continue;
      const state = getRetailInvoicePaymentState(row);
      if (state.outstandingAmount <= 0) continue;
      const customerId = Number(row.customerid);
      if (!Number.isSafeInteger(customerId) || customerId <= 0) continue;

      const customer = customers.get(customerId) || {
        id: customerId,
        name: buildCustomerName(row),
        email: row.useremail || null,
        mobilenumber: row.usermobilenumber || null,
        outstandinginvoicecount: 0,
        totaloutstanding: 0,
      };
      customer.outstandinginvoicecount += 1;
      customer.totaloutstanding = toMoney(
        customer.totaloutstanding + state.outstandingAmount
      );
      customers.set(customerId, customer);
    }

    return Array.from(customers.values())
      .filter((customer) => {
        if (!search) return true;
        return [customer.name, customer.email, customer.mobilenumber]
          .some((value) => String(value || "").toLowerCase().includes(search));
      })
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 50);
  };

  export const listOutstandingInvoices = async (request: any) => {
    const customerId = Number(request.params?.customerId);
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new FinanceValidationError("A valid customerId is required.");
    }
    const result = await query(
      `${selectRetailInvoices}
       ORDER BY COALESCE(r.invoicedate, r.createddate) ASC, r.id ASC`,
      [customerId]
    );

    return result.rows
      .filter(isRetailStoreInvoice)
      .map(serializeOutstandingInvoice)
      .filter((invoice) => invoice.outstandingamount > 0);
  };

  export const postReceipt = async (request: any) => {
    const { actor, organizationId } = resolveFinanceContext(request);
    const accountId = Number(request.params?.accountId);
    const customerId = Number(request.body?.customerid);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      throw new FinanceValidationError("A valid accountId is required.");
    }
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new FinanceValidationError("A valid customerid is required.");
    }

    const transactionDate = requireIsoDate(
      request.body?.transactiondate,
      "transactiondate"
    );
    const amount = requirePositiveMoney(request.body?.amount);
    const remarks = normalizeText(
      request.body?.remarks,
      "remarks",
      false,
      2000
    );
    const requestReference = normalizeText(
      request.body?.requestreference,
      "requestreference",
      true,
      100
    )!;
    const requestedAllocations = Array.isArray(request.body?.allocations)
      ? request.body.allocations
      : [];
    if (requestedAllocations.length === 0) {
      throw new FinanceValidationError(
        "At least one invoice allocation is required."
      );
    }
    const normalizedAllocations = requestedAllocations.map((item: any) => {
      const invoiceId = Number(item?.invoiceid);
      const allocationAmount = requirePositiveMoney(
        item?.allocationamount,
        "allocationamount"
      );
      const tdsApplied = item?.tdsapplied === true;
      const tdsAmount = toMoney(item?.tdsamount ?? 0, "tdsamount");

      if (tdsAmount < 0) {
        throw new FinanceValidationError(
          "TDS Receivable amount cannot be negative."
        );
      }
      if (tdsApplied) {
        if (tdsAmount <= 0) {
          throw new FinanceValidationError(
            "TDS Receivable amount must be greater than zero when TDS is applied."
          );
        }
      } else if (tdsAmount !== 0) {
        throw new FinanceValidationError(
          "TDS Receivable amount must be zero when TDS is not applied."
        );
      }

      return {
        invoiceId,
        allocationAmount,
        tdsApplied,
        tdsAmount,
      };
    });
    const invoiceIds = normalizedAllocations.map((item) => item.invoiceId);
    if (
      invoiceIds.some(
        (id: number) => !Number.isSafeInteger(id) || id <= 0
      ) ||
      new Set(invoiceIds).size !== invoiceIds.length
    ) {
      throw new FinanceValidationError(
        "Invoice allocations must contain unique valid invoice IDs."
      );
    }
    const allocationTotal = toMoney(
      normalizedAllocations.reduce(
        (total, item) => total + item.allocationAmount,
        0
      )
    );
    const totalTdsAmount = toMoney(
      normalizedAllocations.reduce(
        (total, item) => total + item.tdsAmount,
        0
      )
    );
    const totalSettlementAmount = toMoney(amount + totalTdsAmount);
    if (allocationTotal !== amount) {
      throw new FinanceValidationError(
        "Receipt amount must equal the total invoice allocation."
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingReceipt = await getExistingReceipt(
        client,
        organizationId,
        requestReference
      );
      if (existingReceipt) {
        await client.query("COMMIT");
        return existingReceipt;
      }

      const accountResult = await client.query(
        `
        SELECT *
        FROM bank_cash_accounts
        WHERE id = $1
          AND organizationid = $2
        FOR UPDATE
        `,
        [accountId, organizationId]
      );
      const account = accountResult.rows[0];
      if (!account) {
        throw new FinanceValidationError(
          "Bank/Cash account was not found.",
          404,
          "BANK_CASH_ACCOUNT_NOT_FOUND"
        );
      }
      if (account.status !== "active") {
        throw new FinanceValidationError(
          "Receipts can only be posted to an active Bank/Cash account."
        );
      }

      const customerResult = await client.query(
        `
        SELECT id, firstname, lastname, useremail, usermobilenumber
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [customerId]
      );
      const customer = customerResult.rows[0];
      if (!customer) {
        throw new FinanceValidationError(
          "The selected customer was not found."
        );
      }
      const customerName = buildCustomerName({
        ...customer,
        customerid: customerId,
      });

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
        FOR UPDATE OF r
        `,
        [invoiceIds]
      );
      if (invoiceResult.rows.length !== invoiceIds.length) {
        throw new FinanceValidationError(
          "One or more selected invoices were not found."
        );
      }
      const invoiceById = new Map<number, any>(
        invoiceResult.rows.map(
          (row: any): [number, any] => [Number(row.id), row]
        )
      );
      const preparedAllocations = normalizedAllocations.map((item) => {
        const invoice = invoiceById.get(item.invoiceId);
        if (
          !invoice ||
          Number(invoice.customerid) !== customerId ||
          !isRetailStoreInvoice(invoice)
        ) {
          throw new FinanceValidationError(
            "All selected invoices must be outstanding retail invoices for the selected customer."
          );
        }
        return {
          invoice,
          tdsApplied: item.tdsApplied,
          ...applyRetailInvoiceAllocation(
            invoice,
            item.allocationAmount,
            item.tdsAmount
          ),
        };
      });

      const latestTransactionResult = await client.query(
        `
        SELECT transactiondate
        FROM bank_transactions
        WHERE bankcashaccountid = $1
          AND postingstatus = 'posted'
        ORDER BY transactiondate DESC, posteddate DESC, id DESC
        LIMIT 1
        `,
        [accountId]
      );
      const latestTransactionDate = toFinanceDateOnly(
        latestTransactionResult.rows[0]?.transactiondate
      );
      if (latestTransactionDate && transactionDate < latestTransactionDate) {
        throw new FinanceValidationError(
          "Backdated transactions are not enabled in the foundation release."
        );
      }

      const accountsReceivableResult = await client.query(
        `
        SELECT id
        FROM finance_accounts
        WHERE organizationid = $1
          AND accountcode = 'SYS-AR'
          AND status = 'active'
        LIMIT 1
        `,
        [organizationId]
      );
      const accountsReceivableId = Number(
        accountsReceivableResult.rows[0]?.id
      );
      if (!Number.isSafeInteger(accountsReceivableId)) {
        throw new FinanceValidationError(
          "Accounts Receivable system ledger is unavailable.",
          409,
          "ACCOUNTS_RECEIVABLE_LEDGER_MISSING"
        );
      }

      let tdsReceivableAccountId: number | null = null;
      if (totalTdsAmount > 0) {
        const tdsReceivableResult = await client.query(
          `
          SELECT id
          FROM finance_accounts
          WHERE organizationid = $1
            AND accountcode = 'SYS-TDS-RECEIVABLE'
            AND status = 'active'
          LIMIT 1
          `,
          [organizationId]
        );
        tdsReceivableAccountId = Number(tdsReceivableResult.rows[0]?.id);
        if (!Number.isSafeInteger(tdsReceivableAccountId)) {
          throw new FinanceValidationError(
            "TDS Receivable system ledger is unavailable.",
            409,
            "TDS_RECEIVABLE_LEDGER_MISSING"
          );
        }
      }

      const balanceAfter = calculateAvailableBalance(
        account.currentbalance,
        "debit",
        amount
      );
      const epoch = nowEpoch();
      const defaultRemarks =
        preparedAllocations.length === 1
          ? `Retail receipt against invoice ${preparedAllocations[0].invoice.invoicenumber}`
          : `Retail receipt allocated across ${preparedAllocations.length} invoices`;
      const receiptRemarks = remarks || defaultRemarks;
      const sourceId = resolveAgainstDocumentSourceId(
        preparedAllocations.map((allocation) => allocation.invoice.orderid),
        requestReference
      );
      const bankTransactionResult = await client.query(
        `
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
          $1, $2, $3, 'customer', $4, $5, $6, 'debit',
          $7, $7, 0, $8, 'against_document', $9, $10, $11,
          $12, 'posted', 'manual', $13, $13, $14, $14
        )
        RETURNING *
        `,
        [
          organizationId,
          accountId,
          transactionDate,
          customerId,
          customerName,
          accountsReceivableId,
          amount,
          balanceAfter,
          RETAIL_SOURCE_TYPE,
          sourceId,
          requestReference,
          receiptRemarks,
          actor,
          epoch,
        ]
      );
      const bankTransaction = bankTransactionResult.rows[0];
      const transactionNumber = `BT-${String(bankTransaction.id).padStart(8, "0")}`;

      const journalResult = await client.query(
        `
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
        `,
        [
          organizationId,
          transactionDate,
          bankTransaction.id,
          receiptRemarks,
          actor,
          epoch,
        ]
      );
      const journalEntry = journalResult.rows[0];
      const journalNumber = `JE-${String(journalEntry.id).padStart(8, "0")}`;

      await client.query(
        `
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
          ($1, $2, 'customer', $3, $4, 0, $5),
          ($1, $6, 'customer', $3, 0, $7, $5)
        `,
        [
          journalEntry.id,
          account.financeaccountid,
          customerId,
          amount,
          receiptRemarks,
          accountsReceivableId,
          totalSettlementAmount,
        ]
      );

      if (totalTdsAmount > 0) {
        await client.query(
          `
          INSERT INTO journal_lines (
            journalentryid,
            financeaccountid,
            partytype,
            partyid,
            debitamount,
            creditamount,
            description
          )
          VALUES ($1, $2, 'customer', $3, $4, 0, $5)
          `,
          [
            journalEntry.id,
            tdsReceivableAccountId,
            customerId,
            totalTdsAmount,
            receiptRemarks,
          ]
        );
      }

      const allocationRecords = [];
      for (const allocation of preparedAllocations) {
        const allocationResult = await client.query(
          `
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
            $1, 'sales_invoice', $2, $3, $4, $5, $6, $7, $8, $9,
            $10::jsonb, 'applied', $11, $12
          )
          RETURNING *
          `,
          [
            bankTransaction.id,
            allocation.invoice.id,
            allocation.invoice.invoicenumber,
            allocation.allocationAmount,
            allocation.tdsApplied,
            null,
            allocation.tdsApplied ? tdsReceivableAccountId : null,
            allocation.tdsAmount,
            allocation.totalSettledAmount,
            JSON.stringify({ adjustmenttype: "tds_receivable" }),
            actor,
            epoch,
          ]
        );
        const allocationRecord = allocationResult.rows[0];
        allocationRecords.push({
          id: Number(allocationRecord.id),
          invoiceid: Number(allocation.invoice.id),
          invoicenumber: allocation.invoice.invoicenumber,
          allocationamount: allocation.allocationAmount,
          tdsapplied: allocation.tdsApplied,
          tdssectionid: null,
          tdssection: null,
          adjustmenttype: allocation.tdsApplied ? "tds_receivable" : null,
          tdsamount: allocation.tdsAmount,
          totalsettledamount: allocation.totalSettledAmount,
          status: "applied",
        });

        const existingPayments = Array.isArray(allocation.invoice.paymentdata)
          ? allocation.invoice.paymentdata
          : [];
        const paymentEntry = {
          id: existingPayments.length + 1,
          paymentamount: allocation.allocationAmount,
          tdsamount: allocation.tdsAmount,
          settlementamount: allocation.totalSettledAmount,
          paymentmethod:
            account.accounttype === "cash" ? "cash" : "bank_transfer",
          paymentdate: epoch,
          transactionreference: transactionNumber,
          providerpaymentid: null,
          providerorderid: null,
          transactionid: null,
          source: "finance_retail_receipt",
          status: "success",
          comments: remarks,
          banktransactionid: Number(bankTransaction.id),
          allocationid: Number(allocationRecord.id),
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
            allocation.paidAmount,
            allocation.balanceAmount,
            allocation.paymentStatus,
            epoch,
            allocation.invoice.id,
          ]
        );
      }

      await client.query(
        `
        UPDATE journal_entries
        SET journalnumber = $1
        WHERE id = $2
        `,
        [journalNumber, journalEntry.id]
      );
      await client.query(
        `
        UPDATE bank_transactions
        SET transactionnumber = $1,
            journalentryid = $2
        WHERE id = $3
        `,
        [transactionNumber, journalEntry.id, bankTransaction.id]
      );
      await client.query(
        `
        UPDATE bank_cash_accounts
        SET currentbalance = $1,
            version = version + 1,
            modifiedby = $2,
            modifieddate = $3
        WHERE id = $4
        `,
        [balanceAfter, actor, epoch, accountId]
      );
      await client.query(
        `
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
          $1, 'bank_transaction', $2, 'retail_receipt_posted',
          $3, $4::jsonb, $5
        )
        `,
        [
          organizationId,
          bankTransaction.id,
          actor,
          JSON.stringify({
            transactionnumber: transactionNumber,
            customerid: customerId,
            amount,
            tdsamount: totalTdsAmount,
            totalsettledamount: totalSettlementAmount,
            previousbalance: toMoney(account.currentbalance),
            balanceafter: balanceAfter,
            allocations: allocationRecords,
            journalentryid: Number(journalEntry.id),
          }),
          epoch,
        ]
      );

      await client.query("COMMIT");
      return {
        ...bankTransaction,
        transactiondate: transactionDate,
        transactionnumber: transactionNumber,
        journalentryid: Number(journalEntry.id),
        journalnumber: journalNumber,
        allocations: allocationRecords,
      };
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") {
        const existingReceipt = await getExistingReceipt(
          client,
          organizationId,
          requestReference
        );
        if (existingReceipt) return existingReceipt;
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
