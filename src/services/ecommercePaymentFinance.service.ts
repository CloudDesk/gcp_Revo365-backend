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

const ORGANIZATION_ID = 1;
const SYSTEM_ACTOR = "system:ecommerce_payment";

type FinanceEventResult = {
  status: "ignored" | "pending" | "posted" | "failed";
  eventId?: number;
  bankTransactionId?: number;
  reason?: string;
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

    return processEvent(Number(event.id));
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
      SELECT id
      FROM ecommerce_payment_finance_events
      WHERE organizationid = $1
        AND status IN ('pending', 'failed')
      ORDER BY paymentdate ASC, id ASC
      LIMIT $2
      `,
      [ORGANIZATION_ID, normalizedLimit]
    );

    const processed: FinanceEventResult[] = [];
    for (const row of result.rows) {
      processed.push(await processEvent(Number(row.id)));
    }
    return processed;
  };
}
