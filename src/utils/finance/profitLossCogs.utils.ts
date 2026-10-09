import { toMoney } from "./finance.utils.js";

export type InvoiceStockCost = {
  stockId: number;
  orderLineNumber?: string | null;
  productId?: number | null;
  puc?: string | null;
  productName?: string | null;
  purchasePrice?: number | null;
  source?: "order" | "service";
};

export type ProductCostIndex = {
  byId: Map<string, number>;
  byPuc: Map<string, number>;
  byName: Map<string, number>;
};

export type InvoiceCogsResolution = {
  amount: number;
  source: string;
  expectedQuantity: number;
  matchedStockQuantity: number;
  fallbackQuantity: number;
  unresolvedQuantity: number;
  duplicateReferenceQuantity: number;
  unmatchedStockQuantity: number;
  stockIds: number[];
};

export type ResolveInvoiceCogsOptions = {
  claimedStockIds?: Set<number>;
  claimedOrderLineQuantities?: Map<string, number>;
};

const normalizedText = (value: unknown) => String(value ?? "").trim().toLowerCase();
const positiveMoney = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? toMoney(parsed) : 0;
};
const hasOwn = (value: unknown, key: string) =>
  Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));

const itemQuantity = (item: any) => {
  const parsed = Number(item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const itemStockIds = (item: any) => {
  const candidates = [
    ...(Array.isArray(item?.stockIds) ? item.stockIds : []),
    ...(Array.isArray(item?.stockids) ? item.stockids : []),
    item?.stockId,
    item?.stockid,
    item?.assetStockId,
    item?.assetstockid,
  ];
  return new Set(
    candidates
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
};

const fallbackCost = (item: any, products: ProductCostIndex) => {
  const invoiceItemCost = positiveMoney(item?.purchaseprice ?? item?.purchasePrice);
  if (invoiceItemCost > 0) return { amount: invoiceItemCost, source: "invoice_item_fallback" };

  // `id` in legacy invoice JSON is commonly the invoice-line index, not a
  // product_revo id. Only explicit product-id fields are safe for this lookup.
  const productId = String(item?.productid ?? item?.productId ?? "");
  const puc = String(item?.puc ?? item?.productcode ?? "").trim();
  const name = normalizedText(item?.productname ?? item?.name);
  const productCost = [
    productId ? products.byId.get(productId) : undefined,
    puc ? products.byPuc.get(puc) : undefined,
    name ? products.byName.get(name) : undefined,
  ].map(positiveMoney).find((amount) => amount > 0) || 0;
  if (productCost > 0) return { amount: productCost, source: "product_fallback" };

  return { amount: 0, source: "unresolved" };
};

const matchesItem = (stock: InvoiceStockCost, item: any, explicitStockIds: Set<number>) => {
  if (explicitStockIds.size > 0) return explicitStockIds.has(Number(stock.stockId));

  const itemOrderLineNumber = normalizedText(item?.orderlinenumber ?? item?.orderLineNumber);
  if (itemOrderLineNumber && normalizedText(stock.orderLineNumber) === itemOrderLineNumber) {
    return true;
  }

  const itemProductId = Number(item?.productid ?? item?.productId);
  if (Number.isInteger(itemProductId) && itemProductId > 0 && Number(stock.productId) === itemProductId) {
    return true;
  }

  const itemPuc = normalizedText(item?.puc ?? item?.productcode);
  if (itemPuc && normalizedText(stock.puc) === itemPuc) return true;

  const itemName = normalizedText(item?.productname ?? item?.name);
  return Boolean(itemName && normalizedText(stock.productName) === itemName);
};

export const emptyProductCostIndex = (): ProductCostIndex => ({
  byId: new Map(),
  byPuc: new Map(),
  byName: new Map(),
});

export const resolveInvoiceCogs = (
  productSection: Record<string, any>,
  invoiceStockRows: InvoiceStockCost[],
  products: ProductCostIndex,
  options: ResolveInvoiceCogsOptions = {}
): InvoiceCogsResolution => {
  const claimedStockIds = options.claimedStockIds;
  const claimedOrderLineQuantities = options.claimedOrderLineQuantities;
  const invoiceSnapshotKey = hasOwn(productSection, "cogsAmount")
    ? "cogsAmount"
    : hasOwn(productSection, "cogsamount")
      ? "cogsamount"
      : "";
  if (invoiceSnapshotKey) {
    const amount = Math.max(Number(productSection[invoiceSnapshotKey]) || 0, 0);
    const snapshotStockIds = Array.isArray(productSection.cogsStockIds)
      ? productSection.cogsStockIds.map(Number).filter((value: number) => Number.isInteger(value) && value > 0)
      : [];
    return {
      amount: toMoney(amount),
      source: "invoice_snapshot",
      expectedQuantity: Number(productSection.cogsQuantity) || 0,
      matchedStockQuantity: snapshotStockIds.length,
      fallbackQuantity: 0,
      unresolvedQuantity: 0,
      duplicateReferenceQuantity: 0,
      unmatchedStockQuantity: 0,
      stockIds: snapshotStockIds,
    };
  }

  const uniqueStockRows = Array.from(
    new Map(
      (Array.isArray(invoiceStockRows) ? invoiceStockRows : [])
        .filter((row) => Number.isInteger(Number(row?.stockId)) && Number(row.stockId) > 0)
        .map((row) => [Number(row.stockId), { ...row, stockId: Number(row.stockId) }])
    ).values()
  );
  const unusedStockRows = new Map(
    uniqueStockRows
      .filter((row) => !claimedStockIds?.has(row.stockId))
      .map((row) => [row.stockId, row])
  );
  const items = Array.isArray(productSection?.items) ? productSection.items : [];
  const sources = new Set<string>();
  const usedStockIds: number[] = [];
  let amount = 0;
  let expectedQuantity = 0;
  let matchedStockQuantity = 0;
  let fallbackQuantity = 0;
  let unresolvedQuantity = 0;
  let duplicateReferenceQuantity = 0;

  if (items.length === 0 && uniqueStockRows.length > 0) {
    for (const stock of uniqueStockRows) {
      const purchasePrice = positiveMoney(stock.purchasePrice);
      if (purchasePrice > 0) {
        amount += purchasePrice;
        matchedStockQuantity += 1;
        usedStockIds.push(stock.stockId);
        claimedStockIds?.add(stock.stockId);
        sources.add(stock.source === "service" ? "service_stock" : "order_stock");
      } else {
        unresolvedQuantity += 1;
        sources.add("unresolved");
      }
    }
    return {
      amount: toMoney(amount),
      source: Array.from(sources).sort().join("+") || "unresolved",
      expectedQuantity: uniqueStockRows.length,
      matchedStockQuantity,
      fallbackQuantity,
      unresolvedQuantity,
      duplicateReferenceQuantity,
      unmatchedStockQuantity: 0,
      stockIds: usedStockIds,
    };
  }

  for (const item of items) {
    const quantity = itemQuantity(item);
    expectedQuantity += quantity;

    const itemSnapshotKey = hasOwn(item, "cogsAmount")
      ? "cogsAmount"
      : hasOwn(item, "cogsamount")
        ? "cogsamount"
        : "";
    if (itemSnapshotKey) {
      amount += Math.max(Number(item[itemSnapshotKey]) || 0, 0);
      sources.add("invoice_snapshot");
      continue;
    }

    const explicitStockIds = itemStockIds(item);
    const alreadyClaimedRows = claimedStockIds
      ? uniqueStockRows.filter(
          (stock) => claimedStockIds.has(stock.stockId) && matchesItem(stock, item, explicitStockIds)
        )
      : [];
    const matchingRows = Array.from(unusedStockRows.values())
      .filter((stock) => matchesItem(stock, item, explicitStockIds))
      .sort((left, right) => left.stockId - right.stockId);
    const physicalUnits = Math.max(Math.trunc(quantity), 0);
    const selectedRows = matchingRows.slice(0, physicalUnits);

    for (const stock of selectedRows) {
      unusedStockRows.delete(stock.stockId);
      const purchasePrice = positiveMoney(stock.purchasePrice);
      if (purchasePrice > 0) {
        amount += purchasePrice;
        matchedStockQuantity += 1;
        usedStockIds.push(stock.stockId);
        claimedStockIds?.add(stock.stockId);
        sources.add(stock.source === "service" ? "service_stock" : "order_stock");
      }
    }

    const pricedSelectedQuantity = selectedRows.filter((stock) => positiveMoney(stock.purchasePrice) > 0).length;
    const duplicateQuantity = Math.min(
      Math.max(quantity - pricedSelectedQuantity, 0),
      alreadyClaimedRows.filter((stock) => positiveMoney(stock.purchasePrice) > 0).length
    );
    if (duplicateQuantity > 0) {
      duplicateReferenceQuantity += duplicateQuantity;
      sources.add("duplicate_stock_reference");
    }
    let missingQuantity = Math.max(quantity - pricedSelectedQuantity - duplicateQuantity, 0);
    const orderLineKey = normalizedText(item?.orderlinenumber ?? item?.orderLineNumber);
    if (missingQuantity > 0 && orderLineKey && claimedOrderLineQuantities) {
      const previouslyClaimed = claimedOrderLineQuantities.get(orderLineKey) || 0;
      const duplicateOrderLineQuantity = Math.min(missingQuantity, previouslyClaimed);
      if (duplicateOrderLineQuantity > 0) {
        duplicateReferenceQuantity += duplicateOrderLineQuantity;
        missingQuantity -= duplicateOrderLineQuantity;
        sources.add("duplicate_order_line_reference");
      }
    }
    if (missingQuantity > 0) {
      const fallback = fallbackCost(item, products);
      if (fallback.amount > 0) {
        amount += fallback.amount * missingQuantity;
        fallbackQuantity += missingQuantity;
        if (orderLineKey && claimedOrderLineQuantities) {
          claimedOrderLineQuantities.set(
            orderLineKey,
            (claimedOrderLineQuantities.get(orderLineKey) || 0) + missingQuantity
          );
        }
      } else {
        unresolvedQuantity += missingQuantity;
      }
      sources.add(fallback.source);
    }
  }

  return {
    amount: toMoney(amount),
    source: Array.from(sources).sort().join("+") || "unresolved",
    expectedQuantity: toMoney(expectedQuantity),
    matchedStockQuantity,
    fallbackQuantity: toMoney(fallbackQuantity),
    unresolvedQuantity: toMoney(unresolvedQuantity),
    duplicateReferenceQuantity: toMoney(duplicateReferenceQuantity),
    unmatchedStockQuantity: unusedStockRows.size,
    stockIds: usedStockIds,
  };
};
