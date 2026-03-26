import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { demandrequestService } from "../services/demandrequest.service.js";

interface idparams {
    id: number;
}

export module demandrequestController {

    export const getDemandRequest = async (request: any, reply: any) => {
        try {
            let getDemandRequestResult: any = await demandrequestService.getDemandRequest(request);
            if (getDemandRequestResult.length > 0) {
                reply.status(200).send(getDemandRequestResult);
            } else {
                reply.status(404).send({ message: "No Demand Requests found" });
            }
        } catch (error) {
            console.log("ERROR IN Controller getDemandRequest", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };

    export const upsertDemandRequest = async (request: any, reply: any) => {
            try {
                console.log("Request Body in upsertDemandRequest:", request.body);
                const demandrequestData = request.body;
                let upsertDemandRequestResult : any = await demandrequestService.upsertDemandRequest(demandrequestData);
                if (
                    upsertDemandRequestResult.command === "UPDATE" ||
                    upsertDemandRequestResult.command === "INSERT"
                ) {
                    let message: any = {};
                    message = {
                        message:
                            upsertDemandRequestResult.command === "UPDATE"
                                ? `Demand Request Updated successfully`
                                : `Demand Request Inserted successfully`,
                    };
                    reply.status(200).send(message);
                } else {
                    reply.status(404).send(upsertDemandRequestResult);
                }
            } catch (error) {
                console.log("ERROR IN Controller upsertDemandRequest", error);
                let errordata = await ErrorHandler.handleQueryError(error);
                reply.status(404).send(errordata);
            }
        };
}