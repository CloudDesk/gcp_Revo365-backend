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
      let transactionData :any = await transactionService.paymentInitializationRazorpay(
        request
      );
      console.log("transactionData", transactionData);
      if (transactionData && transactionData.status == 200) {
        reply.send(transactionData);
      } else {
        reply.status(transactionData.status).send('Transaction initialization failed');
      }
    } catch (error) {
      console.error("Query Execution Error: IN paymentInitialization Controller",error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };


   export const paymentConfirmationRazorpay = async (request, reply) => {
    try {
      console.log('inside razorpay confirmation controller');
      let transactionData = await transactionService.paymentConfirmationRazorpay(request);
      if (transactionData?.status == 400 || transactionData?.status == 500) {
        reply.status(transactionData.status).send({
          message: transactionData.message,
          data: transactionData.data || {},
        });
      } else {
        reply.send(transactionData);
      }
    } catch (error) {
      console.error("Query Execution Error: IN paymentConfirmationRazorpay Controller", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      reply.send(ErrorMessage);
    }
  };

  export const paymentInitializationRazorpayTicket = async (request: any, reply: any) => {
    try {
      let transactionData :any = await transactionService.paymentInitializationRazorpayTicket(
        request
      );
      console.log("transactionData", transactionData);
      if (transactionData && transactionData.status == 200) {
        reply.send(transactionData);
      } else {
        reply.status(transactionData.status).send('Transaction initialization failed');
      }
    } catch (error) {
      console.error("Query Execution Error: IN paymentInitialization Controller",error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const paymentConfirmationRazorpayTicket = async (request, reply) => {
    try {
      let transactionData = await transactionService.paymentConfirmationRazorpayTicket(request);
      if (transactionData?.status == 400 || transactionData?.status == 500) {
        reply.status(transactionData.status).send({
          message: transactionData.message,
        });
      } else {
        reply.send(transactionData);
      }
    } catch (error) {
      console.error("Query Execution Error: IN paymentConfirmationRazorpay Controller", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      reply.send(ErrorMessage);
    }
  };
}
