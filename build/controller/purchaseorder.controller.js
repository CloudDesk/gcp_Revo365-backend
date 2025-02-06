import { purchaseOrderService } from "../services/purchaseorder.service.js";
export var purchaseOrderController;
(function (purchaseOrderController) {
    purchaseOrderController.getPurchaseOrder = async (request, reply) => {
        try {
            let getPurchaseOrderResult = await purchaseOrderService.getPurchaseOrderData(request);
            reply.send(getPurchaseOrderResult);
        }
        catch (error) {
            console.error("Error in getPurchaseOrder", error);
            reply.send(error.message);
        }
    };
    purchaseOrderController.getEachPurchaseOrder = async (request, reply) => {
        try {
            let getPurchaseOrderResult = await purchaseOrderService.getEachPurchaseOrderData(request);
            reply.send(getPurchaseOrderResult);
        }
        catch (error) {
            console.error("Error in getPurchaseOrder", error);
            reply.send(error.message);
        }
    };
    purchaseOrderController.deletePurchaseOrder = async (reqeust, reply) => {
        try {
            const { id } = reqeust.params;
            let deletePurchaseOrderResult = await purchaseOrderService.deletePurchaseOrder(Number(id));
            reply.send(deletePurchaseOrderResult);
        }
        catch (error) {
            console.error("Error in deletePurchaseOrder", error);
            reply.send(error.message);
        }
    };
    purchaseOrderController.upsertInvoice = async (request, reply) => {
        try {
            let productUpsertResult = await purchaseOrderService.upsertInvoice(request);
            if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                let message = {};
                message = {
                    "Purchase Order": productUpsertResult.command === "UPDATE"
                        ? `Inovice Added successfully`
                        : `Inovice Added successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send('Error when uploading Invoice please contact Admin');
            }
        }
        catch (error) {
            console.error("Error in upsertInvoice", error);
            reply.send(` Error in upsert Product : ${error.message}`);
        }
    };
    purchaseOrderController.upsertGcpInvoice = async (request, reply) => {
        try {
            let productUpsertResult = await purchaseOrderService.upsertInvoice(request);
            if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                let message = {};
                message = {
                    "Purchase Order": productUpsertResult.command === "UPDATE"
                        ? `Inovice Added successfully`
                        : `Inovice Added successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send('Error when uploading Invoice please contact Admin');
            }
        }
        catch (error) {
            console.error("Error in upsertGcpInvoice", error);
            reply.send(` Error in upsert Product : ${error.message}`);
        }
    };
    purchaseOrderController.deleteUrl = async (request, reply) => {
        try {
            let productUpsertResult = await purchaseOrderService.deleteUrl(request);
            if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                let message = {};
                message = {
                    "Purchase Order": productUpsertResult.command === "UPDATE"
                        ? `Inovice Removed Successfully`
                        : `Inovice Removed Successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send('Error when uploading Invoice please contact Admin');
            }
        }
        catch (error) {
            console.error("Error in deleteUrl", error);
            reply.send(` Error in upsert Product : ${error.message}`);
        }
    };
    purchaseOrderController.upsertPurchaseOrder = async (request, reply) => {
        try {
            const purchaseorderData = request.body;
            let upsertPurchaseorderResult = await purchaseOrderService.upsertPurchaseOrder(purchaseorderData);
            if (upsertPurchaseorderResult.command === "UPDATE" || upsertPurchaseorderResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertPurchaseorderResult.command === "UPDATE"
                        ? `Data Updated successfully in Purchaseorder`
                        : `Data Inserted succcessfully into Purchaseorder`,
                    Data: upsertPurchaseorderResult.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send(upsertPurchaseorderResult);
            }
        }
        catch (error) {
            console.error("Error in upsertPurchaseOrder", error);
            reply.send(error.message);
        }
    };
})(purchaseOrderController || (purchaseOrderController = {}));
//# sourceMappingURL=purchaseorder.controller.js.map