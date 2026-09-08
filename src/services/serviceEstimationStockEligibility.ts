export const SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES = [
    "on_catalogue_product",
    "off_catalogue_product",
] as const;

type ServiceEstimationStockCandidate = {
    stocktype?: string | null;
    stockstatus?: string | null;
    rfid?: string | number | null;
    assetnumber?: string | number | null;
    isdeleted?: boolean | number | string | null;
    isarchive?: boolean | number | string | null;
    removefromrecyclebin?: boolean | number | string | null;
    ewaste?: boolean | number | string | null;
};

const isEnabledFlag = (value: unknown) =>
    value === true || value === 1 || value === "1" || value === "true";

export const isServiceEstimationCatalogueStock = (
    stock: ServiceEstimationStockCandidate
) =>
    stock.stockstatus === "Available" &&
    SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES.includes(
        stock.stocktype as (typeof SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES)[number]
    ) &&
    !isEnabledFlag(stock.isdeleted) &&
    !isEnabledFlag(stock.isarchive) &&
    !isEnabledFlag(stock.removefromrecyclebin) &&
    !isEnabledFlag(stock.ewaste) &&
    String(stock.rfid ?? stock.assetnumber ?? "").trim().length > 0;

export const resolveServiceEstimationAssetNumber = (
    stock: Pick<ServiceEstimationStockCandidate, "rfid" | "assetnumber">
) => String(stock.rfid ?? stock.assetnumber ?? "").trim();

export const isSingleAssetServiceEstimationUnit = (
    quantity: number,
    selectedStockId: number
) =>
    quantity === 1 &&
    Number.isInteger(selectedStockId) &&
    selectedStockId > 0;

export const getServiceEstimationAssetAllocationPlan = (
    quantity: number,
    selectedStockIds: number[]
) => {
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Service estimation quantity must be a positive integer");
    }

    const normalizedStockIds = selectedStockIds.map(Number);
    if (
        normalizedStockIds.some(
            (stockId) => !Number.isInteger(stockId) || stockId <= 0
        )
    ) {
        throw new Error("Selected asset stock id is invalid");
    }

    const uniqueStockIds = [...new Set(normalizedStockIds)];
    if (uniqueStockIds.length !== normalizedStockIds.length) {
        throw new Error("The same asset number cannot be selected more than once");
    }
    if (uniqueStockIds.length > quantity) {
        throw new Error("Selected asset count cannot exceed product quantity");
    }

    return {
        selectedStockIds: uniqueStockIds,
        remainingQuantity: quantity - uniqueStockIds.length,
    };
};
