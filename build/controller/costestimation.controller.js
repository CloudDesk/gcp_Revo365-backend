import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { costEstimationService } from "../services/costestimation.service.js";
export var constEstimationController;
(function (constEstimationController) {
    constEstimationController.getEstimationProducts = async (request, reply) => {
        try {
            const result = await costEstimationService.getEstimationProducts(request);
            return reply.send(result);
        }
        catch (error) {
            console.error("ERROR IN Controller getEstimationProducts", error);
            return reply.status(error?.statusCode || 500).send({
                message: error?.message || "Unable to load products for estimation",
            });
        }
    };
    constEstimationController.getEstimationProductAssets = async (request, reply) => {
        try {
            const result = await costEstimationService.getEstimationProductAssets(request);
            return reply.send(result);
        }
        catch (error) {
            console.error("ERROR IN Controller getEstimationProductAssets", error);
            return reply.status(error?.statusCode || 500).send({
                message: error?.message ||
                    "Unable to load asset numbers for estimation",
            });
        }
    };
    constEstimationController.getCostEstimationData = async (request, reply) => {
        try {
            let getCostEstimationDataResult = await costEstimationService.getCostEstimationData(request);
            reply.send(getCostEstimationDataResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getCostEstimationData', error);
            if (error?.statusCode) {
                return reply.status(error.statusCode).send({ message: error.message });
            }
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    constEstimationController.getStockRestorationStatus = async (request, reply) => {
        try {
            const result = await costEstimationService.getStockRestorationStatus(request);
            return reply.status(200).send(result);
        }
        catch (error) {
            console.error("ERROR IN Controller getStockRestorationStatus", error);
            return reply.status(error?.statusCode || 500).send({
                message: error?.message ||
                    "Unable to check service stock restoration status",
            });
        }
    };
    constEstimationController.restoreApprovedEstimationStock = async (request, reply) => {
        try {
            const result = await costEstimationService.restoreApprovedEstimationStock(request);
            return reply.status(200).send({
                message: `${result.restoredquantity} stock item(s) restored to Available`,
                data: result,
            });
        }
        catch (error) {
            console.error("ERROR IN Controller restoreApprovedEstimationStock", error);
            return reply.status(error?.statusCode || 500).send({
                message: error?.message ||
                    "Unable to restore service estimation stock",
            });
        }
    };
    constEstimationController.upsertCostEstimation = async (request, reply) => {
        try {
            let host = request.headers.host;
            let upsertCostEstimationResult = await costEstimationService.upsertCostEstimation(request, request.body);
            if (upsertCostEstimationResult.command === "UPDATE" || upsertCostEstimationResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertCostEstimationResult.command === "UPDATE"
                        ? `Cost Estimation Updated  successfully`
                        : `Cost Estimation Created  successfully`,
                    data: upsertCostEstimationResult.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(upsertCostEstimationResult);
            }
        }
        catch (error) {
            console.error('ERROR IN  Controller upsertCostEstimation', error);
            if (error?.statusCode) {
                return reply.status(error.statusCode).send({ message: error.message });
            }
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    constEstimationController.upsertGcpCostEstimation = async (request, reply) => {
        try {
            let host = request.headers.host;
            let upsertCostEstimationResult = await costEstimationService.upsertGcpCostEstimation(request, request.body);
            if (upsertCostEstimationResult.command === "UPDATE" || upsertCostEstimationResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertCostEstimationResult.command === "UPDATE"
                        ? `Cost Estimation Updated  successfully`
                        : `Cost Estimation Created  successfully`,
                    data: upsertCostEstimationResult.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(upsertCostEstimationResult);
            }
        }
        catch (error) {
            console.error('ERROR IN  Controller upsertGcpCostEstimation', error);
            if (error?.statusCode) {
                return reply.status(error.statusCode).send({ message: error.message });
            }
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(constEstimationController || (constEstimationController = {}));
//# sourceMappingURL=costestimation.controller.js.map