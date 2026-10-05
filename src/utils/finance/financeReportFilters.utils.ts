import { FinanceValidationError } from "./finance.utils.js";

const SALES_REPORT_STATUSES = new Set(["pending", "partially_paid", "paid"]);
const SUPPLIER_REPORT_STATUSES = new Set([
  "in_progress",
  "complete",
  "overdue",
  "overdue_complete",
]);

export const normalizeFinanceReportStatus = (
  reportKey: string,
  value: unknown,
) => {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return "";

  const allowed = ["sales-invoices", "gst-outward"].includes(reportKey)
    ? SALES_REPORT_STATUSES
    : ["supplier-bills", "gst-inward"].includes(reportKey)
      ? SUPPLIER_REPORT_STATUSES
      : null;
  if (!allowed?.has(status)) {
    throw new FinanceValidationError(
      `status is not supported for ${reportKey}.`,
      400,
      "FINANCE_REPORT_STATUS_INVALID",
    );
  }
  return status;
};
