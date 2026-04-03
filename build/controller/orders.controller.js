import { ordersService } from "../services/orders.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var ordersController;
(function (ordersController) {
    ordersController.getOrderlineDynamicData = async (request, reply) => {
        try {
            let getstock = await ordersService.getOrderlineDynamic(request);
            reply.send(getstock);
        }
        catch (error) {
            console.error("Query Execution Error: IN getOrderlineDynamicData Controller", error);
            reply.send(error.message);
        }
    };
    ordersController.getOrderData = async (request, reply) => {
        try {
            let data = await ordersService.getOrderData(request);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN getOrderData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.updateorderlineitem = async (request, reply) => {
        try {
            let upsertOrderlineResult = await ordersService.updateorderlineitem(request);
            if (upsertOrderlineResult.command === "UPDATE" || upsertOrderlineResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertOrderlineResult.command === "UPDATE"
                        ? `Order Line Item Updated successfully in orders`
                        : `Order  Order Line Item Inserted  Successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(400).send(upsertOrderlineResult);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN updateorderlineitem Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.getInvoiceGeneratedData = async (request, reply) => {
        try {
            const result = await ordersService.getInvoiceGeneratedData(request);
            if ("error" in result) {
                return reply.code(404).send({ success: false, message: result.error });
            }
            if ("errorMessage" in result) {
                return reply.code(result.statusCode ?? 400).send({ success: false, message: result.errorMessage, details: result.errorDetails });
            }
            return reply.send({ success: true, data: result });
        }
        catch (error) {
            console.error("Query Execution Error: IN getInvoiceGeneratedData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.updateInvoiceGeneratedData = async (request, reply) => {
        try {
            const result = await ordersService.updateInvoiceGeneratedData(request);
            console.log("Result in updateInvoiceGeneratedData Controller:", result);
            if ("errorMessage" in result) {
                return reply.code(result.statusCode ?? 400).send({
                    success: false,
                    message: result.errorMessage,
                    details: result.errorDetails
                });
            }
            if (result?.success === false) {
                return reply.code(400).send(result);
            }
            // ✅ Send success response
            return reply.send({
                success: true,
                message: "Rental invoice status updated successfully",
                data: result
            });
        }
        catch (error) {
            console.error("Query Execution Error: IN updateInvoiceGeneratedData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.getUserOrderData = async (request, reply) => {
        try {
            // const userid = request.params.userId;
            let getOrderDataResult = await ordersService.getUserOrderData(request);
            reply.send(getOrderDataResult);
        }
        catch (error) {
            console.error("Error IN Controller getUserOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.getorderlinedata = async (request) => {
        try {
            let data = await ordersService.getOrderLineData(request);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN getorderlinedata Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.getInvorderlinedata = async (request) => {
        try {
            let data = await ordersService.getInvOrderLineData(request);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN getorderlinedata Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.getUserOrderData1 = async (request, reply) => {
        try {
            // const userid = request.params.userId;
            let getOrderDataResult = await ordersService.getUserOrderData1(request);
            reply.send(getOrderDataResult);
        }
        catch (error) {
            console.error("Error IN Controller getUserOrderData1", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.getInvoiceDataForOrderid = async (request, reply) => {
        try {
            let getInvoiceDataResult = await ordersService.getInvoiceDataForOrderid(request);
            reply.send(getInvoiceDataResult);
        }
        catch (error) {
            console.error("Error IN Controller getInvoiceDataForOrderid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.deleteOrder = async (request, reply) => {
        try {
            const { id } = request.params;
            // let deleteOrderResult = await ordersService.deleteOrder(Number(id));
            // reply.send(deleteOrderResult);
        }
        catch (error) {
            console.error("Error IN Controller deleteOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.upsertOrder = async (request, reply) => {
        try {
            const orderData = request.body;
            let upsertOrderResult = await ordersService.upsertOrder(orderData);
            if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertOrderResult.command === "UPDATE"
                        ? `Data Updated successfully in orders`
                        : `Order Placed Successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(400).send(upsertOrderResult);
            }
        }
        catch (error) {
            console.error("Error IN Controller upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.upsertOrderv2 = async (request, reply) => {
        try {
            // const orderData = request.body.order;
            // let upsertOrderResult = await ordersService.bulkInsertOrder(orderData);
            // if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
            //     let message: any = {};
            //     message = {
            //         message: upsertOrderResult.command === "UPDATE"
            //             ? `Data Updated successfully in orders`
            //             : `Order Placed Successfully`,
            //        data:upsertOrderResult.rows     
            //     };
            //     reply.status(200).send(message);
            // } else {
            //     reply.status(400).send(upsertOrderResult)
            // }
        }
        catch (error) {
            console.error("Error IN Controller upsertOrderv2", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.upsertOrderrfid = async (request, reply) => {
        try {
            const orderData = request.body;
            let upsertOrderResult = await ordersService.upsertOrderrfid(orderData);
            if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertOrderResult.command === "UPDATE"
                        ? `Order Updated Successfully and Stock Status Updated To Sold`
                        : `Order Placed Successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(400).send(upsertOrderResult);
            }
        }
        catch (error) {
            console.error("Error IN Controller upsertOrderrfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.upsertOrderlinerfid = async (request, reply) => {
        try {
            const orderData = request.body;
            let upsertOrderResult = await ordersService.upsertOrderlinerfid(orderData);
            if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertOrderResult.command === "UPDATE"
                        ? `Order Updated Successfully and Stock Status Updated To Sold`
                        : `Order Placed Successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(400).send(upsertOrderResult);
            }
        }
        catch (error) {
            console.error("Error IN Controller upsertOrderlinerfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.deleteBasedOnMerchantId = async (request, reply) => {
        try {
            let getOrderDataResult = await ordersService.getOrderDataForMerchantid(request.body);
            reply.send(getOrderDataResult);
        }
        catch (error) {
            console.error("Error IN Controller deleteBasedOnMerchantId", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersController.deleteFailedOrder = async (request, reply) => {
        try {
            const getOrderDataResult = await ordersService.deleteFailedOrder(request.body.merchantid);
            reply.send(getOrderDataResult);
        }
        catch (error) {
            console.error("Error IN Controller deleteBasedOnMerchantId", error);
            const ErrorMessage = await ErrorHandler.handleQueryError(error);
            reply.code(500).send(ErrorMessage);
        }
    };
})(ordersController || (ordersController = {}));
//# sourceMappingURL=orders.controller.js.map