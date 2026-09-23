import { globalserachService } from "../services/globalsearch.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var globalSearchController;
(function (globalSearchController) {
    globalSearchController.getALlData = async (request, reply) => {
        try {
            let result = await globalserachService.getGlobalData(request);
            reply.send(result);
        }
        catch (error) {
            console.error("Error: IN getALlData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    globalSearchController.getAllProductData = async (request, reply) => {
        try {
            let result = await globalserachService.getGlobalProductData(request, reply);
            reply.send(result);
        }
        catch (error) {
            console.error("Error: IN getAllProductData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    globalSearchController.getGlobalStockOrderTicketData = async (request, reply) => {
        try {
            let result = await globalserachService.getGlobalStockOrderTicketData(request, reply);
            reply.send(result);
        }
        catch (error) {
            console.error("Error: IN getGlobalStockOrderTicketData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(globalSearchController || (globalSearchController = {}));
//# sourceMappingURL=globalsearch.controller.js.map