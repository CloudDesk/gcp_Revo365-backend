import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { orderReturnsService } from "../services/orderReturns.service.js";

export module orderReturnsController {
    const sendResult = (reply: any, result: any, fallbackMessage?: string) => {
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

    export const getReturnReasons = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.getReturnReasons(request);
            return sendResult(reply, result, "Return reasons fetched successfully");
        } catch (error) {
            console.error("Query Execution Error: IN getReturnReasons Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };

    export const upsertReturnReason = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.upsertReturnReason(request);
            return sendResult(reply, result, "Return reason saved successfully");
        } catch (error) {
            console.error("Query Execution Error: IN upsertReturnReason Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };

    export const getReturnRequests = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.getReturnRequests(request);
            return sendResult(reply, result, "Return requests fetched successfully");
        } catch (error) {
            console.error("Query Execution Error: IN getReturnRequests Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };

    export const createReturnRequest = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.createReturnRequest(request);
            return sendResult(reply, result, "Return request submitted successfully");
        } catch (error) {
            console.error("Query Execution Error: IN createReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };

    export const approveReturnRequest = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.approveReturnRequest(request);
            return sendResult(reply, result, "Return request approved successfully");
        } catch (error) {
            console.error("Query Execution Error: IN approveReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };

    export const rejectReturnRequest = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.rejectReturnRequest(request);
            return sendResult(reply, result, "Return request rejected successfully");
        } catch (error) {
            console.error("Query Execution Error: IN rejectReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };

    export const receiveReturnRequest = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.receiveReturnRequest(request);
            return sendResult(reply, result, "Return marked as received successfully");
        } catch (error) {
            console.error("Query Execution Error: IN receiveReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };

    export const finalizeReturnRequest = async (request: any, reply: any) => {
        try {
            const result = await orderReturnsService.finalizeReturnRequest(request);
            return sendResult(reply, result, "Return finalized successfully");
        } catch (error) {
            console.error("Query Execution Error: IN finalizeReturnRequest Controller", error);
            const errorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
        }
    };
}
