import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { transactionService } from "../services/transaction.service.js";
export var transactionController;
(function (transactionController) {
    transactionController.paymentInitialization = async (request, reply) => {
        try {
            let transactionData = await transactionService.paymentInitialization(request);
            if (transactionData?.status == 400) {
                reply.status(404).send(transactionData.message);
            }
            else {
                reply.send(transactionData);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionController.inserttransaction = async (request, reply) => {
        try {
            const transactionReqData = request.body;
            let transactionData = await transactionService.insertTransactionData(transactionReqData, false);
            if (transactionData?.status == 400) {
                reply.status(404).send(transactionData.message);
            }
            else {
                reply.send(transactionData);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN inserttransaction Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionController.paymentConfirmation = async (request, reply) => {
        try {
            let transactionData = await transactionService.paymentConfirmation(request, reply);
            reply.send(transactionData);
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentConfirmation Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionController.getTransactionData = async (request) => {
        try {
            let data = await transactionService.getTransactionData(request);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN getTransactionData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionController.paymentInitializationRazorpay = async (request, reply) => {
        try {
            let transactionData = await transactionService.paymentInitializationRazorpay(request);
            console.log("transactionData", transactionData);
            if (transactionData && transactionData.status == 200) {
                reply.send(transactionData);
            }
            else if (transactionData?.statusCode) {
                // Handle ErrorHandler response (has statusCode instead of status)
                reply.status(transactionData.statusCode).send({
                    message: transactionData.errorMessage || 'Transaction initialization failed',
                    errorDetails: transactionData.errorDetails || []
                });
            }
            else if (transactionData?.status) {
                // Handle service error response (has status)
                reply.status(transactionData.status).send({
                    message: transactionData.message || 'Transaction initialization failed'
                });
            }
            else {
                // Fallback for unexpected response format
                reply.status(500).send({
                    message: 'Transaction initialization failed',
                    errorDetails: []
                });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            reply.status(ErrorMessage.statusCode || 500).send(ErrorMessage);
        }
    };
    transactionController.paymentConfirmationRazorpay = async (request, reply) => {
        try {
            console.log('inside razorpay confirmation controller');
            let transactionData = await transactionService.paymentConfirmationRazorpay(request);
            console.log('transactionData', transactionData);
            if (transactionData?.status == 400 || transactionData?.status == 500) {
                reply.status(transactionData.status).send({
                    message: transactionData.message,
                    data: transactionData.data || {},
                });
            }
            else {
                reply.send(transactionData);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentConfirmationRazorpay Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            reply.send(ErrorMessage);
        }
    };
    transactionController.paymentInitializationRazorpayTicket = async (request, reply) => {
        try {
            let transactionData = await transactionService.paymentInitializationRazorpayTicket(request);
            console.log("transactionData", transactionData);
            if (transactionData && transactionData.status == 200) {
                reply.send(transactionData);
            }
            else {
                // Handle error responses - check for statusCode (from ErrorHandler) or status (from service)
                const statusCode = transactionData?.statusCode || transactionData?.status || 500;
                const errorMessage = transactionData?.errorMessage || transactionData?.message || 'Transaction initialization failed';
                reply.status(statusCode).send({
                    message: errorMessage,
                    errorDetails: transactionData?.errorDetails || []
                });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            reply.status(ErrorMessage.statusCode || 500).send(ErrorMessage);
        }
    };
    transactionController.paymentConfirmationRazorpayTicket = async (request, reply) => {
        try {
            let transactionData = await transactionService.paymentConfirmationRazorpayTicket(request);
            if (transactionData?.status == 400 || transactionData?.status == 500) {
                reply.status(transactionData.status).send({
                    message: transactionData.message,
                });
            }
            else {
                reply.send(transactionData);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentConfirmationRazorpay Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            reply.send(ErrorMessage);
        }
    };
})(transactionController || (transactionController = {}));
//# sourceMappingURL=transaction.controller.js.map