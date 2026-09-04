import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { storeQuotationService } from "../services/storeQuotation.service.js";

export module storeQuotationController {
  export const getStoreQuotations = async (request: any, reply: any) => {
    try {
      const result = await storeQuotationService.getStoreQuotations(request);
      reply.send(result);
    } catch (error) {
      console.error("Query Execution Error: IN getStoreQuotations controller", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const getStoreQuotationVersions = async (request: any, reply: any) => {
    try {
      const result = await storeQuotationService.getStoreQuotationVersions(request);
      reply.send(result);
    } catch (error) {
      console.error("Query Execution Error: IN getStoreQuotationVersions controller", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const upsertStoreQuotation = async (request: any, reply: any) => {
    try {
      const result: any = await storeQuotationService.upsertStoreQuotation(request.body);
      if (result.command === "UPDATE" || result.command === "INSERT") {
        return reply.status(200).send({
          message: result.command === "UPDATE" ? "Quotation revised successfully" : "Quotation created successfully",
          data: result.rows[0],
        });
      }
      return reply.status(result.statusCode || 500).send(result);
    } catch (error) {
      console.error("Query Execution Error: IN upsertStoreQuotation controller", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const finalizeStoreQuotation = async (request: any, reply: any) => {
    try {
      const result: any = await storeQuotationService.finalizeStoreQuotation(request);
      if (result.command === "UPDATE") {
        return reply.status(200).send({
          message: "Quotation finalized successfully",
          data: result.rows[0],
        });
      }
      return reply.status(result.statusCode || 500).send(result);
    } catch (error) {
      console.error("Query Execution Error: IN finalizeStoreQuotation controller", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const markStoreQuotationConverted = async (request: any, reply: any) => {
    try {
      const result: any = await storeQuotationService.markStoreQuotationConverted({
        ...request.body,
        id: request.params?.id ?? request.body?.id,
      });
      if (result.command === "UPDATE") {
        return reply.status(200).send({
          message: "Quotation converted successfully",
          data: result.rows[0],
        });
      }
      return reply.status(result.statusCode || 500).send(result);
    } catch (error) {
      console.error("Query Execution Error: IN markStoreQuotationConverted controller", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const updateStoreQuotationUrl = async (request: any, reply: any) => {
    try {
      const result: any = await storeQuotationService.updateStoreQuotationUrl({
        ...request.body,
        id: request.params?.id ?? request.body?.id,
      });
      if (result.command === "UPDATE") {
        return reply.status(200).send({
          message: "Quotation URL updated successfully",
          data: result.rows[0],
        });
      }
      return reply.status(result.statusCode || 500).send(result);
    } catch (error) {
      console.error("Query Execution Error: IN updateStoreQuotationUrl controller", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };
}
