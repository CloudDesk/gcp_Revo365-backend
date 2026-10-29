import { FinanceValidationError } from "./finance.utils.js";

export type DeliverableInvoiceLine = {
  invoicelinekey: string;
  productid: number | null;
  productname: string;
  invoicequantity: number;
  unit: string;
  unitrate: number | null;
  lineamount: number | null;
  hsnsaccode: string | null;
  taxableamount: number | null;
  gstrate: number | null;
  gstamount: number | null;
  totalamount: number | null;
};

export type InvoiceDeliveryAddressContext = {
  billingaddress: string | null;
  recipientaddress: string | null;
  recipientname: string | null;
  recipientphone: string | null;
  recipientemail: string | null;
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

const textValue = (...values: unknown[]): string | null => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return null;
};

const addressSnapshot = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseInvoiceJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    && Object.keys(parsed).length > 0 ? parsed : null;
};

const formatAddressSnapshot = (snapshot: Record<string, unknown> | null): string | null => {
  if (!snapshot) return null;
  const formatted = textValue(snapshot.formattedaddress, snapshot.formattedAddress);
  if (formatted) return formatted;
  const parts = [
    snapshot.doornumber,
    snapshot.address,
    snapshot.landmark,
    snapshot.city,
    snapshot.state,
    snapshot.pincode,
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

export const extractInvoiceDeliveryAddressContext = (
  billingSnapshotValue: unknown,
  shippingSnapshotValue: unknown,
  invoiceCustomerValue?: unknown
): InvoiceDeliveryAddressContext => {
  const invoiceCustomer = addressSnapshot(invoiceCustomerValue);
  const billing = addressSnapshot(billingSnapshotValue) || invoiceCustomer;
  const shipping = addressSnapshot(shippingSnapshotValue);
  const recipient = shipping || billing;
  return {
    billingaddress: formatAddressSnapshot(billing),
    recipientaddress: formatAddressSnapshot(recipient),
    recipientname: textValue(recipient?.name, recipient?.customername, billing?.name, billing?.customername),
    recipientphone: textValue(recipient?.mobilenumber, recipient?.phonenumber, recipient?.phone,
      billing?.mobilenumber, billing?.phonenumber, billing?.phone),
    recipientemail: textValue(recipient?.email, recipient?.useremail, billing?.email, billing?.useremail),
  };
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
    const taxableamount = moneyValue(item?.taxableamount ?? item?.taxableAmount
      ?? item?.taxablevalue ?? item?.taxableValue ?? item?.subtotal ?? item?.amount);
    const cgst = moneyValue(item?.cgstamount ?? item?.cgstAmount ?? item?.cgst) || 0;
    const sgst = moneyValue(item?.sgstamount ?? item?.sgstAmount ?? item?.sgst) || 0;
    const igst = moneyValue(item?.igstamount ?? item?.igstAmount ?? item?.igst) || 0;
    const gstamount = moneyValue(item?.gstamount ?? item?.gstAmount ?? item?.taxamount ?? item?.taxAmount
      ?? item?.totalgst ?? item?.totalGst) ?? Math.round((cgst + sgst + igst) * 100) / 100;
    const totalamount = moneyValue(item?.totalamount ?? item?.totalMRP ?? item?.grandtotal)
      ?? (taxableamount == null ? moneyValue(item?.amount) : Math.round((taxableamount + gstamount) * 100) / 100);
    const lineamount = totalamount;
    const explicitRate = moneyValue(item?.gstrate ?? item?.gstRate ?? item?.taxpercentage ?? item?.taxPercentage
      ?? item?.taxpercent ?? item?.taxPercent ?? item?.gstpercentage ?? item?.gstPercentage);
    const gstrate = explicitRate ?? (taxableamount && gstamount ? Math.round((gstamount / taxableamount) * 10000) / 100 : 0);
    return [{
      invoicelinekey,
      productid: Number.isSafeInteger(productId) && productId > 0 ? productId : null,
      productname: String(item?.productname || item?.name || item?.description || `Item ${index + 1}`).trim(),
      invoicequantity,
      unit: String(item?.unit || "Nos").trim() || "Nos",
      unitrate,
      lineamount,
      hsnsaccode: String(item?.hsnsaccode ?? item?.hsncode ?? item?.saccode ?? item?.hsn ?? "").trim() || null,
      taxableamount,
      gstrate,
      gstamount,
      totalamount,
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
  hsnsaccode: string | null;
  unitrate: number | null;
  taxableamount: number | null;
  gstrate: number | null;
  gstamount: number | null;
  totalamount: number | null;
};

export const resolveDeliveryChallanDocumentAccess = (
  showAmounts: unknown,
  canViewInvoiceAmounts: boolean
) => {
  const canViewAmounts = showAmounts === true && canViewInvoiceAmounts;
  return {
    canViewAmounts,
    canAccessDocument: showAmounts !== true || canViewAmounts,
  };
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
    const hsnsaccode = String(line?.hsnsaccode || "").trim() || null;
    const unitrate = moneyValue(line?.unitrate);
    const gstrate = moneyValue(line?.gstrate) ?? 0;
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
    if (hsnsaccode && hsnsaccode.length > 64) {
      throw new FinanceValidationError(`HSN/SAC code for ${productname} cannot exceed 64 characters.`);
    }
    if (unitrate != null && unitrate < 0) {
      throw new FinanceValidationError(`Amounts for ${productname} cannot be negative.`);
    }
    if (gstrate < 0 || gstrate > 28) {
      throw new FinanceValidationError(`GST rate for ${productname} must be between 0 and 28 percent.`);
    }
    // Computed amounts are authoritative server values. Browser-supplied
    // taxable/GST/total fields are intentionally ignored.
    const taxableamount = unitrate == null
      ? null
      : Math.round(unitrate * deliveryquantity * 100) / 100;
    const gstamount = taxableamount == null
      ? null
      : Math.round(taxableamount * gstrate) / 100;
    const totalamount = taxableamount == null
      ? null
      : Math.round((taxableamount + (gstamount || 0)) * 100) / 100;
    return { linesource: productid ? "product" : "custom", productid, productname, deliveryquantity, unit, assetreference, hsnsaccode, unitrate, taxableamount, gstrate, gstamount, totalamount };
  });
};
