const toQuantity = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateInStoreSaleAvailability = (input: {
  onCatalogueQuantity?: unknown;
  offCatalogueQuantity?: unknown;
  orderedQuantity?: unknown;
  heldQuantity?: unknown;
}): number =>
  Math.max(
    0,
    toQuantity(input.onCatalogueQuantity) +
      toQuantity(input.offCatalogueQuantity) -
      toQuantity(input.orderedQuantity) -
      toQuantity(input.heldQuantity),
  );

export const calculateInStoreRentalAvailability = (input: {
  rentalAvailableQuantity?: unknown;
  heldQuantity?: unknown;
}): number =>
  Math.max(
    0,
    toQuantity(input.rentalAvailableQuantity) - toQuantity(input.heldQuantity),
  );
