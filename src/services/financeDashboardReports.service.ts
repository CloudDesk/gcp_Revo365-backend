import { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  resolveFinanceContext,
  toMoney,
} from "../utils/finance/finance.utils.js";
import { invoiceIncludesCogs, invoiceIncludesRentalIncome, parseGstMoney, resolveBillGst, resolveInvoiceDocumentType, resolveInvoiceGst } from "../utils/finance/gstSummary.utils.js";
import { getRetailInvoicePaymentState } from "../utils/finance/retailReceipt.utils.js";
import { getSupplierBillPaymentState } from "../utils/finance/supplierBill.utils.js";
import { fillMonthlyFinanceTrend, normalizeFinanceEpochSeconds } from "../utils/finance/financeDate.utils.js";
import { buildInventoryStockValuation, resolveInventoryStockUnitCost } from "../utils/finance/inventoryStockValuation.utils.js";
import { netPostedGstLedgerRows } from "../utils/finance/balanceSheetPresentation.utils.js";
import { buildOutwardIstPortalDetails, buildOutwardIstPortalRows } from "../utils/finance/outwardIstPortal.utils.js";
import { normalizeFinanceReportStatus } from "../utils/finance/financeReportFilters.utils.js";
import {
  resolveSupplierBillLineDetails,
  summarizeSupplierBillLines,
  type SupplierBillLineDetail,
} from "../utils/finance/supplierBillLineDetails.utils.js";
import {
  emptyProductCostIndex,
  resolveInvoiceCogs,
  type InvoiceStockCost,
} from "../utils/finance/profitLossCogs.utils.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const getFilters = (request: any) => {
  const today = new Date().toISOString().slice(0, 10);
  const to = String(request.query?.to || today).trim();
  const toDate = ISO_DATE.test(to) ? new Date(`${to}T00:00:00.000Z`) : null;
  const financialYear = toDate && toDate.getUTCMonth() < 3
    ? toDate.getUTCFullYear() - 1
    : Number(to.slice(0, 4));
  const from = String(request.query?.from || `${financialYear}-04-01`).trim();
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    throw new FinanceValidationError("Select a valid From and To date range.");
  }
  return { from, to };
};

const money = (value: unknown) => toMoney(Number(value) || 0);
const jsonObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
};
const taxableSectionAmount = (sectionValue: unknown) => {
  const section = jsonObject(sectionValue);
  const gross = parseGstMoney(section.total ?? section.totalamount ?? section.grandtotal);
  const tax = parseGstMoney(section.taxamount);
  return money(Math.max(gross - tax, 0));
};
const epochRange = (from: string, to: string) => ({
  fromEpoch: Math.floor(new Date(`${from}T00:00:00.000Z`).getTime() / 1000),
  toEpoch: Math.floor(new Date(`${to}T23:59:59.999Z`).getTime() / 1000),
});

// revoinvoice contains legacy epoch-second values and newer epoch-millisecond
// values (the set_epochinvoicedate trigger writes milliseconds). Normalize both
// representations before applying finance date filters and ageing calculations.
const REVO_INVOICE_DATE_SECONDS = `CASE
  WHEN COALESCE(r.invoicedate, r.createddate) >= 100000000000
    THEN FLOOR(COALESCE(r.invoicedate, r.createddate) / 1000.0)
  ELSE COALESCE(r.invoicedate, r.createddate)
END`;
const REVO_BILL_DATE_SECONDS = `CASE
  WHEN COALESCE(b.invoicedate, b.createddate) >= 100000000000
    THEN FLOOR(COALESCE(b.invoicedate, b.createddate) / 1000.0)
  ELSE COALESCE(b.invoicedate, b.createddate)
END`;
const getPage = (request: any) => ({
  page: Math.max(Number(request.query?.page) || 1, 1),
  count: Math.min(
    Math.max(Number(request.query?.count) || 10, 1),
    request.query?.export === "true" ? 10_000 : 10
  ),
});

export module financeDashboardReportsService {
  export const getDashboardSummary = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const { from, to } = getFilters(request);
    const { fromEpoch, toEpoch } = epochRange(from, to);
    const [result, invoiceResult, billResult, tdsActivityResult, tdsDepositResult] = await Promise.all([query(
      `
      WITH ledger AS (
        SELECT
          fa.accounttype,
          fa.accountsubtype,
          COALESCE(SUM(CASE WHEN je.entrydate <= $3 THEN jl.debitamount - jl.creditamount ELSE 0 END), 0) AS asofnet,
          COALESCE(SUM(CASE WHEN je.entrydate BETWEEN $2 AND $3 THEN jl.debitamount - jl.creditamount ELSE 0 END), 0) AS periodnet
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journalentryid = je.id
        JOIN finance_accounts fa ON fa.id = jl.financeaccountid
        WHERE je.organizationid = $1
          AND je.status = 'posted'
          AND je.entrydate <= $3
        GROUP BY fa.accounttype, fa.accountsubtype
      )
      SELECT
        COALESCE(SUM(CASE WHEN accountsubtype = 'accounts_receivable' THEN asofnet ELSE 0 END), 0) AS receivables,
        COALESCE(SUM(CASE WHEN accountsubtype = 'accounts_payable' THEN -asofnet ELSE 0 END), 0) AS payables,
        COALESCE(SUM(CASE WHEN accounttype = 'income' THEN -periodnet ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN accounttype = 'expense' THEN periodnet ELSE 0 END), 0) AS expense,
        COALESCE(SUM(CASE WHEN accountsubtype = 'tds_receivable' THEN asofnet ELSE 0 END), 0) AS tdsreceivable,
        COALESCE(SUM(CASE WHEN accountsubtype = 'tds_payable' THEN -(asofnet - periodnet) ELSE 0 END), 0) AS openingtdspayable,
        COALESCE(SUM(CASE WHEN accountsubtype = 'tds_payable' THEN -asofnet ELSE 0 END), 0) AS tdspayable
      FROM ledger
      `,
      [organizationId, from, to]
    ),
    query(
      `SELECT id, invoicedate, createddate, paymentduedate,
              invoicefor, invoicedata, servicedata, summaryinvoicedata,
              supportingdocumentdata, taxamount, totalorderamount,
              paidamount, paymentdata, paymentstatus
       FROM revoinvoice
       WHERE organizationid = $2
         AND CASE
               WHEN COALESCE(invoicedate, createddate) >= 100000000000
                 THEN FLOOR(COALESCE(invoicedate, createddate) / 1000.0)
               ELSE COALESCE(invoicedate, createddate)
             END <= $1
         AND LOWER(COALESCE(paymentstatus, 'pending')) NOT IN ('cancelled', 'void')`,
      [toEpoch, organizationId]
    ),
    query(
      `SELECT b.id, b.invoicedate, b.createddate, b.paymentduedate,
              b.invoiceamount, b.balanceamount, b.paymentdata,
              b.payabletaxamount, b.igst, b.cgst,
              b.sgst, b.billtype, b.invoicestatus,
              COALESCE(b.suppliergstin, po.suppliergstnumber) AS suppliergstin,
              COALESCE(po.dt_gstnumber, po.io_gstnumber) AS destinationgstin
       FROM poinvoice b
       LEFT JOIN LATERAL (
         SELECT suppliergstnumber, dt_gstnumber, io_gstnumber
         FROM purchaseorder WHERE ponumber=b.ponumber ORDER BY id DESC LIMIT 1
       ) po ON TRUE
       WHERE b.organizationid = $2
         AND ${REVO_BILL_DATE_SECONDS} <= $1
         AND LOWER(COALESCE(b.invoicestatus, 'in_progress')) NOT IN ('cancelled', 'void')`,
      [toEpoch, organizationId]
    ),
    query(
      `SELECT
         COALESCE(SUM(a.tdsamount) FILTER (WHERE a.documenttype='sales_invoice'),0) AS customer_deducted,
         COALESCE(SUM(a.tdsamount) FILTER (WHERE a.documenttype='purchase_bill'),0) AS company_deducted
       FROM bank_transaction_allocations a
       JOIN bank_transactions t ON t.id=a.banktransactionid
       WHERE t.organizationid=$1 AND t.postingstatus='posted'
         AND a.status='applied' AND a.tdsapplied=TRUE
         AND t.transactiondate BETWEEN $2 AND $3`,
      [organizationId, from, to]
    ),
    query(`SELECT COALESCE(SUM(taxamount),0) AS deposited
           FROM finance_tds_deposits
           WHERE organizationid=$1 AND status IN ('paid','reconciled')
             AND depositdate BETWEEN $2 AND $3`, [organizationId, from, to])]);
    const row = result.rows[0] || {};
    const invoicePeriod = invoiceResult.rows.filter((invoice: any) =>
      normalizeFinanceEpochSeconds(invoice.invoicedate || invoice.createddate) >= fromEpoch
    );
    const billPeriod = billResult.rows.filter((bill: any) =>
      normalizeFinanceEpochSeconds(bill.invoicedate || bill.createddate) >= fromEpoch
    );
    const invoiceTotals = invoicePeriod.reduce((sum: any, invoice: any) => {
      const payment = getRetailInvoicePaymentState(invoice);
      const gst = resolveInvoiceGst(invoice);
      sum.gross += payment.invoiceAmount;
      sum.gst += gst.total;
      return sum;
    }, { gross: 0, gst: 0 });
    const billTotals = billPeriod.reduce((sum: any, bill: any) => {
      const payment = getSupplierBillPaymentState(bill);
      const gst = resolveBillGst(bill);
      const net = money(payment.invoiceAmount - gst.total);
      sum.gross += payment.invoiceAmount;
      sum.gst += gst.total;
      if (String(bill.billtype || "inventory").toLowerCase() === "expense") sum.operatingExpense += net;
      else sum.inventoryPurchases += net;
      return sum;
    }, { gross: 0, gst: 0, operatingExpense: 0, inventoryPurchases: 0 });
    const netSales = money(invoiceTotals.gross - invoiceTotals.gst);
    const billsExcludingGst = money(billTotals.gross - billTotals.gst);
    const receivables = money(invoiceResult.rows.reduce(
      (sum: number, invoice: any) => sum + getRetailInvoicePaymentState(invoice).outstandingAmount,
      0
    ));
    const payables = money(billResult.rows.reduce(
      (sum: number, bill: any) => sum + getSupplierBillPaymentState(bill).outstandingAmount,
      0
    ));
    const ledgerReceivables = money(row.receivables);
    const ledgerPayables = money(row.payables);
    const tdsActivity = tdsActivityResult.rows[0] || {};
    const openingTdsPayable = money(row.openingtdspayable);
    const tdsPayable = money(row.tdspayable);
    const tdsDeductedByUs = money(tdsActivity.company_deducted);
    const tdsDepositedByUs = money(tdsDepositResult.rows[0]?.deposited);
    const tdsPayableAdjustments = money(
      tdsPayable - openingTdsPayable - tdsDeductedByUs + tdsDepositedByUs
    );
    return {
      meta: {
        from,
        to,
        currency: "INR",
        accountingBasis: "accrual",
        generatedAt: new Date().toISOString(),
        postedOnly: true,
      },
      metrics: {
        // Headline outstanding values deliberately use the same canonical
        // document settlement state as ageing. Ledger balances remain visible
        // below as reconciliation controls instead of silently contradicting it.
        receivables,
        payables,
        ledgerReceivables,
        ledgerPayables,
        receivablesLedgerVariance: money(ledgerReceivables - receivables),
        payablesLedgerVariance: money(ledgerPayables - payables),
        income: netSales,
        expense: billsExcludingGst,
        netProfit: money(money(row.income) - money(row.expense)),
        postedIncome: money(row.income),
        postedExpense: money(row.expense),
        inventoryPurchases: money(billTotals.inventoryPurchases),
        operatingExpense: money(billTotals.operatingExpense),
        tdsReceivable: money(row.tdsreceivable),
        openingTdsPayable,
        tdsPayable,
        tdsPayableAdjustments,
        tdsDeductedByCustomers: money(tdsActivity.customer_deducted),
        tdsDeductedByUs,
        tdsDepositedByUs,
      },
    };
  };

  export const getDashboardInsights = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const { from, to } = getFilters(request);
    const { fromEpoch, toEpoch } = epochRange(from, to);
    const [trendResult, invoiceResult, billResult, cashResult, exceptionResult, topExpenseResult] = await Promise.all([
      query(
        `SELECT TO_CHAR(DATE_TRUNC('month', je.entrydate), 'YYYY-MM') AS period,
                COALESCE(SUM(CASE WHEN fa.accounttype='income' THEN jl.creditamount-jl.debitamount ELSE 0 END),0) AS income,
                COALESCE(SUM(CASE WHEN fa.accounttype='expense' THEN jl.debitamount-jl.creditamount ELSE 0 END),0) AS expense
         FROM journal_entries je JOIN journal_lines jl ON jl.journalentryid=je.id
         JOIN finance_accounts fa ON fa.id=jl.financeaccountid
         WHERE je.organizationid=$1 AND je.status='posted' AND je.entrydate BETWEEN $2 AND $3
         GROUP BY DATE_TRUNC('month', je.entrydate) ORDER BY DATE_TRUNC('month', je.entrydate)`,
        [organizationId, from, to]
      ),
      query(`SELECT id,invoicedate,createddate,paymentduedate,paymentstatus,invoicefor,
                    totalorderamount,paidamount,paymentdata,taxamount,
                    invoicedata,servicedata,summaryinvoicedata,supportingdocumentdata
             FROM revoinvoice
             WHERE organizationid=$2
               AND LOWER(COALESCE(paymentstatus,'pending')) NOT IN ('cancelled','void')
               AND CASE
                     WHEN COALESCE(invoicedate,createddate) >= 100000000000
                       THEN FLOOR(COALESCE(invoicedate,createddate) / 1000.0)
                     ELSE COALESCE(invoicedate,createddate)
                   END <= $1`, [toEpoch,organizationId]),
      query(`SELECT b.id,b.invoicedate,b.createddate,b.paymentduedate,b.invoicestatus,
                    b.invoiceamount,b.balanceamount,b.paymentdata,b.payabletaxamount,b.igst,b.cgst,b.sgst,
                    COALESCE(b.suppliergstin,po.suppliergstnumber) AS suppliergstin,
                    COALESCE(po.dt_gstnumber,po.io_gstnumber) AS destinationgstin
             FROM poinvoice b
             LEFT JOIN LATERAL (
               SELECT suppliergstnumber,dt_gstnumber,io_gstnumber
               FROM purchaseorder WHERE ponumber=b.ponumber ORDER BY id DESC LIMIT 1
             ) po ON TRUE
             WHERE b.organizationid=$2
               AND LOWER(COALESCE(b.invoicestatus,'in_progress')) NOT IN ('cancelled','void')
               AND ${REVO_BILL_DATE_SECONDS} <= $1`, [toEpoch,organizationId]),
      query(`SELECT COALESCE(SUM(currentbalance) FILTER (WHERE status='active'),0) AS total,
                    COUNT(*) FILTER (WHERE status='active')::int AS accounts,
                    (SELECT COALESCE(JSON_AGG(top_account),'[]'::json) FROM (
                       SELECT accountname AS name, currentbalance AS balance
                       FROM bank_cash_accounts
                       WHERE organizationid=$1 AND status='active'
                       ORDER BY ABS(currentbalance) DESC, accountname ASC LIMIT 3
                     ) top_account) AS topaccounts
             FROM bank_cash_accounts WHERE organizationid=$1`, [organizationId]),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status='draft')::int AS draftjournals,
           COUNT(*) FILTER (WHERE status='posted' AND ABS(COALESCE(lines.debits,0)-COALESCE(lines.credits,0)) > 0.01)::int AS unbalanced
         FROM journal_entries je
         LEFT JOIN LATERAL (SELECT SUM(debitamount) debits, SUM(creditamount) credits FROM journal_lines WHERE journalentryid=je.id) lines ON TRUE
         WHERE je.organizationid=$1`,
        [organizationId]
      ),
      query(
        `SELECT fa.id, fa.accountname AS name,
                COALESCE(SUM(jl.debitamount - jl.creditamount), 0) AS amount
         FROM journal_entries je
         JOIN journal_lines jl ON jl.journalentryid=je.id
         JOIN finance_accounts fa ON fa.id=jl.financeaccountid
         WHERE je.organizationid=$1 AND je.status='posted'
           AND je.entrydate BETWEEN $2 AND $3 AND fa.accounttype='expense'
         GROUP BY fa.id, fa.accountname
         HAVING ABS(COALESCE(SUM(jl.debitamount - jl.creditamount), 0)) >= 0.01
         ORDER BY ABS(COALESCE(SUM(jl.debitamount - jl.creditamount), 0)) DESC, fa.accountname ASC`,
        [organizationId, from, to]
      ),
    ]);

    const ageing = (rows: any[], stateResolver: (row: any) => any) => {
      const buckets: Record<string, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      const counts: Record<string, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      rows.forEach((row) => {
        const outstanding = stateResolver(row).outstandingAmount;
        if (outstanding <= 0) return;
        const epoch = normalizeFinanceEpochSeconds(row.paymentduedate || row.invoicedate || row.createddate, toEpoch);
        const age = Math.floor((toEpoch - epoch) / 86400);
        const bucket = age <= 0 ? "current" : age <= 30 ? "1-30" : age <= 60 ? "31-60" : age <= 90 ? "61-90" : "90+";
        buckets[bucket] = money(buckets[bucket] + outstanding);
        counts[bucket] += 1;
      });
      return { buckets, counts };
    };
    const invoicePeriod = invoiceResult.rows.filter((row: any) => normalizeFinanceEpochSeconds(row.invoicedate || row.createddate) >= fromEpoch);
    const billPeriod = billResult.rows.filter((row: any) => normalizeFinanceEpochSeconds(row.invoicedate || row.createddate) >= fromEpoch);
    const invoiceGst = invoicePeriod.reduce((sum: any, row: any) => { const gst=resolveInvoiceGst(row); sum.cgst+=gst.cgst; sum.sgst+=gst.sgst; sum.igst+=gst.igst; sum.total+=gst.total; return sum; }, {cgst:0,sgst:0,igst:0,total:0});
    const billGst = billPeriod.reduce((sum: any, row: any) => { const gst=resolveBillGst(row); sum.cgst+=gst.cgst; sum.sgst+=gst.sgst; sum.igst+=gst.igst; sum.total+=gst.total; return sum; }, {cgst:0,sgst:0,igst:0,total:0});
    [invoiceGst, billGst].forEach((gst) => Object.keys(gst).forEach((key) => gst[key]=money(gst[key])));
    const receivablesAgeing = ageing(invoiceResult.rows, getRetailInvoicePaymentState);
    const payablesAgeing = ageing(billResult.rows, getSupplierBillPaymentState);
    const topAccounts = Array.isArray(cashResult.rows[0]?.topaccounts) ? cashResult.rows[0].topaccounts : [];
    return {
      meta: { from, to, currency: "INR", generatedAt: new Date().toISOString() },
      trend: fillMonthlyFinanceTrend(from, to, trendResult.rows.map((row: any) => ({ period: row.period, income: money(row.income), expense: money(row.expense) }))),
      topExpenses: topExpenseResult.rows.map((row: any) => ({ id: Number(row.id), name: String(row.name || "Expense"), amount: money(row.amount) })),
      receivablesAgeing: receivablesAgeing.buckets,
      payablesAgeing: payablesAgeing.buckets,
      receivablesAgeingCounts: receivablesAgeing.counts,
      payablesAgeingCounts: payablesAgeing.counts,
      gst: { outward: invoiceGst, inward: billGst, net: money(invoiceGst.total-billGst.total) },
      cashBank: { total: money(cashResult.rows[0]?.total), accounts: Number(cashResult.rows[0]?.accounts || 0), topAccounts: topAccounts.map((account: any) => ({ name: String(account.name || "Account"), balance: money(account.balance) })) },
      exceptions: { draftJournals: Number(exceptionResult.rows[0]?.draftjournals || 0), unbalancedJournals: Number(exceptionResult.rows[0]?.unbalanced || 0) },
    };
  };

  export const getDashboardAgeingDetails = async (request: any) => {
    resolveFinanceContext(request);
    const { to } = getFilters(request);
    const { toEpoch } = epochRange(to, to);
    const kind = String(request.query?.kind || "").trim().toLowerCase();
    const bucket = String(request.query?.bucket || "").trim().toLowerCase();
    const allowedBuckets = new Set(["all", "current", "1-30", "31-60", "61-90", "90+"]);
    if (!['receivables', 'payables'].includes(kind) || !allowedBuckets.has(bucket)) {
      throw new Error('Select a valid ageing type and period.');
    }
    const page = Math.max(Number(request.query?.page) || 1, 1);
    const count = Math.min(Math.max(Number(request.query?.count) || 10, 1), bucket === 'all' ? 10000 : 25);
    const isBucket = (age: number) => bucket === 'all' ? true
      : bucket === 'current' ? age <= 0
      : bucket === '1-30' ? age >= 1 && age <= 30
      : bucket === '31-60' ? age >= 31 && age <= 60
      : bucket === '61-90' ? age >= 61 && age <= 90
      : age > 90;

    let details: any[] = [];
    if (kind === 'receivables') {
      const result = await query(
        `SELECT r.*, CONCAT_WS(' ', u.firstname, u.lastname) AS partyname
         FROM revoinvoice r
         LEFT JOIN users u ON u.id=r.customerid
         WHERE ${REVO_INVOICE_DATE_SECONDS} <= $1
           AND LOWER(COALESCE(r.paymentstatus,'pending')) NOT IN ('cancelled','void')
         ORDER BY COALESCE(r.paymentduedate,r.invoicedate,r.createddate) ASC, r.id ASC`,
        [toEpoch]
      );
      details = result.rows.map((row: any) => {
        const outstandingAmount = getRetailInvoicePaymentState(row).outstandingAmount;
        const dueEpoch = normalizeFinanceEpochSeconds(row.paymentduedate || row.invoicedate || row.createddate, toEpoch);
        return { id: Number(row.id), date: normalizeFinanceEpochSeconds(row.invoicedate || row.createddate, dueEpoch), dueDate: dueEpoch, number: row.invoicenumber || `INV-${row.id}`, partyName: row.partyname || `Customer ${row.customerid || '—'}`, outstandingAmount, overdueDays: Math.floor((toEpoch-dueEpoch)/86400) };
      });
    } else {
      const result = await query(
        `SELECT b.*, COALESCE(b.supplierid,po.supplierid) AS report_supplierid, s.suppliername AS partyname
         FROM poinvoice b
         LEFT JOIN LATERAL (SELECT supplierid FROM purchaseorder WHERE ponumber=b.ponumber ORDER BY id DESC LIMIT 1) po ON TRUE
         LEFT JOIN supplier s ON s.id=COALESCE(b.supplierid,po.supplierid)
         WHERE COALESCE(b.invoicedate,b.createddate) <= $1
           AND LOWER(COALESCE(b.invoicestatus,'in_progress')) NOT IN ('cancelled','void')
         ORDER BY COALESCE(b.paymentduedate,b.invoicedate,b.createddate) ASC, b.id ASC`,
        [toEpoch]
      );
      details = result.rows.map((row: any) => {
        const outstandingAmount = getSupplierBillPaymentState(row).outstandingAmount;
        const dueEpoch = normalizeFinanceEpochSeconds(row.paymentduedate || row.invoicedate || row.createddate, toEpoch);
        return { id: Number(row.id), date: normalizeFinanceEpochSeconds(row.invoicedate || row.createddate, dueEpoch), dueDate: dueEpoch, number: row.invoicenumber || `BILL-${row.id}`, partyName: row.partyname || `Supplier ${row.report_supplierid || '—'}`, outstandingAmount, overdueDays: Math.floor((toEpoch-dueEpoch)/86400) };
      });
    }
    details = details.filter((row) => row.outstandingAmount > 0 && isBucket(row.overdueDays));
    const total = details.length;
    const totalAmount = money(details.reduce((sum, row) => sum + row.outstandingAmount, 0));
    const rows = details.slice((page-1)*count, page*count);
    return { meta: { kind, bucket, to, currency: 'INR' }, rows, total, totalAmount, page, count };
  };

  export const getReport = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const { from, to } = getFilters(request);
    const { page, count } = getPage(request);
    const reportKey = String(request.params?.reportKey || "").trim();
    if (reportKey === "outward-ist-portal") {
      const { fromEpoch, toEpoch } = epochRange(from, to);
      const result = await query(
        `SELECT r.*, COALESCE(u.isbusinessuser, FALSE) AS isbusinessuser,
                CONCAT_WS(' ', u.firstname, u.lastname) AS partyname,
                latest_address.state AS customerstate
         FROM revoinvoice r
         LEFT JOIN users u ON u.id = r.customerid
         LEFT JOIN LATERAL (
           SELECT a.state FROM address a WHERE a.userid = u.id
           ORDER BY a.modifieddate DESC NULLS LAST, a.id DESC LIMIT 1
         ) latest_address ON TRUE
         WHERE ${REVO_INVOICE_DATE_SECONDS} BETWEEN $1 AND $2
           AND LOWER(COALESCE(r.paymentstatus, 'pending')) NOT IN ('cancelled','void')`,
        [fromEpoch, toEpoch]
      );
      const rows = buildOutwardIstPortalRows(result.rows);
      const details = buildOutwardIstPortalDetails(result.rows);
      return { meta: { reportKey, from, to, currency: "INR", generatedAt: new Date().toISOString(), totalsScope: "statutory_categories" }, rows, details, total: rows.length };
    }
    if (["sales-invoices", "supplier-bills", "gst-inward", "gst-outward", "tds-summary"].includes(reportKey)) {
      return getDocumentReport(request, reportKey, from, to, organizationId);
    }
    if (!["trial-balance", "profit-loss", "balance-sheet"].includes(reportKey)) {
      throw new FinanceValidationError("Select a supported finance report.", 404);
    }

    const result = await query(
      `
      SELECT
        fa.id AS accountid,
        fa.accountcode,
        fa.accountname,
        fa.accounttype,
        fa.accountsubtype,
        COALESCE(SUM(CASE WHEN je.entrydate < $2 THEN jl.debitamount ELSE 0 END), 0) AS openingdebit,
        COALESCE(SUM(CASE WHEN je.entrydate < $2 THEN jl.creditamount ELSE 0 END), 0) AS openingcredit,
        COALESCE(SUM(CASE WHEN je.entrydate BETWEEN $2 AND $3 THEN jl.debitamount ELSE 0 END), 0) AS perioddebit,
        COALESCE(SUM(CASE WHEN je.entrydate BETWEEN $2 AND $3 THEN jl.creditamount ELSE 0 END), 0) AS periodcredit,
        COALESCE(SUM(CASE WHEN je.entrydate <= $3 THEN jl.debitamount ELSE 0 END), 0) AS closingdebitmovement,
        COALESCE(SUM(CASE WHEN je.entrydate <= $3 THEN jl.creditamount ELSE 0 END), 0) AS closingcreditmovement
      FROM finance_accounts fa
      LEFT JOIN journal_lines jl ON jl.financeaccountid = fa.id
      LEFT JOIN journal_entries je
        ON je.id = jl.journalentryid
       AND je.organizationid = $1
       AND je.status = 'posted'
       AND je.entrydate <= $3
      WHERE fa.organizationid = $1
      GROUP BY fa.id, fa.accountcode, fa.accountname, fa.accounttype, fa.accountsubtype
      ORDER BY
        CASE fa.accounttype
          WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3
          WHEN 'income' THEN 4 WHEN 'expense' THEN 5 ELSE 6
        END,
        fa.accountcode,
        fa.accountname
      `,
      [organizationId, from, to]
    );

    const allRows = result.rows.map((row: any) => {
      const closingNet = money(row.closingdebitmovement - row.closingcreditmovement);
      return {
        accountId: Number(row.accountid),
        accountCode: row.accountcode,
        accountName: row.accountname,
        accountType: row.accounttype,
        accountSubtype: row.accountsubtype,
        openingDebit: money(Math.max(row.openingdebit - row.openingcredit, 0)),
        openingCredit: money(Math.max(row.openingcredit - row.openingdebit, 0)),
        periodDebit: money(row.perioddebit),
        periodCredit: money(row.periodcredit),
        closingDebit: money(Math.max(closingNet, 0)),
        closingCredit: money(Math.max(-closingNet, 0)),
        balance: closingNet,
      };
    });

    let rows = allRows;
    let operationalProfitLoss: any = null;
    let profitLossDetails: any[] | undefined;
    let balanceSheetDetails: any | undefined;
    let trialBalanceDetails: any | undefined;
    if (reportKey === "trial-balance") {
      const journalDetailResult = await query(
        `SELECT jl.financeaccountid AS accountid, je.entrydate, je.journalnumber,
                je.sourcetype, je.description AS entrydescription,
                jl.description AS linedescription, jl.debitamount, jl.creditamount
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journalentryid
         WHERE je.organizationid = $1 AND je.status = 'posted' AND je.entrydate <= $2
         ORDER BY je.entrydate DESC, je.id DESC, jl.id ASC`,
        [organizationId, to]
      );
      trialBalanceDetails = {
        journalLines: journalDetailResult.rows.map((detail: any) => ({
          accountId: Number(detail.accountid), date: detail.entrydate,
          reference: detail.journalnumber, sourceType: detail.sourcetype,
          description: detail.linedescription || detail.entrydescription || "Posted journal entry",
          debit: money(Number(detail.debitamount || 0)), credit: money(Number(detail.creditamount || 0)),
        })),
      };
    }
    if (reportKey === "profit-loss") {
      rows = allRows.filter((row: any) => ["income", "expense"].includes(row.accountType));
      const { fromEpoch, toEpoch } = epochRange(from, to);
      const [invoiceResult, productResult] = await Promise.all([
        query(`SELECT r.*, CONCAT_WS(' ', u.firstname, u.lastname) AS partyname
          FROM revoinvoice r LEFT JOIN users u ON u.id = r.customerid
          WHERE ${REVO_INVOICE_DATE_SECONDS} BETWEEN $1 AND $2
          AND r.organizationid = $3
          AND LOWER(COALESCE(r.paymentstatus,'pending')) NOT IN ('cancelled','void')
          ORDER BY ${REVO_INVOICE_DATE_SECONDS}, r.id`, [fromEpoch, toEpoch, organizationId]),
        query(`SELECT id,puc,productname,COALESCE(purchaseprice,0) AS purchaseprice
               FROM product_revo`, []),
      ]);
      const productCosts = emptyProductCostIndex();
      productResult.rows.forEach((product: any) => {
        const purchasePrice = Number(product.purchaseprice || 0);
        productCosts.byId.set(String(product.id), purchasePrice);
        productCosts.byPuc.set(String(product.puc || "").trim(), purchasePrice);
        productCosts.byName.set(String(product.productname || "").trim().toLowerCase(), purchasePrice);
      });
      const invoiceIds = invoiceResult.rows
        .map((invoice: any) => Number(invoice.id))
        .filter((id: number) => Number.isInteger(id) && id > 0);
      const stockCostResult = invoiceIds.length > 0
        ? await query(
            `SELECT DISTINCT ON (linked.invoiceid, linked.stockid)
                    linked.invoiceid, linked.stockid, linked.orderlinenumber, linked.productid, linked.puc,
                    linked.productname, linked.purchaseprice, linked.source
             FROM (
               SELECT r.id AS invoiceid, s.id AS stockid, ol.orderlinenumber,
                      COALESCE(ol.productid, p.id) AS productid,
                      s.puc, COALESCE(p.productname, ol.productname) AS productname,
                      s.purchaseprice, 'order'::text AS source
               FROM revoinvoice r
               JOIN orderline ol ON ol.uniqueorderid = r.orderid
               JOIN stock_revo s ON s.orderlinenumber = ol.orderlinenumber
               LEFT JOIN product_revo p ON p.puc = s.puc
               WHERE r.id = ANY($1::int[])
                 AND LOWER(BTRIM(COALESCE(s.stockstatus, ''))) = 'sold'

               UNION ALL

               SELECT r.id AS invoiceid, s.id AS stockid, NULL::text AS orderlinenumber,
                      allocation.productid, s.puc, p.productname,
                      s.purchaseprice, 'service'::text AS source
               FROM revoinvoice r
               JOIN service_estimation_stock_allocations allocation
                 ON allocation.ticketnumber = r.ticketnumber
                AND allocation.allocationstatus = 'sold'
               JOIN stock_revo s ON s.id = allocation.stockid
               LEFT JOIN product_revo p ON p.id = allocation.productid
               WHERE r.id = ANY($1::int[])
             ) linked
             ORDER BY linked.invoiceid, linked.stockid,
                      CASE WHEN linked.source = 'service' THEN 0 ELSE 1 END`,
            [invoiceIds]
          )
        : { rows: [] };
      const invoiceOrderLineResult = invoiceIds.length > 0
        ? await query(
            `SELECT r.id AS invoiceid, ol.orderlinenumber, ol.productid,
                    ol.productname, p.puc
             FROM revoinvoice r
             JOIN orderline ol ON ol.uniqueorderid = r.orderid
             LEFT JOIN product_revo p ON p.id = ol.productid
             WHERE r.id = ANY($1::int[])
             ORDER BY r.id, ol.id`,
            [invoiceIds]
          )
        : { rows: [] };
      const orderLinesByInvoice = new Map<number, any[]>();
      invoiceOrderLineResult.rows.forEach((line: any) => {
        const invoiceId = Number(line.invoiceid);
        const invoiceLines = orderLinesByInvoice.get(invoiceId) || [];
        invoiceLines.push(line);
        orderLinesByInvoice.set(invoiceId, invoiceLines);
      });
      const stockCostsByInvoice = new Map<number, InvoiceStockCost[]>();
      stockCostResult.rows.forEach((stock: any) => {
        const invoiceId = Number(stock.invoiceid);
        const rowsForInvoice = stockCostsByInvoice.get(invoiceId) || [];
        rowsForInvoice.push({
          stockId: Number(stock.stockid),
          orderLineNumber: stock.orderlinenumber,
          productId: stock.productid == null ? null : Number(stock.productid),
          puc: stock.puc,
          productName: stock.productname,
          purchasePrice: stock.purchaseprice == null ? null : Number(stock.purchaseprice),
          source: stock.source === "service" ? "service" : "order",
        });
        stockCostsByInvoice.set(invoiceId, rowsForInvoice);
      });
      profitLossDetails = [];
      const claimedCogsStockIds = new Set<number>();
      const claimedCogsOrderLineQuantities = new Map<string, number>();
      operationalProfitLoss = invoiceResult.rows.reduce((sum: any, invoice: any) => {
        const rawProductSection = jsonObject(invoice.invoicedata);
        const invoiceOrderLines = orderLinesByInvoice.get(Number(invoice.id)) || [];
        const productSection = {
          ...rawProductSection,
          items: Array.isArray(rawProductSection.items)
            ? rawProductSection.items.map((item: any) => {
                const itemOrderLine = String(item?.orderlinenumber ?? item?.orderLineNumber ?? "").trim();
                const itemName = String(item?.productname ?? item?.name ?? "").trim().toLowerCase();
                const line = invoiceOrderLines.find((candidate: any) =>
                  itemOrderLine && String(candidate.orderlinenumber || "").trim() === itemOrderLine
                ) || invoiceOrderLines.find((candidate: any) =>
                  itemName && String(candidate.productname || "").trim().toLowerCase() === itemName
                ) || (invoiceOrderLines.length === 1 ? invoiceOrderLines[0] : undefined);
                return line
                  ? {
                      ...item,
                      productid: item.productid ?? item.productId ?? line.productid,
                      orderlinenumber: itemOrderLine || line.orderlinenumber,
                      puc: item.puc ?? item.productcode ?? line.puc,
                    }
                  : item;
              })
            : rawProductSection.items,
        };
        const serviceSection = jsonObject(invoice.servicedata);
        const documentType = resolveInvoiceDocumentType(invoice);
        const hasProductSale = invoiceIncludesCogs(invoice);
        const hasServiceSale = documentType === "service" || documentType === "product + service";
        const hasRentalIncome = invoiceIncludesRentalIncome(invoice);
        let productTaxable = taxableSectionAmount(productSection);
        let serviceTaxable = taxableSectionAmount(serviceSection);
        if (productTaxable === 0 && serviceTaxable === 0) {
          const payment = getRetailInvoicePaymentState(invoice);
          const taxable = money(Math.max(payment.invoiceAmount - resolveInvoiceGst(invoice).total, 0));
          if (String(invoice.invoicefor || "").toLowerCase() === "service") serviceTaxable = taxable;
          else productTaxable = taxable;
        }
        // Rental snapshots can retain the full contract/product total in
        // invoicedata. Use the canonical billed amount so P&L reconciles with
        // the Sales Invoice report for the same document and period.
        const rentalTaxable = hasRentalIncome
          ? money(Math.max(
              getRetailInvoicePaymentState(invoice).invoiceAmount - resolveInvoiceGst(invoice).total,
              0
            ))
          : 0;
        if (hasProductSale) sum.salesIncome += productTaxable;
        if (hasServiceSale) sum.serviceIncome += serviceTaxable;
        if (hasRentalIncome) sum.rentalIncome += rentalTaxable;
        const cogsResolution = hasProductSale
          ? resolveInvoiceCogs(
              productSection,
              stockCostsByInvoice.get(Number(invoice.id)) || [],
              productCosts,
              {
                claimedStockIds: claimedCogsStockIds,
                claimedOrderLineQuantities: claimedCogsOrderLineQuantities,
              }
            )
          : {
              amount: 0,
              source: "not_applicable",
              expectedQuantity: 0,
              matchedStockQuantity: 0,
              fallbackQuantity: 0,
              unresolvedQuantity: 0,
              duplicateReferenceQuantity: 0,
              unmatchedStockQuantity: 0,
              stockIds: [],
            };
        const invoiceCogs = cogsResolution.amount;
        sum.cogs += invoiceCogs;
        profitLossDetails!.push({
          id: Number(invoice.id),
          date: normalizeFinanceEpochSeconds(invoice.invoicedate || invoice.createddate),
          number: invoice.invoicenumber || `INV-${invoice.id}`,
          partyName: String(invoice.partyname || "").trim() || `Customer ${invoice.customerid || "—"}`,
          documentType,
          salesIncome: money(hasProductSale ? productTaxable : 0),
          serviceIncome: money(hasServiceSale ? serviceTaxable : 0),
          rentalIncome: rentalTaxable,
          cogs: money(invoiceCogs),
          cogsSource: cogsResolution.source,
          cogsExpectedQuantity: cogsResolution.expectedQuantity,
          cogsMatchedStockQuantity: cogsResolution.matchedStockQuantity,
          cogsFallbackQuantity: cogsResolution.fallbackQuantity,
          cogsUnresolvedQuantity: cogsResolution.unresolvedQuantity,
          cogsDuplicateReferenceQuantity: cogsResolution.duplicateReferenceQuantity,
          cogsUnmatchedStockQuantity: cogsResolution.unmatchedStockQuantity,
          cogsStockIds: cogsResolution.stockIds,
        });
        return sum;
      }, { salesIncome: 0, serviceIncome: 0, rentalIncome: 0, cogs: 0 });
      Object.keys(operationalProfitLoss).forEach(key => operationalProfitLoss[key] = money(operationalProfitLoss[key]));
      const calculatedRows = [
        { accountId: -101, accountCode: "CALC-SALES-INCOME", accountName: "Sales Income (excluding GST)", accountType: "income", accountSubtype: "sales_income", openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: operationalProfitLoss.salesIncome, closingDebit: 0, closingCredit: operationalProfitLoss.salesIncome, balance: -operationalProfitLoss.salesIncome },
        { accountId: -102, accountCode: "CALC-SERVICE-INCOME", accountName: "Service Income (excluding GST)", accountType: "income", accountSubtype: "service_income", openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: operationalProfitLoss.serviceIncome, closingDebit: 0, closingCredit: operationalProfitLoss.serviceIncome, balance: -operationalProfitLoss.serviceIncome },
        { accountId: -104, accountCode: "CALC-RENTAL-INCOME", accountName: "Rental Income (excluding GST)", accountType: "income", accountSubtype: "rental_income", openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: operationalProfitLoss.rentalIncome, closingDebit: 0, closingCredit: operationalProfitLoss.rentalIncome, balance: -operationalProfitLoss.rentalIncome },
        { accountId: -103, accountCode: "CALC-COGS", accountName: "Cost of Goods Sold", accountType: "expense", accountSubtype: "cost_of_goods_sold", openingDebit: 0, openingCredit: 0, periodDebit: operationalProfitLoss.cogs, periodCredit: 0, closingDebit: operationalProfitLoss.cogs, closingCredit: 0, balance: operationalProfitLoss.cogs },
      ];
      rows = [...calculatedRows, ...rows];
    } else if (reportKey === "balance-sheet") {
      rows = allRows.filter((row: any) => ["asset", "liability", "equity"].includes(row.accountType));
      const { fromEpoch, toEpoch } = epochRange(from, to);
      const [stockResult, gstInvoiceResult, gstBillResult] = await Promise.all([query(
        `SELECT s.id AS stockid, s.stocktype, s.stockstatus, s.puc,
                COALESCE(s.productname, p.productname) AS productname,
                COALESCE(s.createddate, s.modifieddate) AS stockdate,
                s.purchaseprice AS stockpurchaseprice,
                p.purchaseprice AS productpurchaseprice
         FROM stock_revo s LEFT JOIN product_revo p ON p.puc = s.puc
         WHERE COALESCE(s.isdeleted, FALSE) = FALSE
           AND COALESCE(s.isarchive, FALSE) = FALSE
           AND COALESCE(s.removefromrecyclebin, FALSE) = FALSE
           AND COALESCE(s.ewaste, FALSE) = FALSE
           AND ((LOWER(BTRIM(s.stocktype)) IN ('on_catalogue_product', 'off_catalogue_product')
                 AND LOWER(BTRIM(s.stockstatus)) = 'available')
             OR (LOWER(BTRIM(s.stocktype)) = 'rental_product'
                 AND LOWER(BTRIM(s.stockstatus)) IN ('available', 'rental sold')))
         ORDER BY s.id`, []
      ), query(
        `SELECT r.* FROM revoinvoice r WHERE ${REVO_INVOICE_DATE_SECONDS} BETWEEN $1 AND $2
           AND LOWER(COALESCE(r.paymentstatus, 'pending')) NOT IN ('cancelled', 'void')`, [fromEpoch, toEpoch]
      ), query(
        `SELECT b.*, COALESCE(b.suppliergstin, po.suppliergstnumber) AS suppliergstin,
                COALESCE(po.dt_gstnumber, po.io_gstnumber) AS destinationgstin
         FROM poinvoice b
         LEFT JOIN LATERAL (SELECT suppliergstnumber, dt_gstnumber, io_gstnumber FROM purchaseorder WHERE ponumber=b.ponumber ORDER BY id DESC LIMIT 1) po ON TRUE
         WHERE ${REVO_BILL_DATE_SECONDS} BETWEEN $1 AND $2
           AND LOWER(COALESCE(b.invoicestatus, 'in_progress')) NOT IN ('cancelled', 'void')`, [fromEpoch, toEpoch]
      )]);
      const stockValuationRows = stockResult.rows.map((detail: any) => {
        const unitCost = resolveInventoryStockUnitCost({
          stockPurchasePrice: detail.stockpurchaseprice,
          productPurchasePrice: detail.productpurchaseprice,
        });
        return {
          ...detail,
          purchaseprice: unitCost.amount,
          purchasepricesource: unitCost.source,
          quantity: 1,
          amount: unitCost.amount,
        };
      });
      const stock = buildInventoryStockValuation(stockValuationRows);
      const journalDetailResult = await query(
        `SELECT jl.financeaccountid AS accountid, je.entrydate, je.journalnumber,
                je.sourcetype, je.description AS entrydescription,
                jl.description AS linedescription, jl.debitamount, jl.creditamount
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journalentryid
         WHERE je.organizationid = $1 AND je.status = 'posted' AND je.entrydate <= $2
         ORDER BY je.entrydate DESC, je.id DESC, jl.id ASC`,
        [organizationId, to]
      );
      balanceSheetDetails = {
        journalLines: journalDetailResult.rows.map((detail: any) => ({
          accountId: Number(detail.accountid), date: detail.entrydate,
          reference: detail.journalnumber, sourceType: detail.sourcetype,
          description: detail.linedescription || detail.entrydescription || "Posted journal entry",
          debit: money(Number(detail.debitamount || 0)), credit: money(Number(detail.creditamount || 0)),
        })),
        stock: stockValuationRows.map((detail: any) => ({
          stockId: Number(detail.stockid),
          puc: detail.puc, productName: detail.productname || detail.puc,
          date: normalizeFinanceEpochSeconds(detail.stockdate),
          stockType: detail.stocktype, stockStatus: detail.stockstatus,
          purchasePrice: money(Number(detail.purchaseprice || 0)), quantity: Number(detail.quantity || 0),
          purchasePriceSource: detail.purchasepricesource,
          amount: money(Number(detail.amount || 0)),
        })),
        gst: [
          ...gstInvoiceResult.rows.map((invoice: any) => ({
            kind: "output", date: normalizeFinanceEpochSeconds(invoice.invoicedate || invoice.createddate),
            reference: invoice.invoicenumber || `INV-${invoice.id}`,
            description: "Output GST from sales invoice", amount: money(resolveInvoiceGst(invoice).total),
          })),
          ...gstBillResult.rows.map((bill: any) => ({
            kind: "input", date: normalizeFinanceEpochSeconds(bill.invoicedate || bill.createddate),
            reference: bill.invoicenumber || `BILL-${bill.id}`,
            description: "Input GST from supplier bill", amount: money(resolveBillGst(bill).total),
          })),
        ].filter((detail: any) => detail.amount !== 0),
      };
      const outputGst = money(gstInvoiceResult.rows.reduce((sum: number, invoice: any) => sum + resolveInvoiceGst(invoice).total, 0));
      const inputGst = money(gstBillResult.rows.reduce((sum: number, bill: any) => sum + resolveBillGst(bill).total, 0));
      const netGst = money(outputGst - inputGst);
      const stockValuationSources = stockValuationRows.reduce((summary: Record<string, number>, detail: any) => {
        const source = String(detail.purchasepricesource || "unresolved");
        summary[source] = (summary[source] || 0) + 1;
        return summary;
      }, {});
      // Stock and GST source records are operational subledger information. They
      // remain available under details for reconciliation, but must not be added
      // to the statement because the Balance Sheet is driven exclusively by
      // balanced, posted journal entries. Adding them here would double-count
      // amounts already represented by Inventory and GST ledger accounts.
      balanceSheetDetails.reconciliation = [{
        stockValue: stock.amount,
        stockQuantity: stock.quantity,
        stockBreakdown: stock.breakdown,
        valuationMethod: "Per-stock purchase price; explicit stored product purchase price fallback",
        valuationSources: stockValuationSources,
        outputGst,
        inputGst,
        netGst,
      }];
      rows = netPostedGstLedgerRows(rows);
      const incomeThroughDate = allRows
        .filter((row: any) => row.accountType === "income")
        .reduce((sum: number, row: any) => sum + row.closingCredit - row.closingDebit, 0);
      const expenseThroughDate = allRows
        .filter((row: any) => row.accountType === "expense")
        .reduce((sum: number, row: any) => sum + row.closingDebit - row.closingCredit, 0);
      const currentEarnings = money(incomeThroughDate - expenseThroughDate);
      rows = [
        ...rows,
        {
          accountId: -1,
          accountCode: "RETAINED-EARNINGS",
          accountName: "Retained Earnings",
          accountType: "equity",
          accountSubtype: "retained_earnings",
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: currentEarnings < 0 ? Math.abs(currentEarnings) : 0,
          periodCredit: currentEarnings > 0 ? currentEarnings : 0,
          closingDebit: currentEarnings < 0 ? Math.abs(currentEarnings) : 0,
          closingCredit: currentEarnings > 0 ? currentEarnings : 0,
          balance: -currentEarnings,
        },
      ];
    }

    const totals = rows.reduce(
      (sum: any, row: any) => {
        sum.openingDebit += row.openingDebit;
        sum.openingCredit += row.openingCredit;
        sum.periodDebit += row.periodDebit;
        sum.periodCredit += row.periodCredit;
        sum.closingDebit += row.closingDebit;
        sum.closingCredit += row.closingCredit;
        return sum;
      },
      { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 }
    );
    Object.keys(totals).forEach((key) => (totals[key] = money(totals[key])));

    const profitLossSummary = reportKey === "profit-loss"
      ? (() => {
          const incomeRows = rows.filter((row: any) => row.accountType === "income");
          const expenseRows = rows.filter((row: any) => row.accountType === "expense");
          const incomeCredits = money(incomeRows.reduce((sum: number, row: any) => sum + row.periodCredit, 0));
          const incomeDebits = money(incomeRows.reduce((sum: number, row: any) => sum + row.periodDebit, 0));
          const expenseDebits = money(expenseRows.reduce((sum: number, row: any) => sum + row.periodDebit, 0));
          const expenseCredits = money(expenseRows.reduce((sum: number, row: any) => sum + row.periodCredit, 0));
          const netIncome = money(incomeCredits - incomeDebits);
          const netExpense = money(expenseDebits - expenseCredits);
          return {
            incomeCredits,
            incomeDebits,
            netIncome,
            expenseDebits,
            expenseCredits,
            netExpense,
            salesIncome: operationalProfitLoss?.salesIncome || 0,
            serviceIncome: operationalProfitLoss?.serviceIncome || 0,
            rentalIncome: operationalProfitLoss?.rentalIncome || 0,
            cogs: operationalProfitLoss?.cogs || 0,
            totalIncome: money(netIncome - (operationalProfitLoss?.cogs || 0)),
            netProfit: money(netIncome - netExpense),
          };
        })()
      : undefined;

    const responseRows = reportKey === "trial-balance"
      ? rows.slice((page - 1) * count, page * count)
      : rows;

    return {
      meta: { reportKey, from, to, currency: "INR", generatedAt: new Date().toISOString(), postedOnly: true },
      rows: responseRows,
      totals,
      ...(reportKey === "trial-balance" ? { total: rows.length, page, count } : {}),
      ...(profitLossSummary ? { summary: profitLossSummary } : {}),
      ...(profitLossDetails ? { details: { invoices: profitLossDetails } } : {}),
      ...(balanceSheetDetails ? { details: balanceSheetDetails } : {}),
      ...(trialBalanceDetails ? { details: trialBalanceDetails } : {}),
      variance: money(
        reportKey === "trial-balance"
          ? totals.periodDebit - totals.periodCredit
          : reportKey === "balance-sheet"
            ? totals.closingDebit - totals.closingCredit
            : 0
      ),
    };
  };

  const getDocumentReport = async (
    request: any,
    reportKey: string,
    from: string,
    to: string,
    organizationId: number
  ) => {
    const { fromEpoch, toEpoch } = epochRange(from, to);
    const { page, count } = getPage(request);
    const offset = (page - 1) * count;
    const search = String(request.query?.search || "").trim();
    const searchPattern = `%${search}%`;
    const status = normalizeFinanceReportStatus(reportKey, request.query?.status);
    const documentType = String(request.query?.documentType || request.query?.billType || "").trim().toLowerCase();
    const category = String(request.query?.category || "").trim().toLowerCase();
    const direction = String(request.query?.direction || "").trim().toLowerCase();

    if (["sales-invoices", "gst-outward"].includes(reportKey)) {
      const [recordsResult, countResult] = await Promise.all([
        query(
          `SELECT r.*,
                  CONCAT_WS(' ', u.firstname, u.lastname) AS partyname,
                  u.gstnumber AS partygstin
           FROM revoinvoice r
           LEFT JOIN users u ON u.id = r.customerid
           WHERE ${REVO_INVOICE_DATE_SECONDS} BETWEEN $1 AND $2
             AND r.organizationid = $9
             AND LOWER(COALESCE(r.paymentstatus, 'pending')) NOT IN ('cancelled','void')
             AND ($3 = '' OR COALESCE(r.invoicenumber, '') ILIKE $4
                  OR CONCAT_WS(' ', u.firstname, u.lastname) ILIKE $4)
             AND ($5 = '' OR LOWER(COALESCE(r.paymentstatus, 'pending')) = $5)
             AND ($6 = '' OR LOWER(COALESCE(r.invoicefor, 'invoice')) = $6)
           ORDER BY ${REVO_INVOICE_DATE_SECONDS} DESC, r.id DESC
           OFFSET $7 LIMIT $8`,
          [fromEpoch, toEpoch, search, searchPattern, status, documentType, offset, count, organizationId]
        ),
        query(
          `SELECT r.id, r.invoicefor, r.invoicedata, r.servicedata, r.summaryinvoicedata,
                  r.supportingdocumentdata, r.totalorderamount, r.taxamount,
                  r.paidamount, r.paymentdata
           FROM revoinvoice r
           LEFT JOIN users u ON u.id = r.customerid
           WHERE ${REVO_INVOICE_DATE_SECONDS} BETWEEN $1 AND $2
             AND r.organizationid = $7
             AND LOWER(COALESCE(r.paymentstatus, 'pending')) NOT IN ('cancelled','void')
             AND ($3 = '' OR COALESCE(r.invoicenumber, '') ILIKE $4
                  OR CONCAT_WS(' ', u.firstname, u.lastname) ILIKE $4)
             AND ($5 = '' OR LOWER(COALESCE(r.paymentstatus, 'pending')) = $5)
             AND ($6 = '' OR LOWER(COALESCE(r.invoicefor, 'invoice')) = $6)`,
          [fromEpoch, toEpoch, search, searchPattern, status, documentType, organizationId]
        ),
      ]);
      const rows = recordsResult.rows.map((invoice: any) => {
        const payment = getRetailInvoicePaymentState(invoice);
        const gst = resolveInvoiceGst(invoice);
        return {
          id: Number(invoice.id),
          date: Number(invoice.invoicedate || invoice.createddate),
          number: invoice.invoicenumber || `INV-${invoice.id}`,
          documentUrl: invoice.invoiceurl || invoice.supportingdocumenturl || null,
          partyName: invoice.partyname || `Customer ${invoice.customerid || "—"}`,
          partyGstin: invoice.partygstin || null,
          documentType: resolveInvoiceDocumentType(invoice),
          taxableValue: money(payment.invoiceAmount - gst.total),
          cgst: gst.cgst,
          sgst: gst.sgst,
          igst: gst.igst,
          tax: gst.total,
          grossAmount: payment.invoiceAmount,
          paidAmount: payment.paidAmount,
          balanceAmount: payment.outstandingAmount,
          status: invoice.paymentstatus || "pending",
        };
      });
      // Use the same validated resolvers for both detail rows and report totals.
      // Legacy paidamount values can exceed an individual invoice, so a raw
      // SQL SUM would overstate paid and incorrectly force balance to zero.
      const summary = countResult.rows.reduce(
        (sum: any, invoice: any) => {
          const payment = getRetailInvoicePaymentState(invoice);
          const gst = resolveInvoiceGst(invoice);
          sum.grossAmount += payment.invoiceAmount;
          sum.tax += gst.total;
          sum.cgst += gst.cgst;
          sum.sgst += gst.sgst;
          sum.igst += gst.igst;
          sum.paidAmount += payment.paidAmount;
          sum.balanceAmount += payment.outstandingAmount;
          return sum;
        },
        { grossAmount: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, paidAmount: 0, balanceAmount: 0 }
      );
      Object.keys(summary).forEach((key) => (summary[key] = money(summary[key])));
      summary.taxableValue = money(summary.grossAmount - summary.tax);
      const reportSummary = reportKey === "gst-outward"
        ? { taxableValue: summary.taxableValue, cgst: summary.cgst, sgst: summary.sgst, igst: summary.igst, tax: summary.tax }
        : summary;
      return { meta: { reportKey, from, to, currency: "INR", generatedAt: new Date().toISOString(), totalsScope: "all_matching_rows" }, rows, summary: reportSummary, total: countResult.rows.length, page, count };
    }

    if (["supplier-bills", "gst-inward"].includes(reportKey)) {
      const [recordsResult, countResult] = await Promise.all([
        query(
          `SELECT b.*, COALESCE(b.supplierid, po.supplierid) AS report_supplierid,
                  s.suppliername AS partyname,
                  COALESCE(b.suppliergstin, po.suppliergstnumber, s.gstnumber) AS partygstin,
                  COALESCE(po.dt_gstnumber, po.io_gstnumber) AS destinationgstin
           FROM poinvoice b
           LEFT JOIN LATERAL (
             SELECT supplierid,suppliergstnumber,dt_gstnumber,io_gstnumber
             FROM purchaseorder WHERE ponumber = b.ponumber ORDER BY id DESC LIMIT 1
           ) po ON TRUE
           LEFT JOIN supplier s ON s.id = COALESCE(b.supplierid, po.supplierid)
           WHERE COALESCE(b.invoicedate, b.createddate) BETWEEN $1 AND $2
             AND LOWER(COALESCE(b.invoicestatus, 'in_progress')) NOT IN ('cancelled','void')
             AND ($3 = '' OR COALESCE(b.invoicenumber, '') ILIKE $4
                  OR COALESCE(s.suppliername, '') ILIKE $4)
             AND ($5 = '' OR LOWER(COALESCE(b.invoicestatus, 'in_progress')) = $5)
             AND ($6 = '' OR LOWER(COALESCE(b.billtype, 'inventory')) = $6)
             AND ($7 = '' OR LOWER(COALESCE(b.expensecategory, '')) = $7)
           ORDER BY COALESCE(b.invoicedate, b.createddate) DESC, b.id DESC
           OFFSET $8 LIMIT $9`,
          [fromEpoch, toEpoch, search, searchPattern, status, documentType, category, offset, count]
        ),
        query(
          `SELECT b.*,
                  COALESCE(b.suppliergstin, po.suppliergstnumber, s.gstnumber) AS partygstin,
                  COALESCE(po.dt_gstnumber, po.io_gstnumber) AS destinationgstin
           FROM poinvoice b
           LEFT JOIN LATERAL (
             SELECT supplierid,suppliergstnumber,dt_gstnumber,io_gstnumber
             FROM purchaseorder WHERE ponumber = b.ponumber ORDER BY id DESC LIMIT 1
           ) po ON TRUE
           LEFT JOIN supplier s ON s.id = COALESCE(b.supplierid, po.supplierid)
           WHERE COALESCE(b.invoicedate, b.createddate) BETWEEN $1 AND $2
             AND LOWER(COALESCE(b.invoicestatus, 'in_progress')) NOT IN ('cancelled','void')
             AND ($3 = '' OR COALESCE(b.invoicenumber, '') ILIKE $4 OR COALESCE(s.suppliername, '') ILIKE $4)
             AND ($5 = '' OR LOWER(COALESCE(b.invoicestatus, 'in_progress')) = $5)
             AND ($6 = '' OR LOWER(COALESCE(b.billtype, 'inventory')) = $6)
             AND ($7 = '' OR LOWER(COALESCE(b.expensecategory, '')) = $7)`,
          [fromEpoch, toEpoch, search, searchPattern, status, documentType, category]
        ),
      ]);
      const billLines: SupplierBillLineDetail[] = [];
      const rows = recordsResult.rows.map((bill: any) => {
        const payment = getSupplierBillPaymentState(bill);
        const gst = resolveBillGst(bill);
        const lines = resolveSupplierBillLineDetails(bill.id, bill.productdata);
        const lineSummary = summarizeSupplierBillLines(lines);
        billLines.push(...lines);
        return {
          id: Number(bill.id), date: Number(bill.invoicedate || bill.createddate), number: bill.invoicenumber || `BILL-${bill.id}`,
          documentUrl: Array.isArray(bill.invoiceurl)
            ? [...bill.invoiceurl].reverse().find((url: unknown) => typeof url === "string" && url.trim()) || null
            : (typeof bill.invoiceurl === "string" && bill.invoiceurl.trim() ? bill.invoiceurl.trim() : null),
          partyName: bill.partyname || `Supplier ${bill.report_supplierid || "—"}`, partyGstin: bill.partygstin || null,
          documentType: bill.billtype || "inventory", category: bill.expensecategory || null, reference: bill.ponumber || null,
          taxableValue: money(payment.invoiceAmount - gst.total), cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst, tax: gst.total,
          grossAmount: payment.invoiceAmount, paidAmount: payment.settledAmount, balanceAmount: payment.outstandingAmount,
          lineCount: lineSummary.lineCount, lineQuantity: lineSummary.totalQuantity,
          lineSubtotal: lineSummary.lineSubtotal, lineVariance: lineSummary.lineVariance,
          status: bill.invoicestatus || "in_progress",
        };
      });
      const summary = countResult.rows.reduce(
        (sum: any, bill: any) => {
          const payment = getSupplierBillPaymentState(bill);
          const gst = resolveBillGst(bill);
          const taxableValue = money(payment.invoiceAmount - gst.total);
          sum.grossAmount += payment.invoiceAmount;
          sum.tax += gst.total;
          sum.cgst += gst.cgst;
          sum.sgst += gst.sgst;
          sum.igst += gst.igst;
          sum.paidAmount += payment.settledAmount;
          sum.balanceAmount += payment.outstandingAmount;
          if (String(bill.billtype || "inventory").trim().toLowerCase() === "expense") sum.operatingExpense += taxableValue;
          else sum.inventoryPurchases += taxableValue;
          return sum;
        },
        { grossAmount: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, paidAmount: 0, balanceAmount: 0, inventoryPurchases: 0, operatingExpense: 0 }
      );
      Object.keys(summary).forEach((key) => (summary[key] = money(summary[key])));
      summary.taxableValue = money(summary.grossAmount - summary.tax);
      const reportSummary = reportKey === "gst-inward"
        ? { taxableValue: summary.taxableValue, cgst: summary.cgst, sgst: summary.sgst, igst: summary.igst, tax: summary.tax }
        : summary;
      return {
        meta: { reportKey, from, to, currency: "INR", generatedAt: new Date().toISOString(), totalsScope: "all_matching_rows" },
        rows,
        details: { billLines },
        summary: reportSummary,
        total: countResult.rows.length,
        page,
        count,
      };
    }

    if (direction === "deposit") {
      const [depositRows, depositTotals] = await Promise.all([
        query(`SELECT d.id,d.depositdate AS date,d.challannumber AS documentnumber,
                      d.financialyear,d.quarter,d.taxamount AS tdsamount,d.interestamount,
                      d.feeamount,d.penaltyamount,d.totalamount,d.status,d.cin,d.bsrcode,
                      d.paymentreference,s.newcode AS sectioncode,s.natureofpayment,
                      'deposit' AS documenttype,'Government' AS partyname
               FROM finance_tds_deposits d LEFT JOIN tds_sections s ON s.id=d.tdssectionid
               WHERE d.organizationid=$1 AND d.depositdate BETWEEN $2 AND $3
                 AND ($4='' OR d.challannumber ILIKE $5 OR COALESCE(d.cin,'') ILIKE $5)
               ORDER BY d.depositdate DESC,d.id DESC OFFSET $6 LIMIT $7`,
          [organizationId,from,to,search,searchPattern,offset,count]),
        query(`SELECT COUNT(*)::int AS total,COALESCE(SUM(taxamount) FILTER (WHERE status IN ('paid','reconciled')),0) AS deposited,
                      COALESCE(SUM(interestamount+feeamount+penaltyamount) FILTER (WHERE status IN ('paid','reconciled')),0) AS charges
               FROM finance_tds_deposits WHERE organizationid=$1 AND depositdate BETWEEN $2 AND $3
                 AND ($4='' OR challannumber ILIKE $5 OR COALESCE(cin,'') ILIKE $5)`, [organizationId,from,to,search,searchPattern]),
      ]);
      return { meta:{reportKey,from,to,currency:"INR",generatedAt:new Date().toISOString(),direction:"deposit",depositsSupported:true}, rows:depositRows.rows,
        summary:{depositedByUs:money(depositTotals.rows[0]?.deposited),interestFeePenalty:money(depositTotals.rows[0]?.charges)}, total:Number(depositTotals.rows[0]?.total||0),page,count };
    }

    const tdsResult = await query(
      `SELECT a.id, t.transactiondate AS date, t.partytype, t.partyid, t.partyname,
              a.documenttype, a.documentid, a.documentnumber, a.allocationamount,
              a.tdsamount, a.totalsettledamount, a.status,
              s.newcode AS sectioncode, s.natureofpayment, s.rate,
              t.transactionnumber, b.accountname AS bankaccountname,
              COALESCE(sales_document.invoiceurl, purchase_bill_document.invoiceurl) AS documenturl
       FROM bank_transaction_allocations a
       JOIN bank_transactions t ON t.id = a.banktransactionid
       LEFT JOIN tds_sections s ON s.id = a.tdssectionid
       LEFT JOIN bank_cash_accounts b ON b.id = t.bankcashaccountid
       LEFT JOIN revoinvoice sales_document
         ON a.documenttype = 'sales_invoice' AND sales_document.id = a.documentid
       LEFT JOIN poinvoice purchase_bill_document
         ON a.documenttype = 'purchase_bill' AND purchase_bill_document.id = a.documentid
       WHERE t.organizationid = $1 AND t.postingstatus = 'posted'
         AND a.tdsapplied = TRUE AND a.tdsamount > 0
         AND t.transactiondate BETWEEN $2 AND $3
         AND ($4 = '' OR ($4='customer' AND a.documenttype='sales_invoice') OR ($4='company' AND a.documenttype='purchase_bill'))
         AND ($5 = '' OR COALESCE(t.partyname,'') ILIKE $6 OR COALESCE(a.documentnumber,'') ILIKE $6 OR COALESCE(s.newcode,'') ILIKE $6)
       ORDER BY t.transactiondate DESC, a.id DESC
       OFFSET $7 LIMIT $8`,
      [organizationId, from, to, direction, search, searchPattern, offset, count]
    );
    const totalResult = await query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(a.tdsamount),0) AS tdsamount,
              COALESCE(SUM(a.tdsamount) FILTER (WHERE a.documenttype='sales_invoice'),0) AS customerdeducted,
              COALESCE(SUM(a.tdsamount) FILTER (WHERE a.documenttype='purchase_bill'),0) AS companydeducted
       FROM bank_transaction_allocations a JOIN bank_transactions t ON t.id = a.banktransactionid
       LEFT JOIN tds_sections s ON s.id = a.tdssectionid
       WHERE t.organizationid=$1 AND t.postingstatus='posted' AND a.tdsapplied=TRUE AND a.tdsamount>0
         AND t.transactiondate BETWEEN $2 AND $3
         AND ($4 = '' OR ($4='customer' AND a.documenttype='sales_invoice') OR ($4='company' AND a.documenttype='purchase_bill'))
         AND ($5 = '' OR COALESCE(t.partyname,'') ILIKE $6 OR COALESCE(a.documentnumber,'') ILIKE $6 OR COALESCE(s.newcode,'') ILIKE $6)`,
      [organizationId, from, to, direction, search, searchPattern]
    );
    const depositSummary = await query(`SELECT COALESCE(SUM(taxamount),0) AS deposited FROM finance_tds_deposits WHERE organizationid=$1 AND status IN ('paid','reconciled') AND depositdate BETWEEN $2 AND $3`, [organizationId,from,to]);
    return { meta: { reportKey, from, to, currency: "INR", generatedAt: new Date().toISOString(), depositsSupported: true }, rows: tdsResult.rows, summary: { tdsAmount: money(totalResult.rows[0]?.tdsamount), deductedByCustomers: money(totalResult.rows[0]?.customerdeducted), deductedByUs: money(totalResult.rows[0]?.companydeducted), depositedByUs: money(depositSummary.rows[0]?.deposited) }, total: Number(totalResult.rows[0]?.total || 0), page, count };
  };
}
