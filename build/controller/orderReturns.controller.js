import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { orderReturnsService } from "../services/orderReturns.service.js";
export var orderReturnsController;
(function (orderReturnsController) {
    const sendResult = (reply, result, fallbackMessage) => {
        if (result?.success === false || result?.status) {
            return reply.status(result?.status || 400).send({
                success: false,
                message: result?.message || fallbackMessage || "Request failed",
                data: result?.data || null,
            });
        }
        return reply.status(200).send({
            success: true,
            message: result?.message || fallbackMessage || "Success",
            data: result?.data ?? result,
        });
    };
    orderReturnsController.getReturnReasons = async (request, reply) => {
        try {
            const result = await orderReturnsService.getReturnReasons(request);
            return sendResult(reply, result, "Return reasons fetched successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN getReturnReasons Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
    orderReturnsController.upsertReturnReason = async (request, reply) => {
        try {
            const result = await orderReturnsService.upsertReturnReason(request);
            return sendResult(reply, result, "Return reason saved successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertReturnReason Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
    orderReturnsController.getReturnRequests = async (request, reply) => {
        try {
            const result = await orderReturnsService.getReturnRequests(request);
            return sendResult(reply, result, "Return requests fetched successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN getReturnRequests Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
    orderReturnsController.createReturnRequest = async (request, reply) => {
        try {
            const result = await orderReturnsService.createReturnRequest(request);
            return sendResult(reply, result, "Return request submitted successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN createReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
    orderReturnsController.approveReturnRequest = async (request, reply) => {
        try {
            const result = await orderReturnsService.approveReturnRequest(request);
            return sendResult(reply, result, "Return request approved successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN approveReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
    orderReturnsController.rejectReturnRequest = async (request, reply) => {
        try {
            const result = await orderReturnsService.rejectReturnRequest(request);
            return sendResult(reply, result, "Return request rejected successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN rejectReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
    orderReturnsController.receiveReturnRequest = async (request, reply) => {
        try {
            const result = await orderReturnsService.receiveReturnRequest(request);
            return sendResult(reply, result, "Return marked as received successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN receiveReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
    orderReturnsController.finalizeReturnRequest = async (request, reply) => {
        try {
            const result = await orderReturnsService.finalizeReturnRequest(request);
            return sendResult(reply, result, "Return finalized successfully");
        }
        catch (error) {
            console.error("Query Execution Error: IN finalizeReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
})(orderReturnsController || (orderReturnsController = {}));
//# sourceMappingURL=orderReturns.controller.js.map