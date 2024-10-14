import { recordCountService } from "../services/recordcount.service.js";
export var recordCount;
(function (recordCount) {
    recordCount.getRecordCount = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getRecordCount(objectName, request);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    recordCount.getRecordCountRevo = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getRecordCountRevo(objectName, request);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    recordCount.getRecordCountWithUserId = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getRecordCountWithUserId(request);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    recordCount.getArchivefilterRecordCount = async (request, reply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount = await recordCountService.getArchivefilterRecordCount(objectName, request);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    recordCount.getGlobalProductDataCount = async (request, reply) => {
        try {
            const getRecordCount = await recordCountService.getGlobalProductDataCount(request, reply);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
})(recordCount || (recordCount = {}));
//# sourceMappingURL=recordcount.controller.js.map