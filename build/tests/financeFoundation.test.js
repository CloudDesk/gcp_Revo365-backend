import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FinanceValidationError, calculateAvailableBalance, calculateLedgerBalance, formatTdsSectionDisplayName, maskAccountNumber, normalizeAccountType, normalizeEntrySide, protectAccountNumber, requireIsoDate, requirePositiveMoney, toFinanceDateOnly, toMoney, } from "../utils/finance/finance.utils.js";
import { buildEcommerceCustomerName, isEligibleEcommerceOrder, resolveEcommercePaymentDate, resolveEcommercePaymentMethod, resolveEcommercePaymentProvider, resolveEcommercePaymentReference, } from "../utils/finance/ecommerceFinance.utils.js";
import { applyRetailInvoiceAllocation, getRetailInvoicePaymentState, getRetailInvoicesOutstandingTotal, isRentalInvoice, isRetailStoreInvoice, isRetailStoreProductOrder, isServiceRequestInvoice, resolveCustomerReceiptSourceType, resolveRetailInvoiceAmount, } from "../utils/finance/retailReceipt.utils.js";
import { assertSupplierBillCanBeModified, assertSupplierTdsMapping, applySupplierBillAllocation, assertSupplierBillTotalWithinPurchaseOrder, getSupplierBillPaymentState, isSupplierBillOpen, resolveSupplierBillStatus, validateSupplierBillProductInput, } from "../utils/finance/supplierBill.utils.js";
import { createChartAccountSchema, createDirectBankTransactionSchema, createRetailReceiptSchema, createSupplierPaymentSchema, } from "../schemas/finance.schema.js";
import { FINANCE_SOURCE_TYPES, getCustomerReceiptSourceTypes, getRetailReceiptSourceTypes, resolveAgainstDocumentSourceId, } from "../utils/finance/financeSource.utils.js";
import { getBillGstSummary, getInvoiceGstSummary, parseGstMoney, resolveInvoiceGst, } from "../utils/finance/gstSummary.utils.js";
import { buildCustomerStatement, toCustomerStatementDate, } from "../utils/finance/customerStatement.utils.js";
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
        const statement = buildCustomerStatement([
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
        ], { fromdate: "2026-08-01", todate: "2026-08-31" });
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
        assert.equal(createChartAccountSchema.properties.description.maxLength, 2000);
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
        assert.equal(createDirectBankTransactionSchema.properties.amount
            .exclusiveMinimum, 0);
    });
    test("summarizes invoice Output GST amounts across supported sales flows", () => {
        assert.deepEqual(getInvoiceGstSummary([
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
        ]), { igst: 360, cgst: 135, sgst: 135, total: 630 });
    });
    test("summarizes supplier Bill Input GST from tax amounts, not rates", () => {
        assert.deepEqual(getBillGstSummary([
            { payabletaxamount: 1800, cgst: 9, sgst: 9 },
            { payabletaxamount: 500, cgst: 0, sgst: 0 },
        ]), { igst: 0, cgst: 1150, sgst: 1150, total: 2300 });
    });
    test("reads only the first amount from legacy formatted tax text", () => {
        assert.equal(parseGstMoney("₹6,896.55 (CGST ₹3,448.28)"), 6896.55);
        assert.deepEqual(resolveInvoiceGst({
            invoicefor: "service",
            taxamount: "₹6,896.55 (CGST ₹3,448.28)",
            invoicedata: { taxtype: "intra_state", cgst: 9, sgst: 9 },
        }), { igst: 0, cgst: 3448.28, sgst: 3448.27, total: 6896.55 });
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
        assert.equal(getRetailInvoicesOutstandingTotal([
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
        ]), 750);
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
        assert.throws(() => requirePositiveMoney(0), (error) => error instanceof FinanceValidationError &&
            error.message === "amount must be greater than zero.");
    });
});
describe("Cash and Bank foundation validation", () => {
    test("Retail receipt schema accepts TDS allocation fields", () => {
        const allocationSchema = createRetailReceiptSchema.properties.allocations
            .items;
        assert.deepEqual(Object.keys(allocationSchema.properties).sort(), ["allocationamount", "invoiceid", "tdsamount", "tdsapplied"].sort());
    });
    test("Customer receipt schema accepts retail, rental, and customer-workspace modes", () => {
        assert.deepEqual(createRetailReceiptSchema.properties.receiptmode.enum, ["retail", "rental", "all"]);
    });
    test("Supplier payment schema accepts bill and TDS Payable fields", () => {
        const allocationSchema = createSupplierPaymentSchema.properties.allocations.items;
        assert.deepEqual(Object.keys(allocationSchema.properties).sort(), [
            "allocationamount",
            "billid",
            "tdsamount",
            "tdsapplied",
            "tdssectionid",
        ].sort());
    });
    test("TDS Receivable and TDS Payable schema amounts allow zero", () => {
        const receiptAllocation = createRetailReceiptSchema.properties.allocations.items;
        const paymentAllocation = createSupplierPaymentSchema.properties.allocations.items;
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
        assert.equal(toFinanceDateOnly(new Date(2026, 6, 31)), "2026-07-31");
        assert.equal(toFinanceDateOnly("2026-07-31"), "2026-07-31");
    });
});
describe("Finance source classification", () => {
    test("New E-commerce and Retail entries use the approved source types", () => {
        assert.equal(FINANCE_SOURCE_TYPES.ecommerceOrder, "ecommerce_order");
        assert.equal(FINANCE_SOURCE_TYPES.customerReceipt, "customer_receipt");
        assert.equal(FINANCE_SOURCE_TYPES.retailReceipt, "retail_receipt");
        assert.equal(FINANCE_SOURCE_TYPES.serviceRequestReceipt, "service_request_receipt");
        assert.equal(FINANCE_SOURCE_TYPES.rentalReceipt, "rental_receipt");
        assert.equal(FINANCE_SOURCE_TYPES.supplierBillPayment, "supplier_bill_payment");
    });
    test("Customer receipt filters include single-source and mixed receipts", () => {
        assert.deepEqual(getCustomerReceiptSourceTypes(), [
            "customer_receipt",
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
        assert.equal(resolveAgainstDocumentSourceId(["ORDER-1001"], "request-1001"), "ORDER-1001");
    });
    test("A multi-document receipt uses the idempotent request reference", () => {
        assert.equal(resolveAgainstDocumentSourceId(["ORDER-1001", "ORDER-1002"], "request-1001"), "request-1001");
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
        paymentduedate: 2000000000,
    };
    test("Multiple Bills can exactly consume the Purchase Order total", () => {
        const result = assertSupplierBillTotalWithinPurchaseOrder(1000000, 600000, 400000);
        assert.equal(result.aggregateBillTotal, 1000000);
        assert.equal(result.remainingAmount, 0);
    });
    test("Aggregate Bill amount cannot exceed the Purchase Order total", () => {
        assert.throws(() => assertSupplierBillTotalWithinPurchaseOrder(1000000, 600000, 400001), /exceeds the remaining purchase order amount 400000/);
    });
    test("Bill product quantity must be a whole number greater than zero", () => {
        assert.throws(() => validateSupplierBillProductInput("Apple MacBook M3", 0), /whole number greater than 0/);
        assert.deepEqual(validateSupplierBillProductInput("Apple MacBook M3", "2"), { productName: "Apple MacBook M3", quantity: 2 });
    });
    test("Bill product name rejects null and false-like values", () => {
        for (const invalidName of [null, undefined, false, "", "null", "false"]) {
            assert.throws(() => validateSupplierBillProductInput(invalidName, 1), /Product Name must contain a valid value/);
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
        const secondTransaction = applySupplierBillAllocation(billAfterFirstTransaction, 30000, 10000);
        assert.equal(firstTransaction.balanceAmount, 40000);
        assert.equal(secondTransaction.totalSettledAmount, 40000);
        assert.equal(secondTransaction.settledAmount, 50000);
        assert.equal(secondTransaction.balanceAmount, 0);
        assert.equal(resolveSupplierBillStatus(billAfterFirstTransaction, secondTransaction.balanceAmount, 1900000000), "complete");
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
        assert.throws(() => applySupplierBillAllocation(openBill, 48000, 2001), /Total settlement.*exceeds its outstanding amount/);
    });
    test("Completed and cancelled bills are not eligible", () => {
        assert.equal(isSupplierBillOpen(openBill), true);
        assert.equal(isSupplierBillOpen({ ...openBill, invoicestatus: "cancelled" }), false);
        assert.equal(isSupplierBillOpen({ ...openBill, invoicestatus: "complete" }), false);
    });
    test("A Supplier bill is locked after its first Cash and Bank transaction", () => {
        assert.doesNotThrow(() => assertSupplierBillCanBeModified(false));
        assert.throws(() => assertSupplierBillCanBeModified(true), /cannot be updated or deleted because a Cash & Bank transaction/);
    });
    test("Supplier TDS requires a section when enabled and allows zero amount", () => {
        assert.doesNotThrow(() => assertSupplierTdsMapping(true, 0, 2));
        assert.throws(() => assertSupplierTdsMapping(true, 0, null), /valid TDS section is required/);
        assert.doesNotThrow(() => assertSupplierTdsMapping(false, 0, null));
    });
    test("Bill status preserves overdue completion semantics", () => {
        assert.equal(resolveSupplierBillStatus(openBill, 0, 1900000000), "complete");
        assert.equal(resolveSupplierBillStatus(openBill, 0, 2100000000), "overdue_complete");
        assert.equal(resolveSupplierBillStatus(openBill, 1000, 2100000000), "overdue");
    });
});
describe("TDS section dropdown", () => {
    test("Display name follows nature, code, and rate format", () => {
        assert.equal(formatTdsSectionDisplayName("Commission or Brokerage - others", "1006", "2%"), "Commission or Brokerage - others 1006(2%)");
    });
});
describe("E-commerce automatic finance entry", () => {
    test("Only online product orders are eligible", () => {
        assert.equal(isEligibleEcommerceOrder([
            { ordername: "Online", invoicefor: "Product" },
        ]), true);
        assert.equal(isEligibleEcommerceOrder([
            { ordername: "StorePurchase", invoicefor: "Product" },
        ]), false);
        assert.equal(isEligibleEcommerceOrder([
            { ordername: "Rental", invoicefor: "Product Rental" },
        ]), false);
        assert.equal(isEligibleEcommerceOrder([
            { ordername: "Online", invoicefor: "Product" },
            { ordername: "Rental", invoicefor: "Product Rental" },
        ]), false);
    });
    test("Razorpay provider, method, and payment reference are resolved", () => {
        const transaction = {
            razorpay_payment_id: "pay_1001",
            transactiondata: { method: "upi" },
        };
        assert.equal(resolveEcommercePaymentProvider(transaction), "razorpay");
        assert.equal(resolveEcommercePaymentMethod(transaction, []), "upi");
        assert.equal(resolveEcommercePaymentReference(transaction), "pay_1001");
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
        assert.equal(resolveEcommercePaymentMethod(transaction, []), "pay_page");
        assert.equal(resolveEcommercePaymentReference(transaction), "TXN-1002");
    });
    test("Payment date uses the India accounting date", () => {
        const utcBoundaryEpoch = Math.floor(new Date("2026-07-30T20:00:00.000Z").getTime() / 1000);
        assert.equal(resolveEcommercePaymentDate({
            transactiondata: { created_at: utcBoundaryEpoch },
        }), "2026-07-31");
        assert.equal(resolveEcommercePaymentDate({
            createddate: utcBoundaryEpoch * 1000,
        }), "2026-07-31");
    });
    test("Customer name prefers the registered customer identity", () => {
        assert.equal(buildEcommerceCustomerName({
            firstname: "Asha",
            lastname: "Kumar",
            useremail: "asha@example.com",
        }, { name: "Checkout Name" }), "Asha Kumar");
        assert.equal(buildEcommerceCustomerName({ useremail: "asha@example.com" }, { name: "Checkout Name" }), "asha@example.com");
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
        assert.equal(isRetailStoreProductOrder({
            ordername: "StorePurchase",
            invoicefor: "Product",
        }), true);
        assert.equal(isRetailStoreInvoice(manualStoreInvoice), true);
        assert.equal(resolveRetailInvoiceAmount(manualStoreInvoice), 23500);
        assert.deepEqual(getRetailInvoicePaymentState(manualStoreInvoice), {
            invoiceAmount: 23500,
            paidAmount: 0,
            outstandingAmount: 23500,
        });
    });
    test("Online, rental, and service orders retain their existing payment flow", () => {
        assert.equal(isRetailStoreProductOrder({ ordername: "online", invoicefor: "product" }), false);
        assert.equal(isRetailStoreProductOrder({
            ordername: "rental",
            invoicefor: "product rental",
        }), false);
        assert.equal(isRetailStoreProductOrder({
            ordername: "storepurchase",
            invoicefor: "service",
        }), false);
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
        assert.equal(isServiceRequestInvoice({ ...serviceInvoice, ticketnumber: "" }), false);
        assert.equal(isServiceRequestInvoice(manualStoreInvoice), false);
        assert.equal(isRetailStoreInvoice(manualStoreInvoice), true);
    });
    test("Partial allocation calculates the remaining balance and status", () => {
        const result = applyRetailInvoiceAllocation(manualStoreInvoice, 10000);
        assert.equal(result.paidAmount, 10000);
        assert.equal(result.balanceAmount, 13500);
        assert.equal(result.paymentStatus, "partially_paid");
    });
    test("Full allocation marks the invoice paid", () => {
        const result = applyRetailInvoiceAllocation(manualStoreInvoice, 23500);
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
        const result = applyRetailInvoiceAllocation({
            ...manualStoreInvoice,
            invoicedata: {
                ordername: "storepurchase",
                total: "₹1,00,000",
            },
        }, 50000, 10000);
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
        assert.throws(() => applyRetailInvoiceAllocation(manualStoreInvoice, 23501), /exceeds its outstanding amount/);
    });
    test("Allocation plus TDS cannot exceed the outstanding invoice amount", () => {
        assert.throws(() => applyRetailInvoiceAllocation(manualStoreInvoice, 23000, 501), /Total settlement.*exceeds its outstanding amount/);
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
        assert.equal(resolveCustomerReceiptSourceType([rentalInvoice]), "rental_receipt");
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
        assert.throws(() => protectAccountNumber("123456789012", undefined), (error) => error instanceof FinanceValidationError &&
            error.code === "FINANCE_ENCRYPTION_KEY_MISSING");
    });
});
//# sourceMappingURL=financeFoundation.test.js.map