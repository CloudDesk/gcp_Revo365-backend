import { vendorCustomerAssignmentService } from "../services/vendorCustomerAssignment.service.js";
export var vendorCustomerAssignmentController;
(function (vendorCustomerAssignmentController) {
    vendorCustomerAssignmentController.getAssignments = async (request, reply) => {
        try {
            const result = await vendorCustomerAssignmentService.getAssignments(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in getAssignments:", error);
            reply.status(error?.statusCode || 400).send({
                message: error?.message || "Failed to load vendor customer assignments.",
                invalidCustomerIds: error?.invalidCustomerIds,
            });
        }
    };
    vendorCustomerAssignmentController.replaceAssignments = async (request, reply) => {
        try {
            const result = await vendorCustomerAssignmentService.replaceAssignments(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in replaceAssignments:", error);
            reply.status(error?.statusCode || 400).send({
                message: error?.message || "Failed to update vendor customer assignments.",
                invalidCustomerIds: error?.invalidCustomerIds,
            });
        }
    };
})(vendorCustomerAssignmentController || (vendorCustomerAssignmentController = {}));
//# sourceMappingURL=vendorCustomerAssignment.controller.js.map