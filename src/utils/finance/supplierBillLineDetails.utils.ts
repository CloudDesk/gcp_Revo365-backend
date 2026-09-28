export type SupplierBillLineDetail = {
  billId: number;
  lineId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  storedLineTotal: number | null;
  variance: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const finiteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseLines = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const resolveSupplierBillLineDetails = (
  billId: unknown,
  productData: unknown
): SupplierBillLineDetail[] => parseLines(productData).map((line, index) => {
  const quantity = Math.max(finiteNumber(line?.quantity ?? line?.qty), 0);
  const unitPrice = Math.max(finiteNumber(
    line?.unitPrice ?? line?.unitprice ?? line?.unit_price ?? line?.rate
  ), 0);
  const lineTotal = money(quantity * unitPrice);
  const storedTotalValue = line?.total ?? line?.totalamount ?? line?.lineTotal;
  const hasStoredTotal = storedTotalValue !== null
    && storedTotalValue !== undefined
    && storedTotalValue !== ""
    && Number.isFinite(Number(storedTotalValue));
  const storedLineTotal = hasStoredTotal ? money(Number(storedTotalValue)) : null;

  return {
    billId: Number(billId) || 0,
    lineId: String(line?.lineid ?? line?.lineId ?? line?.id ?? index + 1),
    description: String(
      line?.name ?? line?.description ?? line?.productname ?? line?.productName ?? `Line ${index + 1}`
    ).trim() || `Line ${index + 1}`,
    quantity,
    unitPrice: money(unitPrice),
    lineTotal,
    storedLineTotal,
    variance: money((storedLineTotal ?? lineTotal) - lineTotal),
  };
});

export const summarizeSupplierBillLines = (lines: SupplierBillLineDetail[]) => ({
  lineCount: lines.length,
  totalQuantity: money(lines.reduce((sum, line) => sum + line.quantity, 0)),
  lineSubtotal: money(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
  storedLineSubtotal: money(lines.reduce((sum, line) => sum + (line.storedLineTotal ?? line.lineTotal), 0)),
  lineVariance: money(lines.reduce((sum, line) => sum + line.variance, 0)),
});
