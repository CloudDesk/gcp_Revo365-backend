import { ticketReplacementService } from "../services/ticketReplacement.service.js";
export var ticketReplacementController;
(function (ticketReplacementController) {
    ticketReplacementController.getRentalReplacementContext = async (request, reply) => {
        try {
            const result = await ticketReplacementService.getRentalReplacementContext(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'getRentalReplacementContext':", error);
            const message = error?.message || "Failed to load rental replacement context.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.getRentalReplacementHistory = async (request, reply) => {
        try {
            const result = await ticketReplacementService.getRentalReplacementHistory(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'getRentalReplacementHistory':", error);
            const message = error?.message || "Failed to load rental replacement history.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.initiateRentalReplacement = async (request, reply) => {
        try {
            const result = await ticketReplacementService.initiateRentalReplacement(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'initiateRentalReplacement':", error);
            const message = error?.message || "Failed to initiate rental replacement.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.receiveOldAsset = async (request, reply) => {
        try {
            const result = await ticketReplacementService.receiveOldAsset(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'receiveOldAsset':", error);
            const message = error?.message || "Failed to receive the old asset.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.assignTechnicalReplacement = async (request, reply) => {
        try {
            const result = await ticketReplacementService.assignTechnicalReplacement(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'assignTechnicalReplacement':", error);
            const message = error?.message || "Failed to assign the technical replacement asset.";
            reply.status(400).send({ message });
        }
    };
})(ticketReplacementController || (ticketReplacementController = {}));
//# sourceMappingURL=ticketReplacement.controller.js.map