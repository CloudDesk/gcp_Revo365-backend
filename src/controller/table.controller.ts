import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { getTables } from "../services/getTable.service.js"

export module tablecontoller {
    export const getTable = async (request: any, reply: any) => {
        try {
            let getTableResult = await getTables.getTable(request);
            reply.send(getTableResult);
        } catch (error) {
            console.error("Error in getTable", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const getUserTable = async (request: any, reply: any) => {
        try {
            let getTableResult = await getTables.getUserTable(request);
            reply.send(getTableResult);
        } catch (error) {
            console.error("Error in getUserTable", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
}