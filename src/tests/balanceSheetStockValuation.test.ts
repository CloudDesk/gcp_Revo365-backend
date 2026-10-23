import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildInventoryStockValuation,
  resolveInventoryStockUnitCost,
} from "../utils/finance/inventoryStockValuation.utils.js";

describe("Balance Sheet stock purchase-price valuation", () => {
  test("uses the stock-specific purchase price before every product fallback", () => {
    assert.deepEqual(resolveInventoryStockUnitCost({
      stockPurchasePrice: 48500,
      productPurchasePrice: 40000,
    }), { amount: 48500, source: "stock_purchase_price" });
  });

  test("values units of the same product at their individual acquisition prices", () => {
    const first = resolveInventoryStockUnitCost({ stockPurchasePrice: 48000 });
    const second = resolveInventoryStockUnitCost({ stockPurchasePrice: 51500 });
    const valuation = buildInventoryStockValuation([
      { stocktype: "on_catalogue_product", stockstatus: "Available", quantity: 1, amount: first.amount },
      { stocktype: "on_catalogue_product", stockstatus: "Available", quantity: 1, amount: second.amount },
    ]);

    assert.equal(valuation.quantity, 2);
    assert.equal(valuation.amount, 99500);
  });

  test("uses an explicit product purchase price only when stock purchase price is missing", () => {
    assert.deepEqual(resolveInventoryStockUnitCost({
      stockPurchasePrice: null,
      productPurchasePrice: 4200,
    }), { amount: 4200, source: "product_purchase_price_fallback" });
  });

  test("never derives inventory cost from product selling price", () => {
    assert.deepEqual(resolveInventoryStockUnitCost({
      stockPurchasePrice: null,
      productPurchasePrice: 0,
      productPrice: 45000,
    } as any), { amount: 0, source: "unresolved" });
  });

  test("keeps genuinely unpriced stock visible as unresolved with zero value", () => {
    assert.deepEqual(resolveInventoryStockUnitCost({
      stockPurchasePrice: null,
      productPurchasePrice: null,
    }), { amount: 0, source: "unresolved" });
  });

  test("excludes sold catalogue stock and non-owned rental states from valuation", () => {
    const valuation = buildInventoryStockValuation([
      { stocktype: "on_catalogue_product", stockstatus: "Available", quantity: 1, amount: 1000 },
      { stocktype: "on_catalogue_product", stockstatus: "Sold", quantity: 1, amount: 1000 },
      { stocktype: "rental_product", stockstatus: "Rental Sold", quantity: 1, amount: 2000 },
      { stocktype: "rental_product", stockstatus: "Reserved for Rental", quantity: 1, amount: 2000 },
    ]);

    assert.equal(valuation.quantity, 2);
    assert.equal(valuation.amount, 3000);
  });
});
