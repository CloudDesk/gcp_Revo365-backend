import { purchaseRequestService } from "../services/purchaseRequest.Service.js";
export var purcahseRequestController;
(function (purcahseRequestController) {
    purcahseRequestController.getPurchaseRequestData = async (request, reply) => {
        try {
            let getPurchaseRequestResult = await purchaseRequestService.getPurchaseRequestData(request);
            reply.send(getPurchaseRequestResult);
        }
        catch (error) {
            console.error("Error in 'getPurchaseRequestData':", error);
            reply.status(404).send(error.message);
        }
    };
    purcahseRequestController.upsertPurchaseRequestData = async (request, reply) => {
        try {
            const prData = request.body;
            console.log("Request Body in upsertPurchaseRequestData:", prData);
            let upsertPurchaseRequest = await purchaseRequestService.upsertPurchaseRequestData(prData);
            if (upsertPurchaseRequest.command === "UPDATE" || upsertPurchaseRequest.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertPurchaseRequest.command === "UPDATE"
                        ? `Purchase Request Updated successfully`
                        : `Purchase Request Inserted successfully`,
                    Data: upsertPurchaseRequest.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [upsertPurchaseRequest] });
            }
        }
        catch (error) {
            console.error("Error in 'upsertPurchaseRequestData':", error);
            reply.status(404).send(error.message);
        }
    };
})(purcahseRequestController || (purcahseRequestController = {}));
//# sourceMappingURL=purchaserequest.controller.js.map