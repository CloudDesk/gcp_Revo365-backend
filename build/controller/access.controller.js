import { accessScopeService } from "../services/accessScope.service.js";
export var accessController;
(function (accessController) {
    accessController.getMyAccess = async (request, reply) => {
        try {
            const result = await accessScopeService.getAccessForRequest(request);
            if (!result) {
                return reply.status(401).send({ message: "Unauthorized: No valid session" });
            }
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in getMyAccess:", error);
            reply.status(400).send({
                message: error?.message || "Failed to load access configuration.",
            });
        }
    };
})(accessController || (accessController = {}));
//# sourceMappingURL=access.controller.js.map