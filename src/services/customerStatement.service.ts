import { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  requireIsoDate,
  resolveFinanceContext,
  toMoney,
} from "../utils/finance/finance.utils.js";
import {
  getRetailInvoicePaymentState,
} from "../utils/finance/retailReceipt.utils.js";
import {
  buildCustomerStatement,
  CustomerStatementRow,
  toCustomerStatementDate,
} from "../utils/finance/customerStatement.utils.js";

const requirePositiveInteger = (value: unknown, fieldName: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FinanceValidationError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
};

const normalizePageValue = (
  value: unknown,
  fallback: number,
  maximum: number
) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};

const customerName = (row: any) =>
  [row?.firstname, row?.lastname]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ") ||
  String(row?.useremail || "").trim() ||
  `Customer ${row?.id}`;

const isActiveInvoice = (invoice: any) => {
  const status = String(
    invoice?.invoicestatus || invoice?.status || ""
  ).trim().toLowerCase();
  return !["cancelled", "canceled", "void"].includes(status);
};

const sourceLabel = (value: unknown) => {
  const source = String(value || "invoice").trim().toLowerCase();
  if (source === "product") return "Product Invoice";
  if (source === "rental") return "Rental Invoice";
  if (source === "service") return "Service Invoice";
  if (source === "penalty") return "Penalty Invoice";
  return "Sales Invoice";
};

const paymentSourceLabel = (value: unknown) => {
  const source = String(value || "customer_receipt").trim().toLowerCase();
  if (source.includes("rental")) return "Rental receipt";
  if (source.includes("service")) return "Service receipt";
  if (source.includes("retail")) return "Retail receipt";
  if (source.includes("ecommerce")) return "E-commerce receipt";
  return "Customer receipt";
};

export module customerStatementService {
  export const listCustomers = async (request: any) => {
    const page = normalizePageValue(request.query?.page, 1, 1_000_000);
    const count = normalizePageValue(request.query?.count, 10, 100);
    const search = String(request.query?.search || "").trim();
    const searchPattern = `%${search}%`;
    const offset = (page - 1) * count;

    const [customerResult, countResult] = await Promise.all([
      query(
        `
        SELECT
          u.id,
          u.firstname,
          u.lastname,
          u.useremail,
          u.usermobilenumber,
          u.isbusinessuser,
          u.gstnumber,
          u.modifieddate
        FROM users u
        WHERE (
          $1 = ''
          OR u.firstname ILIKE $2
          OR u.lastname ILIKE $2
          OR CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.lastname, '')) ILIKE $2
          OR u.useremail ILIKE $2
          OR u.usermobilenumber::text ILIKE $2
          OR u.gstnumber ILIKE $2
        )
        ORDER BY
          COALESCE(u.isbusinessuser, FALSE) DESC,
          u.modifieddate DESC NULLS LAST,
          u.id DESC
        OFFSET $3 LIMIT $4
        `,
        [search, searchPattern, offset, count]
      ),
      query(
        `
        SELECT COUNT(*)::int AS total
        FROM users u
        WHERE (
          $1 = ''
          OR u.firstname ILIKE $2
          OR u.lastname ILIKE $2
          OR CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.lastname, '')) ILIKE $2
          OR u.useremail ILIKE $2
          OR u.usermobilenumber::text ILIKE $2
          OR u.gstnumber ILIKE $2
        )
        `,
        [search, searchPattern]
      ),
    ]);

    const customerIds = customerResult.rows.map((row: any) => Number(row.id));
    const invoiceResult = customerIds.length
      ? await query(
          `
          SELECT *
          FROM revoinvoice
          WHERE customerid = ANY($1::int[])
          ORDER BY customerid, id
          `,
          [customerIds]
        )
      : { rows: [] };

    const summaryByCustomer = new Map<number, {
      invoicecount: number;
      invoiceamount: number;
      paidamount: number;
      balanceamount: number;
    }>();
    invoiceResult.rows.filter(isActiveInvoice).forEach((invoice: any) => {
      const invoiceCustomerId = Number(invoice.customerid);
      const paymentState = getRetailInvoicePaymentState(invoice);
      const summary = summaryByCustomer.get(invoiceCustomerId) || {
        invoicecount: 0,
        invoiceamount: 0,
        paidamount: 0,
        balanceamount: 0,
      };
      summary.invoicecount += 1;
      summary.invoiceamount = toMoney(
        summary.invoiceamount + paymentState.invoiceAmount
      );
      summary.paidamount = toMoney(
        summary.paidamount + paymentState.paidAmount
      );
      summary.balanceamount = toMoney(
        summary.balanceamount + paymentState.outstandingAmount
      );
      summaryByCustomer.set(invoiceCustomerId, summary);
    });

    const records = customerResult.rows.map((customer: any) => {
      const summary = summaryByCustomer.get(Number(customer.id)) || {
        invoicecount: 0,
        invoiceamount: 0,
        paidamount: 0,
        balanceamount: 0,
      };
      const paymentstatus =
        summary.invoicecount === 0
          ? "no_invoices"
          : summary.invoiceamount > 0 && summary.balanceamount === 0
            ? "paid"
            : summary.paidamount > 0
              ? "partially_paid"
              : "pending";
      return {
        id: Number(customer.id),
        customername: customerName(customer),
        email: customer.useremail || null,
        mobilenumber: customer.usermobilenumber || null,
        isbusinessuser: Boolean(customer.isbusinessuser),
        gstnumber: customer.gstnumber || null,
        ...summary,
        paymentstatus,
      };
    });

    return {
      records,
      total: Number(countResult.rows[0]?.total || 0),
      page,
      count,
    };
  };

  export const getCustomerStatement = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const customerId = requirePositiveInteger(
      request.params?.customerId,
      "customerId"
    );
    const page = normalizePageValue(request.query?.page, 1, 1_000_000);
    const count = normalizePageValue(request.query?.count, 10, 100);
    const fromDate = request.query?.fromdate
      ? requireIsoDate(request.query.fromdate, "fromdate")
      : null;
    const toDate = request.query?.todate
      ? requireIsoDate(request.query.todate, "todate")
      : null;
    if (fromDate && toDate && fromDate > toDate) {
      throw new FinanceValidationError(
        "From Date cannot be later than To Date."
      );
    }

    const customerResult = await query(
      `
      SELECT
        id,
        firstname,
        lastname,
        useremail,
        usermobilenumber,
        isbusinessuser,
        gstnumber
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [customerId]
    );
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new FinanceValidationError(
        "Customer not found.",
        404,
        "FINANCE_CUSTOMER_NOT_FOUND"
      );
    }

    const [invoiceResult, paymentResult, addressResult] = await Promise.all([
      query(
        `
        SELECT *
        FROM revoinvoice
        WHERE customerid = $1
        ORDER BY invoicedate, id
        `,
        [customerId]
      ),
      query(
        `
        SELECT
          t.id,
          t.transactionnumber,
          t.transactiondate,
          t.amount,
          t.allocationmethod,
          t.sourcetype,
          t.remarks,
          t.postingstatus,
          b.accountname AS bankcashaccountname,
          b.bankname,
          COALESCE(allocation.allocationamount, 0) AS allocationamount,
          COALESCE(allocation.tdsamount, 0) AS tdsamount,
          COALESCE(allocation.totalsettledamount, 0) AS totalsettledamount,
          COALESCE(unapplied.remainingamount, 0) AS unappliedamount
        FROM bank_transactions t
        JOIN bank_cash_accounts b
          ON b.id = t.bankcashaccountid
         AND b.organizationid = t.organizationid
        LEFT JOIN LATERAL (
          SELECT
            SUM(a.allocationamount) AS allocationamount,
            SUM(a.tdsamount) AS tdsamount,
            SUM(a.totalsettledamount) AS totalsettledamount
          FROM bank_transaction_allocations a
          WHERE a.banktransactionid = t.id
            AND a.documenttype = 'sales_invoice'
            AND a.status = 'applied'
        ) allocation ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(u.remainingamount) AS remainingamount
          FROM party_unapplied_amounts u
          WHERE u.banktransactionid = t.id
            AND u.partytype = 'customer'
            AND u.partyid = $2
            AND u.status = 'open'
        ) unapplied ON TRUE
        WHERE t.organizationid = $1
          AND t.partytype = 'customer'
          AND t.partyid = $2
          AND t.postingstatus = 'posted'
        ORDER BY t.transactiondate, t.posteddate, t.id
        `,
        [organizationId, customerId]
      ),
      query(
        `
        SELECT
          id,
          name,
          mobilenumber,
          pincode,
          address,
          landmark,
          state,
          city,
          email,
          doornumber
        FROM address
        WHERE userid = $1
        ORDER BY modifieddate DESC NULLS LAST, id DESC
        `,
        [customerId]
      ),
    ]);

    const activeInvoices = invoiceResult.rows.filter(isActiveInvoice);
    const invoiceSummary = activeInvoices.reduce(
      (summary: any, invoice: any) => {
        const paymentState = getRetailInvoicePaymentState(invoice);
        summary.invoicecount += 1;
        summary.invoiceamount += paymentState.invoiceAmount;
        summary.paidamount += paymentState.paidAmount;
        summary.currentreceivable += paymentState.outstandingAmount;
        return summary;
      },
      { invoicecount: 0, invoiceamount: 0, paidamount: 0, currentreceivable: 0 }
    );
    Object.keys(invoiceSummary).forEach((key) => {
      invoiceSummary[key] = key === "invoicecount"
        ? Number(invoiceSummary[key])
        : toMoney(invoiceSummary[key], key);
    });
    const paymentStatus =
      invoiceSummary.invoicecount === 0
        ? "no_invoices"
        : invoiceSummary.invoiceamount > 0 && invoiceSummary.currentreceivable === 0
          ? "paid"
          : invoiceSummary.paidamount > 0
            ? "partially_paid"
            : "pending";

    const invoiceRows = activeInvoices.flatMap((invoice: any) => {
      const transactionDate = toCustomerStatementDate(
        invoice.invoicedate || invoice.createddate
      );
      if (!transactionDate) return [];
      const paymentState = getRetailInvoicePaymentState(invoice);
      return [{
        id: `invoice-${invoice.id}`,
        sourceid: Number(invoice.id),
        transactiontype: "invoice" as const,
        transactiondate: transactionDate,
        reference: String(invoice.invoicenumber || `INV-${invoice.id}`),
        description: sourceLabel(invoice.invoicefor),
        invoiceamount: paymentState.invoiceAmount,
        paymentamount: 0,
        settledamount: 0,
        tdsamount: 0,
        unappliedamount: 0,
        status: String(invoice.paymentstatus || "pending"),
        source: String(invoice.invoicefor || "invoice"),
        bankcashaccountname: null,
        bankname: null,
      }];
    });

    const paymentRows = paymentResult.rows.flatMap((payment: any) => {
      const transactionDate = toCustomerStatementDate(payment.transactiondate);
      if (!transactionDate) return [];
      return [{
        id: `payment-${payment.id}`,
        sourceid: Number(payment.id),
        transactiontype: "customer_payment" as const,
        transactiondate: transactionDate,
        reference: String(payment.transactionnumber || `BT-${payment.id}`),
        description:
          String(payment.remarks || "").trim() ||
          paymentSourceLabel(payment.sourcetype),
        invoiceamount: 0,
        paymentamount: toMoney(payment.amount),
        settledamount: toMoney(payment.totalsettledamount),
        tdsamount: toMoney(payment.tdsamount),
        unappliedamount: toMoney(payment.unappliedamount),
        status: String(payment.postingstatus || "posted"),
        source: String(payment.sourcetype || "customer_receipt"),
        bankcashaccountname: payment.bankcashaccountname || null,
        bankname: payment.bankname || null,
      }];
    });

    const statement = buildCustomerStatement(
      [...invoiceRows, ...paymentRows],
      { fromdate: fromDate, todate: toDate }
    );
    const offset = (page - 1) * count;
    const records = statement.records.slice(offset, offset + count);

    return {
      customer: {
        id: Number(customer.id),
        name: customerName(customer),
        email: customer.useremail || null,
        mobilenumber: customer.usermobilenumber || null,
        isbusinessuser: Boolean(customer.isbusinessuser),
        gstnumber: customer.gstnumber || null,
        addresses: addressResult.rows,
        invoicecount: invoiceSummary.invoicecount,
        invoiceamount: invoiceSummary.invoiceamount,
        paidamount: invoiceSummary.paidamount,
        balanceamount: invoiceSummary.currentreceivable,
        paymentstatus: paymentStatus,
      },
      records: records as CustomerStatementRow[],
      total: statement.records.length,
      page,
      count,
      summary: {
        ...statement.summary,
        invoicecount: invoiceRows.length,
        paymentcount: paymentRows.length,
        currentreceivable: invoiceSummary.currentreceivable,
      },
    };
  };
}
