import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { storeQuotationService } from "../services/storeQuotation.service.js";
export var storeQuotationController;
(function (storeQuotationController) {
    storeQuotationController.getStoreQuotations = async (request, reply) => {
        try {
            const result = await storeQuotationService.getStoreQuotations(request);
            reply.send(result);
        }
        catch (error) {
            console.error("Query Execution Error: IN getStoreQuotations controller", error);
            return await ErrorHandler.handleQueryError(error);
        }
    };
    storeQuotationController.getStoreQuotationVersions = async (request, reply) => {
        try {
            const result = await storeQuotationService.getStoreQuotationVersions(request);
            reply.send(result);
        }
        catch (error) {
            console.error("Query Execution Error: IN getStoreQuotationVersions controller", error);
            return await ErrorHandler.handleQueryError(error);
        }
    };
    storeQuotationController.upsertStoreQuotation = async (request, reply) => {
        try {
            const result = await storeQuotationService.upsertStoreQuotation(request.body);
            if (result.command === "UPDATE" || result.command === "INSERT") {
                return reply.status(200).send({
                    message: result.command === "UPDATE" ? "Quotation revised successfully" : "Quotation created successfully",
                    data: result.rows[0],
                });
            }
            return reply.status(result.statusCode || 500).send(result);
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertStoreQuotation controller", error);
            return await ErrorHandler.handleQueryError(error);
        }
    };
    storeQuotationController.finalizeStoreQuotation = async (request, reply) => {
        try {
            const result = await storeQuotationService.finalizeStoreQuotation(request);
            if (result.command === "UPDATE") {
                return reply.status(200).send({
                    message: "Quotation finalized successfully",
                    data: result.rows[0],
                });
            }
            return reply.status(result.statusCode || 500).send(result);
        }
        catch (error) {
            console.error("Query Execution Error: IN finalizeStoreQuotation controller", error);
            return await ErrorHandler.handleQueryError(error);
        }
    };
    storeQuotationController.markStoreQuotationConverted = async (request, reply) => {
        try {
            const result = await storeQuotationService.markStoreQuotationConverted({
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
        }
        catch (error) {
            console.error("Query Execution Error: IN markStoreQuotationConverted controller", error);
            return await ErrorHandler.handleQueryError(error);
        }
    };
    storeQuotationController.updateStoreQuotationUrl = async (request, reply) => {
        try {
            const result = await storeQuotationService.updateStoreQuotationUrl({
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
        }
        catch (error) {
            console.error("Query Execution Error: IN updateStoreQuotationUrl controller", error);
            return await ErrorHandler.handleQueryError(error);
        }
    };
})(storeQuotationController || (storeQuotationController = {}));
//# sourceMappingURL=storeQuotation.controller.js.map