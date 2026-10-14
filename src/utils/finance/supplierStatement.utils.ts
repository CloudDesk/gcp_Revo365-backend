import { toMoney } from "./finance.utils.js";

export type SupplierStatementRow = {
  id: string;
  sourceid: number;
  transactiontype: "bill" | "supplier_payment";
  transactiondate: string;
  reference: string;
  description: string;
  billamount: number;
  paymentamount: number;
  allocatedamount?: number;
  settledamount: number;
  tdsamount: number;
  balance: number;
  status?: string | null;
  source?: string | null;
  bankcashaccountname?: string | null;
  bankname?: string | null;
  documentnumbers?: string[];
};

type SupplierStatementInputRow = Omit<SupplierStatementRow, "balance">;

const compareRows = (
  left: SupplierStatementInputRow,
  right: SupplierStatementInputRow
) => {
  const dateOrder = left.transactiondate.localeCompare(right.transactiondate);
  if (dateOrder !== 0) return dateOrder;
  if (left.transactiontype !== right.transactiontype) {
    return left.transactiontype === "bill" ? -1 : 1;
  }
  return left.id.localeCompare(right.id, undefined, { numeric: true });
};

const statementEffect = (row: SupplierStatementInputRow) =>
  toMoney(row.billamount - row.settledamount, "supplier statement effect");

export const buildSupplierStatement = (
  inputRows: SupplierStatementInputRow[],
  options: { fromdate?: string | null; todate?: string | null } = {}
) => {
  const rows = [...inputRows].sort(compareRows);
  const fromDate = options.fromdate || null;
  const toDate = options.todate || null;
  const openingPayable = toMoney(
    rows
      .filter((row) => Boolean(fromDate) && row.transactiondate < String(fromDate))
      .reduce((total, row) => total + statementEffect(row), 0),
    "opening payable"
  );
  const periodRows = rows.filter(
    (row) =>
      (!fromDate || row.transactiondate >= fromDate) &&
      (!toDate || row.transactiondate <= toDate)
  );

  let runningBalance = openingPayable;
  const records: SupplierStatementRow[] = periodRows.map((row) => {
    runningBalance = toMoney(
      runningBalance + statementEffect(row),
      "supplier statement balance"
    );
    return { ...row, balance: runningBalance };
  });

  return {
    records,
    summary: {
      openingpayable: openingPayable,
      billamount: toMoney(
        periodRows.reduce((total, row) => total + row.billamount, 0)
      ),
      paymentamount: toMoney(
        periodRows.reduce((total, row) => total + row.paymentamount, 0)
      ),
      settledamount: toMoney(
        periodRows.reduce((total, row) => total + row.settledamount, 0)
      ),
      tdspayable: toMoney(
        periodRows.reduce((total, row) => total + row.tdsamount, 0)
      ),
      closingpayable: runningBalance,
    },
  };
};
