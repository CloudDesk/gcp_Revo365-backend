import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateAvailableBalance } from "../utils/finance/finance.utils.js";
import { isEligibleEcommerceOrder } from "../utils/finance/ecommerceFinance.utils.js";
import {
  applyRetailInvoiceAllocation,
  getRetailInvoicePaymentState,
  isRetailStoreInvoice,
  isServiceRequestInvoice,
  resolveCustomerReceiptSourceType,
} from "../utils/finance/retailReceipt.utils.js";

const generatedServiceInvoice = {
  id: 501,
  invoicenumber: "TEQIT-Invoice-00501",
  invoicefor: "service",
  ticketnumber: "SR-000501",
  customerid: 91,
  totalorderamount: 10000,
  paidamount: 0,
  balanceamount: 10000,
  paymentstatus: "pending",
  paymentdata: [],
};

describe("Service Request invoice receipt flow", () => {
  test("normal and walk-in tickets use the same isolated service eligibility", () => {
    assert.equal(
      isServiceRequestInvoice({
        ...generatedServiceInvoice,
        walkintickets: false,
      }),
      true
    );
    assert.equal(
      isServiceRequestInvoice({
        ...generatedServiceInvoice,
        walkintickets: true,
      }),
      true
    );
    assert.equal(isRetailStoreInvoice(generatedServiceInvoice), false);
  });

  test("invoice generation starts pending and does not create a receipt", () => {
    assert.deepEqual(getRetailInvoicePaymentState(generatedServiceInvoice), {
      invoiceAmount: 10000,
      paidAmount: 0,
      outstandingAmount: 10000,
    });
  });

  test("partial Bank receipt plus TDS settles only the combined invoice amount", () => {
    const allocation = applyRetailInvoiceAllocation(
      generatedServiceInvoice,
      4000,
      400
    );

    assert.equal(allocation.allocationAmount, 4000);
    assert.equal(allocation.tdsAmount, 400);
    assert.equal(allocation.totalSettledAmount, 4400);
    assert.equal(allocation.paidAmount, 4400);
    assert.equal(allocation.balanceAmount, 5600);
    assert.equal(allocation.paymentStatus, "partially_paid");
  });

  test("Bank/Cash balance increases by receipt amount and excludes TDS", () => {
    const openingBankBalance = 20000;
    const receiptAmount = 4000;
    const tdsAmount = 400;
    const invoiceSettlement = receiptAmount + tdsAmount;

    assert.equal(
      calculateAvailableBalance(openingBankBalance, "debit", receiptAmount),
      24000
    );
    assert.equal(invoiceSettlement, 4400);
  });

  test("a later receipt can complete a partially paid service invoice", () => {
    const partiallyPaidInvoice = {
      ...generatedServiceInvoice,
      paidamount: 4400,
      balanceamount: 5600,
      paymentstatus: "partially_paid",
      paymentdata: [
        {
          paymentamount: 4000,
          tdsamount: 400,
          settlementamount: 4400,
          status: "success",
        },
      ],
    };
    const finalAllocation = applyRetailInvoiceAllocation(
      partiallyPaidInvoice,
      5000,
      600
    );

    assert.equal(finalAllocation.totalSettledAmount, 5600);
    assert.equal(finalAllocation.paidAmount, 10000);
    assert.equal(finalAllocation.balanceAmount, 0);
    assert.equal(finalAllocation.paymentStatus, "paid");
  });

  test("overpayment and allocation plus excessive TDS are rejected", () => {
    assert.throws(
      () => applyRetailInvoiceAllocation(generatedServiceInvoice, 10001),
      /exceeds its outstanding amount/
    );
    assert.throws(
      () => applyRetailInvoiceAllocation(generatedServiceInvoice, 9500, 501),
      /exceeds its outstanding amount/
    );
  });

  test("a service record without a ticket is not eligible", () => {
    assert.equal(
      isServiceRequestInvoice({
        ...generatedServiceInvoice,
        ticketnumber: null,
      }),
      false
    );
  });

  test("Service Request receipt uses its own source classification", () => {
    assert.equal(
      resolveCustomerReceiptSourceType([generatedServiceInvoice]),
      "service_request_receipt"
    );
  });

  test("a mixed-source payment is classified as a customer receipt", () => {
    const storeInvoice = {
      invoicefor: "product",
      invoicedata: { ordername: "StorePurchase" },
    };
    assert.equal(
      resolveCustomerReceiptSourceType([generatedServiceInvoice, storeInvoice]),
      "customer_receipt"
    );
  });
});

describe("Existing invoice flow regression boundaries", () => {
  test("in-store product invoice remains retail and not service", () => {
    const storeInvoice = {
      invoicefor: "product",
      invoicedata: { ordername: "StorePurchase", total: 10000 },
    };
    assert.equal(isRetailStoreInvoice(storeInvoice), true);
    assert.equal(isServiceRequestInvoice(storeInvoice), false);
    assert.equal(
      resolveCustomerReceiptSourceType([storeInvoice]),
      "retail_receipt"
    );
  });

  test("online product order remains eligible only for e-commerce automation", () => {
    const onlineOrder = [{ ordername: "Online", invoicefor: "Product" }];
    assert.equal(isEligibleEcommerceOrder(onlineOrder), true);
    assert.equal(
      isRetailStoreInvoice({
        invoicefor: "product",
        invoicedata: { ordername: "Online" },
      }),
      false
    );
    assert.equal(
      isServiceRequestInvoice({
        invoicefor: "product",
        ticketnumber: "SR-ONLINE",
      }),
      false
    );
  });
});
