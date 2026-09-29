import { consolidatedInvoiceService } from "../services/consolidatedInvoice.service.js";
import { accessScopeService } from "../services/accessScope.service.js";

const getErrorStatus = (error: any) => {
  if (error?.statusCode) return error.statusCode;
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("not found")) return 404;
  if (message.includes("required") || message.includes("valid") || message.includes("no generated invoices")) {
    return 400;
  }
  return 500;
};

const assertCustomerAccess = async (request: any) => {
  const customerId = Number(
    request.body?.customerid ||
      request.params?.customerid ||
      request.query?.customerid
  );
  if (!(await accessScopeService.canVendorAccessCustomer(request, customerId))) {
    const error: any = new Error("Vendor users can consolidate invoices only for assigned business customers.");
    error.statusCode = 403;
    throw error;
  }
};

export module consolidatedInvoiceController {
  export const listConsolidatedInvoices = async (request: any, reply: any) => {
    try {
      await assertCustomerAccess(request);
      const result =
        await consolidatedInvoiceService.listConsolidatedInvoices(request.body || {});
      reply.status(200).send({
        message: "Consolidated invoices fetched successfully",
        data: result,
      });
    } catch (error: any) {
      reply.status(getErrorStatus(error)).send({
        success: false,
        message: error?.message || "Unable to fetch consolidated invoices.",
      });
    }
  };

  export const previewConsolidatedInvoice = async (request: any, reply: any) => {
    try {
      await assertCustomerAccess(request);
      const result =
        await consolidatedInvoiceService.previewConsolidatedInvoice(request.body || {});
      reply.status(200).send({
        message: "Consolidated invoice preview generated successfully",
        data: result,
      });
    } catch (error: any) {
      reply.status(getErrorStatus(error)).send({
        success: false,
        message: error?.message || "Consolidated invoice preview failed.",
      });
    }
  };

  export const generateConsolidatedInvoice = async (request: any, reply: any) => {
    try {
      await assertCustomerAccess(request);
      const result =
        await consolidatedInvoiceService.generateConsolidatedInvoice(request);
      reply.status(200).send({
        message: result.reusedExisting
          ? "Existing consolidated invoice found"
          : "Consolidated invoice generated successfully",
        data: result,
      });
    } catch (error: any) {
      reply.status(getErrorStatus(error)).send({
        success: false,
        message: error?.message || "Consolidated invoice generation failed.",
      });
    }
  };
}
