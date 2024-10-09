import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { getTables } from "../services/getTable.service.js";
export var tablecontoller;
(function (tablecontoller) {
    tablecontoller.getTable = async (request, reply) => {
        try {
            let getTableResult = await getTables.getTable(request);
            reply.send(getTableResult);
        }
        catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    tablecontoller.getUserTable = async (request, reply) => {
        try {
            let getTableResult = await getTables.getUserTable(request);
            reply.send(getTableResult);
        }
        catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(tablecontoller || (tablecontoller = {}));
//# sourceMappingURL=table.controller.js.map