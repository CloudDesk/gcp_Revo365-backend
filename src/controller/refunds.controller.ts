import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { refundsService } from "../services/refunds.service.js";

export module refundsController {
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

  export const getRefundEligibility = async (request: any, reply: any) => {
    try {
      const result = await refundsService.getRefundEligibility(request);
      return sendResult(reply, result, "Refund eligibility fetched successfully");
    } catch (error) {
      console.error("Query Execution Error: IN getRefundEligibility Controller", error);
      const errorMessage = await ErrorHandler.handleQueryError(error);
      return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
    }
  };

  export const getRefunds = async (request: any, reply: any) => {
    try {
      const result = await refundsService.getRefunds(request);
      return sendResult(reply, result, "Refunds fetched successfully");
    } catch (error) {
      console.error("Query Execution Error: IN getRefunds Controller", error);
      const errorMessage = await ErrorHandler.handleQueryError(error);
      return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
    }
  };

  export const initiateRefund = async (request: any, reply: any) => {
    try {
      const result = await refundsService.initiateRefund(request);
      return sendResult(reply, result, "Refund initiated successfully");
    } catch (error) {
      console.error("Query Execution Error: IN initiateRefund Controller", error);
      const errorMessage = await ErrorHandler.handleQueryError(error);
      return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
    }
  };

  export const syncRefund = async (request: any, reply: any) => {
    try {
      const result = await refundsService.syncRefund(request);
      return sendResult(reply, result, "Refund synchronized successfully");
    } catch (error) {
      console.error("Query Execution Error: IN syncRefund Controller", error);
      const errorMessage = await ErrorHandler.handleQueryError(error);
      return reply.status(errorMessage?.statusCode || 500).send(errorMessage);
    }
  };
}
