import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { enquiryExportService } from "../services/enquiryExport.service.js";

export module enquiryExportController {
  /**
   * GET /enquiry-export?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * Query params:
   *   from  {string} REQUIRED — start date (inclusive), e.g. "2025-01-01"
   *   to    {string} OPTIONAL — end   date (inclusive), e.g. "2025-03-12"
   *                             Defaults to the current date/time when omitted.
   *
   * Returns an Excel (.xlsx) attachment with two sheets:
   *   • Corporate  — id, recordtype, first_name, last_name, email, phone,
   *                  company, fleet, preferred_date, notes, status, created_at
   *   • Individual — id, recordtype, first_name, last_name, email, phone,
   *                  topic, message, status, created_at
   *
   * All dates in the file are formatted as "YYYY-MM-DD HH:MM" (IST).
   * Protected: requires a valid session (preHandler: [getSession]).
   */
  export const downloadEnquiryExcel = async (
    request: any,
    reply: any
  ): Promise<void> => {
    try {
      const { from, to } = request.query as { from?: string; to?: string };

      // ── Validate `from` (required) ─────────────────────────────────────────
      if (!from) {
        return reply.status(400).send({
          success: false,
          error: { message: "`from` query parameter is required (YYYY-MM-DD)." },
        });
      }

      const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

      if (!ISO_DATE.test(from) || isNaN(Date.parse(from))) {
        return reply.status(400).send({
          success: false,
          error: { message: "`from` must be a valid date in YYYY-MM-DD format." },
        });
      }

      // ── Validate `to` (optional) ───────────────────────────────────────────
      if (to && (!ISO_DATE.test(to) || isNaN(Date.parse(to)))) {
        return reply.status(400).send({
          success: false,
          error: { message: "`to` must be a valid date in YYYY-MM-DD format." },
        });
      }

      if (to && new Date(to) < new Date(from)) {
        return reply.status(400).send({
          success: false,
          error: { message: "`to` date cannot be earlier than `from` date." },
        });
      }

      // ── Generate workbook ──────────────────────────────────────────────────
      const workbook = await enquiryExportService.generateEnquiryExcel({ from, to });

      // Write workbook to an in-memory buffer (mirrors sample.ts pattern)
      const buffer = await workbook.xlsx.writeBuffer();

      // File name encodes the date range for easy identification
      const toLabel = to ?? new Date().toISOString().slice(0, 10);
      const fileName = `Enquiries_${from}_to_${toLabel}.xlsx`;

      reply.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      reply.header(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );

      return reply.send(buffer);
    } catch (error) {
      console.error(
        "Query Execution Error: IN downloadEnquiryExcel Controller",
        error
      );
      const ErrorMessage = await ErrorHandler.handleQueryError(error);
      return reply
        .status(ErrorMessage.statusCode || 500)
        .send(ErrorMessage);
    }
  };
}
