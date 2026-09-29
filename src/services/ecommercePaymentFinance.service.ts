import pool, { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  calculateAvailableBalance,
  nowEpoch,
  requirePositiveMoney,
  toFinanceDateOnly,
  toMoney,
} from "../utils/finance/finance.utils.js";
import {
  buildEcommerceCustomerName,
  isEligibleEcommerceOrder,
  resolveEcommercePaymentDate,
  resolveEcommercePaymentMethod,
  resolveEcommercePaymentProvider,
  resolveEcommercePaymentReference,
} from "../utils/finance/ecommerceFinance.utils.js";
import { FINANCE_SOURCE_TYPES } from "../utils/finance/financeSource.utils.js";

const ORGANIZATION_ID = 1;
const SYSTEM_ACTOR = "system:ecommerce_payment";
const ECOMMERCE_SOURCE_TYPE = FINANCE_SOURCE_TYPES.ecommerceOrder;
const ECOMMERCE_ALLOCATION_JOURNAL_SOURCE = "ecommerce_invoice_allocation";

type FinanceEventResult = {
  status: "ignored" | "pending" | "posted" | "failed";
  eventId?: number;
  bankTransactionId?: number;
  reason?: string;
};

type EcommerceInvoiceLinkResult = {
  status: "ignored" | "linked" | "already_linked" | "failed";
  invoiceId: number;
  bankTransactionId?: number;
  allocationId?: number;
  reason?: string;
};

const parseJsonArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toInvoiceNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const numericValue = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const resolveInvoiceAmount = (invoice: any) => {
  const invoiceData =
    invoice?.invoicedata && typeof invoice.invoicedata === "object"
      ? invoice.invoicedata
      : {};
  const candidates = [
    invoice?.totalorderamount,
    invoice?.invoiceamount,
    invoiceData?.payableamount,
    invoiceData?.total,
    invoiceData?.totalamount,
  ];
  for (const candidate of candidates) {
    const amount = toInvoiceNumber(candidate);
    if (amount > 0) return toMoney(amount);
  }
  return 0;
};

const isMatchingInvoicePayment = (payment: any, transaction: any) => {
  const paymentReferences = new Set(
    [
      payment?.providerpaymentid,
      payment?.transactionreference,
      payment?.transactionid,
      payment?.merchanttransactionid,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );
  return [transaction?.sourcepaymentid, transaction?.merchanttransactionid]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .some((value) => paymentReferences.has(value));
};

const getEligibleOrderContext = async (merchantTransactionId: string) => {
  const orderResult = await query(
    `
    SELECT
      id,
      orderid,
      userid,
      ordername,
      invoicefor,
      paymentmethod,
      merchanttransactionid
    FROM orders
    WHERE merchanttransactionid = $1
    ORDER BY id
    `,
    [merchantTransactionId]
  );
  const orderRows = orderResult.rows;
  if (!isEligibleEcommerceOrder(orderRows)) return null;

  const customerId = Number(orderRows[0]?.userid);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) return null;

  const userResult = await query(
    `
    SELECT id, firstname, lastname, useremail
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [customerId]
  );

  return {
    orderRows,
    customerId,
    user: userResult.rows[0] || null,
    primaryOrderId: String(orderRows[0]?.orderid || merchantTransactionId),
  };
};

const markEventFailure = async (
  eventId: number,
  status: "pending" | "failed",
  code: string,
  message: string
) => {
  await query(
    `
    UPDATE ecommerce_payment_finance_events
    SET status = $1,
        attemptcount = attemptcount + 1,
        failurecode = $2,
        failuremessage = $3,
        modifiedby = $4,
        modifieddate = $5
    WHERE id = $6
      AND status <> 'posted'
    `,
    [status, code, message, SYSTEM_ACTOR, nowEpoch(), eventId]
  );
};

const linkInvoiceToPostedReceipt = async (
  invoiceId: number
): Promise<EcommerceInvoiceLinkResult> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoiceResult = await client.query(
      `
      SELECT
        r.*,
        order_context.merchanttransactionid AS linkedmerchanttransactionid,
        order_context.ordername AS linkedordername,
        order_context.invoicefor AS linkedinvoicefor
      FROM revoinvoice r
      LEFT JOIN LATERAL (
        SELECT candidate.merchanttransactionid, candidate.ordername, candidate.invoicefor
        FROM (
          SELECT o.merchanttransactionid, o.ordername, o.invoicefor, 1 AS priority
          FROM orders o
          WHERE o.orderid = r.orderid
          UNION ALL
          SELECT ol.merchanttransactionid, ol.ordername, ol.invoicefor, 2 AS priority
          FROM orderline ol
          WHERE ol.uniqueorderid = r.orderid
        ) candidate
        WHERE candidate.merchanttransactionid IS NOT NULL
        ORDER BY candidate.priority
        LIMIT 1
      ) order_context ON TRUE
      WHERE r.id = $1
      FOR UPDATE OF r
      `,
      [invoiceId]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      await client.query("COMMIT");
      return { status: "ignored", invoiceId, reason: "INVOICE_NOT_FOUND" };
    }
    if (
      String(invoice.invoicefor || "").trim().toLowerCase() !== "product" ||
      !isEligibleEcommerceOrder([
        {
          ordername: invoice.linkedordername,
          invoicefor: invoice.linkedinvoicefor,
        },
      ])
    ) {
      await client.query("COMMIT");
      return {
        status: "ignored",
        invoiceId,
        reason: "NOT_ECOMMERCE_PRODUCT_INVOICE",
      };
    }

    const merchantTransactionId = String(
      invoice.linkedmerchanttransactionid || ""
    ).trim();
    if (!merchantTransactionId) {
      await client.query("COMMIT");
      return {
        status: "ignored",
        invoiceId,
        reason: "MERCHANT_TRANSACTION_ID_MISSING",
      };
    }

    const transactionResult = await client.query(
      `
      SELECT *
      FROM bank_transactions
      WHERE organizationid = $1
        AND sourcetype = $2
        AND merchanttransactionid = $3
        AND partytype = 'customer'
        AND partyid = $4
        AND postingstatus = 'posted'
      ORDER BY id
      LIMIT 1
      FOR UPDATE
      `,
      [
        ORGANIZATION_ID,
        ECOMMERCE_SOURCE_TYPE,
        merchantTransactionId,
        invoice.customerid,
      ]
    );
    const bankTransaction = transactionResult.rows[0];
    if (!bankTransaction) {
      await client.query("COMMIT");
      return {
        status: "ignored",
        invoiceId,
        reason: "POSTED_ECOMMERCE_RECEIPT_NOT_FOUND",
      };
    }

    const existingAllocationResult = await client.query(
      `
      SELECT id, banktransactionid
      FROM bank_transaction_allocations
      WHERE documenttype = 'sales_invoice'
        AND documentid = $1
        AND status = 'applied'
      ORDER BY id
      LIMIT 1
      `,
      [invoiceId]
    );
    const existingAllocation = existingAllocationResult.rows[0];
    if (existingAllocation) {
      await client.query("COMMIT");
      return {
        status: "already_linked",
        invoiceId,
        bankTransactionId: Number(existingAllocation.banktransactionid),
        allocationId: Number(existingAllocation.id),
      };
    }

    const unappliedResult = await client.query(
      `
      SELECT *
      FROM party_unapplied_amounts
      WHERE banktransactionid = $1
        AND partytype = 'customer'
        AND partyid = $2
        AND unappliedtype = 'advance'
        AND status = 'open'
      LIMIT 1
      FOR UPDATE
      `,
      [bankTransaction.id, invoice.customerid]
    );
    const unapplied = unappliedResult.rows[0];
    if (!unapplied || toMoney(unapplied.remainingamount) <= 0) {
      await client.query("COMMIT");
      return {
        status: "ignored",
        invoiceId,
        bankTransactionId: Number(bankTransaction.id),
        reason: "NO_UNAPPLIED_ECOMMERCE_AMOUNT",
      };
    }

    const invoiceAmount = resolveInvoiceAmount(invoice);
    if (invoiceAmount <= 0) {
      await client.query("COMMIT");
      return {
        status: "ignored",
        invoiceId,
        bankTransactionId: Number(bankTransaction.id),
        reason: "INVOICE_AMOUNT_UNAVAILABLE",
      };
    }

    const allocatedResult = await client.query(
      `
      SELECT COALESCE(SUM(totalsettledamount), 0) AS allocatedamount
      FROM bank_transaction_allocations
      WHERE documenttype = 'sales_invoice'
        AND documentid = $1
        AND status = 'applied'
      `,
      [invoiceId]
    );
    const documentOutstanding = toMoney(
      Math.max(
        invoiceAmount - toMoney(allocatedResult.rows[0]?.allocatedamount),
        0
      )
    );
    const allocationAmount = toMoney(
      Math.min(toMoney(unapplied.remainingamount), documentOutstanding)
    );
    if (allocationAmount <= 0) {
      await client.query("COMMIT");
      return {
        status: "ignored",
        invoiceId,
        bankTransactionId: Number(bankTransaction.id),
        reason: "NO_DOCUMENT_OUTSTANDING_AMOUNT",
      };
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
      [ORGANIZATION_ID]
    );
    const accountsReceivableId = Number(accountsReceivableResult.rows[0]?.id);
    const customerAdvanceAccountId = Number(
      bankTransaction.counterpartyaccountid
    );
    if (
      !Number.isSafeInteger(accountsReceivableId) ||
      !Number.isSafeInteger(customerAdvanceAccountId)
    ) {
      throw new FinanceValidationError(
        "The Accounts Receivable or Customer Advance ledger is unavailable.",
        409,
        "ECOMMERCE_ALLOCATION_LEDGER_MISSING"
      );
    }

    const epoch = nowEpoch();
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
        $1, 'sales_invoice', $2, $3, $4, FALSE, NULL, NULL, 0, $4,
        $5::jsonb, 'applied', $6, $7
      )
      RETURNING *
      `,
      [
        bankTransaction.id,
        invoiceId,
        invoice.invoicenumber,
        allocationAmount,
        JSON.stringify({
          source: ECOMMERCE_SOURCE_TYPE,
          merchanttransactionid: merchantTransactionId,
        }),
        SYSTEM_ACTOR,
        epoch,
      ]
    );
    const allocation = allocationResult.rows[0];
    const remainingAmount = toMoney(
      toMoney(unapplied.remainingamount) - allocationAmount
    );
    const appliedAmount = toMoney(
      toMoney(unapplied.appliedamount) + allocationAmount
    );

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
        appliedAmount,
        remainingAmount,
        remainingAmount === 0 ? "fully_applied" : "open",
        SYSTEM_ACTOR,
        epoch,
        unapplied.id,
      ]
    );

    if (remainingAmount === 0) {
      await client.query(
        `
        UPDATE bank_transactions
        SET allocationmethod = 'against_document'
        WHERE id = $1
        `,
        [bankTransaction.id]
      );
    }

    const description = `E-commerce receipt allocated to invoice ${invoice.invoicenumber}`;
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
      VALUES ($1, $2, $3, $4, 'posted', $5, $6, $6, $7, $7)
      RETURNING *
      `,
      [
        ORGANIZATION_ID,
        bankTransaction.transactiondate,
        ECOMMERCE_ALLOCATION_JOURNAL_SOURCE,
        allocation.id,
        description,
        SYSTEM_ACTOR,
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
        ($1, $6, 'customer', $3, 0, $4, $5)
      `,
      [
        journalEntry.id,
        customerAdvanceAccountId,
        invoice.customerid,
        allocationAmount,
        description,
        accountsReceivableId,
      ]
    );
    await client.query(
      `UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`,
      [journalNumber, journalEntry.id]
    );

    const paymentData = parseJsonArray(invoice.paymentdata);
    const matchingPaymentIndex = paymentData.findIndex((payment) =>
      isMatchingInvoicePayment(payment, bankTransaction)
    );
    const financePayment = {
      paymentamount: allocationAmount,
      paymentmethod: "online",
      paymentdate: Number(bankTransaction.posteddate || epoch),
      transactionreference:
        bankTransaction.sourcepaymentid || bankTransaction.transactionnumber,
      providerpaymentid: bankTransaction.sourcepaymentid || null,
      transactionid: null,
      merchanttransactionid: merchantTransactionId,
      source: "finance_ecommerce_receipt",
      status: "success",
      comments: null,
      banktransactionid: Number(bankTransaction.id),
      allocationid: Number(allocation.id),
    };
    const nextPaymentData = [...paymentData];
    if (matchingPaymentIndex >= 0) {
      nextPaymentData[matchingPaymentIndex] = {
        ...nextPaymentData[matchingPaymentIndex],
        banktransactionid: Number(bankTransaction.id),
        allocationid: Number(allocation.id),
        merchanttransactionid: merchantTransactionId,
      };
    } else {
      nextPaymentData.push({
        id: paymentData.length + 1,
        ...financePayment,
      });
    }
    const paidAmount = toMoney(
      Math.min(
        invoiceAmount,
        nextPaymentData.reduce(
          (total, payment) =>
            String(payment?.status || "success").toLowerCase() === "failed"
              ? total
              : total + toInvoiceNumber(payment?.paymentamount),
          0
        )
      )
    );
    const balanceAmount = toMoney(Math.max(invoiceAmount - paidAmount, 0));
    const paymentStatus =
      balanceAmount === 0
        ? "paid"
        : paidAmount > 0
          ? "partially_paid"
          : "pending";
    const lastPaymentDate = nextPaymentData.reduce(
      (latest, payment) =>
        Math.max(latest, toInvoiceNumber(payment?.paymentdate)),
      0
    );
    await client.query(
      `
      UPDATE revoinvoice
      SET paymentdata = $1::jsonb,
          paidamount = $2,
          balanceamount = $3,
          paymentstatus = $4,
          lastpaymentdate = $5,
          modifieddate = $6
      WHERE id = $7
      `,
      [
        JSON.stringify(nextPaymentData),
        paidAmount,
        balanceAmount,
        paymentStatus,
        lastPaymentDate || epoch,
        epoch,
        invoiceId,
      ]
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
        $1, 'bank_transaction', $2, 'ecommerce_invoice_allocated',
        $3, $4::jsonb, $5
      )
      `,
      [
        ORGANIZATION_ID,
        bankTransaction.id,
        SYSTEM_ACTOR,
        JSON.stringify({
          invoiceid: invoiceId,
          invoicenumber: invoice.invoicenumber,
          allocationid: Number(allocation.id),
          allocationamount: allocationAmount,
          remainingunappliedamount: remainingAmount,
          journalentryid: Number(journalEntry.id),
        }),
        epoch,
      ]
    );

    await client.query("COMMIT");
    return {
      status: "linked",
      invoiceId,
      bankTransactionId: Number(bankTransaction.id),
      allocationId: Number(allocation.id),
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    return {
      status: "failed",
      invoiceId,
      reason: String(error?.code || error?.message || "INVOICE_LINK_FAILED"),
    };
  } finally {
    client.release();
  }
};

const linkExistingInvoicesForPayment = async (
  merchantTransactionId: string
) => {
  const invoiceResult = await query(
    `
    SELECT DISTINCT r.id
    FROM revoinvoice r
    WHERE LOWER(COALESCE(r.invoicefor, '')) = 'product'
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT o.merchanttransactionid, o.ordername, o.invoicefor
          FROM orders o
          WHERE o.orderid = r.orderid
          UNION ALL
          SELECT ol.merchanttransactionid, ol.ordername, ol.invoicefor
          FROM orderline ol
          WHERE ol.uniqueorderid = r.orderid
        ) source_order
        WHERE source_order.merchanttransactionid = $1
          AND LOWER(COALESCE(source_order.ordername, '')) = 'online'
          AND LOWER(COALESCE(source_order.invoicefor, '')) = 'product'
      )
    ORDER BY r.id
    `,
    [merchantTransactionId]
  );

  const results: EcommerceInvoiceLinkResult[] = [];
  for (const row of invoiceResult.rows) {
    results.push(await linkInvoiceToPostedReceipt(Number(row.id)));
  }
  return results;
};

const processEvent = async (eventId: number): Promise<FinanceEventResult> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const eventResult = await client.query(
      `
      SELECT *
      FROM ecommerce_payment_finance_events
      WHERE id = $1
      FOR UPDATE
      `,
      [eventId]
    );
    const event = eventResult.rows[0];
    if (!event) {
      throw new FinanceValidationError(
        "E-commerce finance event was not found.",
        404,
        "ECOMMERCE_FINANCE_EVENT_NOT_FOUND"
      );
    }
    if (event.status === "posted") {
      await client.query("COMMIT");
      return {
        status: "posted",
        eventId,
        bankTransactionId: Number(event.banktransactionid),
      };
    }

    const existingTransactionResult = await client.query(
      `
      SELECT id
      FROM bank_transactions
      WHERE organizationid = $1
        AND sourcetype = 'ecommerce_order'
        AND sourcepaymentid = $2
        AND postingstatus <> 'reversed'
      LIMIT 1
      `,
      [event.organizationid, event.sourcepaymentid]
    );
    if (existingTransactionResult.rows[0]) {
      const bankTransactionId = Number(existingTransactionResult.rows[0].id);
      await client.query(
        `
        UPDATE ecommerce_payment_finance_events
        SET status = 'posted',
            banktransactionid = $1,
            failurecode = NULL,
            failuremessage = NULL,
            modifiedby = $2,
            modifieddate = $3,
            processeddate = $3
        WHERE id = $4
        `,
        [bankTransactionId, SYSTEM_ACTOR, nowEpoch(), eventId]
      );
      await client.query("COMMIT");
      return { status: "posted", eventId, bankTransactionId };
    }

    const defaultAccountResult = await client.query(
      `
      SELECT id AS bankcashaccountid
      FROM bank_cash_accounts
      WHERE organizationid = $1
        AND isecommercedefault = TRUE
        AND accounttype = 'bank'
        AND status = 'active'
      LIMIT 1
      `,
      [event.organizationid]
    );
    const destination = defaultAccountResult.rows[0];
    if (!destination) {
      await client.query(
        `
        UPDATE ecommerce_payment_finance_events
        SET status = 'pending',
            attemptcount = attemptcount + 1,
            failurecode = 'ECOMMERCE_DEFAULT_BANK_ACCOUNT_MISSING',
            failuremessage = $1,
            modifiedby = $2,
            modifieddate = $3
        WHERE id = $4
        `,
        [
          `No active e-commerce default Bank account exists for ${event.paymentdate}.`,
          SYSTEM_ACTOR,
          nowEpoch(),
          eventId,
        ]
      );
      await client.query("COMMIT");
      return {
        status: "pending",
        eventId,
        reason: "ECOMMERCE_DEFAULT_BANK_ACCOUNT_MISSING",
      };
    }

    const bankCashAccountId = Number(destination.bankcashaccountid);
    const accountResult = await client.query(
      `
      SELECT *
      FROM bank_cash_accounts
      WHERE id = $1
        AND organizationid = $2
        AND accounttype = 'bank'
        AND isecommercedefault = TRUE
        AND status = 'active'
      FOR UPDATE
      `,
      [bankCashAccountId, event.organizationid]
    );
    const bankCashAccount = accountResult.rows[0];
    if (!bankCashAccount) {
      throw new FinanceValidationError(
        "The e-commerce default Bank account is unavailable.",
        409,
        "ECOMMERCE_DEFAULT_BANK_ACCOUNT_UNAVAILABLE"
      );
    }

    const customerAdvanceResult = await client.query(
      `
      SELECT id
      FROM finance_accounts
      WHERE organizationid = $1
        AND accountcode = 'SYS-CUSTOMER-ADVANCE'
        AND status = 'active'
      LIMIT 1
      `,
      [event.organizationid]
    );
    const customerAdvanceAccountId = Number(
      customerAdvanceResult.rows[0]?.id
    );
    if (!Number.isSafeInteger(customerAdvanceAccountId)) {
      throw new FinanceValidationError(
        "Customer Advances system ledger is unavailable.",
        409,
        "CUSTOMER_ADVANCE_LEDGER_MISSING"
      );
    }

    const latestTransactionResult = await client.query(
      `
      SELECT transactiondate
      FROM bank_transactions
      WHERE bankcashaccountid = $1
        AND postingstatus = 'posted'
      ORDER BY transactiondate DESC, posteddate DESC, id DESC
      LIMIT 1
      `,
      [bankCashAccountId]
    );
    const latestTransactionDate = toFinanceDateOnly(
      latestTransactionResult.rows[0]?.transactiondate
    );
    const eventPaymentDate = toFinanceDateOnly(event.paymentdate);
    if (
      latestTransactionDate &&
      eventPaymentDate &&
      eventPaymentDate < latestTransactionDate
    ) {
      throw new FinanceValidationError(
        "The payment predates the latest posted Bank/Cash transaction. Backdated automatic posting is not enabled.",
        409,
        "BACKDATED_FINANCE_POSTING_NOT_SUPPORTED"
      );
    }

    const amount = requirePositiveMoney(event.amount);
    const balanceAfter = calculateAvailableBalance(
      bankCashAccount.currentbalance,
      "debit",
      amount
    );
    const epoch = nowEpoch();
    const remarks = `E-commerce payment received for order ${event.primaryorderid}`;

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
        merchanttransactionid,
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
        $7, $7, 0, $8, 'advance', 'ecommerce_order',
        $9, $10, $11, $12, 'posted', 'system',
        $13, $13, $14, $14
      )
      RETURNING *
      `,
      [
        event.organizationid,
        bankCashAccountId,
        event.paymentdate,
        event.customerid,
        event.customername,
        customerAdvanceAccountId,
        amount,
        balanceAfter,
        event.primaryorderid,
        event.sourcepaymentid,
        event.merchanttransactionid,
        remarks,
        SYSTEM_ACTOR,
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
        event.organizationid,
        event.paymentdate,
        bankTransaction.id,
        remarks,
        SYSTEM_ACTOR,
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
        ($1, $6, 'customer', $3, 0, $4, $5)
      `,
      [
        journalEntry.id,
        bankCashAccount.financeaccountid,
        event.customerid,
        amount,
        remarks,
        customerAdvanceAccountId,
      ]
    );

    await client.query(
      `
      INSERT INTO party_unapplied_amounts (
        banktransactionid,
        partytype,
        partyid,
        originalamount,
        appliedamount,
        remainingamount,
        unappliedtype,
        status,
        createdby,
        modifiedby,
        createddate,
        modifieddate
      )
      VALUES (
        $1, 'customer', $2, $3, 0, $3, 'advance', 'open',
        $4, $4, $5, $5
      )
      `,
      [bankTransaction.id, event.customerid, amount, SYSTEM_ACTOR, epoch]
    );

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
      [balanceAfter, SYSTEM_ACTOR, epoch, bankCashAccountId]
    );
    await client.query(
      `
      UPDATE ecommerce_payment_finance_events
      SET status = 'posted',
          attemptcount = attemptcount + 1,
          failurecode = NULL,
          failuremessage = NULL,
          banktransactionid = $1,
          modifiedby = $2,
          modifieddate = $3,
          processeddate = $3
      WHERE id = $4
      `,
      [bankTransaction.id, SYSTEM_ACTOR, epoch, eventId]
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
        $1, 'bank_transaction', $2, 'ecommerce_payment_posted',
        $3, $4::jsonb, $5
      )
      `,
      [
        event.organizationid,
        bankTransaction.id,
        SYSTEM_ACTOR,
        JSON.stringify({
          transactionnumber: transactionNumber,
          provider: event.provider,
          sourcepaymentid: event.sourcepaymentid,
          merchanttransactionid: event.merchanttransactionid,
          primaryorderid: event.primaryorderid,
          entryside: "debit",
          amount: toMoney(amount),
          previousbalance: toMoney(bankCashAccount.currentbalance),
          balanceafter: balanceAfter,
          allocationmethod: "advance",
          journalentryid: journalEntry.id,
        }),
        epoch,
      ]
    );

    await client.query("COMMIT");
    return {
      status: "posted",
      eventId,
      bankTransactionId: Number(bankTransaction.id),
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    const code = String(error?.code || "ECOMMERCE_FINANCE_POSTING_FAILED");
    const message = String(
      error?.message || "Unable to post the e-commerce payment."
    );
    await markEventFailure(eventId, "failed", code, message);
    return { status: "failed", eventId, reason: code };
  } finally {
    client.release();
  }
};

export module ecommercePaymentFinanceService {
  export const recordSuccessfulPayment = async (
    transactionRow: any
  ): Promise<FinanceEventResult> => {
    const merchantTransactionId = String(
      transactionRow?.merchanttransactionid || ""
    ).trim();
    if (!merchantTransactionId) {
      return { status: "ignored", reason: "MERCHANT_TRANSACTION_ID_MISSING" };
    }

    const orderContext = await getEligibleOrderContext(merchantTransactionId);
    if (!orderContext) {
      return { status: "ignored", reason: "ORDER_NOT_ELIGIBLE" };
    }

    const amount = requirePositiveMoney(transactionRow?.amount);
    const provider = resolveEcommercePaymentProvider(transactionRow);
    const sourcePaymentId = resolveEcommercePaymentReference(transactionRow);
    if (!sourcePaymentId) {
      return { status: "ignored", reason: "PAYMENT_REFERENCE_MISSING" };
    }

    const paymentMethod = resolveEcommercePaymentMethod(
      transactionRow,
      orderContext.orderRows
    );
    const paymentDate = resolveEcommercePaymentDate(transactionRow);
    const customerName = buildEcommerceCustomerName(
      orderContext.user,
      transactionRow
    );
    const epoch = nowEpoch();

    const eventResult = await query(
      `
      INSERT INTO ecommerce_payment_finance_events (
        organizationid,
        provider,
        paymentmethod,
        sourcepaymentid,
        providerorderid,
        merchanttransactionid,
        paymenttransactionid,
        primaryorderid,
        customerid,
        customername,
        amount,
        currencycode,
        paymentdate,
        status,
        createdby,
        modifiedby,
        createddate,
        modifieddate
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, 'INR', $12, 'pending', $13, $13, $14, $14
      )
      ON CONFLICT (organizationid, provider, sourcepaymentid)
      DO NOTHING
      RETURNING id, status, banktransactionid
      `,
      [
        ORGANIZATION_ID,
        provider,
        paymentMethod,
        sourcePaymentId,
        transactionRow?.razorpay_order_id || null,
        merchantTransactionId,
        transactionRow?.transactionid || null,
        orderContext.primaryOrderId,
        orderContext.customerId,
        customerName,
        amount,
        paymentDate,
        SYSTEM_ACTOR,
        epoch,
      ]
    );

    const event =
      eventResult.rows[0] ||
      (
        await query(
          `
          SELECT id, status, banktransactionid
          FROM ecommerce_payment_finance_events
          WHERE organizationid = $1
            AND provider = $2
            AND sourcepaymentid = $3
          LIMIT 1
          `,
          [ORGANIZATION_ID, provider, sourcePaymentId]
        )
      ).rows[0];
    if (!event) {
      throw new FinanceValidationError(
        "Unable to resolve the e-commerce finance event.",
        500,
        "ECOMMERCE_FINANCE_EVENT_RESOLUTION_FAILED"
      );
    }

    const financeResult = await processEvent(Number(event.id));
    if (financeResult.status === "posted") {
      await linkExistingInvoicesForPayment(merchantTransactionId);
    }
    return financeResult;
  };

  export const linkInvoice = async (invoiceId: number) => {
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      return {
        status: "ignored",
        invoiceId,
        reason: "INVALID_INVOICE_ID",
      } as EcommerceInvoiceLinkResult;
    }
    return linkInvoiceToPostedReceipt(invoiceId);
  };

  export const safelyLinkInvoice = async (invoiceId: number) => {
    try {
      const result = await linkInvoice(invoiceId);
      if (result.status === "failed") {
        console.warn(
          "[EcommerceFinance] Invoice allocation was not completed.",
          result
        );
      }
      return result;
    } catch (error: any) {
      console.error(
        "[EcommerceFinance] Unable to link invoice to posted receipt:",
        error?.message || error
      );
      return {
        status: "failed",
        invoiceId,
        reason: error?.code || "ECOMMERCE_INVOICE_LINK_FAILED",
      } as EcommerceInvoiceLinkResult;
    }
  };

  export const safelyRecordSuccessfulPayment = async (transactionRow: any) => {
    try {
      const result = await recordSuccessfulPayment(transactionRow);
      if (result.status === "pending" || result.status === "failed") {
        console.warn("[EcommerceFinance] Payment was not posted.", result);
      }
      return result;
    } catch (error: any) {
      console.error(
        "[EcommerceFinance] Unable to capture successful payment:",
        error?.message || error
      );
      return {
        status: "failed",
        reason: error?.code || "ECOMMERCE_FINANCE_CAPTURE_FAILED",
      } as FinanceEventResult;
    }
  };

  export const processPendingPayments = async (limit = 100) => {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const result = await query(
      `
      SELECT id, merchanttransactionid
      FROM ecommerce_payment_finance_events event
      WHERE event.organizationid = $1
        AND (
          event.status IN ('pending', 'failed')
          OR (
            event.status = 'posted'
            AND EXISTS (
              SELECT 1
              FROM bank_transactions transaction
              JOIN party_unapplied_amounts unapplied
                ON unapplied.banktransactionid = transaction.id
               AND unapplied.status = 'open'
               AND unapplied.remainingamount > 0
              WHERE transaction.id = event.banktransactionid
                AND transaction.postingstatus = 'posted'
            )
            AND EXISTS (
              SELECT 1
              FROM revoinvoice invoice
              WHERE LOWER(COALESCE(invoice.invoicefor, '')) = 'product'
                AND EXISTS (
                  SELECT 1
                  FROM (
                    SELECT orders.merchanttransactionid
                    FROM orders
                    WHERE orders.orderid = invoice.orderid
                    UNION ALL
                    SELECT orderline.merchanttransactionid
                    FROM orderline
                    WHERE orderline.uniqueorderid = invoice.orderid
                  ) invoice_order
                  WHERE invoice_order.merchanttransactionid = event.merchanttransactionid
                )
            )
          )
        )
      ORDER BY paymentdate ASC, id ASC
      LIMIT $2
      `,
      [ORGANIZATION_ID, normalizedLimit]
    );

    const processed: FinanceEventResult[] = [];
    for (const row of result.rows) {
      const financeResult = await processEvent(Number(row.id));
      processed.push(financeResult);
      if (financeResult.status === "posted" && row.merchanttransactionid) {
        await linkExistingInvoicesForPayment(String(row.merchanttransactionid));
      }
    }
    return processed;
  };
}
