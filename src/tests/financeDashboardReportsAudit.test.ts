import assert from "node:assert/strict";
import test from "node:test";
import { auditFinanceDashboard, auditFinanceReport } from "../utils/finance/financeReportAudit.utils.js";
import { buildNetGstBalanceSheetRow, invoiceIncludesCogs, resolveBillGst } from "../utils/finance/gstSummary.utils.js";
import { fillMonthlyFinanceTrend, listFinanceMonths, normalizeFinanceEpochSeconds } from "../utils/finance/financeDate.utils.js";
import { buildInventoryStockValuation } from "../utils/finance/inventoryStockValuation.utils.js";
import { classifyM4Document, requiredM4Movement } from "../utils/finance/m4Reconciliation.utils.js";
import { buildOutwardIstPortalDetails, buildOutwardIstPortalRows } from "../utils/finance/outwardIstPortal.utils.js";

test("builds the statutory Outward IST portal categories without populating fixed-zero rows", () => {
  const rows = buildOutwardIstPortalRows([
    { isbusinessuser: true, invoicefor: "product", totalorderamount: 118000, taxamount: 18000, invoicedata: { taxmode: "cgst_sgst", cgstamount: 9000, sgstamount: 9000 } },
    { isbusinessuser: false, customerstate: "Karnataka", invoicefor: "product", totalorderamount: 118001, taxamount: 18001, invoicedata: { taxmode: "igst", igstamount: 18001, ordername: "Online" } },
    { isbusinessuser: false, customerstate: "Tamil Nadu", invoicefor: "service", totalorderamount: 59000, taxamount: 9000, invoicedata: { taxtype: "intra_state", cgst: 9, sgst: 9 } },
  ]);
  assert.equal(rows.length, 11);
  assert.deepEqual(rows[0], { code: "b2b", description: rows[0].description, igstAmount: 0, cgstAmount: 9000, sgstAmount: 9000, invoiceTotal: 118000 });
  assert.equal(rows[1].igstAmount, 18001); assert.equal(rows[1].invoiceTotal, 118001);
  assert.ok(rows.slice(2, 8).every(row => row.igstAmount === 0 && row.cgstAmount === 0 && row.sgstAmount === 0 && row.invoiceTotal === 0));
  assert.equal(rows[8].invoiceTotal, 118000); assert.equal(rows[9].invoiceTotal, 177001);
  assert.equal(rows[10].igstAmount, 18001);
});

test("Outward IST drill-down invoices reconcile to every clickable amount", () => {
  const invoices = [
    { id: 1, invoicenumber: "B2B-1", isbusinessuser: true, invoicefor: "product", totalorderamount: 118000, taxamount: 18000, invoicedata: { taxmode: "cgst_sgst", cgstamount: 9000, sgstamount: 9000 } },
    { id: 2, invoicenumber: "B2C-1", isbusinessuser: false, customerstate: "Karnataka", invoicefor: "product", totalorderamount: 118001, taxamount: 18001, invoicedata: { taxmode: "igst", igstamount: 18001, ordername: "Online" } },
  ];
  const rows = buildOutwardIstPortalRows(invoices);
  const details = buildOutwardIstPortalDetails(invoices);
  for (const row of rows.filter(row => ["b2b", "b2cl", "hsn-b2b", "hsn-b2c", "ecommerce"].includes(row.code))) {
    for (const key of ["igstAmount", "cgstAmount", "sgstAmount", "invoiceTotal"] as const) {
      assert.equal(details[row.code].reduce((sum, detail) => sum + Number(detail[key] || 0), 0), row[key]);
    }
  }
});

test("values Balance Sheet stock using available catalogue and owned rental units only", () => {
  const stock = buildInventoryStockValuation([
    { stocktype: "on_catalogue_product", stockstatus: "Available", quantity: 2, amount: 2000 },
    { stocktype: "off_catalogue_product", stockstatus: "Available", quantity: 3, amount: 4500 },
    { stocktype: "rental_product", stockstatus: "Available", quantity: 4, amount: 8000 },
    { stocktype: "rental_product", stockstatus: "Rental Sold", quantity: 1, amount: 2000 },
    { stocktype: "rental_product", stockstatus: "Reserved for Rental", quantity: 5, amount: 10000 },
    { stocktype: "on_catalogue_product", stockstatus: "Sold", quantity: 6, amount: 6000 },
  ]);
  assert.equal(stock.quantity, 10);
  assert.equal(stock.amount, 16500);
  assert.deepEqual(stock.breakdown, {
    onCatalogueAvailableQuantity: 2,
    offCatalogueAvailableQuantity: 3,
    rentalAvailableQuantity: 4,
    rentalSoldQuantity: 1,
    onCatalogueAvailableAmount: 2000,
    offCatalogueAvailableAmount: 4500,
    rentalAvailableAmount: 8000,
    rentalSoldAmount: 2000,
  });
});

test("classifies M4 document exceptions and derives safe control-account movement", () => {
  assert.equal(classifyM4Document({difference:0.01,directJournalCount:1,hasRelatedControlLine:true,hasOtherSource:false,reversed:false}),"matched");
  assert.equal(classifyM4Document({difference:-100,directJournalCount:0,hasRelatedControlLine:true,hasOtherSource:false,reversed:false}),"missing");
  assert.equal(classifyM4Document({difference:100,directJournalCount:2,hasRelatedControlLine:true,hasOtherSource:false,reversed:false}),"duplicated");
  assert.equal(classifyM4Document({difference:100,directJournalCount:0,hasRelatedControlLine:false,hasOtherSource:true,reversed:false}),"misclassified");
  assert.equal(classifyM4Document({difference:100,directJournalCount:1,hasRelatedControlLine:true,hasOtherSource:false,reversed:true}),"reversed");
  assert.deepEqual(requiredM4Movement("ar",-2876723.25),{amount:2876723.25,side:"debit"});
  assert.deepEqual(requiredM4Movement("ap",-3082163),{amount:3082163,side:"credit"});
});

test("classifies Net GST on exactly one Balance Sheet side", () => {
  const credit = buildNetGstBalanceSheetRow(-180713.24);
  assert.equal(credit?.accountType, "asset"); assert.equal(credit?.closingDebit, 180713.24); assert.equal(credit?.closingCredit, 0);
  const payable = buildNetGstBalanceSheetRow(1250.5);
  assert.equal(payable?.accountType, "liability"); assert.equal(payable?.closingDebit, 0); assert.equal(payable?.closingCredit, 1250.5);
  assert.equal(buildNetGstBalanceSheetRow(0), null);
});

test("includes only product sales in COGS", () => {
  assert.equal(invoiceIncludesCogs({ invoicefor: "product", invoicedata: { items: [{ quantity: 1 }] } }), true);
  assert.equal(invoiceIncludesCogs({ invoicefor: "service", servicedata: { items: [{ quantity: 1 }] } }), false);
  assert.equal(invoiceIncludesCogs({ invoicefor: "rental", invoicedata: { items: [{ quantity: 1 }] } }), false);
  assert.equal(invoiceIncludesCogs({ invoicefor: "service", invoicedata: { items: [{ quantity: 1 }] }, servicedata: { items: [{ quantity: 1 }] } }), true);
});

test("normalizes legacy seconds and current millisecond invoice dates", () => {
  assert.equal(normalizeFinanceEpochSeconds(1785974400), 1785974400);
  assert.equal(normalizeFinanceEpochSeconds(1785974400000), 1785974400);
  assert.equal(normalizeFinanceEpochSeconds("1785974400000"), 1785974400);
  assert.equal(normalizeFinanceEpochSeconds(null, 123), 123);
  assert.equal(normalizeFinanceEpochSeconds(Number.NaN, 456), 456);
});

test("fills every selected dashboard month including zero and cross-year periods", () => {
  assert.deepEqual(listFinanceMonths("2026-01-01", "2026-08-24"), [
    "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
  ]);
  assert.deepEqual(fillMonthlyFinanceTrend("2025-11-15", "2026-02-02", [
    { period: "2025-12", income: 100, expense: 40 },
    { period: "2026-02", income: 25, expense: -5 },
  ]), [
    { period: "2025-11", income: 0, expense: 0 },
    { period: "2025-12", income: 100, expense: 40 },
    { period: "2026-01", income: 0, expense: 0 },
    { period: "2026-02", income: 25, expense: -5 },
  ]);
});

test("audits Dashboard monetary equations", () => {
  assert.deepEqual(auditFinanceDashboard(
    { metrics: { postedIncome: 1000, postedExpense: 400, netProfit: 600, inventoryPurchases: 250, operatingExpense: 150, expense: 400 } },
    { gst: { outward: { total: 180 }, inward: { total: 90 }, net: 90 } }
  ), []);
});

test("audits the complete TDS payable reconciliation", () => {
  const baseMetrics = {
    postedIncome: 1000, postedExpense: 400, netProfit: 600,
    inventoryPurchases: 250, operatingExpense: 150, expense: 400,
    openingTdsPayable: 0, tdsDeductedByUs: 33232,
    tdsPayableAdjustments: 1000, tdsDepositedByUs: 0, tdsPayable: 34232,
  };
  const insights = { gst: { outward: { total: 180 }, inward: { total: 90 }, net: 90 } };
  assert.deepEqual(auditFinanceDashboard({ metrics: baseMetrics }, insights), []);
  const issues = auditFinanceDashboard({ metrics: { ...baseMetrics, tdsPayable: 33232 } }, insights);
  assert.ok(issues.some(issue => issue.scope === "dashboard.tds"));
});

test("audits Dashboard outstanding totals against ageing and ledger reconciliation", () => {
  const summary = { metrics: {
    postedIncome: 1000, postedExpense: 400, netProfit: 600,
    inventoryPurchases: 250, operatingExpense: 150, expense: 400,
    receivables: 300, payables: 200,
    ledgerReceivables: 300, ledgerPayables: 200,
    receivablesLedgerVariance: 0, payablesLedgerVariance: 0,
  } };
  const insights = {
    receivablesAgeing: { current: 100, "1-30": 200 },
    payablesAgeing: { current: 50, "1-30": 150 },
    gst: { outward: { total: 180 }, inward: { total: 90 }, net: 90 },
  };
  assert.deepEqual(auditFinanceDashboard(summary, insights), []);
  const issues = auditFinanceDashboard(
    { metrics: { ...summary.metrics, receivables: 250, ledgerPayables: -200, payablesLedgerVariance: -400 } },
    insights
  );
  assert.ok(issues.some(issue => issue.message.includes("Receivables Ageing")));
  assert.ok(issues.some(issue => issue.message.includes("AP ledger")));
});

test("audits Sales, Supplier, Inward GST and Outward GST equations", () => {
  const row = { number: "1", date: 1786989502, partyName: "Party", documentType: "service", taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180, grossAmount: 1180, paidAmount: 500, balanceAmount: 680 };
  const summary = { taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180, grossAmount: 1180, paidAmount: 500, balanceAmount: 680, inventoryPurchases: 1000, operatingExpense: 0 };
  for (const key of ["sales-invoices", "supplier-bills", "gst-inward", "gst-outward"])
    assert.deepEqual(auditFinanceReport(key, { rows: [row], summary }), []);
});

test("audits P&L, Balance Sheet and Trial Balance equations", () => {
  assert.deepEqual(auditFinanceReport("profit-loss", { rows: [{ accountType: "income", periodDebit: 0, periodCredit: 100 }, { accountType: "expense", periodDebit: 40, periodCredit: 0 }] }), []);
  assert.deepEqual(auditFinanceReport("balance-sheet", { rows: [], variance: 0 }), []);
  assert.deepEqual(auditFinanceReport("trial-balance", { totals: { periodDebit: 500, periodCredit: 500, closingDebit: 900, closingCredit: 900 }, variance: 0 }), []);
});

test("audits TDS deduction and deposit values", () => {
  assert.deepEqual(auditFinanceReport("tds-summary", { rows: [{ tdsamount: 100 }, { documenttype: "deposit", tdsamount: 100, interestamount: 5, feeamount: 2, penaltyamount: 3, totalamount: 110 }] }), []);
});

test("detects material monetary mismatches", () => {
  const issues = auditFinanceReport("supplier-bills", { rows: [{ number: "bad", taxableValue: 1000, cgst: 90, sgst: 90, igst: 10, tax: 180, grossAmount: 1200, paidAmount: 500, balanceAmount: 600 }], summary: {} });
  assert.ok(issues.length >= 3);
});

test("audits required Sales Invoice identity, date and mutually exclusive GST fields", () => {
  const correct = { number: "INV-1", date: 1786989502, partyName: "Customer", documentType: "service", taxableValue: 100, cgst: 9, sgst: 9, igst: 0, tax: 18, grossAmount: 118, paidAmount: 50, balanceAmount: 68 };
  const summary = { taxableValue: 100, tax: 18, grossAmount: 118, paidAmount: 50, balanceAmount: 68 };
  assert.deepEqual(auditFinanceReport("sales-invoices", { rows: [correct], summary }), []);
  assert.deepEqual(auditFinanceReport("sales-invoices", { rows: [{ ...correct, date: 1786989502000 }], summary }), []);
  const issues = auditFinanceReport("sales-invoices", { rows: [{ ...correct, number: "", date: "bad", partyName: "", documentType: "", cgst: 4, sgst: 4, igst: 10 }], summary });
  assert.ok(issues.some(issue => issue.message.includes("number")));
  assert.ok(issues.some(issue => issue.message.includes("date")));
  assert.ok(issues.some(issue => issue.message.includes("Party")));
  assert.ok(issues.some(issue => issue.message.includes("type")));
  assert.ok(issues.some(issue => issue.message.includes("IGST cannot")));
});

test("audits Outward GST component totals independently from Sales payment totals", () => {
  const row = { number: "INV-GST", date: 1786989502, partyName: "Customer", documentType: "product", taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180, grossAmount: 1180 };
  assert.deepEqual(auditFinanceReport("gst-outward", { rows: [row], summary: { taxableValue: 1000, cgst: 90, sgst: 90, igst: 0, tax: 180 } }), []);
  const issues = auditFinanceReport("gst-outward", { rows: [row], summary: { taxableValue: 1000, cgst: 90, sgst: 80, igst: 0, tax: 180 } });
  assert.ok(issues.some(issue => issue.scope === "gst-outward.summary"));
});

test("accepts one-paise rounding tolerance and rejects larger differences", () => {
  const base = { number: "rounding", date: 1786989502, partyName: "Party", documentType: "service", taxableValue: 100, cgst: 9, sgst: 9, igst: 0, tax: 18, grossAmount: 118.01, paidAmount: 50, balanceAmount: 68.01 };
  assert.deepEqual(auditFinanceReport("sales-invoices", { rows: [base], summary: base }), []);
  assert.ok(auditFinanceReport("sales-invoices", { rows: [{ ...base, grossAmount: 118.02 }], summary: base }).length > 0);
});

test("covers explicit IGST, interstate GSTIN, intrastate GSTIN and no-GSTIN fallback", () => {
  assert.deepEqual(resolveBillGst({ payabletaxamount: 180, igst: 18, cgst: 0, sgst: 0 }), { igst: 180, cgst: 0, sgst: 0, total: 180 });
  assert.deepEqual(resolveBillGst({ payabletaxamount: 180, cgst: 9, sgst: 9, suppliergstin: "29ABCDE1234F1Z5", destinationgstin: "33ABCDE1234F1Z5" }), { igst: 180, cgst: 0, sgst: 0, total: 180 });
  assert.deepEqual(resolveBillGst({ payabletaxamount: 180, cgst: 9, sgst: 9, suppliergstin: "33ABCDE1234F1Z5", destinationgstin: "33ABCDE9999F1Z5" }), { igst: 0, cgst: 90, sgst: 90, total: 180 });
  assert.deepEqual(resolveBillGst({ payabletaxamount: 180, cgst: 9, sgst: 9 }), { igst: 0, cgst: 90, sgst: 90, total: 180 });
});

test("detects Dashboard profit, bill split and GST failures independently", () => {
  const issues = auditFinanceDashboard(
    { metrics: { postedIncome: 1000, postedExpense: 300, netProfit: 600, inventoryPurchases: 200, operatingExpense: 50, expense: 300 } },
    { gst: { outward: { total: 180 }, inward: { total: 80 }, net: 90 } }
  );
  assert.equal(issues.length, 3);
});

test("detects P&L wrong account types and invalid movements", () => {
  const issues = auditFinanceReport("profit-loss", { rows: [{ accountType: "asset", periodDebit: -1, periodCredit: Number.NaN }] });
  assert.equal(issues.length, 3);
});

test("audits P&L expense credits, signed net expense and net profit formula", () => {
  const rows = [
    { accountType: "income", periodDebit: 0, periodCredit: 10000 },
    { accountType: "expense", periodDebit: 87000, periodCredit: 100000 },
  ];
  const summary = { incomeCredits: 10000, incomeDebits: 0, netIncome: 10000, cogs: 4000, totalIncome: 6000, expenseDebits: 87000, expenseCredits: 100000, netExpense: -13000, netProfit: 23000 };
  assert.deepEqual(auditFinanceReport("profit-loss", { rows, summary }), []);
  assert.ok(auditFinanceReport("profit-loss", { rows, summary: { ...summary, netProfit: -3000 } }).some(issue => issue.message.includes("Net Profit")));
  assert.ok(auditFinanceReport("profit-loss", { rows, summary: { ...summary, totalIncome: 7000 } }).some(issue => issue.message.includes("Net Income")));
});

test("detects Balance Sheet wrong account types and variance", () => {
  const issues = auditFinanceReport("balance-sheet", { rows: [{ accountType: "income" }], variance: 10 });
  assert.equal(issues.length, 2);
});

test("audits standard Balance Sheet presentation equation", () => {
  const rows = [
    { accountType: "asset", closingDebit: 7068562, closingCredit: 0 },
    { accountType: "liability", closingDebit: 0, closingCredit: 6934562 },
    { accountType: "equity", closingDebit: 0, closingCredit: 134000 },
  ];
  assert.deepEqual(auditFinanceReport("balance-sheet", { rows, variance: 0 }), []);
  assert.ok(auditFinanceReport("balance-sheet", { rows: [{ ...rows[0], closingDebit: 7068563 }, ...rows.slice(1)], variance: 0 }).some(issue => issue.message.includes("Assets")));
});

test("detects Trial Balance period, closing and reported variance failures", () => {
  const issues = auditFinanceReport("trial-balance", { totals: { periodDebit: 100, periodCredit: 90, closingDebit: 200, closingCredit: 180 }, variance: 10 });
  assert.equal(issues.length, 3);
});

test("accepts correct TDS deduction/deposit equations and rejects incorrect ones", () => {
  const valid = { rows: [
    { documenttype: "purchase_bill", allocationamount: 900, tdsamount: 100, totalsettledamount: 1000, sectioncode: "1009" },
    { documenttype: "deposit", tdsamount: 100, interestamount: 5, feeamount: 2, penaltyamount: 3, totalamount: 110 },
  ] };
  assert.deepEqual(auditFinanceReport("tds-summary", valid), []);
  const invalid = { rows: [
    { documenttype: "purchase_bill", allocationamount: 900, tdsamount: 100, totalsettledamount: 999, sectioncode: "1009" },
    { documenttype: "deposit", tdsamount: 100, interestamount: 5, feeamount: 2, penaltyamount: 3, totalamount: 109 },
    { documenttype: "sales_invoice", tdsamount: -1 },
  ] };
  assert.equal(auditFinanceReport("tds-summary", invalid).length, 3);
});

test("audits TDS direction summary and supplier section mapping", () => {
  const rows = [
    { documenttype: "sales_invoice", allocationamount: 20000, tdsamount: 2000, totalsettledamount: 22000 },
    { documenttype: "purchase_bill", allocationamount: 55000, tdsamount: 5000, totalsettledamount: 60000, sectioncode: "1009" },
  ];
  const summary = { deductedByCustomers: 2000, deductedByUs: 5000, tdsAmount: 7000, depositedByUs: 0 };
  assert.deepEqual(auditFinanceReport("tds-summary", { rows, summary }), []);
  const issues = auditFinanceReport("tds-summary", { rows: [{ ...rows[1], sectioncode: "" }], summary: { deductedByCustomers: 1, deductedByUs: 2, tdsAmount: 4 } });
  assert.ok(issues.some(issue => issue.message.includes("section code")));
  assert.ok(issues.some(issue => issue.scope === "tds-summary.summary"));
});

test("detects Supplier Bill inventory/expense summary mismatch", () => {
  const issues = auditFinanceReport("supplier-bills", {
    rows: [],
    summary: { taxableValue: 1000, tax: 180, grossAmount: 1180, paidAmount: 500, balanceAmount: 680, inventoryPurchases: 700, operatingExpense: 200 },
  });
  assert.equal(issues.length, 1);
});
