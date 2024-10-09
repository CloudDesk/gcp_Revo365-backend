import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { locationHistoryService } from "../services/locationhistory.service.js";
export var locationhistrorycontroller;
(function (locationhistrorycontroller) {
    locationhistrorycontroller.getLocationHistoryData = async (request, reply) => {
        try {
            let getlocationhistroy = await locationHistoryService.getLocationHistoryData(request);
            reply.status(200).send(getlocationhistroy);
        }
        catch (error) {
            console.log('ERROR IN  Controller getLocationHistoryData');
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    locationhistrorycontroller.upsertLocatonData = async (request, reply) => {
        try {
            let upsertLocation = await locationHistoryService.upsertLocationHistory(request.body);
            if (upsertLocation.command === "UPDATE" || upsertLocation.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertLocation.command === "UPDATE"
                        ? `Location History Updated successfully`
                        : `Location History successfully`,
                    Data: upsertLocation.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                console.log("else upsertnotesData Error");
                console.log(upsertLocation);
                reply.status(404).send({ error: [upsertLocation] });
            }
        }
        catch (error) {
            console.log('ERROR IN  Controller getLocationHistoryData');
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
})(locationhistrorycontroller || (locationhistrorycontroller = {}));
//# sourceMappingURL=locationhistory.controller.js.map