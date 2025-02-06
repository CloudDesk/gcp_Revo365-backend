import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { costEstimationService } from "../services/costestimation.service.js";
export var constEstimationController;
(function (constEstimationController) {
    constEstimationController.getCostEstimationData = async (request, reply) => {
        try {
            let getCostEstimationDataResult = await costEstimationService.getCostEstimationData(request);
            reply.send(getCostEstimationDataResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getCostEstimationData', error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
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
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(constEstimationController || (constEstimationController = {}));
//# sourceMappingURL=costestimation.controller.js.map