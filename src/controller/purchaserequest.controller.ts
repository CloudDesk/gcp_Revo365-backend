import { purchaseRequestService } from "../services/purchaseRequest.Service.js"

export module purcahseRequestController {


    export const getPurchaseRequestData = async (request, reply) => {
        try {
            let getPurchaseRequestResult = await purchaseRequestService.getPurchaseRequestData(request)
            reply.send(getPurchaseRequestResult)
        } catch (error) {
            console.error("Error in 'getPurchaseRequestData':", error);
            reply.status(404).send(error.message)
        }
    }

    export const upsertPurchaseRequestData = async (request, reply) => {
        try {
            const prData = request.body;
            console.log("Request Body in upsertPurchaseRequestData:", prData);
            let upsertPurchaseRequest = await purchaseRequestService.upsertPurchaseRequestData(prData)
            if (upsertPurchaseRequest.command === "UPDATE" || upsertPurchaseRequest.command === "INSERT") {
                let message: any = {}
                message = {
                    message: upsertPurchaseRequest.command === "UPDATE"
                        ? `Purchase Request Updated successfully`
                        : `Purchase Request Inserted successfully`,
                    Data: upsertPurchaseRequest.rows[0]
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertPurchaseRequest] })
            }

        }
        catch (error) {
            console.error("Error in 'upsertPurchaseRequestData':", error);
            reply.status(404).send(error.message)
        }
    }
}