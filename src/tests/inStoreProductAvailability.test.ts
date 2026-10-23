import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateInStoreRentalAvailability,
  calculateInStoreSaleAvailability,
} from "../services/inStoreProductAvailability.js";

describe("In-store product availability", () => {
  test("sale availability combines on-catalogue and off-catalogue stock", () => {
    assert.equal(
      calculateInStoreSaleAvailability({
        onCatalogueQuantity: 4,
        offCatalogueQuantity: 3,
      }),
      7,
    );
  });

  test("sale availability subtracts committed and held quantities", () => {
    assert.equal(
      calculateInStoreSaleAvailability({
        onCatalogueQuantity: 4,
        offCatalogueQuantity: 3,
        orderedQuantity: 2,
        heldQuantity: 1,
      }),
      4,
    );
  });

  test("rental availability uses only the rental pool", () => {
    assert.equal(
      calculateInStoreRentalAvailability({
        rentalAvailableQuantity: 5,
        heldQuantity: 2,
      }),
      3,
    );
  });

  test("availability never becomes negative", () => {
    assert.equal(
      calculateInStoreSaleAvailability({
        onCatalogueQuantity: 1,
        offCatalogueQuantity: 0,
        orderedQuantity: 3,
      }),
      0,
    );
    assert.equal(
      calculateInStoreRentalAvailability({
        rentalAvailableQuantity: 1,
        heldQuantity: 3,
      }),
      0,
    );
  });
});
