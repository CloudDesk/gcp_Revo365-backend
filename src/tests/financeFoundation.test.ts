import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  FinanceValidationError,
  calculateAvailableBalance,
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
  isRetailStoreInvoice,
  isRetailStoreProductOrder,
  isServiceRequestInvoice,
  resolveRetailInvoiceAmount,
} from "../utils/finance/retailReceipt.utils.js";
import { createRetailReceiptSchema } from "../schemas/finance.schema.js";

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
