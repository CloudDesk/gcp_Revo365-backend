import { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  requireIsoDate,
  resolveFinanceContext,
  toMoney,
} from "../utils/finance/finance.utils.js";
import { toCustomerStatementDate } from "../utils/finance/customerStatement.utils.js";
import { getSupplierBillPaymentState } from "../utils/finance/supplierBill.utils.js";
import {
  buildSupplierStatement,
  SupplierStatementRow,
} from "../utils/finance/supplierStatement.utils.js";
import { onAccountStatementService } from "./onAccountStatement.service.js";

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

const isNonCancelledBill = (bill: any) =>
  String(bill?.invoicestatus || "")
    .trim()
    .toLowerCase() !== "cancelled";

const SUPPLIER_STATEMENT_TYPES = new Set(["bill", "supplier_payment"]);

export module supplierStatementService {
  export const getSupplierStatement = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const supplierId = requirePositiveInteger(
      request.params?.supplierId,
      "supplierId"
    );
    const page = normalizePageValue(request.query?.page, 1, 1_000_000);
    const count = normalizePageValue(request.query?.count, 10, 100);
    const transactionType = String(request.query?.type || "")
      .trim()
      .toLowerCase();
    if (transactionType && !SUPPLIER_STATEMENT_TYPES.has(transactionType)) {
      throw new FinanceValidationError(
        "Statement type must be bill or supplier_payment."
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

    const supplierResult = await query(
      `
      SELECT
        id,
        suppliername,
        supplieremail,
        supplierphonenumber,
        suppliercode,
        gstnumber
      FROM supplier
      WHERE id = $1
        AND COALESCE(isdeleted, FALSE) = FALSE
      LIMIT 1
      `,
      [supplierId]
    );
    const supplier = supplierResult.rows[0];
    if (!supplier) {
      throw new FinanceValidationError(
        "Supplier not found.",
        404,
        "FINANCE_SUPPLIER_NOT_FOUND"
      );
    }

    const onaccount = await onAccountStatementService.getPartyStatement(
      request,
      "supplier",
      supplierId
    );

    const [billResult, paymentResult] = await Promise.all([
      query(
        `
        SELECT
          bill.*,
          linked_po.supplierid,
          COALESCE(
            (
              SELECT SUM(allocation.totalsettledamount)
              FROM bank_transaction_allocations allocation
              JOIN bank_transactions bank_tx
                ON bank_tx.id = allocation.banktransactionid
              WHERE allocation.documenttype = 'purchase_bill'
                AND allocation.documentid = bill.id
                AND allocation.status = 'applied'
                AND bank_tx.organizationid = $2
                AND bank_tx.postingstatus = 'posted'
            ),
            0
          ) AS finance_settled_amount
        FROM poinvoice bill
        JOIN LATERAL (
          SELECT po.supplierid
          FROM purchaseorder po
          WHERE po.ponumber = bill.ponumber
          ORDER BY po.id DESC
          LIMIT 1
        ) linked_po ON TRUE
        WHERE linked_po.supplierid = $1
        ORDER BY COALESCE(bill.invoicedate, bill.createddate), bill.id
        `,
        [supplierId, organizationId]
      ),
      query(
        `
        SELECT
          t.id,
          t.transactionnumber,
          t.transactiondate,
          t.amount,
          t.sourcetype,
          t.remarks,
          t.postingstatus,
          b.accountname AS bankcashaccountname,
          b.bankname,
          COALESCE(allocation.allocationamount, 0) AS allocationamount,
          COALESCE(allocation.tdsamount, 0) AS tdsamount,
          COALESCE(allocation.totalsettledamount, 0) AS totalsettledamount,
          COALESCE(allocation.documentnumbers, ARRAY[]::varchar[]) AS documentnumbers
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
            AND a.documenttype = 'purchase_bill'
            AND a.status = 'applied'
        ) allocation ON TRUE
        WHERE t.organizationid = $1
          AND t.partytype = 'supplier'
          AND t.partyid = $2
          AND t.postingstatus = 'posted'
        ORDER BY t.transactiondate, t.posteddate, t.id
        `,
        [organizationId, supplierId]
      ),
    ]);

    const activeBills = billResult.rows.filter(isNonCancelledBill);
    const billRows = activeBills.flatMap((bill: any) => {
      const transactionDate = toCustomerStatementDate(
        bill.invoicedate || bill.createddate
      );
      if (!transactionDate) return [];
      const state = getSupplierBillPaymentState(bill);
      return [{
        id: `bill-${bill.id}`,
        sourceid: Number(bill.id),
        transactiontype: "bill" as const,
        transactiondate: transactionDate,
        reference: String(bill.invoicenumber || `BILL-${bill.id}`),
        description: bill.ponumber
          ? `Purchase Order ${bill.ponumber}`
          : "Purchase Bill",
        billamount: state.invoiceAmount,
        paymentamount: 0,
        settledamount: 0,
        tdsamount: 0,
        status: String(bill.invoicestatus || "in_progress"),
        source: "purchase_bill",
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
        transactiontype: "supplier_payment" as const,
        transactiondate: transactionDate,
        reference: String(payment.transactionnumber || `BT-${payment.id}`),
        description:
          String(payment.remarks || "").trim() || "Supplier payment",
        billamount: 0,
        paymentamount: toMoney(payment.amount),
        allocatedamount: toMoney(payment.allocationamount),
        settledamount: toMoney(payment.totalsettledamount),
        tdsamount: toMoney(payment.tdsamount),
        status: String(payment.postingstatus || "posted"),
        source: String(payment.sourcetype || "supplier_bill_payment"),
        bankcashaccountname: payment.bankcashaccountname || null,
        bankname: payment.bankname || null,
        documentnumbers: Array.isArray(payment.documentnumbers)
          ? payment.documentnumbers.map(String)
          : [],
      }];
    });

    const statement = buildSupplierStatement(
      [...billRows, ...paymentRows],
      { fromdate: fromDate, todate: toDate }
    );
    const currentPayable = toMoney(
      activeBills.reduce(
        (total: number, bill: any) =>
          total + getSupplierBillPaymentState(bill).outstandingAmount,
        0
      )
    );
    const filteredRecords = transactionType
      ? statement.records.filter(
          (record) => record.transactiontype === transactionType
        )
      : statement.records;
    const offset = (page - 1) * count;

    return {
      supplier: {
        id: Number(supplier.id),
        name:
          String(supplier.suppliername || "").trim() ||
          `Supplier ${supplier.id}`,
        email: supplier.supplieremail || null,
        mobilenumber: supplier.supplierphonenumber || null,
        suppliercode: supplier.suppliercode || null,
        gstnumber: supplier.gstnumber || null,
      },
      records: filteredRecords.slice(offset, offset + count) as SupplierStatementRow[],
      onaccount,
      total: filteredRecords.length,
      page,
      count,
      summary: {
        ...statement.summary,
        currentpayable: currentPayable,
        billcount: billRows.length,
        paymentcount: paymentRows.length,
      },
    };
  };
}
