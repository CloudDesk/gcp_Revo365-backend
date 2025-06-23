import { FastifyReply, FastifyRequest } from "fastify";
import { thirdPartyOrdersService } from "../services/thirdpartyorders.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

export module thirdPartyController{
    export const getThirdpartyOrderData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            console.log("Inside third party controller Request Query:", request.query);
            let data = await thirdPartyOrdersService.getThirdPartyOrderData(request)
            return data
        } catch (error) {
            console.error("Query Execution Error: IN getOrderData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
}