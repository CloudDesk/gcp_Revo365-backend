import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { locationHistoryService } from "../services/locationhistory.service.js";

export module locationhistrorycontroller {
    export const getLocationHistoryData = async (request: any, reply: any) => {
        try {

            let getlocationhistroy = await locationHistoryService.getLocationHistoryData(request)
            reply.status(200).send(getlocationhistroy)

        } catch (error) {
            console.log('ERROR IN  Controller getLocationHistoryData', error);
            let errordata = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata)
        }
    }

    export const upsertLocatonData = async (request: any, reply: any) => {
        try {

            let upsertLocation = await locationHistoryService.upsertLocationHistory(request.body)
            if (upsertLocation.command === "UPDATE" || upsertLocation.command === "INSERT") {
                let message: any = {}
                message = {
                    message: upsertLocation.command === "UPDATE"
                        ? `Location History Updated successfully`
                        : `Location History successfully`,
                    Data: upsertLocation.rows[0]
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertLocation] })
            }

        } catch (error) {
            console.log('ERROR IN  Controller getLocationHistoryData', error);
            let errordata = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata)
        }
    }

}