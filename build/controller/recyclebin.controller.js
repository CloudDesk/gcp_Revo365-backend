import { recycleBinSerivce } from "../services/recyclebin.service.js";
export var recycleBinController;
(function (recycleBinController) {
    recycleBinController.getRecycleBindata = async (request, reply) => {
        try {
            const { pageNumber, recordCount } = request.params;
            let getRecycleBinData = await recycleBinSerivce.getRecycleBinData(pageNumber, recordCount);
            reply.send(getRecycleBinData);
        }
        catch (error) {
            console.error("Error in 'getRecycleBindata':", error);
            reply.send(error);
        }
    };
    recycleBinController.getRecycleBindataRevo = async (request, reply) => {
        try {
            const { pageNumber, recordCount } = request.params;
            let getRecycleBinData = await recycleBinSerivce.getRecycleBinDataRevo(pageNumber, recordCount);
            reply.send(getRecycleBinData);
        }
        catch (error) {
            console.error("Error in 'getRecycleBindataRevo':", error);
            reply.send(error);
        }
    };
})(recycleBinController || (recycleBinController = {}));
//# sourceMappingURL=recyclebin.controller.js.map