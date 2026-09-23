import { ErrorHandler } from "../errorHandler/errorHandler.js"
import { costEstimationService } from "../services/costestimation.service.js";

export module constEstimationController {
    export const getEstimationProducts = async (request: any, reply: any) => {
        try {
            const result = await costEstimationService.getEstimationProducts(request);
            return reply.send(result);
        } catch (error: any) {
            console.error("ERROR IN Controller getEstimationProducts", error);
            return reply.status(error?.statusCode || 500).send({
                message: error?.message || "Unable to load products for estimation",
            });
        }
    };

    export const getEstimationProductAssets = async (
        request: any,
        reply: any
    ) => {
        try {
            const result =
                await costEstimationService.getEstimationProductAssets(request);
            return reply.send(result);
        } catch (error: any) {
            console.error(
                "ERROR IN Controller getEstimationProductAssets",
                error
            );
            return reply.status(error?.statusCode || 500).send({
                message:
                    error?.message ||
                    "Unable to load asset numbers for estimation",
            });
        }
    };

    export const getCostEstimationData = async (request: any, reply: any) => {
        try {
            let getCostEstimationDataResult = await costEstimationService.getCostEstimationData(request);
            reply.send(getCostEstimationDataResult);

        } catch (error: any) {
            console.error('ERROR IN  Controller getCostEstimationData', error);
            if (error?.statusCode) {
                return reply.status(error.statusCode).send({ message: error.message });
            }
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }

    export const getStockRestorationStatus = async (request: any, reply: any) => {
        try {
            const result =
                await costEstimationService.getStockRestorationStatus(request);
            return reply.status(200).send(result);
        } catch (error: any) {
            console.error(
                "ERROR IN Controller getStockRestorationStatus",
                error
            );
            return reply.status(error?.statusCode || 500).send({
                message:
                    error?.message ||
                    "Unable to check service stock restoration status",
            });
        }
    };

    export const restoreApprovedEstimationStock = async (
        request: any,
        reply: any
    ) => {
        try {
            const result =
                await costEstimationService.restoreApprovedEstimationStock(
                    request
                );
            return reply.status(200).send({
                message: `${result.restoredquantity} stock item(s) restored to Available`,
                data: result,
            });
        } catch (error: any) {
            console.error(
                "ERROR IN Controller restoreApprovedEstimationStock",
                error
            );
            return reply.status(error?.statusCode || 500).send({
                message:
                    error?.message ||
                    "Unable to restore service estimation stock",
            });
        }
    };

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
        } catch (error: any) {
            console.error('ERROR IN  Controller upsertCostEstimation', error);
            if (error?.statusCode) {
                return reply.status(error.statusCode).send({ message: error.message });
            }
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
        } catch (error: any) {
            console.error('ERROR IN  Controller upsertGcpCostEstimation', error);
            if (error?.statusCode) {
                return reply.status(error.statusCode).send({ message: error.message });
            }
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }
}
