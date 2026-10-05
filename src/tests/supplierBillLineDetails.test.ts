import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  resolveSupplierBillLineDetails,
  summarizeSupplierBillLines,
} from "../utils/finance/supplierBillLineDetails.utils.js";

describe("Supplier Bill and Inward GST unit-price details", () => {
  test("uses the immutable unit price stored on each bill line", () => {
    const [line] = resolveSupplierBillLineDetails(12, [
      { lineid: "po-1", name: "Laptop", quantity: 2, unitPrice: 42500, total: 85000 },
    ]);

    assert.deepEqual(line, {
      billId: 12,
      lineId: "po-1",
      description: "Laptop",
      quantity: 2,
      unitPrice: 42500,
      lineTotal: 85000,
      storedLineTotal: 85000,
      variance: 0,
    });
  });

  test("supports legacy unit-price and total field names", () => {
    const [line] = resolveSupplierBillLineDetails(13, JSON.stringify([
      { id: 7, productname: "Adapter", qty: 3, unitprice: 250, totalamount: 750 },
    ]));

    assert.equal(line.unitPrice, 250);
    assert.equal(line.quantity, 3);
    assert.equal(line.lineTotal, 750);
  });

  test("calculates line total from quantity and unit price and reports stored variance", () => {
    const [line] = resolveSupplierBillLineDetails(14, [
      { description: "Freight", quantity: 2, unitPrice: 499.995, total: 999.98 },
    ]);

    assert.equal(line.unitPrice, 500);
    assert.equal(line.lineTotal, 1000);
    assert.equal(line.storedLineTotal, 999.98);
    assert.equal(line.variance, -0.02);
  });

  test("does not substitute product selling price when unit price is absent", () => {
    const [line] = resolveSupplierBillLineDetails(15, [
      { name: "Phone", quantity: 1, productPrice: 25000, price: 25000 },
    ]);

    assert.equal(line.unitPrice, 0);
    assert.equal(line.lineTotal, 0);
  });

  test("summarizes all bill lines at money precision", () => {
    const lines = resolveSupplierBillLineDetails(16, [
      { name: "A", quantity: 2, unitPrice: 10.125 },
      { name: "B", quantity: 1, unitPrice: 5.5 },
    ]);

    assert.deepEqual(summarizeSupplierBillLines(lines), {
      lineCount: 2,
      totalQuantity: 3,
      lineSubtotal: 25.76,
      storedLineSubtotal: 25.76,
      lineVariance: 0,
    });
  });

  test("invalid product data produces no fabricated details", () => {
    assert.deepEqual(resolveSupplierBillLineDetails(17, "not-json"), []);
  });
});
