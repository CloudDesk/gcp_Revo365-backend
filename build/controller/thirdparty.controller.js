import { thirdPartyOrdersService } from "../services/thirdpartyorders.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var thirdPartyController;
(function (thirdPartyController) {
    thirdPartyController.getThirdpartyOrderData = async (request, reply) => {
        try {
            console.log("Inside third party controller Request Query:", request.query);
            let data = await thirdPartyOrdersService.getThirdPartyOrderData(request);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN getOrderData Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    // Admin: mark a 3rd-party order as dispatched / shipped / delivered / cancelled
    // POST /thirdpartyorders/status  body: { id: number, orderstatus: string }
    thirdPartyController.updateThirdPartyOrderStatus = async (request, reply) => {
        try {
            const data = request.body;
            if (!data?.id || !data?.orderstatus) {
                return reply.status(400).send({ error: 'id and orderstatus are required' });
            }
            const result = await thirdPartyOrdersService.updateThirdPartyOrderStatus(data);
            if (result?.error) {
                return reply.status(400).send(result);
            }
            return reply.status(200).send(result);
        }
        catch (error) {
            console.error("Query Execution Error: IN updateThirdPartyOrderStatus Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return reply.status(500).send(ErrorMessage);
        }
    };
})(thirdPartyController || (thirdPartyController = {}));
//# sourceMappingURL=thirdparty.controller.js.map