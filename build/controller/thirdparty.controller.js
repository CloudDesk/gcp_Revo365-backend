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
})(thirdPartyController || (thirdPartyController = {}));
//# sourceMappingURL=thirdparty.controller.js.map