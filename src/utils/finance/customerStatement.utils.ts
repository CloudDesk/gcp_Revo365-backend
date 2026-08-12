import { toMoney } from "./finance.utils.js";

export type CustomerStatementRow = {
  id: string;
  sourceid: number;
  transactiontype: "invoice" | "customer_payment";
  transactiondate: string;
  reference: string;
  description: string;
  invoiceamount: number;
  paymentamount: number;
  allocatedamount?: number;
  settledamount: number;
  tdsamount: number;
  unappliedamount: number;
  balance: number;
  status?: string | null;
  source?: string | null;
  allocationmethod?: string | null;
  bankcashaccountname?: string | null;
  bankname?: string | null;
};

type StatementInputRow = Omit<CustomerStatementRow, "balance">;

const compareRows = (left: StatementInputRow, right: StatementInputRow) => {
  const dateOrder = left.transactiondate.localeCompare(right.transactiondate);
  if (dateOrder !== 0) return dateOrder;
  if (left.transactiontype !== right.transactiontype) {
    return left.transactiontype === "invoice" ? -1 : 1;
  }
  return left.id.localeCompare(right.id, undefined, { numeric: true });
};

const statementEffect = (row: StatementInputRow) =>
  toMoney(row.invoiceamount - row.settledamount, "statement effect");

export const buildCustomerStatement = (
  inputRows: StatementInputRow[],
  options: { fromdate?: string | null; todate?: string | null } = {}
) => {
  const rows = [...inputRows].sort(compareRows);
  const fromDate = options.fromdate || null;
  const toDate = options.todate || null;
  const openingReceivable = toMoney(
    rows
      .filter((row) => Boolean(fromDate) && row.transactiondate < String(fromDate))
      .reduce((total, row) => total + statementEffect(row), 0),
    "opening receivable"
  );
  const periodRows = rows.filter(
    (row) =>
      (!fromDate || row.transactiondate >= fromDate) &&
      (!toDate || row.transactiondate <= toDate)
  );

  let runningBalance = openingReceivable;
  const records: CustomerStatementRow[] = periodRows.map((row) => {
    runningBalance = toMoney(
      runningBalance + statementEffect(row),
      "statement balance"
    );
    return { ...row, balance: runningBalance };
  });

  return {
    records,
    summary: {
      openingreceivable: openingReceivable,
      invoiceamount: toMoney(
        periodRows.reduce((total, row) => total + row.invoiceamount, 0)
      ),
      paymentamount: toMoney(
        periodRows.reduce((total, row) => total + row.paymentamount, 0)
      ),
      settledamount: toMoney(
        periodRows.reduce((total, row) => total + row.settledamount, 0)
      ),
      tdsreceivable: toMoney(
        periodRows.reduce((total, row) => total + row.tdsamount, 0)
      ),
      unappliedamount: toMoney(
        periodRows.reduce((total, row) => total + row.unappliedamount, 0)
      ),
      closingreceivable: runningBalance,
    },
  };
};

export const toCustomerStatementDate = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  const normalized = String(value).trim();
  const dateOnly = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
  if (dateOnly) return dateOnly;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  return new Date(milliseconds + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
};
