import { recordCountService } from "../services/recordcount.service.js";
export var recordCount;
(function (recordCount) {
    recordCount.getRecordCount = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getRecordCount(objectName, request);
            reply.send(getRecordCount);
        }
        catch (error) {
            console.error("Error in getRecordCount", error);
            reply.send(error.message);
        }
    };
    recordCount.getRecordCountRevo = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getRecordCountRevo(objectName, request);
            reply.send(getRecordCount);
        }
        catch (error) {
            console.error("Error in getRecordCountRevo", error);
            reply.send(error.message);
        }
    };
    recordCount.getRecordCountWithUserId = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getRecordCountWithUserId(request);
            reply.send(getRecordCount);
        }
        catch (error) {
            console.error("Error in getRecordCountWithUserId", error);
            reply.send(error.message);
        }
    };
    recordCount.getArchivefilterRecordCount = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getArchivefilterRecordCount(objectName, request);
            reply.send(getRecordCount);
        }
        catch (error) {
            console.error("Error in getArchivefilterRecordCount", error);
            reply.send(error.message);
        }
    };
    recordCount.getGlobalProductDataCount = async (request, reply) => {
        try {
            const getRecordCount = await recordCountService.getGlobalProductDataCount(request, reply);
            reply.send(getRecordCount);
        }
        catch (error) {
            console.error("Error in getGlobalProductDataCount", error);
            reply.send(error.message);
        }
    };
})(recordCount || (recordCount = {}));
//# sourceMappingURL=recordcount.controller.js.map