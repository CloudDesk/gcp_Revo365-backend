import { generatePrdataservice } from "../services/prGenerate.service.js";
export var generatePRController;
(function (generatePRController) {
    generatePRController.generatepr = async (request, reply) => {
        try {
            let prresult = await generatePrdataservice.generatePrdata(request, request.body, reply);
            console.log(prresult, 'PR Result final');
            reply.send(prresult);
        }
        catch (error) {
            console.error('ERROR IN  Controller generatepr', error);
            reply.status(404).send(error.message);
        }
    };
})(generatePRController || (generatePRController = {}));
//# sourceMappingURL=prgenerate.controller.js.map