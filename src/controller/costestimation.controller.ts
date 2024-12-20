import { ErrorHandler } from "../errorHandler/errorHandler.js"
import { costEstimationService } from "../services/costestimation.service.js";

export module constEstimationController {
    export const getCostEstimationData = async (request: any, reply: any) => {
        try {
            let getCostEstimationDataResult = await costEstimationService.getCostEstimationData(request);
            reply.send(getCostEstimationDataResult);

        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }
    export const upsertCostEstimation = async (request: any, reply: any) => {
        try {
            let host = request.headers.host;
            let upsertCostEstimationResult = await costEstimationService.upsertCostEstimation(request, request.body);
            if (upsertCostEstimationResult.command === "UPDATE" || upsertCostEstimationResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertCostEstimationResult.command === "UPDATE"
                        ? `Cost Estimation Updated  successfully`
                        : `Cost Estimation Created  successfully`,
                    data: upsertCostEstimationResult.rows[0]
                };
                reply.status(200).send(message);
            } else {
                reply.status(500).send(upsertCostEstimationResult);
            }
        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }

    export const upsertGcpCostEstimation = async (request: any, reply: any) => {
        try {
            let host = request.headers.host;
            let upsertCostEstimationResult = await costEstimationService.upsertGcpCostEstimation(request, request.body);
            if (upsertCostEstimationResult.command === "UPDATE" || upsertCostEstimationResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertCostEstimationResult.command === "UPDATE"
                        ? `Cost Estimation Updated  successfully`
                        : `Cost Estimation Created  successfully`,
                    data: upsertCostEstimationResult.rows[0]
                };
                reply.status(200).send(message);
            } else {
                reply.status(500).send(upsertCostEstimationResult);
            }
        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }
}