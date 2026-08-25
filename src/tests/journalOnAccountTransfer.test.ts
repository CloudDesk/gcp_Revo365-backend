import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  postCustomerTransferSchema,
  replaceCustomerTransferSchema,
} from "../schemas/finance.schema.js";

describe("Journal Phase 7 - On-Account Transfer & Replacement", () => {
  test("defines transfer orchestration contract", () => {
    assert.deepEqual(postCustomerTransferSchema.required, [
      "sourcecustomerid",
      "sourcereferenceid",
      "destinationcustomerid",
      "amount",
      "entrydate",
      "description",
      "idempotencykey",
    ]);

    // Ensure amount is strictly positive
    const amountProp = postCustomerTransferSchema.properties.amount as any;
    assert.equal(amountProp.type, "number");
    assert.equal(amountProp.exclusiveMinimum, 0);

    // Ensure idempotencykey has min/max lengths
    const idKey = postCustomerTransferSchema.properties.idempotencykey as any;
    assert.equal(idKey.minLength, 8);
    assert.equal(idKey.maxLength, 100);
  });

  test("defines explicit replacement orchestration contract", () => {
    assert.deepEqual(replaceCustomerTransferSchema.required, [
      "version",
      "replacementreferenceid",
    ]);

    // Ensure version and replacementreferenceid are integers
    const versionProp = replaceCustomerTransferSchema.properties.version as any;
    assert.equal(versionProp.type, "integer");
    assert.equal(versionProp.minimum, 1);

    const refProp = replaceCustomerTransferSchema.properties.replacementreferenceid as any;
    assert.equal(refProp.type, "integer");
    assert.equal(refProp.minimum, 1);
  });
});
