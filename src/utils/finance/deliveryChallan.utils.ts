import { FinanceValidationError } from "./finance.utils.js";

export type DeliverableInvoiceLine = {
  invoicelinekey: string;
  productid: number | null;
  productname: string;
  invoicequantity: number;
  unit: string;
  unitrate: number | null;
  lineamount: number | null;
};

const parseInvoiceJson = (value: unknown): any => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
};

const positiveQuantity = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const moneyValue = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

export const extractDeliverableInvoiceLines = (
  invoiceData: unknown
): DeliverableInvoiceLine[] => {
  const document = parseInvoiceJson(invoiceData);
  const items = Array.isArray(document?.items) ? document.items : [];
  const seen = new Set<string>();

  return items.flatMap((item: any, index: number) => {
    const invoicequantity = positiveQuantity(item?.quantity);
    if (!invoicequantity) return [];

    const rawOrderLine = item?.orderlineid ?? item?.orderlinenumber;
    const rawItemLine = item?.id;
    let invoicelinekey = rawOrderLine != null && String(rawOrderLine).trim()
      ? `orderline:${String(rawOrderLine).trim()}`
      : rawItemLine != null && String(rawItemLine).trim()
        ? `item:${String(rawItemLine).trim()}`
        : `index:${index + 1}`;

    // A malformed legacy document must not collapse two lines into one.
    if (seen.has(invoicelinekey)) invoicelinekey = `${invoicelinekey}:index:${index + 1}`;
    seen.add(invoicelinekey);

    const productId = Number(item?.productid);
    const unitrate = moneyValue(item?.unitrate ?? item?.unitPrice ?? item?.rate ?? item?.price ?? item?.mrp);
    const lineamount = moneyValue(item?.totalamount ?? item?.totalMRP ?? item?.amount ?? item?.subtotal);
    return [{
      invoicelinekey,
      productid: Number.isSafeInteger(productId) && productId > 0 ? productId : null,
      productname: String(item?.productname || item?.name || item?.description || `Item ${index + 1}`).trim(),
      invoicequantity,
      unit: String(item?.unit || "Nos").trim() || "Nos",
      unitrate,
      lineamount,
    }];
  });
};

export const validateDeliveryQuantities = (
  availableLines: DeliverableInvoiceLine[],
  previouslyDelivered: Map<string, number>,
  requestedLines: Array<{ invoicelinekey?: unknown; deliveryquantity?: unknown }>
) => {
  if (!Array.isArray(requestedLines) || requestedLines.length === 0) {
    throw new FinanceValidationError("At least one Delivery Challan line is required.");
  }

  const availableByKey = new Map(availableLines.map((line) => [line.invoicelinekey, line]));
  const submitted = new Set<string>();
  return requestedLines.map((requested, index) => {
    const key = String(requested?.invoicelinekey || "").trim();
    if (!key || submitted.has(key)) {
      throw new FinanceValidationError(`Delivery line ${index + 1} is invalid or duplicated.`);
    }
    submitted.add(key);

    const invoiceLine = availableByKey.get(key);
    if (!invoiceLine) {
      throw new FinanceValidationError(`Delivery line ${index + 1} does not belong to the selected Invoice.`);
    }
    const deliveryquantity = Number(requested?.deliveryquantity);
    if (!Number.isSafeInteger(deliveryquantity) || deliveryquantity < 1) {
      throw new FinanceValidationError(`Delivery quantity for ${invoiceLine.productname} must be a whole number of at least one.`);
    }
    const delivered = Number(previouslyDelivered.get(key) || 0);
    const remaining = Math.max(invoiceLine.invoicequantity - delivered, 0);
    if (deliveryquantity > remaining) {
      throw new FinanceValidationError(
        `Delivery quantity for ${invoiceLine.productname} cannot exceed the remaining quantity ${remaining}.`
      );
    }
    return { ...invoiceLine, deliveryquantity };
  });
};

export type ManualDeliveryLine = {
  linesource: "product" | "custom";
  productid: number | null;
  productname: string;
  deliveryquantity: number;
  unit: string;
  assetreference: string | null;
};

export const validateManualDeliveryLines = (requestedLines: any): ManualDeliveryLine[] => {
  if (!Array.isArray(requestedLines) || requestedLines.length === 0) {
    throw new FinanceValidationError("At least one Delivery Challan line is required.");
  }
  return requestedLines.map((line: any, index: number) => {
    const productId = Number(line?.productid);
    const productid = Number.isSafeInteger(productId) && productId > 0 ? productId : null;
    const productname = String(line?.productname || "").trim();
    const deliveryquantity = Number(line?.deliveryquantity);
    const unit = String(line?.unit || "Nos").trim();
    const assetreference = String(line?.assetreference || "").trim() || null;
    if (!productname || productname.length > 500) {
      throw new FinanceValidationError(`Item description for line ${index + 1} is required and cannot exceed 500 characters.`);
    }
    if (!Number.isSafeInteger(deliveryquantity) || deliveryquantity < 1) {
      throw new FinanceValidationError(`Quantity for ${productname} must be a whole number of at least one.`);
    }
    if (!unit || unit.length > 30) {
      throw new FinanceValidationError(`Unit for ${productname} is required and cannot exceed 30 characters.`);
    }
    if (assetreference && assetreference.length > 255) {
      throw new FinanceValidationError(`Asset reference for ${productname} cannot exceed 255 characters.`);
    }
    return { linesource: productid ? "product" : "custom", productid, productname, deliveryquantity, unit, assetreference };
  });
};
