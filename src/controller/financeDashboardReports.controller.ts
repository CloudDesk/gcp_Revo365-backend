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
      const allowedViews = new Set(["sales-invoices", "supplier-bills", "gst-inward", "gst-outward", "outward-ist-portal", "profit-loss", "balance-sheet", "trial-balance", "tds-receivable", "tds-payable"]);
      const rawRequestedView = String(originalQuery.view || "").trim().toLowerCase();
      const requestedView = allowedViews.has(rawRequestedView) ? rawRequestedView : "";
      const tdsDirection = requestedView === "tds-receivable" ? "customer" : requestedView === "tds-payable" ? "company" : originalQuery.direction;
      request.query = { ...originalQuery, direction: tdsDirection, page: 1, count: 10_000, export: "true" };
      const report: any = await financeDashboardReportsService.getReport(request);
      const allRows: any[] = (report.rows || []).slice(0, 10_000);
      request.query = originalQuery;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Revo365 Finance";
      workbook.created = new Date();
      const apiReportKey = String(request.params?.reportKey || "finance-report");
      const reportKey = requestedView || apiReportKey;
      const reportTitle = reportKey.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
      const rawTotals = report.summary || report.totals || {};
      const selectedTotals = reportKey === "tds-receivable"
        ? { tdsReceivable: Number(rawTotals.deductedByCustomers || 0) }
        : reportKey === "tds-payable"
          ? { tdsPayable: Number(rawTotals.deductedByUs || 0) }
          : rawTotals;
      const totals = Object.entries(selectedTotals);
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
      if (reportKey === "outward-ist-portal") {
        const sheet = workbook.addWorksheet("Outward Supplies");
        sheet.mergeCells("A1:E1"); sheet.getCell("A1").value = "TEQIT · Outward IST Portal";
        sheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } }; sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; sheet.getCell("A1").alignment = { vertical: "middle" }; sheet.getRow(1).height = 32;
        sheet.mergeCells("A2:E2"); sheet.getCell("A2").value = `${report.meta?.from || ""} to ${report.meta?.to || ""}  |  ${allRows.length} record(s)`; sheet.getCell("A2").font = { color: { argb: slate } }; sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } }; sheet.getRow(2).height = 22;
        sheet.addRow([]);
        const header = sheet.addRow(["Description", "IGST Amount", "CGST Amount", "SGST Amount", "Invoice Total"]);
        header.font = { bold: true, color: { argb: "FFFFFFFF" } }; header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } }; header.height = 26;
        header.eachCell((cell, column) => { cell.alignment = { horizontal: column === 1 ? "left" : "right", vertical: "middle" }; });
        allRows.forEach((record, rowIndex) => {
          const row = sheet.addRow([record.description, Number(record.igstAmount || 0), Number(record.cgstAmount || 0), Number(record.sgstAmount || 0), Number(record.invoiceTotal || 0)]);
          if (rowIndex % 2) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7FC" } };
          row.eachCell((cell, column) => { cell.alignment = { horizontal: column === 1 ? "left" : "right", vertical: "middle", wrapText: true }; cell.border = { bottom: { style: "thin", color: { argb: border } } }; if (column > 1) cell.numFmt = '₹#,##0.00;[Red]-₹#,##0.00;₹0.00'; });
          row.height = 32;
        });
        [58, 18, 18, 18, 20].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
        sheet.views = [{ state: "frozen", ySplit: 4 }];
        sheet.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
        const buffer = await workbook.xlsx.writeBuffer();
        const name = `TEQIT_outward_ist_portal_${report.meta?.from || ""}_to_${report.meta?.to || ""}.xlsx`;
        return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${name}"`).send(Buffer.from(buffer));
      }
      if (reportKey === "balance-sheet") {
        const sheet = workbook.addWorksheet("Balance Sheet");
        const moneyFormat = '₹#,##0.00;[Red]-₹#,##0.00;₹0.00';
        const sectionTypes = ["asset", "liability", "equity"];
        const sectionLabels: Record<string, string> = { asset: "ASSETS", liability: "LIABILITIES", equity: "EQUITY" };
        const amountFor = (record: any) => String(record.accountType).toLowerCase() === "asset"
          ? Number(record.closingDebit || 0) - Number(record.closingCredit || 0)
          : Number(record.closingCredit || 0) - Number(record.closingDebit || 0);
        sheet.mergeCells("A1:K1"); sheet.getCell("A1").value = "TEQIT - Balance Sheet";
        sheet.getCell("A1").font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } }; sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; sheet.getCell("A1").alignment = { vertical: "middle" }; sheet.getRow(1).height = 34;
        sheet.mergeCells("A2:K2"); sheet.getCell("A2").value = `Financial position from ${formatExportDate(report.meta?.from)} to ${formatExportDate(report.meta?.to)}`; sheet.getCell("A2").font = { color: { argb: slate } }; sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };
        sheet.addRow([]);
        let serial = 1;
        const sectionTotals: Record<string, number> = {};
        sectionTypes.forEach((type) => {
          const records = allRows.filter((record) => String(record.accountType || "").toLowerCase() === type);
          const sectionRow = sheet.addRow([sectionLabels[type]]); sheet.mergeCells(sectionRow.number, 1, sectionRow.number, 11);
          sectionRow.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sectionRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } }; sectionRow.height = 24;
          const header = sheet.addRow(["S.No", "Account Name", "Account Code", "Subtype", "Opening Debit", "Opening Credit", "Period Debit", "Period Credit", "Closing Debit", "Closing Credit", "Balance"]);
          header.font = { bold: true, color: { argb: "FFFFFFFF" } }; header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; header.height = 24;
          header.eachCell((cell, column) => { cell.alignment = { horizontal: column <= 4 ? "left" : "right", vertical: "middle", wrapText: true }; });
          records.forEach((record) => {
            const stock = record.stockBreakdown;
            const detail = stock ? `\nQuantity ${Number(record.stockQuantity || 0)}: On catalogue ${Number(stock.onCatalogueAvailableQuantity || 0)} + Off catalogue ${Number(stock.offCatalogueAvailableQuantity || 0)} + Rental available ${Number(stock.rentalAvailableQuantity || 0)} + Rental sold ${Number(stock.rentalSoldQuantity || 0)}` : "";
            const row = sheet.addRow([serial++, `${record.accountName || "-"}${detail}`, record.accountCode || "-", friendlyLabel(String(record.accountSubtype || "-")), Number(record.openingDebit || 0), Number(record.openingCredit || 0), Number(record.periodDebit || 0), Number(record.periodCredit || 0), Number(record.closingDebit || 0), Number(record.closingCredit || 0), amountFor(record)]);
            row.height = stock ? 34 : 21; row.eachCell((cell, column) => { cell.alignment = { horizontal: column <= 4 ? "left" : "right", vertical: "middle", wrapText: true }; cell.border = { bottom: { style: "thin", color: { argb: border } } }; if (column >= 5) cell.numFmt = moneyFormat; });
          });
          const total = records.reduce((sum, record) => sum + amountFor(record), 0); sectionTotals[type] = total;
          const totalRow = sheet.addRow(["", `Total ${sectionLabels[type].replace(/S$/, "")}`, "", "", "", "", "", "", "", "", total]);
          totalRow.font = { bold: true }; totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } }; totalRow.getCell(11).numFmt = moneyFormat; totalRow.getCell(11).alignment = { horizontal: "right" };
          sheet.addRow([]);
        });
        const combined = sheet.addRow(["", "TOTAL LIABILITIES AND EQUITY", "", "", "", "", "", "", "", "", Number(sectionTotals.liability || 0) + Number(sectionTotals.equity || 0)]);
        combined.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; combined.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; combined.getCell(11).numFmt = moneyFormat; combined.getCell(11).alignment = { horizontal: "right" };
        [8, 44, 24, 24, 17, 17, 17, 17, 17, 17, 20].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
        sheet.views = [{ state: "frozen", ySplit: 2 }]; sheet.pageSetup = { orientation: "landscape", paperSize: 8 as ExcelJS.PaperSize, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.2, right: 0.2, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } }; sheet.headerFooter.oddFooter = "TEQIT Finance - Balance Sheet - Page &P of &N";
        const buffer = await workbook.xlsx.writeBuffer();
        const name = `TEQIT_balance_sheet_${report.meta?.from || ""}_to_${report.meta?.to || ""}.xlsx`;
        return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${name}"`).send(Buffer.from(buffer));
      }
      if (reportKey === "profit-loss") {
        const sheet = workbook.addWorksheet("Profit & Loss");
        const reportSummary: any = report.summary || report.totals || {};
        const valueOf = (key: string) => Number(reportSummary[key] || 0);
        const incomeRows = allRows.filter((row) => String(row.accountType || row.type || "").toLowerCase() === "income");
        const expenseRows = allRows.filter((row) => String(row.accountType || row.type || "").toLowerCase() === "expense");
        const moneyFormat = '₹#,##0.00;[Red]-₹#,##0.00;₹0.00';
        const thinBorder: any = { bottom: { style: "thin", color: { argb: border } } };

        const styleSection = (rowNumber: number, title: string) => {
          sheet.mergeCells(rowNumber, 1, rowNumber, 6);
          const cell = sheet.getCell(rowNumber, 1);
          cell.value = title;
          cell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
          cell.alignment = { vertical: "middle" };
          sheet.getRow(rowNumber).height = 26;
        };
        const styleHeader = (rowNumber: number) => {
          const row = sheet.getRow(rowNumber);
          ["S.NO", "ACCOUNT NAME", "ACCOUNT CODE", "DEBIT", "CREDIT / REVERSAL", "NET"].forEach((label, index) => {
            const cell = row.getCell(index + 1);
            cell.value = label;
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
            cell.alignment = { horizontal: index >= 3 ? "right" : "left", vertical: "middle", wrapText: true };
          });
          row.height = 24;
        };
        const addAccountRows = (rows: any[], accountType: "income" | "expense") => {
          rows.forEach((record, index) => {
            const debit = Number(record.periodDebit || record.debit || 0);
            const credit = Number(record.periodCredit || record.credit || 0);
            const net = accountType === "income" ? credit - debit : debit - credit;
            const row = sheet.addRow([
              index + 1,
              record.accountName || record.name || "-",
              record.accountCode || record.code || "-",
              debit,
              credit,
              net,
            ]);
            row.height = 22;
            if (index % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7FC" } };
            row.eachCell((cell, columnNumber) => {
              cell.border = thinBorder;
              cell.alignment = { vertical: "middle", horizontal: columnNumber >= 4 ? "right" : "left", wrapText: true };
              if (columnNumber >= 4) cell.numFmt = moneyFormat;
            });
          });
        };
        const addTotalRow = (label: string, debit: number, credit: number, net: number) => {
          const row = sheet.addRow(["", label, "", debit, credit, net]);
          row.font = { bold: true, color: { argb: "FF10284E" } };
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };
          row.eachCell((cell, columnNumber) => {
            cell.border = thinBorder;
            cell.alignment = { vertical: "middle", horizontal: columnNumber >= 4 ? "right" : "left" };
            if (columnNumber >= 4) cell.numFmt = moneyFormat;
          });
        };

        sheet.mergeCells("A1:F1");
        sheet.getCell("A1").value = "TEQIT · Profit & Loss";
        sheet.getCell("A1").font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
        sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
        sheet.getCell("A1").alignment = { vertical: "middle" };
        sheet.getRow(1).height = 34;
        sheet.mergeCells("A2:F2");
        sheet.getCell("A2").value = `Finance report from ${report.meta?.from || ""} to ${report.meta?.to || ""}`;
        sheet.getCell("A2").font = { color: { argb: slate } };
        sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };

        styleSection(4, "INCOME");
        styleHeader(5);
        addAccountRows(incomeRows, "income");
        addTotalRow("TOTAL INCOME", valueOf("incomeDebits"), valueOf("incomeCredits"), valueOf("netIncome"));
        sheet.addRow([]);

        const expenseSectionRow = sheet.rowCount + 1;
        styleSection(expenseSectionRow, "EXPENSE");
        styleHeader(expenseSectionRow + 1);
        addAccountRows(expenseRows, "expense");
        addTotalRow("TOTAL EXPENSE", valueOf("expenseDebits"), valueOf("expenseCredits"), valueOf("netExpense"));
        sheet.addRow([]);

        const summaryRow = sheet.rowCount + 1;
        styleSection(summaryRow, "PROFIT & LOSS SUMMARY");
        [
          ["PRODUCT SALES (EXCL. GST)", valueOf("salesIncome")],
          ["SERVICE INCOME (EXCL. GST)", valueOf("serviceIncome")],
          ["TOTAL INCOME", valueOf("netIncome")],
          ["COST OF GOODS SOLD", valueOf("cogs")],
          ["NET INCOME (TOTAL INCOME - COGS)", valueOf("totalIncome")],
          ["NET EXPENSE", valueOf("netExpense")],
          ["NET PROFIT / LOSS", valueOf("netProfit")],
        ].forEach(([label, amount]) => {
          const row = sheet.addRow(["", label, "", "", "", amount]);
          row.font = { bold: true, color: { argb: "FF10284E" } };
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };
          row.getCell(6).numFmt = moneyFormat;
          row.getCell(6).alignment = { horizontal: "right" };
          row.eachCell((cell) => { cell.border = thinBorder; });
        });

        [8, 32, 24, 18, 20, 18].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
        sheet.views = [{ state: "frozen", ySplit: 5 }];
        sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
        sheet.headerFooter.oddFooter = "TEQIT Finance · Profit & Loss · Page &P of &N";

        const buffer = await workbook.xlsx.writeBuffer();
        const name = `TEQIT_profit_loss_${report.meta?.from || ""}_to_${report.meta?.to || ""}.xlsx`;
        return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${name}"`).send(Buffer.from(buffer));
      }
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
      const tdsSectionLabel = (record: any) => {
        const nature = String(record.natureofpayment || "").trim();
        const code = String(record.sectioncode || "").trim();
        const rawRate = String(record.rate ?? "").trim().replace(/^\(|\)$/g, "");
        const numericRate = Number(rawRate);
        const normalizedRate = Number.isFinite(numericRate) && numericRate > 0 ? String(Number(numericRate.toFixed(4))) : rawRate;
        const rate = normalizedRate ? `(${normalizedRate.includes("%") ? normalizedRate : `${normalizedRate}%`})` : "";
        return [nature, code ? `${code}${rate}` : rate].filter(Boolean).join(" ") || "—";
      };
      const exportRows = reportKey.startsWith("tds-") ? allRows.map((record, index) => ({
        serialNumber: index + 1,
        date: record.date,
        party: record.partyname || `${record.partytype || ""} ${record.partyid || ""}`.trim() || "—",
        direction: record.documenttype === "sales_invoice" ? "Customer deducted" : record.documenttype === "deposit" ? "Deposited by us" : "Deducted by us",
        document: record.documentnumber || "—",
        tdsSection: tdsSectionLabel(record),
        allocation: Number(record.allocationamount || 0),
        tds: Number(record.tdsamount || 0),
        status: record.status || "—",
      })) : reportKey === "trial-balance" ? allRows.map((record, index) => ({
        serialNumber: index + 1,
        accountName: record.accountName || "—",
        accountCode: record.accountCode || "—",
        accountType: record.accountType || "—",
        accountSubtype: record.accountSubtype || "—",
        openingDebit: Number(record.openingDebit || 0),
        openingCredit: Number(record.openingCredit || 0),
        periodDebit: Number(record.periodDebit || 0),
        periodCredit: Number(record.periodCredit || 0),
        closingDebit: Number(record.closingDebit || 0),
        closingCredit: Number(record.closingCredit || 0),
      })) : ["gst-inward", "gst-outward"].includes(reportKey) ? allRows.map((record, index) => ({
        serialNumber: index + 1,
        date: record.date,
        number: record.number || "—",
        party: record.partyName || "—",
        gstin: record.partyGstin || "No GSTIN",
        type: record.documentType || "—",
        taxable: Number(record.taxableValue || 0),
        cgst: Number(record.cgst || 0),
        sgst: Number(record.sgst || 0),
        igst: Number(record.igst || 0),
        totalGst: Number(record.tax || 0),
      })) : ["sales-invoices", "supplier-bills"].includes(reportKey) ? allRows.map((record, index) => ({
        serialNumber: index + 1,
        date: record.date,
        number: record.number || "—",
        party: record.partyName || "—",
        gstin: record.partyGstin || "No GSTIN",
        type: record.documentType || "—",
        taxable: Number(record.taxableValue || 0),
        cgst: Number(record.cgst || 0),
        sgst: Number(record.sgst || 0),
        igst: Number(record.igst || 0),
        totalGst: Number(record.tax || 0),
        grossAmount: Number(record.grossAmount || 0),
        paidAmount: Number(record.paidAmount || 0),
        balanceAmount: Number(record.balanceAmount || 0),
      })) : allRows;
      const keys = exportRows.length ? Object.keys(exportRows[0]).filter((key) => !excludedExportKeys.has(key.toLowerCase())) : [];
      const columnCount = Math.max(keys.length, 2);
      details.mergeCells(1, 1, 1, columnCount); details.getCell(1, 1).value = `TEQIT · ${reportTitle}`; details.getCell(1, 1).font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } }; details.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; details.getCell(1, 1).alignment = { vertical: "middle" }; details.getRow(1).height = 32;
      details.mergeCells(2, 1, 2, columnCount); details.getCell(2, 1).value = `${report.meta?.from || ""} to ${report.meta?.to || ""}  |  ${report.total ?? allRows.length} matching record(s)`; details.getCell(2, 1).font = { color: { argb: slate } }; details.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } };
      const exactLabels: Record<string, string> = { serialNumber: "S.NO", accountName: "ACCOUNT NAME", accountCode: "ACCOUNT CODE", accountType: "TYPE", accountSubtype: "SUBTYPE", openingDebit: "OPENING DR", openingCredit: "OPENING CR", periodDebit: "PERIOD DR", periodCredit: "PERIOD CR", closingDebit: "CLOSING DR", closingCredit: "CLOSING CR", tdsSection: "TDS SECTION", gstin: "GSTIN", totalGst: "TOTAL GST", grossAmount: "GROSS AMOUNT", paidAmount: "PAID AMOUNT", balanceAmount: "BALANCE AMOUNT" };
      const headerRow = details.getRow(4); keys.forEach((key, index) => { const cell = headerRow.getCell(index + 1); cell.value = exactLabels[key] || friendlyLabel(key).toUpperCase(); cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } }; cell.alignment = { horizontal: /Debit|Credit|Amount$|^(allocation|tds|taxable|cgst|sgst|igst|totalGst)$/i.test(key) ? "right" : /^(serialNumber|date|status)$/i.test(key) ? "center" : "left", vertical: "middle", wrapText: true }; }); headerRow.height = 28;
      exportRows.forEach((record, rowIndex) => { const row = details.addRow(keys.map((key) => exportValue(key, record[key]))); row.height = reportKey.startsWith("tds-") ? 28 : 22; if (rowIndex % 2) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7FC" } }; row.eachCell((cell, columnNumber) => { const key = keys[columnNumber - 1]; const horizontal = /^(serialNumber|date|status)$/i.test(key) ? "center" : /Debit|Credit|Amount$|^(allocation|tds|taxable|cgst|sgst|igst|totalGst)$/i.test(key) ? "right" : "left"; cell.alignment = { horizontal, vertical: "middle", wrapText: true }; if (typeof cell.value === "number" && !/^serialNumber$/i.test(key)) cell.numFmt = '₹#,##0.00;[Red]-₹#,##0.00'; }); });
      if (!allRows.length) { details.mergeCells(5, 1, 5, columnCount); details.getCell(5, 1).value = "No matching records."; details.getCell(5, 1).alignment = { horizontal: "center" }; details.getCell(5, 1).font = { color: { argb: slate } }; }
      const totalsStart = Math.max(6, 5 + allRows.length + 2); details.mergeCells(totalsStart, 1, totalsStart, columnCount); details.getCell(totalsStart, 1).value = "REPORT TOTALS"; details.getCell(totalsStart, 1).font = { bold: true, color: { argb: "FFFFFFFF" } }; details.getCell(totalsStart, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
      totals.forEach(([key, value], index) => { const rowNumber = totalsStart + 1 + Math.floor(index / 4); const pair = index % 4; const labelColumn = pair * 2 + 1; if (labelColumn + 1 > columnCount) return; const labelCell = details.getCell(rowNumber, labelColumn); const valueCell = details.getCell(rowNumber, labelColumn + 1); labelCell.value = friendlyLabel(key); valueCell.value = Number(value) || 0; valueCell.numFmt = '₹#,##0.00;[Red]-₹#,##0.00'; labelCell.font = { bold: true, color: { argb: slate } }; valueCell.font = { bold: true, color: { argb: "FF10284E" } }; [labelCell, valueCell].forEach((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: paleBlue } }; }); });
      keys.forEach((key, index) => {
        const tdsWidths: Record<string, number> = { serialNumber: 12, date: 14, party: 28, direction: 20, document: 25, tdsSection: 42, allocation: 18, tds: 16, status: 14 };
        const trialWidths: Record<string, number> = { serialNumber: 9, accountName: 30, accountCode: 24, accountType: 14, accountSubtype: 20, openingDebit: 17, openingCredit: 17, periodDebit: 17, periodCredit: 17, closingDebit: 17, closingCredit: 17 };
        const gstWidths: Record<string, number> = { serialNumber: 9, date: 14, number: 25, party: 28, gstin: 20, type: 20, taxable: 18, cgst: 16, sgst: 16, igst: 16, totalGst: 18 };
        details.getColumn(index + 1).width = ["gst-inward", "gst-outward", "sales-invoices", "supplier-bills"].includes(reportKey) && gstWidths[key]
          ? gstWidths[key]
          : reportKey === "trial-balance" && trialWidths[key]
          ? trialWidths[key]
          : reportKey.startsWith("tds-") && tdsWidths[key]
          ? tdsWidths[key]
          : Math.min(Math.max(friendlyLabel(key).length + 5, /name|party|document|account/i.test(key) ? 24 : 14), 34);
      });
      details.views = [{ state: "frozen", ySplit: 4 }];
      details.autoFilter = keys.length ? { from: { row: 4, column: 1 }, to: { row: 4, column: keys.length } } : undefined;
      details.eachRow((row, rowNumber) => row.eachCell((cell) => { if (rowNumber >= 4) cell.border = { bottom: { style: "thin", color: { argb: border } } }; }));
      details.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
      details.headerFooter.oddFooter = `TEQIT Finance · ${reportTitle} · Page &P of &N`;
      // Keep the downloaded file focused on the exact on-screen table. Report
      // totals are already appended below the rows, so a separate Summary tab
      // only hides the requested details when the workbook first opens.
      workbook.removeWorksheet(summary.id);
      const buffer = await workbook.xlsx.writeBuffer();
      const name = `TEQIT_${reportKey.replace(/-/g, "_")}_${report.meta?.from || ""}_to_${report.meta?.to || ""}.xlsx`;
      return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${name}"`).send(Buffer.from(buffer));
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };
}
