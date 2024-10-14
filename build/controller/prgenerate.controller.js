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
        }
    };
})(generatePRController || (generatePRController = {}));
//# sourceMappingURL=prgenerate.controller.js.map