import { rentalInvoiceDocumentService } from "../services/rentalInvoiceDocument.service.js";
import { query } from "../database/postgres.js";
import { accessScopeService } from "../services/accessScope.service.js";

const getErrorStatus = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) {
    return 404;
  }
  if (
    normalized.includes("required") ||
    normalized.includes("valid invoice") ||
    normalized.includes("rental summary")
  ) {
    return 400;
  }
  return 500;
};

export module rentalInvoiceDocumentController {
  export const generateRentalInvoiceDocuments = async (
    request: any,
    reply: any
  ) => {
    try {
      const invoiceId = Number(request.params?.id);
      const invoiceResult = await query(
        `SELECT id, customerid FROM revoinvoice WHERE id = $1 LIMIT 1`,
        [invoiceId]
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) {
        throw new Error("Rental invoice not found.");
      }
      if (!(await accessScopeService.canVendorAccessCustomer(request, invoice.customerid))) {
        const error: any = new Error("Vendor users can generate documents only for assigned business customer invoices.");
        error.statusCode = 403;
        throw error;
      }
      const result =
        await rentalInvoiceDocumentService.generateRentalInvoiceDocuments(
          invoiceId,
          request.body || {}
        );

      reply.status(200).send({
        message: "Rental invoice documents generated successfully",
        data: result,
      });
    } catch (error: any) {
      const message =
        error?.message || "Rental invoice document generation failed.";
      reply.status(error?.statusCode || getErrorStatus(message)).send({
        success: false,
        message,
      });
    }
  };
}
