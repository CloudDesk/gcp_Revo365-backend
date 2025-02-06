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
})(transactionController || (transactionController = {}));
//# sourceMappingURL=transaction.controller.js.map