export const FINANCE_SOURCE_TYPES = Object.freeze({
    ecommerceOrder: "ecommerce_order",
    customerReceipt: "customer_receipt",
    retailReceipt: "retail_receipt",
    serviceRequestReceipt: "service_request_receipt",
    rentalReceipt: "rental_receipt",
    supplierBillPayment: "supplier_bill_payment",
    manual: "manual",
});
export const LEGACY_RETAIL_RECEIPT_SOURCE_TYPES = Object.freeze([
    "retail_instore_receipt",
]);
export const getRetailReceiptSourceTypes = () => [
    FINANCE_SOURCE_TYPES.retailReceipt,
    ...LEGACY_RETAIL_RECEIPT_SOURCE_TYPES,
];
export const getCustomerReceiptSourceTypes = () => [
    FINANCE_SOURCE_TYPES.customerReceipt,
    ...getRetailReceiptSourceTypes(),
    FINANCE_SOURCE_TYPES.serviceRequestReceipt,
    FINANCE_SOURCE_TYPES.rentalReceipt,
];
export const resolveAgainstDocumentSourceId = (sourceReferences, requestReference) => {
    const uniqueReferences = Array.from(new Set(sourceReferences
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)));
    return uniqueReferences.length === 1
        ? uniqueReferences[0]
        : requestReference;
};
//# sourceMappingURL=financeSource.utils.js.map