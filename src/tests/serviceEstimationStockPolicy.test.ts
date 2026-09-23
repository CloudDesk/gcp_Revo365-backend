import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    canRestoreApprovedServiceStock,
    getServiceEstimationStockPersistencePlan,
} from "../services/serviceEstimationStockPolicy.js";
import type {
    ServiceEstimationAllocationStats,
    ServiceEstimationStatus,
} from "../services/serviceEstimationStockPolicy.js";
import {
    getServiceEstimationAssetAllocationPlan,
    isSingleAssetServiceEstimationUnit,
    isServiceEstimationCatalogueStock,
    resolveServiceEstimationAssetNumber,
    SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES,
} from "../services/serviceEstimationStockEligibility.js";
import {
    getServiceEstimationTaxContext,
    resolveServiceEstimationCustomerState,
} from "../services/serviceEstimationTaxPolicy.js";

type QuantitySnapshot = {
    available: number;
    serviceHold: number;
    sold: number;
};

const applyQuantityChange = (
    snapshot: QuantitySnapshot,
    action: "hold" | "sell" | "restore-held" | "restore-sold",
    quantity: number
): QuantitySnapshot => {
    assert.ok(Number.isInteger(quantity) && quantity > 0);
    const next = { ...snapshot };

    if (action === "hold") {
        assert.ok(next.available >= quantity);
        next.available -= quantity;
        next.serviceHold += quantity;
    } else if (action === "sell") {
        assert.ok(next.serviceHold >= quantity);
        next.serviceHold -= quantity;
        next.sold += quantity;
    } else if (action === "restore-held") {
        assert.ok(next.serviceHold >= quantity);
        next.serviceHold -= quantity;
        next.available += quantity;
    } else {
        assert.ok(next.sold >= quantity);
        next.sold -= quantity;
        next.available += quantity;
    }

    return next;
};

const plan = (
    isNew: boolean,
    previousStatus: ServiceEstimationStatus | null,
    nextStatus: ServiceEstimationStatus,
    allocations: ServiceEstimationAllocationStats
) =>
    getServiceEstimationStockPersistencePlan({
        isNew,
        previousStatus,
        nextStatus,
        allocations,
    });

describe("service estimation stock positive cases", () => {
    test("creating quantity 2 decreases Available from 5 to 3 and puts 2 on Service Hold", () => {
        const decision = plan(true, null, "waiting_for_approval", {
            total: 0,
            sold: 0,
            restored: 0,
        });
        assert.deepEqual(decision, {
            allocate: true,
            sellHeld: false,
            restoreHeld: false,
            heldRestorationReason: null,
        });

        const result = applyQuantityChange(
            { available: 5, serviceHold: 0, sold: 0 },
            "hold",
            2
        );
        assert.deepEqual(result, {
            available: 3,
            serviceHold: 2,
            sold: 0,
        });
    });

    test("approval keeps Available at 3 and moves the exact held quantity to Sold", () => {
        const decision = plan(false, "waiting_for_approval", "approved", {
            total: 2,
            sold: 0,
            restored: 0,
        });
        assert.equal(decision.allocate, false);
        assert.equal(decision.sellHeld, true);

        const result = applyQuantityChange(
            { available: 3, serviceHold: 2, sold: 0 },
            "sell",
            2
        );
        assert.deepEqual(result, {
            available: 3,
            serviceHold: 0,
            sold: 2,
        });
    });

    test("Walk-In auto-approval holds and sells in one plan", () => {
        const decision = plan(true, null, "approved", {
            total: 0,
            sold: 0,
            restored: 0,
        });
        assert.equal(decision.allocate, true);
        assert.equal(decision.sellHeld, true);

        const held = applyQuantityChange(
            { available: 5, serviceHold: 0, sold: 0 },
            "hold",
            2
        );
        const sold = applyQuantityChange(held, "sell", 2);
        assert.deepEqual(sold, {
            available: 3,
            serviceHold: 0,
            sold: 2,
        });
    });

    test("rejection and re-quote restore held stock to Available", () => {
        for (const status of ["rejected", "re_quote"] as const) {
            const decision = plan(
                false,
                "waiting_for_approval",
                status,
                { total: 2, sold: 0, restored: 0 }
            );
            assert.equal(decision.restoreHeld, true);
            assert.equal(
                decision.heldRestorationReason,
                status === "rejected"
                    ? "estimation_rejected"
                    : "estimation_requote"
            );

            const result = applyQuantityChange(
                { available: 3, serviceHold: 2, sold: 0 },
                "restore-held",
                2
            );
            assert.deepEqual(result, {
                available: 5,
                serviceHold: 0,
                sold: 0,
            });
        }
    });

    test("after-approval cancellation restores Sold quantity to Available", () => {
        assert.equal(
            canRestoreApprovedServiceStock({
                estimationStatus: "approved",
                ticketStatus: "service_in_progress",
                invoiceGenerated: false,
                restorableQuantity: 2,
            }),
            true
        );

        const result = applyQuantityChange(
            { available: 3, serviceHold: 0, sold: 2 },
            "restore-sold",
            2
        );
        assert.deepEqual(result, {
            available: 5,
            serviceHold: 0,
            sold: 0,
        });
    });

    test("legacy waiting estimation allocates before its first approval", () => {
        const decision = plan(false, "waiting_for_approval", "approved", {
            total: 0,
            sold: 0,
            restored: 0,
        });
        assert.equal(decision.allocate, true);
        assert.equal(decision.sellHeld, true);
    });
});

describe("service estimation stock negative cases", () => {
    test("cannot reject or re-quote an approved estimation with sold stock", () => {
        for (const status of ["rejected", "re_quote"] as const) {
            assert.throws(
                () =>
                    plan(false, "approved", status, {
                        total: 2,
                        sold: 2,
                        restored: 0,
                    }),
                /Use Cancel Service & Restore Stock/
            );
        }
    });

    test("cannot approve an estimation after its tracked stock was restored", () => {
        assert.throws(
            () =>
                plan(false, "approved", "approved", {
                    total: 2,
                    sold: 0,
                    restored: 2,
                }),
            /cannot be approved again/
        );
    });

    test("cannot restore before approval, after completion, or after invoice generation", () => {
        const invalidCases = [
            {
                estimationStatus: "waiting_for_approval",
                ticketStatus: "waiting_for_cost_estimation_approval",
                invoiceGenerated: false,
                restorableQuantity: 2,
            },
            {
                estimationStatus: "approved",
                ticketStatus: "completed",
                invoiceGenerated: false,
                restorableQuantity: 2,
            },
            {
                estimationStatus: "approved",
                ticketStatus: "service_in_progress",
                invoiceGenerated: true,
                restorableQuantity: 2,
            },
            {
                estimationStatus: "approved",
                ticketStatus: "service_in_progress",
                invoiceGenerated: false,
                restorableQuantity: 0,
            },
        ];

        for (const testCase of invalidCases) {
            assert.equal(canRestoreApprovedServiceStock(testCase), false);
        }
    });

    test("quantity cannot exceed Available and cannot be restored twice", () => {
        assert.throws(
            () =>
                applyQuantityChange(
                    { available: 1, serviceHold: 0, sold: 0 },
                    "hold",
                    2
                )
        );
        assert.throws(
            () =>
                applyQuantityChange(
                    { available: 5, serviceHold: 0, sold: 0 },
                    "restore-sold",
                    1
                )
        );
    });
});

describe("service estimation catalogue stock eligibility", () => {
    test("Available On Catalogue and Off Catalogue stock are eligible", () => {
        assert.deepEqual(SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES, [
            "on_catalogue_product",
            "off_catalogue_product",
        ]);

        for (const stocktype of SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES) {
            assert.equal(
                isServiceEstimationCatalogueStock({
                    stocktype,
                    stockstatus: "Available",
                    rfid: `rfid-${stocktype}`,
                }),
                true
            );
        }
    });

    test("Rental, third-party, held, sold, unidentified, and inactive stock are excluded", () => {
        const invalidStocks = [
            { stocktype: "rental_product", stockstatus: "Available" },
            { stocktype: "third_party_product", stockstatus: "Available" },
            { stocktype: "on_catalogue_product", stockstatus: "Service Hold" },
            { stocktype: "off_catalogue_product", stockstatus: "Sold" },
            { stocktype: "on_catalogue_product", stockstatus: "Available" },
            {
                stocktype: "on_catalogue_product",
                stockstatus: "Available",
                rfid: "inactive-deleted",
                isdeleted: true,
            },
            {
                stocktype: "off_catalogue_product",
                stockstatus: "Available",
                rfid: "inactive-archived",
                isarchive: true,
            },
            {
                stocktype: "on_catalogue_product",
                stockstatus: "Available",
                rfid: "inactive-recycled",
                removefromrecyclebin: true,
            },
            {
                stocktype: "off_catalogue_product",
                stockstatus: "Available",
                rfid: "inactive-ewaste",
                ewaste: true,
            },
        ];

        for (const stock of invalidStocks) {
            assert.equal(isServiceEstimationCatalogueStock(stock), false);
        }
    });

    test("selected asset is reserved first and remaining quantity stays automatic", () => {
        assert.deepEqual(
            getServiceEstimationAssetAllocationPlan(3, [101]),
            {
                selectedStockIds: [101],
                remainingQuantity: 2,
            }
        );
        assert.deepEqual(
            getServiceEstimationAssetAllocationPlan(2, [101, 102]),
            {
                selectedStockIds: [101, 102],
                remainingQuantity: 0,
            }
        );
    });

    test("asset display matches In-Store Sales RFID-first mapping", () => {
        assert.equal(
            resolveServiceEstimationAssetNumber({
                rfid: "2341234123",
                assetnumber: "legacy-asset",
            }),
            "2341234123"
        );
        assert.equal(
            resolveServiceEstimationAssetNumber({
                rfid: null,
                assetnumber: "legacy-asset",
            }),
            "legacy-asset"
        );
    });

    test("one product row accepts exactly one selected RFID and quantity one", () => {
        assert.equal(isSingleAssetServiceEstimationUnit(1, 101), true);
        assert.equal(isSingleAssetServiceEstimationUnit(0, 101), false);
        assert.equal(isSingleAssetServiceEstimationUnit(2, 101), false);
        assert.equal(isSingleAssetServiceEstimationUnit(1, 0), false);
        assert.equal(isSingleAssetServiceEstimationUnit(1, Number.NaN), false);
    });

    test("duplicate, invalid, or excessive selected assets are rejected", () => {
        assert.throws(
            () => getServiceEstimationAssetAllocationPlan(2, [101, 101]),
            /same asset number/
        );
        assert.throws(
            () => getServiceEstimationAssetAllocationPlan(1, [101, 102]),
            /cannot exceed product quantity/
        );
        assert.throws(
            () => getServiceEstimationAssetAllocationPlan(1, [0]),
            /stock id is invalid/
        );
    });
});

describe("service estimation customer-state tax policy", () => {
    test("ticket address has priority and customer address is the fallback", () => {
        assert.equal(
            resolveServiceEstimationCustomerState("Tamil Nadu", "Assam"),
            "Tamil Nadu"
        );
        assert.equal(
            resolveServiceEstimationCustomerState(null, "Assam"),
            "Assam"
        );
        assert.equal(
            resolveServiceEstimationCustomerState("", ""),
            "Tamil Nadu"
        );
    });

    test("Assam uses IGST and Tamil Nadu uses CGST plus SGST", () => {
        assert.deepEqual(getServiceEstimationTaxContext("Assam"), {
            customerstate: "Assam",
            taxtype: "inter_state",
            taxlabel: "IGST 18%",
            cgst: 0,
            sgst: 0,
            igst: 18,
        });
        assert.deepEqual(getServiceEstimationTaxContext("Tamil Nadu"), {
            customerstate: "Tamil Nadu",
            taxtype: "intra_state",
            taxlabel: "CGST 9% + SGST 9%",
            cgst: 9,
            sgst: 9,
            igst: 0,
        });
    });
});
