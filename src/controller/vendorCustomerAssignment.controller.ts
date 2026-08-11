import { vendorCustomerAssignmentService } from "../services/vendorCustomerAssignment.service.js";

export module vendorCustomerAssignmentController {
  export const getAssignments = async (request: any, reply: any) => {
    try {
      const result = await vendorCustomerAssignmentService.getAssignments(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in getAssignments:", error);
      reply.status(error?.statusCode || 400).send({
        message: error?.message || "Failed to load vendor customer assignments.",
        invalidCustomerIds: error?.invalidCustomerIds,
      });
    }
  };

  export const replaceAssignments = async (request: any, reply: any) => {
    try {
      const result = await vendorCustomerAssignmentService.replaceAssignments(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in replaceAssignments:", error);
      reply.status(error?.statusCode || 400).send({
        message: error?.message || "Failed to update vendor customer assignments.",
        invalidCustomerIds: error?.invalidCustomerIds,
      });
    }
  };
}
