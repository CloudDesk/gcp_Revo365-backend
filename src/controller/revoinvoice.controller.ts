import { revoinvoiceservice } from "../services/revoinvoice.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import exp from "constants";

export module revoinvoicecontroller {
    export const getRevoInvoiceData = async (request: any, reply: any) => {
        try {
            let getRevoInvoiceDataResult = await revoinvoiceservice.getRevoInvoiceData(request);
            reply.send(getRevoInvoiceDataResult);

        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }

    export const getRevoInvoiceDataById = async (request: any, reply: any) => {
        try {
            let getRevoInvoiceDataByIdResult = await revoinvoiceservice.generaterevoinvoice(request,request.body,reply);
            reply.send(getRevoInvoiceDataByIdResult);

        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }

    export const upsertRevoInvoice = async (request: any, reply: any) => {
        try {
            let upsertRevoInvoiceResult = await revoinvoiceservice.upsertRevoInvoice(request.body);
            if (upsertRevoInvoiceResult.command === "UPDATE" || upsertRevoInvoiceResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertRevoInvoiceResult.command === "UPDATE"
                        ? `Revo Invoice Updated  successfully`
                        : `Revo Invoice Created  successfully`,
                        data: upsertRevoInvoiceResult.rows[0]
                };
                reply.status(200).send(message);
            } else {
                reply.status(500).send(upsertRevoInvoiceResult);
            }
        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }
}