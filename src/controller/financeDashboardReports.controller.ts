import { financeDashboardReportsService } from "../services/financeDashboardReports.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";
import ExcelJS from "exceljs";

export module financeDashboardReportsController {
  export const getDashboardSummary = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await financeDashboardReportsService.getDashboardSummary(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getReport = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await financeDashboardReportsService.getReport(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getDashboardInsights = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await financeDashboardReportsService.getDashboardInsights(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getDashboardAgeingDetails = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await financeDashboardReportsService.getDashboardAgeingDetails(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const exportReport = async (request: any, reply: any) => {
    try {
      const originalQuery = { ...(request.query || {}) };
      request.query = { ...originalQuery, page: 1, count: 10_000, export: "true" };
      const report: any = await financeDashboardReportsService.getReport(request);
      const allRows: any[] = (report.rows || []).slice(0, 10_000);
      request.query = originalQuery;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Revo365 Finance";
      workbook.created = new Date();
      const reportKey = String(request.params?.reportKey || "finance-report");
      const reportTitle = reportKey.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
      const totals = Object.entries(report.summary || report.totals || {});
      const friendlyLabel = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (value) => value.toUpperCase()).trim();
      const excludedExportKeys = new Set(["id", "accountid", "documenturl"]);
      const isDateKey = (key: string) => /date$/i.test(key);
      const formatExportDate = (value: unknown) => {
        if (value == null || String(value).trim() === "") return "-";
        const text = String(value).trim();
        const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoDate) return `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}`;
        const timestamp = typeof value === "number" || /^\d{10,13}$/.test(text) ? Number(value) : NaN;
        const parsed = Number.isFinite(timestamp) ? new Date(timestamp) : new Date(text);
        if (Number.isNaN(parsed.getTime())) return text;
        return new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
        }).format(parsed).replace(/\//g, "-");
      };
      const exportValue = (key: string, value: unknown) => {
        if (isDateKey(key)) return formatExportDate(value);
        if (value == null || (typeof value === "string" && value.trim() === "")) return "-";
        return typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value;
      };
      const navy = "FF173F7F"; const blue = "FF245493"; const paleBlue = "FFEDF4FF"; const border = "FFD7DFEB"; const slate = "FF60728F";
      const summary = workbook.addWorksheet("Summary");
      summary.mergeCells("A1:D1"); summary.getCell("A1").value = `TEQIT · ${reportTitle}`;
      summary.getCell("A1").font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } }; summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; summary.getCell("A1").alignment = { vertical: "middle" }; summary.getRow(1).height = 34;
      summary.mergeCells("A2:D2"); summary.getCell("A2").value = `Finance report from ${report.meta?.from || ""} to ${report.meta?.to || ""}`; summary.getCell("A2").font = { color: { argb: slate } }; summary.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };
      summary.addRow([]); summary.addRow(["Report information", "Value"]); summary.addRows([
        ["Matching records", report.total ?? allRows.length], ["Exported records", allRows.length],
        ["Generated at", report.meta?.generatedAt || new Date().toISOString()], ["Posted records only", report.meta?.postedOnly === false ? "No" : "Yes"],
        ["Export status", Number(report.total || 0) > allRows.length ? "Limited to 10,000 rows — refine filters" : "Complete"],
      ]);
      summary.addRow([]); summary.addRow(["Report totals", "Amount"]);
      totals.forEach(([key, value]) => { const row = summary.addRow([friendlyLabel(key), Number(value) || 0]); row.getCell(2).numFmt = '₹#,##0.00;[Red]-₹#,##0.00'; });
      [4, 11].forEach((rowNumber) => { const row = summary.getRow(rowNumber); row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } }; });
      summary.getColumn(1).width = 34; summary.getColumn(2).width = 30; summary.getColumn(3).width = 18; summary.getColumn(4).width = 18;
      summary.views = [{ state: "frozen", ySplit: 2 }];

      const details = workbook.addWorksheet("Report");
      const keys = allRows.length ? Object.keys(allRows[0]).filter((key) => !excludedExportKeys.has(key.toLowerCase())) : [];
      const columnCount = Math.max(keys.length, 2);
      details.mergeCells(1, 1, 1, columnCount); details.getCell(1, 1).value = `TEQIT · ${reportTitle}`; details.getCell(1, 1).font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } }; details.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; details.getCell(1, 1).alignment = { vertical: "middle" }; details.getRow(1).height = 32;
      details.mergeCells(2, 1, 2, columnCount); details.getCell(2, 1).value = `${report.meta?.from || ""} to ${report.meta?.to || ""}  |  ${report.total ?? allRows.length} matching record(s)`; details.getCell(2, 1).font = { color: { argb: slate } }; details.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };
      const headerRow = details.getRow(4); keys.forEach((key, index) => { const cell = headerRow.getCell(index + 1); cell.value = friendlyLabel(key).toUpperCase(); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } }; cell.alignment = { vertical: "middle", wrapText: true }; }); headerRow.height = 24;
      allRows.forEach((record, rowIndex) => { const row = details.addRow(keys.map((key) => exportValue(key, record[key]))); row.height = 21; if (rowIndex % 2) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7FC" } }; row.eachCell((cell) => { cell.alignment = { vertical: "middle", wrapText: true }; if (typeof cell.value === "number") cell.numFmt = '₹#,##0.00;[Red]-₹#,##0.00'; }); });
      if (!allRows.length) { details.mergeCells(5, 1, 5, columnCount); details.getCell(5, 1).value = "No matching records."; details.getCell(5, 1).alignment = { horizontal: "center" }; details.getCell(5, 1).font = { color: { argb: slate } }; }
      const totalsStart = Math.max(6, 5 + allRows.length + 2); details.mergeCells(totalsStart, 1, totalsStart, columnCount); details.getCell(totalsStart, 1).value = "REPORT TOTALS"; details.getCell(totalsStart, 1).font = { bold: true, color: { argb: "FFFFFFFF" } }; details.getCell(totalsStart, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
      totals.forEach(([key, value], index) => { const rowNumber = totalsStart + 1 + Math.floor(index / 4); const pair = index % 4; const labelColumn = pair * 2 + 1; if (labelColumn + 1 > columnCount) return; const labelCell = details.getCell(rowNumber, labelColumn); const valueCell = details.getCell(rowNumber, labelColumn + 1); labelCell.value = friendlyLabel(key); valueCell.value = Number(value) || 0; valueCell.numFmt = '₹#,##0.00;[Red]-₹#,##0.00'; labelCell.font = { bold: true, color: { argb: slate } }; valueCell.font = { bold: true, color: { argb: "FF10284E" } }; [labelCell, valueCell].forEach((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } }; }); });
      keys.forEach((key, index) => { details.getColumn(index + 1).width = Math.min(Math.max(friendlyLabel(key).length + 5, /name|party|document|account/i.test(key) ? 24 : 14), 34); });
      details.views = [{ state: "frozen", ySplit: 4 }];
      details.autoFilter = keys.length ? { from: { row: 4, column: 1 }, to: { row: 4, column: keys.length } } : undefined;
      details.eachRow((row, rowNumber) => row.eachCell((cell) => { if (rowNumber >= 4) cell.border = { bottom: { style: "thin", color: { argb: border } } }; }));
      details.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
      details.headerFooter.oddFooter = `TEQIT Finance · ${reportTitle} · Page &P of &N`;
      const buffer = await workbook.xlsx.writeBuffer();
      const name = `TEQIT_${reportKey.replace(/-/g, "_")}_${report.meta?.from || ""}_to_${report.meta?.to || ""}.xlsx`;
      return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${name}"`).send(Buffer.from(buffer));
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };
}
