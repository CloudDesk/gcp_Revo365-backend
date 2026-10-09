import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSupplierStatement } from "../utils/finance/supplierStatement.utils.js";

describe("Supplier Statement Phase 3 foundation", () => {
  test("orders Bills before Supplier Payments and calculates running payable", () => {
    const statement = buildSupplierStatement([
      {
        id: "payment-1",
        sourceid: 1,
        transactiontype: "supplier_payment",
        transactiondate: "2026-08-11",
        reference: "BT-1",
        description: "Supplier payment",
        billamount: 0,
        paymentamount: 400,
        settledamount: 450,
        tdsamount: 50,
      },
      {
        id: "bill-1",
        sourceid: 1,
        transactiontype: "bill",
        transactiondate: "2026-08-10",
        reference: "BILL-1",
        description: "Purchase Bill",
        billamount: 1000,
        paymentamount: 0,
        settledamount: 0,
        tdsamount: 0,
      },
    ]);

    assert.equal(statement.records[0].reference, "BILL-1");
    assert.equal(statement.records[0].balance, 1000);
    assert.equal(statement.records[1].balance, 550);
    assert.equal(statement.summary.paymentamount, 400);
    assert.equal(statement.summary.tdspayable, 50);
    assert.equal(statement.summary.closingpayable, 550);
  });

  test("uses activity before the selected period as opening payable", () => {
    const statement = buildSupplierStatement(
      [
        {
          id: "bill-1",
          sourceid: 1,
          transactiontype: "bill",
          transactiondate: "2026-07-01",
          reference: "BILL-1",
          description: "Purchase Bill",
          billamount: 1000,
          paymentamount: 0,
          settledamount: 0,
          tdsamount: 0,
        },
        {
          id: "payment-1",
          sourceid: 1,
          transactiontype: "supplier_payment",
          transactiondate: "2026-08-02",
          reference: "BT-1",
          description: "Supplier payment",
          billamount: 0,
          paymentamount: 250,
          settledamount: 250,
          tdsamount: 0,
        },
      ],
      { fromdate: "2026-08-01", todate: "2026-08-31" }
    );

    assert.equal(statement.summary.openingpayable, 1000);
    assert.equal(statement.records.length, 1);
    assert.equal(statement.summary.closingpayable, 750);
  });
});
