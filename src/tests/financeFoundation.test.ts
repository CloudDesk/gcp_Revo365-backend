import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv = require("ajv");
import {
  FinanceValidationError,
  calculateAvailableBalance,
  calculateLedgerBalance,
  formatTdsSectionDisplayName,
  maskAccountNumber,
  normalizeAccountType,
  normalizeEntrySide,
  protectAccountNumber,
  requireIsoDate,
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
import {
  applyRetailInvoiceAllocation,
  getRetailInvoicePaymentState,
  getRetailInvoicesOutstandingTotal,
  isRentalInvoice,
  isRetailStoreInvoice,
  isRetailStoreProductOrder,
  isServiceRequestInvoice,
  resolveCustomerReceiptSourceType,
  resolveCustomerReceiptAllocationMethod,
  resolveRetailInvoiceAmount,
} from "../utils/finance/retailReceipt.utils.js";
import {
  assertSupplierBillCanBeModified,
  assertSupplierTdsMapping,
  applySupplierBillAllocation,
  assertSupplierBillTotalWithinPurchaseOrder,
  getSupplierBillPaymentState,
  isSupplierBillOpen,
  resolveSupplierBillStatus,
  validateSupplierBillProductInput,
} from "../utils/finance/supplierBill.utils.js";
import {
  createChartAccountSchema,
  createDirectBankTransactionSchema,
  applyCustomerOnAccountSchema,
  applySupplierOnAccountSchema,
  createRetailReceiptSchema,
  createSupplierPaymentSchema,
} from "../schemas/finance.schema.js";
import {
  FINANCE_SOURCE_TYPES,
  getCustomerReceiptSourceTypes,
  getRetailReceiptSourceTypes,
  resolveAgainstDocumentSourceId,
} from "../utils/finance/financeSource.utils.js";
import {
  getBillGstSummary,
  getInvoiceGstSummary,
  parseGstMoney,
  resolveInvoiceGst,
} from "../utils/finance/gstSummary.utils.js";
import {
  buildCustomerStatement,
  toCustomerStatementDate,
} from "../utils/finance/customerStatement.utils.js";
import {
  extractDeliverableInvoiceLines,
  validateManualDeliveryLines,
  validateDeliveryQuantities,
} from "../utils/finance/deliveryChallan.utils.js";
import {
  assertOnAccountMovementBalance,
  calculateOnAccountAvailableFromMovements,
  deriveOnAccountStatus,
  formatOnAccountReferenceNumber,
  normalizeOnAccountPartyType,
  normalizeOnAccountStatusFilter,
  resolveOnAccountAllocationMethod,
  isOnAccountReferenceReconciled,
  validateOnAccountSettlementAmounts,
  buildOnAccountApplicationMatrix,
  buildOnAccountReadScope,
  summarizeOnAccountStatement,
} from "../utils/finance/onAccount.utils.js";
import { requireFinancePermission } from "../services/financeAccess.service.js";
import {
  allocateOnAccountReferenceNumber,
  findOnAccountMovementByIdempotency,
  lockOnAccountReferences,
} from "../services/onAccountFoundation.service.js";

describe("On Account Phase 1 foundation", () => {
  test("formats stable Customer and Supplier reference numbers", () => {
    assert.equal(formatOnAccountReferenceNumber("customer", 1), "OA-C-00000001");
    assert.equal(formatOnAccountReferenceNumber("SUPPLIER", 42), "OA-S-00000042");
    assert.equal(normalizeOnAccountPartyType(" Customer "), "customer");
    assert.throws(
      () => formatOnAccountReferenceNumber("ledger", 1),
      FinanceValidationError
    );
    assert.throws(
      () => formatOnAccountReferenceNumber("customer", 0),
      FinanceValidationError
    );
  });

  test("derives the lifecycle from original, used, and available amounts", () => {
    assert.equal(deriveOnAccountStatus(1000, 0, 1000), "open");
    assert.equal(deriveOnAccountStatus(1000, 250, 750), "partially_applied");
    assert.equal(deriveOnAccountStatus(1000, 1000, 0), "fully_applied");
    assert.equal(deriveOnAccountStatus(1000, 0, 1000, true), "reversed");
    assert.throws(
      () => deriveOnAccountStatus(1000, 500, 400),
      FinanceValidationError
    );
  });

  test("reconciles append-only increases and decreases", () => {
    const movements = [
      { direction: "increase" as const, amount: 1000 },
      { direction: "decrease" as const, amount: 250 },
      { direction: "decrease" as const, amount: 100 },
    ];
    assert.equal(calculateOnAccountAvailableFromMovements(movements), 650);
    assert.equal(assertOnAccountMovementBalance(650, movements), 650);
    assert.throws(
      () => assertOnAccountMovementBalance(700, movements),
      (error: any) =>
        error instanceof FinanceValidationError &&
        error.code === "ON_ACCOUNT_RECONCILIATION_FAILED"
    );
  });

  test("keeps TDS outside the On Account bank portion", () => {
    assert.deepEqual(validateOnAccountSettlementAmounts(45000, 5000), {
      bankportion: 45000,
      tdsamount: 5000,
      totalsettlement: 50000,
    });
    assert.throws(
      () => validateOnAccountSettlementAmounts(0, 5000),
      FinanceValidationError
    );
    assert.throws(
      () => validateOnAccountSettlementAmounts(45000, -1),
      FinanceValidationError
    );
  });

  test("allocates organization-scoped reference numbers from the database counter", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return { rows: [{ lastnumber: "7" }] };
      },
    };
    assert.equal(
      await allocateOnAccountReferenceNumber(client, 3, "customer"),
      "OA-C-00000007"
    );
    assert.deepEqual(calls[0].values, [3, "customer"]);
    assert.match(calls[0].text, /ON CONFLICT \(organizationid, partytype\)/);
  });

  test("locks references in a stable order and rejects reversed references", async () => {
    const client = {
      query: async (_text: string, values?: unknown[]) => ({
        rows: (values?.[1] as number[]).map((id) => ({
          id,
          status: id === 2 ? "reversed" : "open",
        })),
      }),
    };
    await assert.rejects(
      () => lockOnAccountReferences(client, 1, [3, 2]),
      (error: any) =>
        error instanceof FinanceValidationError &&
        error.code === "ON_ACCOUNT_REFERENCE_REVERSED"
    );
    await assert.rejects(
      () => lockOnAccountReferences(client, 1, [3, 3]),
      FinanceValidationError
    );
  });

  test("returns an existing idempotent movement when present", async () => {
    const client = {
      query: async (_text: string, values?: unknown[]) => ({
        rows: [{ id: 9, idempotencykey: values?.[1] }],
      }),
    };
    const movement = await findOnAccountMovementByIdempotency(
      client,
      1,
      "request-100",
      2
    );
    assert.equal(movement.id, 9);
    assert.equal(movement.idempotencykey, "request-100");
  });
});

describe("On Account Phase 3 read model", () => {
  test("normalizes supported reference status filters", () => {
    assert.equal(normalizeOnAccountStatusFilter(undefined), null);
    assert.equal(normalizeOnAccountStatusFilter(" Open "), "open");
    assert.equal(
      normalizeOnAccountStatusFilter("PARTIALLY_APPLIED"),
      "partially_applied"
    );
    assert.equal(
      normalizeOnAccountStatusFilter("fully_applied"),
      "fully_applied"
    );
    assert.equal(normalizeOnAccountStatusFilter("reversed"), "reversed");
    assert.throws(
      () => normalizeOnAccountStatusFilter("pending"),
      FinanceValidationError
    );
  });

  test("compares displayed available value with the movement ledger at money precision", () => {
    assert.equal(isOnAccountReferenceReconciled("1000.00", "1000"), true);
    assert.equal(isOnAccountReferenceReconciled(1000, 999.99), false);
  });
});

describe("On Account Phase 4 Customer Invoice application", () => {
  test("distributes one reference across multiple Invoices", () => {
    assert.deepEqual(
      buildOnAccountApplicationMatrix(
        [{ referenceid: 1, amount: 1000 }],
        [
          { invoiceid: 10, bankportion: 400, tdsamount: 0 },
          { invoiceid: 11, bankportion: 600, tdsamount: 0 },
        ]
      ),
      [
        { referenceid: 1, invoiceid: 10, bankportion: 400, tdsamount: 0, totalsettlement: 400 },
        { referenceid: 1, invoiceid: 11, bankportion: 600, tdsamount: 0, totalsettlement: 600 },
      ]
    );
  });

  test("distributes multiple references to one Invoice and counts TDS once", () => {
    assert.deepEqual(
      buildOnAccountApplicationMatrix(
        [
          { referenceid: 1, amount: 300 },
          { referenceid: 2, amount: 700 },
        ],
        [{ invoiceid: 10, bankportion: 1000, tdsamount: 100 }]
      ),
      [
        { referenceid: 1, invoiceid: 10, bankportion: 300, tdsamount: 100, totalsettlement: 400 },
        { referenceid: 2, invoiceid: 10, bankportion: 700, tdsamount: 0, totalsettlement: 700 },
      ]
    );
  });

  test("rejects a mismatch between selected references and Invoice bank portions", () => {
    assert.throws(
      () =>
        buildOnAccountApplicationMatrix(
          [{ referenceid: 1, amount: 999 }],
          [{ invoiceid: 10, bankportion: 1000, tdsamount: 0 }]
        ),
      FinanceValidationError
    );
  });

  test("validates the Phase 4 request contract", () => {
    const validate = new Ajv({ strict: false }).compile(
      applyCustomerOnAccountSchema as any
    );
    assert.equal(
      validate({
        customerid: 7,
        applicationdate: "2026-08-18",
        requestreference: "oa-application-request-1",
        referenceallocations: [{ referenceid: 1, amount: 900 }],
        invoiceallocations: [
          {
            invoiceid: 10,
            bankportion: 900,
            tdsapplied: true,
            tdsamount: 100,
          },
        ],
      }),
      true
    );
  });
});

describe("On Account Phase 6 Supplier read model", () => {
  test("scopes Supplier references by Organization and party type", () => {
    assert.deepEqual(buildOnAccountReadScope(7, "supplier"), {
      params: [7],
      conditions: ["r.organizationid = $1", "r.partytype = 'supplier'"],
    });
    assert.deepEqual(buildOnAccountReadScope(7, "customer"), {
      params: [7],
      conditions: ["r.organizationid = $1", "r.partytype = 'customer'"],
    });
    assert.throws(() => buildOnAccountReadScope(0, "supplier"), FinanceValidationError);
    assert.throws(() => buildOnAccountReadScope(7, "vendor"), FinanceValidationError);
  });

  test("keeps Supplier lifecycle totals and movement reconciliation consistent", () => {
    assert.equal(deriveOnAccountStatus(1000, 0, 1000), "open");
    assert.equal(deriveOnAccountStatus(1000, 300, 700), "partially_applied");
    assert.equal(deriveOnAccountStatus(1000, 1000, 0), "fully_applied");
    assert.equal(isOnAccountReferenceReconciled(700, 700), true);
    assert.equal(isOnAccountReferenceReconciled(700, 699.99), false);
  });
});

describe("On Account Phase 7 Supplier Bill application", () => {
  test("distributes multiple Supplier references across multiple Bills", () => {
    assert.deepEqual(
      buildOnAccountApplicationMatrix(
        [
          { referenceid: 41, amount: 400 },
          { referenceid: 42, amount: 600 },
        ],
        [
          { invoiceid: 81, bankportion: 750, tdsamount: 50 },
          { invoiceid: 82, bankportion: 250, tdsamount: 0 },
        ]
      ),
      [
        { referenceid: 41, invoiceid: 81, bankportion: 400, tdsamount: 50, totalsettlement: 450 },
        { referenceid: 42, invoiceid: 81, bankportion: 350, tdsamount: 0, totalsettlement: 350 },
        { referenceid: 42, invoiceid: 82, bankportion: 250, tdsamount: 0, totalsettlement: 250 },
      ]
    );
  });

  test("settles a Supplier Bill with OA Bank Portion and TDS Payable", () => {
    const result = applySupplierBillAllocation(
      { id: 81, invoicenumber: "BILL-81", invoiceamount: 1000, paymentdata: [] },
      900,
      100
    );
    assert.equal(result.allocationAmount, 900);
    assert.equal(result.tdsAmount, 100);
    assert.equal(result.totalSettledAmount, 1000);
    assert.equal(result.balanceAmount, 0);
  });

  test("rejects excessive settlement and invalid Supplier TDS mapping", () => {
    assert.throws(
      () => applySupplierBillAllocation(
        { id: 81, invoicenumber: "BILL-81", invoiceamount: 1000, paymentdata: [] },
        900,
        101
      ),
      /exceeds its outstanding amount/
    );
    assert.throws(
      () => assertSupplierTdsMapping(true, 100, null),
      /valid TDS section/
    );
  });

  test("validates the Phase 7 Supplier application contract", () => {
    const validate = new Ajv({ strict: false }).compile(
      applySupplierOnAccountSchema as any
    );
    assert.equal(
      validate({
        supplierid: 5,
        applicationdate: "2026-08-19",
        requestreference: "supplier-oa-application-1",
        referenceallocations: [{ referenceid: 41, amount: 900 }],
        billallocations: [{
          billid: 81,
          bankportion: 900,
          tdsapplied: true,
          tdssectionid: 2,
          tdsamount: 100,
        }],
      }),
      true
    );
    assert.equal(
      validate({
        supplierid: 5,
        applicationdate: "2026-08-19",
        requestreference: "supplier-oa-application-2",
        referenceallocations: [{ referenceid: 41, amount: 900 }],
        billallocations: [{ billid: 81, bankportion: 900, unexpected: true }],
      }),
      false
    );
  });
});

describe("On Account Phase 8 statements and release controls", () => {
  test("calculates opening, period movement, TDS, and closing availability", () => {
    const result = summarizeOnAccountStatement(
      [
        { eventdate: "2026-08-01", direction: "increase", amount: 1000 },
        { eventdate: "2026-08-05", direction: "decrease", amount: 200, tdsamount: 20 },
        { eventdate: "2026-08-10", direction: "increase", amount: 500 },
        { eventdate: "2026-08-20", direction: "decrease", amount: 300, tdsamount: 30 },
      ],
      "2026-08-05",
      "2026-08-10"
    );
    assert.equal(result.openingavailable, 1000);
    assert.equal(result.increases, 500);
    assert.equal(result.decreases, 200);
    assert.equal(result.tdssettled, 20);
    assert.equal(result.closingavailable, 1300);
    assert.equal(result.period.length, 2);
  });

  test("keeps TDS outside availability while retaining it in statement reporting", () => {
    const result = summarizeOnAccountStatement([
      { eventdate: "2026-08-01", direction: "increase", amount: 1000 },
      { eventdate: "2026-08-02", direction: "decrease", amount: 900, tdsamount: 100 },
    ]);
    assert.equal(result.closingavailable, 100);
    assert.equal(result.tdssettled, 100);
  });

  test("rejects invalid statement periods and movement audit values", () => {
    assert.throws(
      () => summarizeOnAccountStatement([], "2026-08-10", "2026-08-01"),
      /From Date cannot be later/
    );
    assert.throws(
      () => summarizeOnAccountStatement([
        { eventdate: "invalid", direction: "increase", amount: 100 },
      ]),
      /eventdate must use YYYY-MM-DD/
    );
  });

  test("denies On Account finance access to missing and non-finance roles", async () => {
    const responses: any[] = [];
    const reply = {
      status(code: number) {
        return { send: (payload: any) => responses.push({ code, payload }) };
      },
    };
    const middleware = requireFinancePermission("read");
    await middleware({ session: {} }, reply);
    await middleware({ session: { role: "sales" } }, reply);
    assert.equal(responses.length, 2);
    assert.deepEqual(responses.map((item) => item.code), [403, 403]);
    assert.ok(responses.every((item) => item.payload.error.code === "FINANCE_ACCESS_DENIED"));
  });
});

describe("Delivery Challan Phase 3 quantity rules", () => {
  const invoiceLines = extractDeliverableInvoiceLines({
    items: [
      { id: 1, orderlineid: 792, name: "Laptop", quantity: 10 },
      { id: 2, productid: 44, productname: "Dock", quantity: 2 },
    ],
  });

  test("extracts stable Invoice line keys from legacy Invoice JSON", () => {
    assert.deepEqual(invoiceLines, [
      {
        invoicelinekey: "orderline:792",
        productid: null,
        productname: "Laptop",
        invoicequantity: 10,
        unit: "Nos",
        unitrate: null,
        lineamount: null,
      },
      {
        invoicelinekey: "item:2",
        productid: 44,
        productname: "Dock",
        invoicequantity: 2,
        unit: "Nos",
        unitrate: null,
        lineamount: null,
      },
    ]);
  });

  test("allows partial delivery up to the server-calculated remaining quantity", () => {
    const lines = validateDeliveryQuantities(
      invoiceLines,
      new Map([["orderline:792", 4]]),
      [{ invoicelinekey: "orderline:792", deliveryquantity: 6 }]
    );
    assert.equal(lines[0].deliveryquantity, 6);
  });

  test("rejects over-delivery and duplicate submitted lines", () => {
    assert.throws(
      () => validateDeliveryQuantities(
        invoiceLines,
        new Map([["orderline:792", 4]]),
        [{ invoicelinekey: "orderline:792", deliveryquantity: 7 }]
      ),
      FinanceValidationError
    );
    assert.throws(
      () => validateDeliveryQuantities(
        invoiceLines,
        new Map(),
        [
          { invoicelinekey: "item:2", deliveryquantity: 1 },
          { invoicelinekey: "item:2", deliveryquantity: 1 },
        ]
      ),
      FinanceValidationError
    );
  });

  test("validates Manual/General lines without Invoice data", () => {
    assert.deepEqual(validateManualDeliveryLines([
      { productname: "Demo equipment", deliveryquantity: 2, unit: "Nos", assetreference: "RFID-1" },
    ]), [{
      linesource: "custom",
      productid: null,
      productname: "Demo equipment",
      deliveryquantity: 2,
      unit: "Nos",
      assetreference: "RFID-1",
    }]);
    assert.throws(
      () => validateManualDeliveryLines([{ productname: "Demo equipment", deliveryquantity: 0, unit: "Nos" }]),
      FinanceValidationError
    );
  });
});

describe("Customer Statement Phase 3 foundation", () => {
  test("orders Invoice and Customer Payment rows and calculates running receivable", () => {
    const statement = buildCustomerStatement([
      {
        id: "payment-1",
        sourceid: 1,
        transactiontype: "customer_payment",
        transactiondate: "2026-08-11",
        reference: "BT-1",
        description: "Receipt",
        invoiceamount: 0,
        paymentamount: 400,
        settledamount: 400,
        tdsamount: 0,
        unappliedamount: 0,
      },
      {
        id: "invoice-1",
        sourceid: 1,
        transactiontype: "invoice",
        transactiondate: "2026-08-10",
        reference: "INV-1",
        description: "Invoice",
        invoiceamount: 1000,
        paymentamount: 0,
        settledamount: 0,
        tdsamount: 0,
        unappliedamount: 0,
      },
    ]);

    assert.equal(statement.records[0].reference, "INV-1");
    assert.equal(statement.records[0].balance, 1000);
    assert.equal(statement.records[1].balance, 600);
    assert.equal(statement.summary.closingreceivable, 600);
  });

  test("uses pre-period rows for the opening receivable", () => {
    const statement = buildCustomerStatement(
      [
        {
          id: "invoice-1",
          sourceid: 1,
          transactiontype: "invoice",
          transactiondate: "2026-07-01",
          reference: "INV-1",
          description: "Invoice",
          invoiceamount: 1000,
          paymentamount: 0,
          settledamount: 0,
          tdsamount: 0,
          unappliedamount: 0,
        },
        {
          id: "payment-1",
          sourceid: 1,
          transactiontype: "customer_payment",
          transactiondate: "2026-08-02",
          reference: "BT-1",
          description: "Receipt",
          invoiceamount: 0,
          paymentamount: 250,
          settledamount: 250,
          tdsamount: 0,
          unappliedamount: 0,
        },
      ],
      { fromdate: "2026-08-01", todate: "2026-08-31" }
    );

    assert.equal(statement.summary.openingreceivable, 1000);
    assert.equal(statement.summary.closingreceivable, 750);
  });

  test("serializes epoch Invoice dates in the India business date", () => {
    assert.equal(toCustomerStatementDate(1786386600), "2026-08-11");
  });
});

describe("Chart of Accounts Phase 1", () => {
  test("requires Account Type, Account Name, and Account Code", () => {
    assert.deepEqual(createChartAccountSchema.required, [
      "accounttype",
      "accountname",
      "accountcode",
    ]);
    assert.equal(
      (createChartAccountSchema.properties.description as any).maxLength,
      2000
    );
  });
});

describe("Chart of Accounts Phase 2", () => {
  test("Direct Ledger Entry requires its account, date, narration, side, and amount", () => {
    assert.deepEqual(createDirectBankTransactionSchema.required, [
      "transactiondate",
      "counterpartyaccountid",
      "entryname",
      "entryside",
      "amount",
    ]);
    assert.equal(
      (createDirectBankTransactionSchema.properties.amount as any)
        .exclusiveMinimum,
      0
    );
  });

  test("summarizes invoice Output GST amounts across supported sales flows", () => {
    assert.deepEqual(
      getInvoiceGstSummary([
        {
          invoicefor: "product",
          taxamount: 180,
          invoicedata: { taxmode: "cgst_sgst", cgst: 90, sgst: 90 },
        },
        {
          invoicefor: "rental",
          taxamount: 360,
          invoicedata: { taxmode: "igst", igstamount: 360 },
        },
        {
          invoicefor: "service",
          taxamount: 90,
          invoicedata: { taxtype: "intra_state", cgst: 9, sgst: 9 },
        },
        { invoicefor: "penalty", taxamount: 999 },
      ]),
      { igst: 360, cgst: 135, sgst: 135, total: 630 }
    );
  });

  test("summarizes supplier Bill Input GST from tax amounts, not rates", () => {
    assert.deepEqual(
      getBillGstSummary([
        { payabletaxamount: 1800, cgst: 9, sgst: 9 },
        { payabletaxamount: 500, cgst: 0, sgst: 0 },
      ]),
      { igst: 0, cgst: 1150, sgst: 1150, total: 2300 }
    );
  });

  test("reads only the first amount from legacy formatted tax text", () => {
    assert.equal(parseGstMoney("₹6,896.55 (CGST ₹3,448.28)"), 6896.55);
    assert.deepEqual(
      resolveInvoiceGst({
        invoicefor: "service",
        taxamount: "₹6,896.55 (CGST ₹3,448.28)",
        invoicedata: { taxtype: "intra_state", cgst: 9, sgst: 9 },
      }),
      { igst: 0, cgst: 3448.28, sgst: 3448.27, total: 6896.55 }
    );
  });
});

describe("Chart of Accounts Phase 3", () => {
  test("uses debit balances for Assets and Expenses", () => {
    assert.equal(calculateLedgerBalance("asset", 50000, 10000), 40000);
    assert.equal(calculateLedgerBalance("expense", 50000, 10000), 40000);
  });

  test("uses credit balances for Liabilities, Equity, and Income", () => {
    assert.equal(calculateLedgerBalance("liability", 10000, 50000), 40000);
    assert.equal(calculateLedgerBalance("equity", 10000, 50000), 40000);
    assert.equal(calculateLedgerBalance("income", 10000, 50000), 40000);
  });

  test("Amount Receivable sums canonical invoice outstanding balances", () => {
    assert.equal(
      getRetailInvoicesOutstandingTotal([
        {
          totalorderamount: 1000,
          paidamount: 250,
          paymentdata: [],
        },
        {
          totalorderamount: 500,
          paidamount: 500,
          paymentdata: [],
        },
      ]),
      750
    );
  });
});

describe("Cash and Bank foundation calculations", () => {
  test("Debit increases available balance", () => {
    assert.equal(calculateAvailableBalance(10000, "debit", 5000), 15000);
  });

  test("Credit decreases available balance", () => {
    assert.equal(calculateAvailableBalance(10000, "credit", 3000), 7000);
  });

  test("Money values are normalized to two decimal places", () => {
    assert.equal(toMoney(10.005), 10.01);
    assert.equal(toMoney("90.10"), 90.1);
  });

  test("Transaction amount must be greater than zero", () => {
    assert.throws(
      () => requirePositiveMoney(0),
      (error: any) =>
        error instanceof FinanceValidationError &&
        error.message === "amount must be greater than zero."
    );
  });
});

describe("Cash and Bank foundation validation", () => {
  test("Retail receipt schema accepts TDS allocation fields", () => {
    const allocationSchema = (createRetailReceiptSchema.properties.allocations as any)
      .items;

    assert.deepEqual(
      Object.keys(allocationSchema.properties).sort(),
      ["allocationamount", "invoiceid", "tdsamount", "tdsapplied"].sort()
    );
  });

  test("Customer receipt schema accepts retail, rental, and customer-workspace modes", () => {
    assert.deepEqual(
      (createRetailReceiptSchema.properties.receiptmode as any).enum,
      ["retail", "rental", "all"]
    );
  });

  test("Customer receipt allocation method defaults to the existing invoice flow", () => {
    assert.equal(
      resolveCustomerReceiptAllocationMethod(undefined),
      "against_document"
    );
    assert.equal(
      resolveCustomerReceiptAllocationMethod("on_account"),
      "on_account"
    );
    assert.throws(
      () => resolveCustomerReceiptAllocationMethod("advance"),
      FinanceValidationError
    );
  });

  test("Customer receipt schema keeps legacy allocations and permits allocation-free On Account receipts", () => {
    const validate = new Ajv({ strict: false }).compile(
      createRetailReceiptSchema as any
    );
    const base = {
      transactiondate: "2026-08-18",
      customerid: 7,
      amount: 1000,
      requestreference: "phase-2-request-001",
    };

    assert.equal(
      validate({
        ...base,
        allocations: [{ invoiceid: 11, allocationamount: 1000 }],
      }),
      true
    );
    assert.equal(
      validate({
        ...base,
        allocationmethod: "on_account",
        allocations: [],
      }),
      true
    );
    assert.equal(
      validate({ ...base, allocationmethod: "on_account" }),
      true
    );
    assert.equal(
      validate({ ...base, allocationmethod: "against_document" }),
      false
    );
    assert.equal(
      validate({
        ...base,
        allocationmethod: "on_account",
        allocations: [{ invoiceid: 11, allocationamount: 1000 }],
      }),
      false
    );
  });

  test("Supplier payment schema accepts bill and TDS Payable fields", () => {
    const allocationSchema = (
      createSupplierPaymentSchema.properties.allocations as any
    ).items;

    assert.deepEqual(
      Object.keys(allocationSchema.properties).sort(),
      [
        "allocationamount",
        "billid",
        "tdsamount",
        "tdsapplied",
        "tdssectionid",
      ].sort()
    );
  });

  test("Supplier payment allocation method defaults to the existing bill flow", () => {
    assert.equal(resolveOnAccountAllocationMethod(undefined), "against_document");
    assert.equal(resolveOnAccountAllocationMethod("on_account"), "on_account");
    assert.throws(
      () => resolveOnAccountAllocationMethod("advance"),
      FinanceValidationError
    );
  });

  test("Supplier payment schema preserves bill payments and permits allocation-free advances", () => {
    const validate = new Ajv({ strict: false }).compile(
      createSupplierPaymentSchema as any
    );
    const base = {
      transactiondate: "2026-08-18",
      supplierid: 9,
      amount: 2500,
      requestreference: "phase-5-request-001",
    };

    assert.equal(
      validate({
        ...base,
        allocations: [{ billid: 15, allocationamount: 2500 }],
      }),
      true
    );
    assert.equal(
      validate({ ...base, allocationmethod: "on_account", allocations: [] }),
      true
    );
    assert.equal(validate({ ...base, allocationmethod: "on_account" }), true);
    assert.equal(
      validate({ ...base, allocationmethod: "against_document" }),
      false
    );
    assert.equal(
      validate({
        ...base,
        allocationmethod: "on_account",
        allocations: [{ billid: 15, allocationamount: 2500 }],
      }),
      false
    );
  });

  test("TDS Receivable and TDS Payable schema amounts allow zero", () => {
    const receiptAllocation = (
      createRetailReceiptSchema.properties.allocations as any
    ).items;
    const paymentAllocation = (
      createSupplierPaymentSchema.properties.allocations as any
    ).items;

    assert.equal(receiptAllocation.properties.tdsamount.minimum, 0);
    assert.equal(paymentAllocation.properties.tdsamount.minimum, 0);
  });

  test("Account and entry types are normalized", () => {
    assert.equal(normalizeAccountType(" BANK "), "bank");
    assert.equal(normalizeAccountType("cash"), "cash");
    assert.equal(normalizeEntrySide("Debit"), "debit");
    assert.equal(normalizeEntrySide(" CREDIT "), "credit");
  });

  test("Invalid accounting date is rejected", () => {
    assert.equal(requireIsoDate("2026-07-30", "date"), "2026-07-30");
    assert.throws(() => requireIsoDate("2026-02-30", "date"));
    assert.throws(() => requireIsoDate("30/07/2026", "date"));
  });

  test("PostgreSQL DATE values are serialized without a timezone shift", () => {
    assert.equal(
      toFinanceDateOnly(new Date(2026, 6, 31)),
      "2026-07-31"
    );
    assert.equal(toFinanceDateOnly("2026-07-31"), "2026-07-31");
  });
});

describe("Finance source classification", () => {
  test("New E-commerce and Retail entries use the approved source types", () => {
    assert.equal(FINANCE_SOURCE_TYPES.ecommerceOrder, "ecommerce_order");
    assert.equal(FINANCE_SOURCE_TYPES.customerReceipt, "customer_receipt");
    assert.equal(
      FINANCE_SOURCE_TYPES.customerOnAccount,
      "customer_on_account"
    );
    assert.equal(FINANCE_SOURCE_TYPES.retailReceipt, "retail_receipt");
    assert.equal(
      FINANCE_SOURCE_TYPES.serviceRequestReceipt,
      "service_request_receipt"
    );
    assert.equal(FINANCE_SOURCE_TYPES.rentalReceipt, "rental_receipt");
    assert.equal(
      FINANCE_SOURCE_TYPES.supplierBillPayment,
      "supplier_bill_payment"
    );
    assert.equal(
      FINANCE_SOURCE_TYPES.supplierOnAccount,
      "supplier_on_account"
    );
  });

  test("Customer receipt filters include single-source and mixed receipts", () => {
    assert.deepEqual(getCustomerReceiptSourceTypes(), [
      "customer_receipt",
      "customer_on_account",
      "retail_receipt",
      "retail_instore_receipt",
      "service_request_receipt",
      "rental_receipt",
    ]);
  });

  test("Legacy Retail source type remains readable for idempotent retries", () => {
    assert.deepEqual(getRetailReceiptSourceTypes(), [
      "retail_receipt",
      "retail_instore_receipt",
    ]);
  });

  test("A single document uses its order reference as transaction source ID", () => {
    assert.equal(
      resolveAgainstDocumentSourceId(["ORDER-1001"], "request-1001"),
      "ORDER-1001"
    );
  });

  test("A multi-document receipt uses the idempotent request reference", () => {
    assert.equal(
      resolveAgainstDocumentSourceId(
        ["ORDER-1001", "ORDER-1002"],
        "request-1001"
      ),
      "request-1001"
    );
  });
});

describe("Supplier bill payment allocation", () => {
  const openBill = {
    id: 34,
    invoicenumber: "SUP-INV-34",
    invoiceamount: 50000,
    balanceamount: 50000,
    paymentdata: [],
    invoicestatus: "in_progress",
    iscreditpayment: true,
    paymentduedate: 2_000_000_000,
  };

  test("Multiple Bills can exactly consume the Purchase Order total", () => {
    const result = assertSupplierBillTotalWithinPurchaseOrder(
      1_000_000,
      600_000,
      400_000
    );

    assert.equal(result.aggregateBillTotal, 1_000_000);
    assert.equal(result.remainingAmount, 0);
  });

  test("Aggregate Bill amount cannot exceed the Purchase Order total", () => {
    assert.throws(
      () =>
        assertSupplierBillTotalWithinPurchaseOrder(
          1_000_000,
          600_000,
          400_001
        ),
      /exceeds the remaining purchase order amount 400000/
    );
  });

  test("Bill product quantity must be a whole number greater than zero", () => {
    assert.throws(
      () => validateSupplierBillProductInput("Apple MacBook M3", 0),
      /whole number greater than 0/
    );
    assert.deepEqual(
      validateSupplierBillProductInput("Apple MacBook M3", "2"),
      { productName: "Apple MacBook M3", quantity: 2 }
    );
  });

  test("Bill product name rejects null and false-like values", () => {
    for (const invalidName of [null, undefined, false, "", "null", "false"]) {
      assert.throws(
        () => validateSupplierBillProductInput(invalidName, 1),
        /Product Name must contain a valid value/
      );
    }
  });

  test("Bank payment and TDS Payable settle the Supplier bill together", () => {
    const result = applySupplierBillAllocation(openBill, 45000, 5000);

    assert.equal(result.allocationAmount, 45000);
    assert.equal(result.tdsAmount, 5000);
    assert.equal(result.totalSettledAmount, 50000);
    assert.equal(result.balanceAmount, 0);
  });

  test("Multiple Cash and Bank transactions can settle the same Supplier bill", () => {
    const firstTransaction = applySupplierBillAllocation(openBill, 10000, 0);
    const billAfterFirstTransaction = {
      ...openBill,
      balanceamount: firstTransaction.balanceAmount,
      paymentdata: [
        {
          paymentamount: firstTransaction.allocationAmount,
          tdsamount: firstTransaction.tdsAmount,
          settlementamount: firstTransaction.totalSettledAmount,
          status: "success",
        },
      ],
    };
    const secondTransaction = applySupplierBillAllocation(
      billAfterFirstTransaction,
      30000,
      10000
    );

    assert.equal(firstTransaction.balanceAmount, 40000);
    assert.equal(secondTransaction.totalSettledAmount, 40000);
    assert.equal(secondTransaction.settledAmount, 50000);
    assert.equal(secondTransaction.balanceAmount, 0);
    assert.equal(
      resolveSupplierBillStatus(
        billAfterFirstTransaction,
        secondTransaction.balanceAmount,
        1_900_000_000
      ),
      "complete"
    );
  });

  test("Existing settlement history includes TDS when deriving outstanding", () => {
    const state = getSupplierBillPaymentState({
      ...openBill,
      paymentdata: [
        {
          paymentamount: 18000,
          tdsamount: 2000,
          settlementamount: 20000,
          status: "success",
        },
      ],
      balanceamount: 30000,
    });

    assert.deepEqual(state, {
      invoiceAmount: 50000,
      settledAmount: 20000,
      outstandingAmount: 30000,
    });
  });

  test("Cash and Bank allocations are included when deriving Bill settlement", () => {
    const state = getSupplierBillPaymentState({
      ...openBill,
      paymentdata: [
        {
          paymentamount: 5000,
          settlementamount: 5000,
          status: "success",
        },
      ],
      balanceamount: 45000,
      finance_settled_amount: 12000,
    });

    assert.deepEqual(state, {
      invoiceAmount: 50000,
      settledAmount: 12000,
      outstandingAmount: 38000,
    });
  });

  test("A legacy bill without a stored balance uses its payment history", () => {
    const state = getSupplierBillPaymentState({
      ...openBill,
      balanceamount: null,
      paymentdata: [],
    });

    assert.deepEqual(state, {
      invoiceAmount: 50000,
      settledAmount: 0,
      outstandingAmount: 50000,
    });
  });

  test("Total bank and TDS settlement cannot exceed bill outstanding", () => {
    assert.throws(
      () => applySupplierBillAllocation(openBill, 48000, 2001),
      /Total settlement.*exceeds its outstanding amount/
    );
  });

  test("Completed and cancelled bills are not eligible", () => {
    assert.equal(isSupplierBillOpen(openBill), true);
    assert.equal(
      isSupplierBillOpen({ ...openBill, invoicestatus: "cancelled" }),
      false
    );
    assert.equal(
      isSupplierBillOpen({ ...openBill, invoicestatus: "complete" }),
      false
    );
  });

  test("A Supplier bill is locked after its first Cash and Bank transaction", () => {
    assert.doesNotThrow(() => assertSupplierBillCanBeModified(false));
    assert.throws(
      () => assertSupplierBillCanBeModified(true),
      /cannot be updated or deleted because a Cash & Bank transaction/
    );
  });

  test("Supplier TDS requires a section when enabled and allows zero amount", () => {
    assert.doesNotThrow(() => assertSupplierTdsMapping(true, 0, 2));
    assert.throws(
      () => assertSupplierTdsMapping(true, 0, null),
      /valid TDS section is required/
    );
    assert.doesNotThrow(() => assertSupplierTdsMapping(false, 0, null));
  });

  test("Bill status preserves overdue completion semantics", () => {
    assert.equal(resolveSupplierBillStatus(openBill, 0, 1_900_000_000), "complete");
    assert.equal(
      resolveSupplierBillStatus(openBill, 0, 2_100_000_000),
      "overdue_complete"
    );
    assert.equal(
      resolveSupplierBillStatus(openBill, 1000, 2_100_000_000),
      "overdue"
    );
  });
});

describe("TDS section dropdown", () => {
  test("Display name follows nature, code, and rate format", () => {
    assert.equal(
      formatTdsSectionDisplayName(
        "Commission or Brokerage - others",
        "1006",
        "2%"
      ),
      "Commission or Brokerage - others 1006(2%)"
    );
  });
});

describe("E-commerce automatic finance entry", () => {
  test("Only online product orders are eligible", () => {
    assert.equal(
      isEligibleEcommerceOrder([
        { ordername: "Online", invoicefor: "Product" },
      ]),
      true
    );
    assert.equal(
      isEligibleEcommerceOrder([
        { ordername: "StorePurchase", invoicefor: "Product" },
      ]),
      false
    );
    assert.equal(
      isEligibleEcommerceOrder([
        { ordername: "Rental", invoicefor: "Product Rental" },
      ]),
      false
    );
    assert.equal(
      isEligibleEcommerceOrder([
        { ordername: "Online", invoicefor: "Product" },
        { ordername: "Rental", invoicefor: "Product Rental" },
      ]),
      false
    );
  });

  test("Razorpay provider, method, and payment reference are resolved", () => {
    const transaction = {
      razorpay_payment_id: "pay_1001",
      transactiondata: { method: "upi" },
    };
    assert.equal(resolveEcommercePaymentProvider(transaction), "razorpay");
    assert.equal(resolveEcommercePaymentMethod(transaction, []), "upi");
    assert.equal(
      resolveEcommercePaymentReference(transaction),
      "pay_1001"
    );
  });

  test("PhonePe successful payment is resolved without Razorpay fields", () => {
    const transaction = {
      transactionid: "TXN-1002",
      transactiondata: {
        code: "PAYMENT_SUCCESS",
        data: { paymentInstrument: { type: "PAY_PAGE" } },
      },
    };
    assert.equal(resolveEcommercePaymentProvider(transaction), "phonepe");
    assert.equal(
      resolveEcommercePaymentMethod(transaction, []),
      "pay_page"
    );
    assert.equal(
      resolveEcommercePaymentReference(transaction),
      "TXN-1002"
    );
  });

  test("Payment date uses the India accounting date", () => {
    const utcBoundaryEpoch = Math.floor(
      new Date("2026-07-30T20:00:00.000Z").getTime() / 1000
    );
    assert.equal(
      resolveEcommercePaymentDate({
        transactiondata: { created_at: utcBoundaryEpoch },
      }),
      "2026-07-31"
    );
    assert.equal(
      resolveEcommercePaymentDate({
        createddate: utcBoundaryEpoch * 1000,
      }),
      "2026-07-31"
    );
  });

  test("Customer name prefers the registered customer identity", () => {
    assert.equal(
      buildEcommerceCustomerName(
        {
          firstname: "Asha",
          lastname: "Kumar",
          useremail: "asha@example.com",
        },
        { name: "Checkout Name" }
      ),
      "Asha Kumar"
    );
    assert.equal(
      buildEcommerceCustomerName(
        { useremail: "asha@example.com" },
        { name: "Checkout Name" }
      ),
      "asha@example.com"
    );
  });
});

describe("Retail in-store receipt allocation", () => {
  const manualStoreInvoice = {
    id: 378,
    invoicenumber: "TEQIT-Invoice-00270",
    invoicefor: "product",
    invoicedata: {
      ordername: "storepurchase",
      total: "₹23,500",
    },
    paidamount: 0,
    paymentdata: [],
  };

  test("Manual-store invoice amount and eligibility are resolved", () => {
    assert.equal(
      isRetailStoreProductOrder({
        ordername: "StorePurchase",
        invoicefor: "Product",
      }),
      true
    );
    assert.equal(isRetailStoreInvoice(manualStoreInvoice), true);
    assert.equal(resolveRetailInvoiceAmount(manualStoreInvoice), 23500);
    assert.deepEqual(getRetailInvoicePaymentState(manualStoreInvoice), {
      invoiceAmount: 23500,
      paidAmount: 0,
      outstandingAmount: 23500,
    });
  });

  test("Online, rental, and service orders retain their existing payment flow", () => {
    assert.equal(
      isRetailStoreProductOrder({ ordername: "online", invoicefor: "product" }),
      false
    );
    assert.equal(
      isRetailStoreProductOrder({
        ordername: "rental",
        invoicefor: "product rental",
      }),
      false
    );
    assert.equal(
      isRetailStoreProductOrder({
        ordername: "storepurchase",
        invoicefor: "service",
      }),
      false
    );
  });

  test("Service Request invoice eligibility is isolated from retail eligibility", () => {
    const serviceInvoice = {
      id: 501,
      invoicenumber: "TEQIT-Invoice-00501",
      invoicefor: "service",
      ticketnumber: "SR-000501",
      totalorderamount: 10000,
    };

    assert.equal(isServiceRequestInvoice(serviceInvoice), true);
    assert.equal(isRetailStoreInvoice(serviceInvoice), false);
    assert.equal(
      isServiceRequestInvoice({ ...serviceInvoice, ticketnumber: "" }),
      false
    );
    assert.equal(isServiceRequestInvoice(manualStoreInvoice), false);
    assert.equal(isRetailStoreInvoice(manualStoreInvoice), true);
  });

  test("Partial allocation calculates the remaining balance and status", () => {
    const result = applyRetailInvoiceAllocation(
      manualStoreInvoice,
      10000
    );
    assert.equal(result.paidAmount, 10000);
    assert.equal(result.balanceAmount, 13500);
    assert.equal(result.paymentStatus, "partially_paid");
  });

  test("Full allocation marks the invoice paid", () => {
    const result = applyRetailInvoiceAllocation(
      manualStoreInvoice,
      23500
    );
    assert.equal(result.balanceAmount, 0);
    assert.equal(result.paymentStatus, "paid");
  });

  test("TDS Receivable settles the invoice without increasing the bank allocation", () => {
    const invoice = {
      ...manualStoreInvoice,
      invoicedata: {
        ordername: "storepurchase",
        total: "₹1,00,000",
      },
    };
    const result = applyRetailInvoiceAllocation(invoice, 50000, 10000);

    assert.equal(result.allocationAmount, 50000);
    assert.equal(result.tdsAmount, 10000);
    assert.equal(result.totalSettledAmount, 60000);
    assert.equal(result.paidAmount, 60000);
    assert.equal(result.balanceAmount, 40000);
    assert.equal(result.paymentStatus, "partially_paid");
  });

  test("Manual in-store TDS Receivable does not depend on a statutory section", () => {
    const result = applyRetailInvoiceAllocation(
      {
        ...manualStoreInvoice,
        invoicedata: {
          ordername: "storepurchase",
          total: "₹1,00,000",
        },
      },
      50000,
      10000
    );

    assert.equal(result.tdsAmount, 10000);
    assert.equal(result.balanceAmount, 40000);
  });

  test("TDS settlement remains part of invoice paid history", () => {
    const state = getRetailInvoicePaymentState({
      ...manualStoreInvoice,
      invoicedata: {
        ordername: "storepurchase",
        total: "₹1,00,000",
      },
      paymentdata: [
        {
          paymentamount: 50000,
          tdsamount: 10000,
          settlementamount: 60000,
          status: "success",
        },
      ],
    });

    assert.deepEqual(state, {
      invoiceAmount: 100000,
      paidAmount: 60000,
      outstandingAmount: 40000,
    });
  });

  test("Allocation cannot exceed the outstanding invoice amount", () => {
    assert.throws(
      () => applyRetailInvoiceAllocation(manualStoreInvoice, 23501),
      /exceeds its outstanding amount/
    );
  });

  test("Allocation plus TDS cannot exceed the outstanding invoice amount", () => {
    assert.throws(
      () => applyRetailInvoiceAllocation(manualStoreInvoice, 23000, 501),
      /Total settlement.*exceeds its outstanding amount/
    );
  });
});

describe("Rental invoice receipt allocation", () => {
  const rentalInvoice = {
    id: 601,
    invoicenumber: "TEQIT-Rental-00601",
    invoicefor: "rental",
    totalorderamount: 12000,
    paidamount: 0,
    paymentdata: [],
  };

  test("Rental eligibility is isolated from existing retail and service flows", () => {
    assert.equal(isRentalInvoice(rentalInvoice), true);
    assert.equal(isRetailStoreInvoice(rentalInvoice), false);
    assert.equal(isServiceRequestInvoice(rentalInvoice), false);
    assert.equal(
      resolveCustomerReceiptSourceType([rentalInvoice]),
      "rental_receipt"
    );
  });

  test("Rental receipt allocation updates the shared invoice balance correctly", () => {
    const result = applyRetailInvoiceAllocation(rentalInvoice, 7000, 500);
    assert.equal(result.paidAmount, 7500);
    assert.equal(result.balanceAmount, 4500);
    assert.equal(result.paymentStatus, "partially_paid");
  });

  test("Legacy order payments do not pre-settle a rental receivable", () => {
    const state = getRetailInvoicePaymentState({
      ...rentalInvoice,
      paidamount: 12000,
      balanceamount: 0,
      paymentstatus: "paid",
      paymentdata: [
        {
          paymentamount: 12000,
          settlementamount: 12000,
          source: "order_payment",
          status: "success",
        },
      ],
    });

    assert.deepEqual(state, {
      invoiceAmount: 12000,
      paidAmount: 0,
      outstandingAmount: 12000,
    });
  });

  test("Rental receipts remain counted when a legacy order payment is present", () => {
    const state = getRetailInvoicePaymentState({
      ...rentalInvoice,
      paidamount: 12000,
      balanceamount: 0,
      paymentstatus: "paid",
      paymentdata: [
        {
          paymentamount: 12000,
          settlementamount: 12000,
          source: "order_payment",
          status: "success",
        },
        {
          paymentamount: 7000,
          settlementamount: 7000,
          source: "finance_rental_receipt",
          status: "success",
        },
      ],
    });

    assert.deepEqual(state, {
      invoiceAmount: 12000,
      paidAmount: 7000,
      outstandingAmount: 5000,
    });
  });
});

describe("Bank account number protection", () => {
  const key = "finance-test-key-with-at-least-16-characters";

  test("Full account number is encrypted and only last four digits are displayed", () => {
    const protectedValue = protectAccountNumber("1234 5678 9012", key);

    assert.ok(protectedValue.encrypted.startsWith("v1:"));
    assert.equal(protectedValue.last4, "9012");
    assert.equal(maskAccountNumber(protectedValue.last4), "****9012");
    assert.equal(protectedValue.encrypted.includes("123456789012"), false);
  });

  test("Hash is deterministic while ciphertext uses a random IV", () => {
    const first = protectAccountNumber("123456789012", key);
    const second = protectAccountNumber("123456789012", key);

    assert.equal(first.hash, second.hash);
    assert.notEqual(first.encrypted, second.encrypted);
  });

  test("Missing encryption key is rejected", () => {
    assert.throws(
      () => protectAccountNumber("123456789012", undefined),
      (error: any) =>
        error instanceof FinanceValidationError &&
        error.code === "FINANCE_ENCRYPTION_KEY_MISSING"
    );
  });
});
