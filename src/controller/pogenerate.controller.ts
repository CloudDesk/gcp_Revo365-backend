import { generatePurchaseOrderService } from "../services/poGenerate.service.js"

export module generatePurchaseOrderController {
    export const purchaseOrderData = async (request: any, reply: any) => {
        try {

            let poresult = await generatePurchaseOrderService.generatepurchaseOrderData(request, request.body, reply);
            reply.send(poresult);

        } catch (error) {
            console.error('ERROR IN  Controller purchaseOrderData', error);
            reply.status(404).send(error.message);
        }
    }
}