const policyError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};
export const getServiceEstimationStockPersistencePlan = ({ isNew, previousStatus, nextStatus, allocations, }) => {
    if (!isNew &&
        allocations.total > 0 &&
        previousStatus === "approved" &&
        nextStatus !== "approved" &&
        allocations.sold > 0) {
        throw policyError("Use Cancel Service & Restore Stock to cancel an approved estimation");
    }
    if (!isNew &&
        allocations.restored > 0 &&
        (nextStatus === "waiting_for_approval" ||
            nextStatus === "approved")) {
        throw policyError("Restored estimation stock cannot be approved again; create a new estimation");
    }
    const allocate = isNew ||
        (nextStatus === "approved" &&
            previousStatus !== "approved" &&
            allocations.total === 0);
    const restoreHeld = nextStatus === "rejected" || nextStatus === "re_quote";
    return {
        allocate,
        sellHeld: nextStatus === "approved",
        restoreHeld,
        heldRestorationReason: nextStatus === "rejected"
            ? "estimation_rejected"
            : nextStatus === "re_quote"
                ? "estimation_requote"
                : null,
    };
};
export const canRestoreApprovedServiceStock = ({ estimationStatus, ticketStatus, invoiceGenerated, restorableQuantity, }) => estimationStatus === "approved" &&
    ticketStatus === "service_in_progress" &&
    !invoiceGenerated &&
    Number.isInteger(restorableQuantity) &&
    restorableQuantity > 0;
//# sourceMappingURL=serviceEstimationStockPolicy.js.map