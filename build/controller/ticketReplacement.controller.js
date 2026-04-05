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
    ticketReplacementController.assignCommercialReplacement = async (request, reply) => {
        try {
            const result = await ticketReplacementService.assignCommercialReplacement(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'assignCommercialReplacement':", error);
            const message = error?.message || "Failed to assign the commercial replacement asset.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.rejectReplacement = async (request, reply) => {
        try {
            const result = await ticketReplacementService.rejectReplacement(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'rejectReplacement':", error);
            const message = error?.message || "Failed to reject the rental replacement flow.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.returnRentalAsset = async (request, reply) => {
        try {
            const result = await ticketReplacementService.returnRentalAsset(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'returnRentalAsset':", error);
            const message = error?.message || "Failed to return the rental asset.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.markRentalAssetLost = async (request, reply) => {
        try {
            const result = await ticketReplacementService.markRentalAssetLost(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'markRentalAssetLost':", error);
            const message = error?.message || "Failed to mark the rental asset as lost.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.assessRentalDamage = async (request, reply) => {
        try {
            const result = await ticketReplacementService.assessRentalDamage(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'assessRentalDamage':", error);
            const message = error?.message || "Failed to assess rental asset damage.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.linkPenaltyInvoice = async (request, reply) => {
        try {
            const result = await ticketReplacementService.linkPenaltyInvoice(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'linkPenaltyInvoice':", error);
            const message = error?.message || "Failed to link the penalty invoice.";
            reply.status(400).send({ message });
        }
    };
    ticketReplacementController.stopRental = async (request, reply) => {
        try {
            const result = await ticketReplacementService.stopRental(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'stopRental':", error);
            const message = error?.message || "Failed to stop the rental contract.";
            reply.status(400).send({ message });
        }
    };
})(ticketReplacementController || (ticketReplacementController = {}));
//# sourceMappingURL=ticketReplacement.controller.js.map