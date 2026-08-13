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
  const status = String(invoice?.paymentstatus || "pending")
    .trim()
    .toLowerCase();
  return ["pending", "partially_paid", "paid"].includes(status);
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

const CUSTOMER_ESTIMATE_STATUSES = new Set([
  "draft",
  "sent",
  "revised",
  "accepted",
  "rejected",
  "expired",
  "converted",
]);

const CUSTOMER_ESTIMATE_TYPES = new Set(["sale", "rental"]);
const CUSTOMER_STATEMENT_TYPES = new Set(["invoice", "customer_payment"]);

const requireCustomer = async (customerId: number) => {
  const customerResult = await query(
    `SELECT id FROM users WHERE id = $1 LIMIT 1`,
    [customerId]
  );
  if (!customerResult.rows[0]) {
    throw new FinanceValidationError(
      "Customer not found.",
      404,
      "FINANCE_CUSTOMER_NOT_FOUND"
    );
  }
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
    const summaryOnly = String(request.query?.summaryonly || "") === "true";
    const transactionType = String(request.query?.type || "")
      .trim()
      .toLowerCase();
    if (transactionType && !CUSTOMER_STATEMENT_TYPES.has(transactionType)) {
      throw new FinanceValidationError(
        "Statement type must be invoice or customer_payment."
      );
    }
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
      summaryOnly
        ? query(
            `
            SELECT COUNT(*)::int AS total
            FROM bank_transactions t
            WHERE t.organizationid = $1
              AND t.partytype = 'customer'
              AND t.partyid = $2
              AND t.postingstatus = 'posted'
            `,
            [organizationId, customerId]
          )
        : query(
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
          COALESCE(allocation.documentnumbers, ARRAY[]::varchar[]) AS documentnumbers,
          COALESCE(unapplied.remainingamount, 0) AS unappliedamount
        FROM bank_transactions t
        JOIN bank_cash_accounts b
          ON b.id = t.bankcashaccountid
         AND b.organizationid = t.organizationid
        LEFT JOIN LATERAL (
          SELECT
            SUM(a.allocationamount) AS allocationamount,
            SUM(a.tdsamount) AS tdsamount,
            SUM(a.totalsettledamount) AS totalsettledamount,
            array_agg(DISTINCT a.documentnumber ORDER BY a.documentnumber)
              FILTER (
                WHERE a.documentnumber IS NOT NULL
                  AND TRIM(a.documentnumber) <> ''
              ) AS documentnumbers
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
        if (paymentState.outstandingAmount > 0) {
          summary.outstandinginvoicecount += 1;
        }
        summary.invoiceamount += paymentState.invoiceAmount;
        summary.paidamount += paymentState.paidAmount;
        summary.currentreceivable += paymentState.outstandingAmount;
        return summary;
      },
      {
        invoicecount: 0,
        outstandinginvoicecount: 0,
        invoiceamount: 0,
        paidamount: 0,
        currentreceivable: 0,
      }
    );
    Object.keys(invoiceSummary).forEach((key) => {
      invoiceSummary[key] = key.endsWith("count")
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

    if (summaryOnly) {
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
          outstandinginvoicecount: invoiceSummary.outstandinginvoicecount,
          invoiceamount: invoiceSummary.invoiceamount,
          paidamount: invoiceSummary.paidamount,
          balanceamount: invoiceSummary.currentreceivable,
          paymentstatus: paymentStatus,
        },
        records: [] as CustomerStatementRow[],
        total: 0,
        page,
        count,
        summary: {
          openingreceivable: 0,
          invoiceamount: 0,
          paymentamount: 0,
          settledamount: 0,
          tdsreceivable: 0,
          unappliedamount: 0,
          closingreceivable: invoiceSummary.currentreceivable,
          invoicecount: invoiceSummary.invoicecount,
          paymentcount: Number(paymentResult.rows[0]?.total || 0),
          currentreceivable: invoiceSummary.currentreceivable,
        },
      };
    }

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
        allocatedamount: toMoney(payment.allocationamount),
        settledamount: toMoney(payment.totalsettledamount),
        tdsamount: toMoney(payment.tdsamount),
        unappliedamount: toMoney(payment.unappliedamount),
        status: String(payment.postingstatus || "posted"),
        source: String(payment.sourcetype || "customer_receipt"),
        allocationmethod: String(payment.allocationmethod || "invoice_allocation"),
        bankcashaccountname: payment.bankcashaccountname || null,
        bankname: payment.bankname || null,
        documentnumbers: Array.isArray(payment.documentnumbers)
          ? payment.documentnumbers.map(String)
          : [],
      }];
    });

    const statement = buildCustomerStatement(
      [...invoiceRows, ...paymentRows],
      { fromdate: fromDate, todate: toDate }
    );
    const filteredRecords = transactionType
      ? statement.records.filter(
          (record) => record.transactiontype === transactionType
        )
      : statement.records;
    const offset = (page - 1) * count;
    const records = filteredRecords.slice(offset, offset + count);

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
        outstandinginvoicecount: invoiceSummary.outstandinginvoicecount,
        invoiceamount: invoiceSummary.invoiceamount,
        paidamount: invoiceSummary.paidamount,
        balanceamount: invoiceSummary.currentreceivable,
        paymentstatus: paymentStatus,
      },
      records: records as CustomerStatementRow[],
      total: filteredRecords.length,
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

  export const listCustomerEstimates = async (request: any) => {
    // Resolve the finance context even though the legacy Store Quotation tables
    // are customer-scoped and do not currently carry an organization column.
    resolveFinanceContext(request);
    const customerId = requirePositiveInteger(
      request.params?.customerId,
      "customerId"
    );
    const page = normalizePageValue(request.query?.page, 1, 1_000_000);
    const count = normalizePageValue(request.query?.count, 10, 100);
    const status = String(request.query?.status || "").trim().toLowerCase();
    const estimateType = String(request.query?.type || "").trim().toLowerCase();

    if (status && !CUSTOMER_ESTIMATE_STATUSES.has(status)) {
      throw new FinanceValidationError("Invalid Estimate status filter.");
    }
    if (estimateType && !CUSTOMER_ESTIMATE_TYPES.has(estimateType)) {
      throw new FinanceValidationError("Estimate type must be sale or rental.");
    }

    await requireCustomer(customerId);

    const params: any[] = [customerId];
    const conditions = [
      "q.customerid = $1",
      "COALESCE(q.isdeleted, FALSE) = FALSE",
      "q.quotationtype IN ('sale', 'rental')",
    ];
    if (status) {
      params.push(status);
      conditions.push(`LOWER(q.status) = $${params.length}`);
    }
    if (estimateType) {
      params.push(estimateType);
      conditions.push(`LOWER(q.quotationtype) = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const offset = (page - 1) * count;
    const recordParams = [...params, offset, count];
    const [recordResult, countResult] = await Promise.all([
      query(
        `
        SELECT
          q.id,
          q.quotationnumber,
          q.quotationtype,
          q.status,
          q.convertedorderid,
          q.convertedinvoiceid,
          q.createddate,
          q.modifieddate,
          COALESCE(fv.id, lv.id) AS versionid,
          COALESCE(fv.versionnumber, lv.versionnumber) AS versionnumber,
          COALESCE(fv.totalamount, lv.totalamount, 0) AS totalamount
        FROM store_quotations q
        LEFT JOIN store_quotation_versions fv
          ON fv.id = q.finalversionid
        LEFT JOIN LATERAL (
          SELECT
            version.id,
            version.versionnumber,
            version.totalamount
          FROM store_quotation_versions version
          WHERE version.quotationid = q.id
          ORDER BY version.versionnumber DESC, version.id DESC
          LIMIT 1
        ) lv ON TRUE
        ${whereClause}
        ORDER BY q.createddate DESC, q.id DESC
        OFFSET $${params.length + 1} LIMIT $${params.length + 2}
        `,
        recordParams
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM store_quotations q ${whereClause}`,
        params
      ),
    ]);

    return {
      records: recordResult.rows.map((estimate: any) => ({
        id: Number(estimate.id),
        estimatenumber:
          estimate.quotationnumber || `SQ-${String(estimate.id).padStart(6, "0")}`,
        estimatetype: String(estimate.quotationtype || "sale"),
        estimatedate: toCustomerStatementDate(estimate.createddate),
        referencenumber: estimate.convertedorderid || null,
        convertedinvoiceid: estimate.convertedinvoiceid
          ? Number(estimate.convertedinvoiceid)
          : null,
        amount: toMoney(estimate.totalamount),
        status: String(estimate.status || "draft"),
        versionid: estimate.versionid ? Number(estimate.versionid) : null,
        versionnumber: estimate.versionnumber
          ? Number(estimate.versionnumber)
          : null,
      })),
      total: Number(countResult.rows[0]?.total || 0),
      page,
      count,
    };
  };

  export const listCustomerInvoices = async (request: any) => {
    resolveFinanceContext(request);
    const customerId = requirePositiveInteger(
      request.params?.customerId,
      "customerId"
    );
    const page = normalizePageValue(request.query?.page, 1, 1_000_000);
    const count = normalizePageValue(request.query?.count, 10, 100);
    await requireCustomer(customerId);

    const offset = (page - 1) * count;
    const [recordResult, countResult] = await Promise.all([
      query(
        `
        SELECT *
        FROM revoinvoice
        WHERE customerid = $1
        ORDER BY COALESCE(invoicedate, createddate) DESC, id DESC
        OFFSET $2 LIMIT $3
        `,
        [customerId, offset, count]
      ),
      query(
        `
        SELECT COUNT(*)::int AS total
        FROM revoinvoice
        WHERE customerid = $1
        `,
        [customerId]
      ),
    ]);

    return {
      records: recordResult.rows.map((invoice: any) => {
        const paymentState = getRetailInvoicePaymentState(invoice);
        const paymentstatus = paymentState.outstandingAmount === 0
          ? "paid"
          : paymentState.paidAmount > 0
            ? "partially_paid"
            : "pending";
        return {
          id: Number(invoice.id),
          invoicenumber: String(invoice.invoicenumber || `INV-${invoice.id}`),
          invoicedate: toCustomerStatementDate(
            invoice.invoicedate || invoice.createddate
          ),
          source: String(invoice.invoicefor || "invoice"),
          sourcelabel: sourceLabel(invoice.invoicefor),
          invoiceamount: paymentState.invoiceAmount,
          paidamount: paymentState.paidAmount,
          balanceamount: paymentState.outstandingAmount,
          paymentstatus,
        };
      }),
      total: Number(countResult.rows[0]?.total || 0),
      page,
      count,
    };
  };

  export const listCustomerPayments = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const customerId = requirePositiveInteger(
      request.params?.customerId,
      "customerId"
    );
    const page = normalizePageValue(request.query?.page, 1, 1_000_000);
    const count = normalizePageValue(request.query?.count, 10, 100);
    await requireCustomer(customerId);

    const offset = (page - 1) * count;
    const paymentWhere = `
      t.organizationid = $1
      AND t.partytype = 'customer'
      AND t.partyid = $2
      AND t.postingstatus = 'posted'
    `;
    const [recordResult, countResult] = await Promise.all([
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
        WHERE ${paymentWhere}
        ORDER BY t.transactiondate DESC, t.posteddate DESC, t.id DESC
        OFFSET $3 LIMIT $4
        `,
        [organizationId, customerId, offset, count]
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM bank_transactions t WHERE ${paymentWhere}`,
        [organizationId, customerId]
      ),
    ]);

    return {
      records: recordResult.rows.map((payment: any) => ({
        id: Number(payment.id),
        transactionnumber: String(
          payment.transactionnumber || `BT-${payment.id}`
        ),
        transactiondate: toCustomerStatementDate(payment.transactiondate),
        paymentamount: toMoney(payment.amount),
        allocatedamount: toMoney(payment.allocationamount),
        settledamount: toMoney(payment.totalsettledamount),
        tdsamount: toMoney(payment.tdsamount),
        unappliedamount: toMoney(payment.unappliedamount),
        allocationmethod: String(
          payment.allocationmethod || "invoice_allocation"
        ),
        source: String(payment.sourcetype || "customer_receipt"),
        description:
          String(payment.remarks || "").trim() ||
          paymentSourceLabel(payment.sourcetype),
        bankcashaccountname: payment.bankcashaccountname || null,
        bankname: payment.bankname || null,
        status: String(payment.postingstatus || "posted"),
      })),
      total: Number(countResult.rows[0]?.total || 0),
      page,
      count,
    };
  };
}
