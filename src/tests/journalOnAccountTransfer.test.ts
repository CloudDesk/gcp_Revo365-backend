import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  postCustomerTransferSchema,
  replaceCustomerTransferSchema,
} from "../schemas/finance.schema.js";
import { requireTransferAmount } from "../services/onAccountTransfer.service.js";
import { removeAllocationFromPaymentData } from "../services/customerOnAccountReversal.service.js";

describe("Journal Phase 7 - On-Account Transfer & Replacement", () => {
  test("defines transfer orchestration contract", () => {
    assert.deepEqual(postCustomerTransferSchema.required, [
      "sourcecustomerid",
      "sourcereferenceid",
      "sourcereferenceversion",
      "destinationcustomerid",
      "currencycode",
      "amount",
      "entrydate",
      "description",
      "idempotencykey",
    ]);

    // Ensure amount is strictly positive
    const amountProp = postCustomerTransferSchema.properties.amount as any;
    assert.equal(amountProp.type, "number");
    assert.equal(amountProp.exclusiveMinimum, 0);
    assert.equal(amountProp.multipleOf, 0.01);

    const sourceVersion = postCustomerTransferSchema.properties
      .sourcereferenceversion as any;
    assert.equal(sourceVersion.type, "integer");
    assert.equal(sourceVersion.minimum, 0);

    const currency = postCustomerTransferSchema.properties.currencycode as any;
    assert.equal(currency.pattern, "^[A-Z]{3}$");

    // Ensure idempotencykey has min/max lengths
    const idKey = postCustomerTransferSchema.properties.idempotencykey as any;
    assert.equal(idKey.minLength, 8);
    assert.equal(idKey.maxLength, 100);
  });

  test("defines explicit replacement orchestration contract", () => {
    assert.deepEqual(replaceCustomerTransferSchema.required, [
      "version",
      "replacementreferenceid",
      "idempotencykey",
    ]);

    // Ensure version and replacementreferenceid are integers
    const versionProp = replaceCustomerTransferSchema.properties.version as any;
    assert.equal(versionProp.type, "integer");
    assert.equal(versionProp.minimum, 1);

    const refProp = replaceCustomerTransferSchema.properties.replacementreferenceid as any;
    assert.equal(refProp.type, "integer");
    assert.equal(refProp.minimum, 1);
  });

  test("removes only the linked allocation and adjusts every payment total", () => {
    const result = removeAllocationFromPaymentData(
      [{ onaccountallocationids: [11, 12], paymentamount: 300, tdsamount: 30, settlementamount: 330, amount: 330 }],
      11,
      100,
      10,
      110
    );
    assert.deepEqual(result, [{ onaccountallocationids: [12], paymentamount: 200, tdsamount: 20, settlementamount: 220, amount: 220 }]);
  });

  test("rejects replacement when the Invoice allocation link is missing", () => {
    assert.throws(() => removeAllocationFromPaymentData([], 99, 100, 0, 100), {
      code: "TRANSFER_REPLACEMENT_ALLOCATION_LINK_MISSING",
    });
  });

  test("accepts positive two-decimal transfer amounts", () => {
    assert.equal(requireTransferAmount(100), 100);
    assert.equal(requireTransferAmount(100.25), 100.25);
    assert.equal(requireTransferAmount("0.01"), 0.01);
  });

  test("rejects zero, negative, and over-precision transfer amounts", () => {
    assert.throws(() => requireTransferAmount(0), {
      code: "TRANSFER_AMOUNT_INVALID",
    });
    assert.throws(() => requireTransferAmount(-10), {
      code: "TRANSFER_AMOUNT_INVALID",
    });
    assert.throws(() => requireTransferAmount(10.001), {
      code: "TRANSFER_AMOUNT_PRECISION",
    });
  });
});
