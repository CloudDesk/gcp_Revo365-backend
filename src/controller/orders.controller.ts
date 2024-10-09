import { FastifyRequest, FastifyReply } from "fastify";
import { ordersService } from "../services/orders.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

interface idparams {
    id: number
}

export module ordersController {

    export const getOrderlineDynamicData = async (request, reply) => {
        try {

            let getstock = await ordersService.getOrderlineDynamic(request)
            reply.send(getstock)
        } catch (error) {
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
            console.log(ErrorMessage);
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
            console.error("Query Execution Error: IN getOrderData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
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
            console.error("Error IN Controller upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }

    // export const upsertOrderrfid = async (request: any, reply: any) => {
    //     try {
    //         console.log("upsertOrderrfid", request.body)
    //         const orderData = request.body;
    //         let upsertOrderResult = await ordersService.upsertOrderrfid(orderData);
    //         if (upsertOrderResult.command === "UPDATE" || upsertOrderResult.command === "INSERT") {
    //             let message: any = {};
    //             message = {
    //                 message: upsertOrderResult.command === "UPDATE"
    //                     ? `Order Updated Successfully and Stock Status Updated To Sold`
    //                     : `Order Placed Successfully`
    //             };
    //             reply.status(200).send(message);
    //         }

    //         else {
    //             reply.status(400).send(upsertOrderResult)
    //         }
    //     } catch (error) {
    //         console.error("Error IN Controller upsertOrder", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //         console.log(ErrorMessage);
    //         return ErrorMessage
    //     }
    // }

    export const upsertOrderrfid = async (request: any, reply: any) => {
        try {
            console.log("upsertOrderrfid", request.body)
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
            console.error("Error IN Controller upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
    export const upsertOrderlinerfid = async (request: any, reply: any) => {
        try {
            console.log("upsertOrderrfid", request.body)
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
            console.error("Error IN Controller upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
    export const deleteBasedOnMerchantId = async (request: any, reply: any) => {
        try {
            let getOrderDataResult = await ordersService.getOrderDataForMerchantid(request.body)
            reply.send(getOrderDataResult)
        } catch (error) {
            console.error("Error IN Controller upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
}
