const normalizedText = (value: unknown): string =>
  String(value ?? "").trim();

const normalizedLowerText = (value: unknown): string =>
  normalizedText(value).toLowerCase();

const INDIA_TIME_OFFSET_MILLISECONDS = 5.5 * 60 * 60 * 1000;

export const isEligibleEcommerceOrder = (orderRows: any[]): boolean => {
  if (!Array.isArray(orderRows) || orderRows.length === 0) return false;

  return orderRows.every(
    (row) =>
      normalizedLowerText(row?.ordername) === "online" &&
      normalizedLowerText(row?.invoicefor) === "product"
  );
};

export const resolveEcommercePaymentProvider = (transactionRow: any): string => {
  if (normalizedText(transactionRow?.razorpay_payment_id)) return "razorpay";

  const transactionData = transactionRow?.transactiondata || {};
  const explicitProvider = normalizedLowerText(transactionData?.provider);
  if (explicitProvider) return explicitProvider;

  if (
    normalizedLowerText(transactionData?.code) === "payment_success" ||
    normalizedText(transactionData?.data?.merchantTransactionId)
  ) {
    return "phonepe";
  }

  return "unknown";
};

export const resolveEcommercePaymentMethod = (
  transactionRow: any,
  orderRows: any[]
): string => {
  const transactionData = transactionRow?.transactiondata || {};
  return (
    normalizedLowerText(transactionData?.method) ||
    normalizedLowerText(transactionData?.data?.paymentInstrument?.type) ||
    normalizedLowerText(orderRows?.[0]?.paymentmethod) ||
    "*"
  );
};

export const resolveEcommercePaymentReference = (
  transactionRow: any
): string =>
  normalizedText(transactionRow?.razorpay_payment_id) ||
  normalizedText(transactionRow?.transactiondata?.data?.transactionId) ||
  normalizedText(transactionRow?.transactionid) ||
  normalizedText(transactionRow?.merchanttransactionid);

export const resolveEcommercePaymentDate = (transactionRow: any): string => {
  const rawEpoch =
    Number(transactionRow?.transactiondata?.created_at) ||
    Number(transactionRow?.createddate);
  const epochMilliseconds =
    rawEpoch > 10_000_000_000 ? rawEpoch : rawEpoch * 1000;
  const parsed = new Date(epochMilliseconds);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(Date.now() + INDIA_TIME_OFFSET_MILLISECONDS)
      .toISOString()
      .slice(0, 10);
  }
  return new Date(parsed.getTime() + INDIA_TIME_OFFSET_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
};

export const buildEcommerceCustomerName = (
  user: any,
  transactionRow: any
): string => {
  const fullName = [user?.firstname, user?.lastname]
    .map(normalizedText)
    .filter(Boolean)
    .join(" ");
  return (
    fullName ||
    normalizedText(user?.useremail) ||
    normalizedText(transactionRow?.name) ||
    "Customer"
  );
};
