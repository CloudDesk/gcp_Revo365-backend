import { FastifyReply, FastifyRequest } from "fastify";
import { thirdPartyOrdersService } from "../services/thirdpartyorders.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

export module thirdPartyController {
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

    // Admin: mark a 3rd-party order as dispatched / shipped / delivered / cancelled
    // POST /thirdpartyorders/status  body: { id: number, orderstatus: string }
    export const updateThirdPartyOrderStatus = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const data = request.body as any;
            if (!data?.id || !data?.orderstatus) {
                return reply.status(400).send({ error: 'id and orderstatus are required' });
            }
            const result = await thirdPartyOrdersService.updateThirdPartyOrderStatus(data);
            if ((result as any)?.error) {
                return reply.status(400).send(result);
            }
            return reply.status(200).send(result);
        } catch (error) {
            console.error("Query Execution Error: IN updateThirdPartyOrderStatus Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return reply.status(500).send(ErrorMessage);
        }
    }
}