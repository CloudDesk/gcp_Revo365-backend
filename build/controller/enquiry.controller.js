import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { enquiryService } from "../services/enquiry.service.js";
export var enquiryController;
(function (enquiryController) {
    enquiryController.enquiryCorporate = async (request, reply) => {
        try {
            const result = await enquiryService.enquiryCorporate(request);
            if (result?.status && result.status !== 200) {
                reply.status(result.status).send({ message: result.message });
            }
            else {
                reply.send(result);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN enquiryCorporate Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            reply.status(ErrorMessage.statusCode || 500).send(ErrorMessage);
        }
    };
    enquiryController.enquiryIndividual = async (request, reply) => {
        try {
            const result = await enquiryService.enquiryIndividual(request);
            if (result?.status && result.status !== 200) {
                reply.status(result.status).send({ message: result.message });
            }
            else {
                reply.send(result);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN enquiryIndividual Controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            reply.status(ErrorMessage.statusCode || 500).send(ErrorMessage);
        }
    };
})(enquiryController || (enquiryController = {}));
//# sourceMappingURL=enquiry.controller.js.map