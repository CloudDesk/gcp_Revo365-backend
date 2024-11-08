import { FastifyReply, FastifyRequest } from "fastify";
import { purchaseOrderService } from "../services/purchaseorder.service.js";

interface idparams {
    id: number
}

export module purchaseOrderController {

    export const getPurchaseOrder = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getPurchaseOrderResult = await purchaseOrderService.getPurchaseOrderData(request)
            reply.send(getPurchaseOrderResult)
        } catch (error) {
            reply.send(error.message)
        }
    }
    export const getEachPurchaseOrder = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getPurchaseOrderResult = await purchaseOrderService.getEachPurchaseOrderData(request)
            reply.send(getPurchaseOrderResult)
        } catch (error) {
            reply.send(error.message)
        }
    }

    export const deletePurchaseOrder = async (reqeust: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = reqeust.params;
            let deletePurchaseOrderResult = await purchaseOrderService.deletePurchaseOrder(Number(id));
            reply.send(deletePurchaseOrderResult)
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const upsertInvoice = async (request: any, reply: any) => {
        try {
            let productUpsertResult: any = await purchaseOrderService.upsertInvoice(request)
            if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                let message: any = {}
                message = {
                    "Purchase Order": productUpsertResult.command === "UPDATE"
                        ? `Inovice Added successfully`
                        : `Inovice Added successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send('Error when uploading Invoice please contact Admin')
            }
        } catch (error) {
            console.log(error.message, 'Error in Upsert Prodouct data set');
            reply.send(` Error in upsert Product : ${error.message}`)
        }
    }

    export const upsertGcpInvoice = async (request: any, reply: any) => {
        try {
            let productUpsertResult: any = await purchaseOrderService.upsertInvoice(request)
            if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                let message: any = {}
                message = {
                    "Purchase Order": productUpsertResult.command === "UPDATE"
                        ? `Inovice Added successfully`
                        : `Inovice Added successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send('Error when uploading Invoice please contact Admin')
            }
        } catch (error) {
            console.log(error.message, 'Error in Upsert Prodouct data set');
            reply.send(` Error in upsert Product : ${error.message}`)
        }
    }
    export const deleteUrl = async (request: any, reply: any) => {
        try {
            let productUpsertResult: any = await purchaseOrderService.deleteUrl(request)
            if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                let message: any = {}
                message = {
                    "Purchase Order": productUpsertResult.command === "UPDATE"
                        ? `Inovice Removed Successfully`
                        : `Inovice Removed Successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send('Error when uploading Invoice please contact Admin')
            }
        } catch (error) {
            console.log(error.message, 'Error in Upsert Prodouct data set');
            reply.send(` Error in upsert Product : ${error.message}`)
        }
    }

    export const upsertPurchaseOrder = async (request: any, reply: any) => {
        try {
            const purchaseorderData = request.body;
            let upsertPurchaseorderResult = await purchaseOrderService.upsertPurchaseOrder(purchaseorderData);
            if (upsertPurchaseorderResult.command === "UPDATE" || upsertPurchaseorderResult.command === "INSERT") {
                console.log(upsertPurchaseorderResult.command, '--');
                let message: any = {};
                message = {
                    message: upsertPurchaseorderResult.command === "UPDATE"
                        ? `Data Updated successfully in Purchaseorder`
                        : `Data Inserted succcessfully into Purchaseorder`,
                    Data: upsertPurchaseorderResult.rows[0]

                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send(upsertPurchaseorderResult)
            }
        } catch (error) {
            reply.send(error.message)
        }
    }
}