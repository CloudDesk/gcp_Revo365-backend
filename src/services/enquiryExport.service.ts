import ExcelJS from "exceljs";
import { query } from "../database/postgres.js";

// ─── Field → Header mappings ─────────────────────────────────────────────────

const CORPORATE_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "id", header: "ID", width: 8 },
  { key: "recordtype", header: "Record Type", width: 14 },
  { key: "first_name", header: "First Name", width: 18 },
  { key: "last_name", header: "Last Name", width: 18 },
  { key: "email", header: "Email", width: 30 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "company", header: "Company", width: 22 },
  { key: "fleet", header: "Fleet / Count", width: 16 },
  { key: "preferred_date", header: "Preferred Date", width: 22 },
  { key: "notes", header: "Notes", width: 35 },
  { key: "status", header: "Status", width: 12 },
  { key: "created_at", header: "Created At", width: 22 },
];

const INDIVIDUAL_COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "id", header: "ID", width: 8 },
  { key: "recordtype", header: "Record Type", width: 14 },
  { key: "first_name", header: "First Name", width: 18 },
  { key: "last_name", header: "Last Name", width: 18 },
  { key: "email", header: "Email", width: 30 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "topic", header: "Topic", width: 22 },
  { key: "message", header: "Message", width: 40 },
  { key: "status", header: "Status", width: 12 },
  { key: "created_at", header: "Created At", width: 22 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDisplayDate = (date) =>
  date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });

/**
 * Formats a JS Date (or ISO string) to "YYYY-MM-DD HH:MM" in IST.
 */
const formatDateTimeIST = (value: Date | string | null | undefined): string => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);

  return d.toLocaleString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .replace(", ", " ")   // "2025-03-12, 22:05" → "2025-03-12 22:05"
    .replace(",", " ");
};

/**
 * Applies bold white-on-dark-blue header styling to a single header row.
 */
const styleHeaderRow = (
  row: ExcelJS.Row,
  colCount: number
): void => {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F3864" }, // dark navy blue
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  }
  row.height = 22;
};

/**
 * Applies thin border + vertical-middle alignment to a data row.
 */
const styleDataRow = (row: ExcelJS.Row): void => {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.alignment = { vertical: "middle", wrapText: false };
  });
};

/**
 * Builds one worksheet (Corporate or Individual) from the provided rows.
 */
const buildSheet = (
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: { key: string; header: string; width: number }[],
  rows: Record<string, any>[],
  rangeLabel?: string
): void => {
  const ws = workbook.addWorksheet(sheetName);

  // ── 1. Set column widths (keys only — no auto-header yet) ──────────────────
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  // ── 2. Created-On stamp (top-right area, Row 1) ────────────────────────────
  const createdOn = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const lastColLetter = String.fromCharCode(64 + columns.length); // e.g. "L" for 12 cols
  const stampCell = ws.getRow(1).getCell(columns.length);
  stampCell.value = `Generated: ${createdOn}`;
  stampCell.alignment = { horizontal: "right" };
  stampCell.font = { size: 10, italic: true, color: { argb: "FF555555" } };

  // ── 3. Sheet title (Row 2, merged across all columns) ─────────────────────
  ws.mergeCells(`A2:${lastColLetter}2`);
  const titleCell = ws.getCell("A2");
  titleCell.value = rangeLabel
    ? `Enquiries — ${sheetName}  |  ${rangeLabel}`
    : `Enquiries — ${sheetName}`;
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1F3864" } };
  ws.getRow(2).height = 28;

  // ── 4. Header row (Row 3) ──────────────────────────────────────────────────
  const headerRow = ws.getRow(3);
  columns.forEach((col, idx) => {
    headerRow.getCell(idx + 1).value = col.header;
  });
  styleHeaderRow(headerRow, columns.length);

  // ── 5. Data rows ───────────────────────────────────────────────────────────
  rows.forEach((record) => {
    const rowData: Record<string, any> = {};
    columns.forEach((col) => {
      const raw = record[col.key];
      // Format date fields
      if (col.key === "created_at" || col.key === "preferred_date") {
        rowData[col.key] = formatDateTimeIST(raw);
      } else {
        rowData[col.key] = raw ?? "";
      }
    });
    const dataRow = ws.addRow(rowData);
    styleDataRow(dataRow);
  });

  // ── 6. Auto-filter on header row ───────────────────────────────────────────
  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: columns.length },
  };

  // ── 7. Freeze pane below header ────────────────────────────────────────────
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
};

// ─── Public service export ────────────────────────────────────────────────────

export interface EnquiryExportFilters {
  /** Start of the date range (inclusive). ISO date string e.g. "2025-01-01" */
  from?: string;
  /**
   * End of the date range (inclusive).
   * Defaults to the current moment when not supplied.
   */
  to?: string;
}

export module enquiryExportService {
  /**
   * Fetches rows from enquiry_submissions within the given date range,
   * splits by recordtype, and returns an ExcelJS workbook with two sheets:
   * Corporate & Individual.
   *
   * @param filters.from  Start date (inclusive) — required
   * @param filters.to    End   date (inclusive) — optional, defaults to now
   */
  export const generateEnquiryExcel = async (
    filters: EnquiryExportFilters
  ): Promise<ExcelJS.Workbook> => {
    // ── IST-aware boundary construction ──────────────────────────────────────
    // IMPORTANT: setHours() works in the SERVER's local TZ.
    // On GCP Cloud Run the server runs in UTC, so setHours(0,0,0,0) would
    // resolve to 00:00 UTC = 05:30 IST — missing the first 5.5 hours of data.
    //
    // Fix: embed the +05:30 offset directly into the ISO string so JavaScript
    // parses it as IST regardless of the host machine's timezone.
    //
    //   from=2025-01-01 → "2025-01-01T00:00:00.000+05:30" = 2024-12-31T18:30:00Z  ✅
    //   to=2025-03-12   → "2025-03-12T23:59:59.999+05:30" = 2025-03-12T18:29:59Z  ✅
    //
    // A record saved at IST 00:00 on Mar 13 = 2025-03-12T18:30:00Z
    //   → NOT included in to=2025-03-12  ✅
    //   → IS  included in from=2025-03-13 ✅
    const fromDate = filters.from
      ? new Date(`${filters.from}T00:00:00.000+05:30`)
      : new Date('1970-01-01T00:00:00.000+05:30');
    const toDate = filters.to
      ? new Date(`${filters.to}T23:59:59.999+05:30`)
      : new Date(); // no `to` → up to the exact current moment

    const sql = `
      SELECT
        id, recordtype,
        first_name, last_name, email, phone,
        company, fleet, preferred_date, notes,
        topic, message,
        status, created_at
      FROM enquiry_submissions
      WHERE created_at >= $1
        AND created_at <= $2
      ORDER BY created_at DESC
    `;

    const result = await query(sql, [fromDate.toISOString(), toDate.toISOString()]);
    const allRows: Record<string, any>[] = result?.rows ?? [];

    const corporateRows = allRows.filter((r) => r.recordtype === "corporate");
    const individualRows = allRows.filter((r) => r.recordtype === "individual");

    // Human-readable label used in the sheet title
    // const rangeLabel = filters.to
    //   ? `${filters.from}  to  ${filters.to}`
    //   : `${filters.from}  to  Now`;
    const fromLabel = filters.from ? formatDisplayDate(fromDate) : 'Beginning';
    const toLabel = filters.to ? formatDisplayDate(toDate) : 'Now';
    const rangeLabel = `${fromLabel} to ${toLabel}`;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Revo365 Backend";
    workbook.created = new Date();
    workbook.modified = new Date();

    buildSheet(workbook, "Corporate", CORPORATE_COLUMNS, corporateRows, rangeLabel);
    buildSheet(workbook, "Individual", INDIVIDUAL_COLUMNS, individualRows, rangeLabel);

    return workbook;
  };
}
