import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  emptyProductCostIndex,
  resolveInvoiceCogs,
  type InvoiceStockCost,
} from "../utils/finance/profitLossCogs.utils.js";

const products = () => {
  const index = emptyProductCostIndex();
  index.byId.set("10", 4000);
  index.byPuc.set("LAP-001", 4000);
  index.byName.set("laptop", 4000);
  return index;
};

const stock = (overrides: Partial<InvoiceStockCost> = {}): InvoiceStockCost => ({
  stockId: 1,
  productId: 10,
  puc: "LAP-001",
  productName: "Laptop",
  purchasePrice: 5000,
  source: "order",
  ...overrides,
});

describe("Profit and Loss stock-level COGS", () => {
  test("sums the purchase price of the actual sold stock units", () => {
    const result = resolveInvoiceCogs(
      { items: [{ productid: 10, quantity: 2 }] },
      [stock(), stock({ stockId: 2, purchasePrice: 5300 })],
      products()
    );

    assert.equal(result.amount, 10300);
    assert.equal(result.matchedStockQuantity, 2);
    assert.equal(result.fallbackQuantity, 0);
    assert.deepEqual(result.stockIds, [1, 2]);
    assert.equal(result.source, "order_stock");
  });

  test("counts the same stock row only once when a database join duplicates it", () => {
    const result = resolveInvoiceCogs(
      { items: [{ productid: 10, quantity: 1 }] },
      [stock(), stock()],
      products()
    );

    assert.equal(result.amount, 5000);
    assert.equal(result.matchedStockQuantity, 1);
    assert.deepEqual(result.stockIds, [1]);
  });

  test("counts a stock row only once across multiple invoices for the same order", () => {
    const claimedStockIds = new Set<number>();
    const first = resolveInvoiceCogs(
      { items: [{ orderlinenumber: "OL-10", quantity: 1, name: "Legacy name" }] },
      [stock({ stockId: 497, orderLineNumber: "OL-10", purchasePrice: 88000 })],
      products(),
      { claimedStockIds }
    );
    const duplicate = resolveInvoiceCogs(
      { items: [{ orderlinenumber: "OL-10", quantity: 1, name: "Legacy name" }] },
      [stock({ stockId: 497, orderLineNumber: "OL-10", purchasePrice: 88000 })],
      products(),
      { claimedStockIds }
    );

    assert.equal(first.amount, 88000);
    assert.equal(duplicate.amount, 0);
    assert.equal(duplicate.duplicateReferenceQuantity, 1);
    assert.equal(duplicate.fallbackQuantity, 0);
    assert.equal(duplicate.source, "duplicate_stock_reference");
  });

  test("matches historical invoice items to stock by order-line number", () => {
    const result = resolveInvoiceCogs(
      { items: [{ id: 1, name: "Shortened display name", orderlinenumber: "OL-22", quantity: 1 }] },
      [stock({ stockId: 299, orderLineNumber: "OL-22", productId: 99, productName: "Full catalogue name", purchasePrice: 500 })],
      products()
    );

    assert.equal(result.amount, 500);
    assert.equal(result.matchedStockQuantity, 1);
    assert.deepEqual(result.stockIds, [299]);
  });

  test("does not treat a legacy invoice line id as a product id during fallback", () => {
    const index = products();
    index.byId.set("1", 0);
    index.byName.set("historical laptop", 7250);

    const result = resolveInvoiceCogs(
      { items: [{ id: 1, name: "Historical Laptop", quantity: 1 }] },
      [],
      index
    );

    assert.equal(result.amount, 7250);
    assert.equal(result.fallbackQuantity, 1);
    assert.equal(result.source, "product_fallback");
  });

  test("counts a product fallback only once across repeated invoices for an order line", () => {
    const claimedOrderLineQuantities = new Map<string, number>();
    const section = { items: [{ productid: 10, orderlinenumber: "OL-30", quantity: 1 }] };
    const first = resolveInvoiceCogs(section, [], products(), { claimedOrderLineQuantities });
    const duplicate = resolveInvoiceCogs(section, [], products(), { claimedOrderLineQuantities });

    assert.equal(first.amount, 4000);
    assert.equal(duplicate.amount, 0);
    assert.equal(duplicate.fallbackQuantity, 0);
    assert.equal(duplicate.duplicateReferenceQuantity, 1);
    assert.equal(duplicate.source, "duplicate_order_line_reference");
  });

  test("never derives purchase cost from an invoice selling price", () => {
    const result = resolveInvoiceCogs(
      { items: [{ id: 1, name: "Screen replacement", price: 1300 }] },
      [],
      emptyProductCostIndex()
    );

    assert.equal(result.amount, 0);
    assert.equal(result.fallbackQuantity, 0);
    assert.equal(result.unresolvedQuantity, 1);
    assert.equal(result.source, "unresolved");
  });

  test("uses sold service allocations as stock-level COGS", () => {
    const result = resolveInvoiceCogs(
      { items: [{ productid: 10, quantity: 2 }] },
      [
        stock({ stockId: 21, purchasePrice: 800, source: "service" }),
        stock({ stockId: 22, purchasePrice: 900, source: "service" }),
      ],
      products()
    );

    assert.equal(result.amount, 1700);
    assert.equal(result.source, "service_stock");
    assert.equal(result.matchedStockQuantity, 2);
  });

  test("uses the invoice-item purchase price only for units without a usable stock cost", () => {
    const result = resolveInvoiceCogs(
      { items: [{ productid: 10, quantity: 3, purchaseprice: 4200 }] },
      [
        stock({ stockId: 31, purchasePrice: 5000 }),
        stock({ stockId: 32, purchasePrice: null }),
      ],
      products()
    );

    assert.equal(result.amount, 13400);
    assert.equal(result.matchedStockQuantity, 1);
    assert.equal(result.fallbackQuantity, 2);
    assert.equal(result.source, "invoice_item_fallback+order_stock");
  });

  test("uses the product cost only as the final compatibility fallback", () => {
    const result = resolveInvoiceCogs(
      { items: [{ productid: 10, quantity: 2 }] },
      [],
      products()
    );

    assert.equal(result.amount, 8000);
    assert.equal(result.fallbackQuantity, 2);
    assert.equal(result.source, "product_fallback");
  });

  test("reports unresolved units instead of producing an invalid amount", () => {
    const result = resolveInvoiceCogs(
      { items: [{ productid: 999, quantity: 2 }] },
      [],
      emptyProductCostIndex()
    );

    assert.equal(result.amount, 0);
    assert.equal(result.unresolvedQuantity, 2);
    assert.equal(result.source, "unresolved");
  });

  test("prefers an immutable invoice COGS snapshot over live stock values", () => {
    const result = resolveInvoiceCogs(
      { cogsAmount: 9750.456, cogsQuantity: 2, cogsStockIds: [41, 42] },
      [stock({ stockId: 41, purchasePrice: 1 })],
      products()
    );

    assert.equal(result.amount, 9750.46);
    assert.equal(result.source, "invoice_snapshot");
    assert.deepEqual(result.stockIds, [41, 42]);
  });

  test("can calculate COGS from linked sold stock when legacy invoice items are absent", () => {
    const result = resolveInvoiceCogs(
      {},
      [stock({ stockId: 51, purchasePrice: 1250 }), stock({ stockId: 52, purchasePrice: 1275 })],
      products()
    );

    assert.equal(result.amount, 2525);
    assert.equal(result.expectedQuantity, 2);
    assert.equal(result.matchedStockQuantity, 2);
  });

  test("does not consume a stock row belonging to a different product item", () => {
    const result = resolveInvoiceCogs(
      { items: [{ productid: 10, quantity: 1 }, { productid: 20, quantity: 1, purchaseprice: 700 }] },
      [stock({ stockId: 61, productId: 10, purchasePrice: 5000 })],
      products()
    );

    assert.equal(result.amount, 5700);
    assert.equal(result.matchedStockQuantity, 1);
    assert.equal(result.fallbackQuantity, 1);
  });
});
