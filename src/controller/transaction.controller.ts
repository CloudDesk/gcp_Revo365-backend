import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { transactionService } from "../services/transaction.service.js";

export module transactionController {
  export const paymentInitialization = async (request: any, reply: any) => {
    try {
      let transactionData = await transactionService.paymentInitialization(
        request
      );
      if (transactionData?.status == 400) {
        reply.status(404).send(transactionData.message);
      } else {
        reply.send(transactionData);
      }
    } catch (error) {
      console.error("Query Execution Error: IN paymentInitialization Controller",error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };
  export const inserttransaction = async (request: any, reply: any) => {
    try {
      const transactionReqData = request.body;
      let transactionData: any = await transactionService.insertTransactionData(
        transactionReqData,
        false
      );
      if (transactionData?.status == 400) {
        reply.status(404).send(transactionData.message);
      } else {
        reply.send(transactionData);
      }
    } catch (error) {
      console.error("Query Execution Error: IN inserttransaction Controller", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };
  export const paymentConfirmation = async (request: any, reply: any) => {
    try {
      let transactionData = await transactionService.paymentConfirmation(
        request,
        reply
      );
      reply.send(transactionData);
    } catch (error) {
      console.error(
        "Query Execution Error: IN paymentConfirmation Controller",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const getTransactionData = async (request) => {
    try {
      let data = await transactionService.getTransactionData(request);
      return data;
    } catch (error) {
      console.error(
        "Query Execution Error: IN getTransactionData Controller",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };


   export const paymentInitializationRazorpay = async (request: any, reply: any) => {
    try {
      let transactionData = await transactionService.paymentInitializationRazorpay(
        request
      );
      if (transactionData?.status == 400) {
        reply.status(404).send(transactionData.message);
      } else {
        reply.send(transactionData);
      }
    } catch (error) {
      console.error("Query Execution Error: IN paymentInitialization Controller",error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };


   export const paymentConfirmationRazorpay = async (request: any, reply: any) => {
    try {
      let transactionData = await transactionService.paymentConfirmation(
        request,
        reply
      );
      reply.send(transactionData);
    } catch (error) {
      console.error(
        "Query Execution Error: IN paymentConfirmation Controller",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };
}
