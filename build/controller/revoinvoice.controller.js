import { revoinvoiceservice } from "../services/revoinvoice.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var revoinvoicecontroller;
(function (revoinvoicecontroller) {
    revoinvoicecontroller.getRevoInvoiceData = async (request, reply) => {
        try {
            let getRevoInvoiceDataResult = await revoinvoiceservice.getRevoInvoiceData(request);
            reply.send(getRevoInvoiceDataResult);
        }
        catch (error) {
            console.error("Query Execution Error: IN getRevoInvoiceData controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    revoinvoicecontroller.getRevoInvoiceDataById = async (request, reply) => {
        try {
            let getRevoInvoiceDataByIdResult = await revoinvoiceservice.generaterevoinvoice(request, request.body, reply);
            reply.send(getRevoInvoiceDataByIdResult);
        }
        catch (error) {
            console.error("Query Execution Error: IN getRevoInvoiceDataById controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    revoinvoicecontroller.upsertRevoInvoice = async (request, reply) => {
        try {
            let upsertRevoInvoiceResult = await revoinvoiceservice.upsertRevoInvoice(request.body);
            console.log(request.body, "request.body in upsertRevoInvoice controller");
            if (upsertRevoInvoiceResult.command === "UPDATE" || upsertRevoInvoiceResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertRevoInvoiceResult.command === "UPDATE"
                        ? `Revo Invoice Updated  successfully`
                        : `Revo Invoice Created  successfully`,
                    data: upsertRevoInvoiceResult.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(upsertRevoInvoiceResult);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRevoInvoice controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(revoinvoicecontroller || (revoinvoicecontroller = {}));
//# sourceMappingURL=revoinvoice.controller.js.map