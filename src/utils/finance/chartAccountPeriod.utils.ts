import {
  FinanceValidationError,
  requireIsoDate,
} from "./finance.utils.js";

export type ChartAccountDateRange = {
  fromDate: string | null;
  toDate: string | null;
};

export const resolveChartAccountDateRange = (
  queryData: Record<string, unknown> = {}
): ChartAccountDateRange => {
  const fromDate = queryData.fromdate
    ? requireIsoDate(queryData.fromdate, "fromdate")
    : null;
  const toDate = queryData.todate
    ? requireIsoDate(queryData.todate, "todate")
    : null;

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    throw new FinanceValidationError("Select both From date and To date.");
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new FinanceValidationError("From date cannot be later than To date.");
  }

  return { fromDate, toDate };
};
