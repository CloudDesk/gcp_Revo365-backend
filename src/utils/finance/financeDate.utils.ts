/** Normalize legacy epoch seconds and newer epoch milliseconds to seconds. */
export const normalizeFinanceEpochSeconds = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric >= 100_000_000_000 ? numeric / 1000 : numeric);
};

/** Return every calendar month touched by an inclusive ISO date range. */
export const listFinanceMonths = (from: string, to: string) => {
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
};

export const fillMonthlyFinanceTrend = <T extends { period: string; income: number; expense: number }>(
  from: string,
  to: string,
  rows: T[]
) => {
  const byPeriod = new Map(rows.map((row) => [row.period, row]));
  return listFinanceMonths(from, to).map((period) => byPeriod.get(period) || { period, income: 0, expense: 0 });
};
