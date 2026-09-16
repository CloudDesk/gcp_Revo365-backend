import { generatePurchaseOrderService } from "../services/poGenerate.service.js";
export var generatePurchaseOrderController;
(function (generatePurchaseOrderController) {
    generatePurchaseOrderController.purchaseOrderData = async (request, reply) => {
        try {
            let poresult = await generatePurchaseOrderService.generatepurchaseOrderData(request, request.body, reply);
            reply.send(poresult);
        }
        catch (error) {
            console.error('ERROR IN  Controller purchaseOrderData', error);
            reply.status(404).send(error.message);
        }
    };
})(generatePurchaseOrderController || (generatePurchaseOrderController = {}));
//# sourceMappingURL=pogenerate.controller.js.map