import { FastifyRequest, FastifyReply } from "fastify";
import { ordersService } from "../services/orders.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { request } from "http";

interface idparams {
    id: number
}

export module ordersController {

    export const getOrderlineDynamicData = async (request, reply) => {
        try {

            let getstock = await ordersService.getOrderlineDynamic(request)
            reply.send(getstock)
        } catch (error) {
            console.error("Query Execution Error: IN getOrderlineDynamicData Controller", error);
            reply.send(error.message)
        }
    }

    export const getOrderData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let data = await ordersService.getOrderData(request)
            return data
        } catch (error) {
            console.error("Query Execution Error: IN getOrderData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const updateorderlineitem = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let upsertOrderlineResult = await ordersService.updateorderlineitem(request)
            if (upsertOrderlineResult.command === "UPDATE" || upsertOrderlineResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertOrderlineResult.command === "UPDATE"
                        ? `Order Line Item Updated successfully in orders`
                        : `Order  Order Line Item Inserted  Successfully`
                };
                reply.status(200).send(message);
            } else {
                reply.status(400).send(upsertOrderlineResult)
            }
        } catch (error) {
            console.error("Query Execution Error: IN updateorderlineitem Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const getInvoiceGeneratedData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const result = await ordersService.getInvoiceGeneratedData(request);
    if ("error" in result) {
        return reply.code(404).send({ success: false, message: result.error });
    }
    if ("errorMessage" in result) {
        return reply.code(result.statusCode ?? 400).send({ success: false, message: result.errorMessage, details: result.errorDetails });
    }

    return reply.send({ success: true, data: result });
        } catch (error) {
            console.error("Query Execution Error: IN getInvoiceGeneratedData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
            
        }
    }

    export const updateInvoiceGeneratedData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const result = await ordersService.updateInvoiceGeneratedData(request);
            console.log("Result in updateInvoiceGeneratedData Controller:", result);
            if (result?.success === false) {
      return reply.code(400).send(result);
    }

    // ✅ Send success response
    return reply.send({
      success: true,
      message: "Rental invoice status updated successfully",
      data: result
    });
        } catch (error) {
            console.error("Query Execution Error: IN updateInvoiceGeneratedData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
            
        }
    }
    export const getUserOrderData = async (request: any, reply: any) => {
        try {
            // const userid = request.params.userId;
            let getOrderDataResult = await ordersService.getUserOrderData(request)
            reply.send(getOrderDataResult)
        } catch (error) {
            console.error("Error IN Controller getUserOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const getorderlinedata = async (request) => {
        try {
            let data = await ordersService.getOrderLineData(request)
            return data
        } catch (error) {
            console.error("Query Execution Error: IN getorderlinedata Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const getInvorderlinedata = async (request) => {
        try {
            let data = await ordersService.getInvOrderLineData(request)
            return data
        } catch (error) {
            console.error("Query Execution Error: IN getorderlinedata Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const getUserOrderData1 = async (request: any, reply: any) => {
        try {
            // const userid = request.params.userId;
            let getOrderDataResult = await ordersService.getUserOrderData1(request)
            reply.send(getOrderDataResult)
        } catch (error) {
            console.error("Error IN Controller getUserOrderData1", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const getInvoiceDataForOrderid = async (request: any, reply: any) => {
        try {
            console.log('Request in Controller getInvoiceDataForOrderid:', request);
            let getInvoiceDataResult = await ordersService.getInvoiceDataForOrderid(request)
            reply.send(getInvoiceDataResult)
        } catch (error) {
            console.error("Error IN Controller getInvoiceDataForOrderid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
            
        }
    }

    export const deleteOrder = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            // let deleteOrderResult = await ordersService.deleteOrder(Number(id));
            // reply.send(deleteOrderResult);
        } catch (error) {
            console.error("Error IN Controller deleteOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const upsertOrder = async (request: any, reply: any) => {
        try {
            const orderData = request.body;
            let upsertOrderResult = await ordersService.upsertOrder(orderData);
            if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertOrderResult.command === "UPDATE"
                        ? `Data Updated successfully in orders`
                        : `Order Placed Successfully`
                };
                reply.status(200).send(message);
            } else {
                reply.status(400).send(upsertOrderResult)
            }
        } catch (error) {
            console.error("Error IN Controller upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const upsertOrderv2 = async (request: any, reply: any) => {
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
        } catch (error) {
            console.error("Error IN Controller upsertOrderv2", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }


    export const upsertOrderrfid = async (request: any, reply: any) => {
        try {
            const orderData = request.body;
            let upsertOrderResult = await ordersService.upsertOrderrfid(orderData);
            if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertOrderResult.command === "UPDATE"
                        ? `Order Updated Successfully and Stock Status Updated To Sold`
                        : `Order Placed Successfully`
                };
                reply.status(200).send(message);
            }

            else {
                reply.status(400).send(upsertOrderResult)
            }
        } catch (error) {
            console.error("Error IN Controller upsertOrderrfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const upsertOrderlinerfid = async (request: any, reply: any) => {
        try {
            const orderData = request.body;
            let upsertOrderResult = await ordersService.upsertOrderlinerfid(orderData);
            if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertOrderResult.command === "UPDATE"
                        ? `Order Updated Successfully and Stock Status Updated To Sold`
                        : `Order Placed Successfully`
                };
                reply.status(200).send(message);
            }

            else {
                reply.status(400).send(upsertOrderResult)
            }
        } catch (error) {
            console.error("Error IN Controller upsertOrderlinerfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const deleteBasedOnMerchantId = async (request: any, reply: any) => {
        try {
            let getOrderDataResult = await ordersService.getOrderDataForMerchantid(request.body)
            reply.send(getOrderDataResult)
        } catch (error) {
            console.error("Error IN Controller deleteBasedOnMerchantId", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const deleteFailedOrder = async (request, reply) => {
  try {
    const getOrderDataResult = await ordersService.deleteFailedOrder(request.body.merchantid);
    reply.send(getOrderDataResult);
  } catch (error) {
    console.error("Error IN Controller deleteBasedOnMerchantId", error);
    const ErrorMessage = await ErrorHandler.handleQueryError(error);
    reply.code(500).send(ErrorMessage);
  }
};

}
