import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { transactionService } from "../services/transaction.service.js";
export var transactionController;
(function (transactionController) {
    transactionController.paymentInitialization = async (request, reply) => {
        try {
            let transactionData = await transactionService.paymentInitialization(request);
            console.log(transactionData, "Transacion data is ===>> ");
            if (transactionData?.status == 400) {
                reply.status(404).send(transactionData.message);
            }
            else {
                console.log(transactionData);
                reply.send(transactionData);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    // Just for me
    transactionController.inserttransaction = async (request, reply) => {
        try {
            const transactionReqData = request.body;
            let transactionData = await transactionService.insertTransactionData(transactionReqData, false);
            if (transactionData?.status == 400) {
                reply.status(404).send(transactionData.message);
            }
            else {
                console.log(transactionData);
                reply.send(transactionData);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN ticketinsert Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    transactionController.paymentConfirmation = async (request, reply) => {
        try {
            let transactionData = await transactionService.paymentConfirmation(request, reply);
            console.log(transactionData);
            reply.send(transactionData);
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(transactionController || (transactionController = {}));
//# sourceMappingURL=transaction.controller.js.map