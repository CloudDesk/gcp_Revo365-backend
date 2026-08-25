type StockAggregate = {
  stocktype?: unknown;
  stockstatus?: unknown;
  quantity?: unknown;
  amount?: unknown;
};

const numberValue = (value: unknown) => Number(value) || 0;
const key = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const buildInventoryStockValuation = (aggregates: StockAggregate[]) => {
  const breakdown = {
    onCatalogueAvailableQuantity: 0,
    offCatalogueAvailableQuantity: 0,
    rentalAvailableQuantity: 0,
    rentalSoldQuantity: 0,
    onCatalogueAvailableAmount: 0,
    offCatalogueAvailableAmount: 0,
    rentalAvailableAmount: 0,
    rentalSoldAmount: 0,
  };

  for (const aggregate of aggregates) {
    const stockType = key(aggregate.stocktype);
    const stockStatus = key(aggregate.stockstatus);
    const quantity = numberValue(aggregate.quantity);
    const amount = numberValue(aggregate.amount);

    if (stockType === "on_catalogue_product" && stockStatus === "available") {
      breakdown.onCatalogueAvailableQuantity += quantity;
      breakdown.onCatalogueAvailableAmount += amount;
    } else if (stockType === "off_catalogue_product" && stockStatus === "available") {
      breakdown.offCatalogueAvailableQuantity += quantity;
      breakdown.offCatalogueAvailableAmount += amount;
    } else if (stockType === "rental_product" && stockStatus === "available") {
      breakdown.rentalAvailableQuantity += quantity;
      breakdown.rentalAvailableAmount += amount;
    } else if (stockType === "rental_product" && stockStatus === "rental_sold") {
      breakdown.rentalSoldQuantity += quantity;
      breakdown.rentalSoldAmount += amount;
    }
  }

  const quantity = breakdown.onCatalogueAvailableQuantity
    + breakdown.offCatalogueAvailableQuantity
    + breakdown.rentalAvailableQuantity
    + breakdown.rentalSoldQuantity;
  const amount = money(
    breakdown.onCatalogueAvailableAmount
      + breakdown.offCatalogueAvailableAmount
      + breakdown.rentalAvailableAmount
      + breakdown.rentalSoldAmount
  );

  Object.keys(breakdown).forEach((field) => {
    if (field.endsWith("Amount")) (breakdown as any)[field] = money((breakdown as any)[field]);
  });

  return { quantity, amount, breakdown };
};
