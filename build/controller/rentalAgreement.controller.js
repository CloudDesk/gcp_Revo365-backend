import { rentalAgreementService } from "../services/rentalAgreement.service.js";
export var rentalAgreementController;
(function (rentalAgreementController) {
    rentalAgreementController.getRentalAgreementCreateContext = async (request, reply) => {
        try {
            const result = await rentalAgreementService.getRentalAgreementCreateContext(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'getRentalAgreementCreateContext':", error);
            reply.status(400).send({
                message: error?.message || "Failed to load the rental agreement create context.",
            });
        }
    };
    rentalAgreementController.getRentalAgreements = async (request, reply) => {
        try {
            const result = await rentalAgreementService.getRentalAgreements(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'getRentalAgreements':", error);
            reply.status(400).send({
                message: error?.message || "Failed to load rental agreements.",
            });
        }
    };
    rentalAgreementController.getRentalAgreementById = async (request, reply) => {
        try {
            const result = await rentalAgreementService.getRentalAgreementById(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'getRentalAgreementById':", error);
            reply.status(400).send({
                message: error?.message || "Failed to load the rental agreement.",
            });
        }
    };
    rentalAgreementController.createRentalAgreement = async (request, reply) => {
        try {
            const result = await rentalAgreementService.createRentalAgreement(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'createRentalAgreement':", error);
            reply.status(400).send({
                message: error?.message || "Failed to create the rental agreement.",
            });
        }
    };
    rentalAgreementController.regenerateRentalAgreementPdf = async (request, reply) => {
        try {
            const result = await rentalAgreementService.regenerateRentalAgreementPdf(request);
            reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in 'regenerateRentalAgreementPdf':", error);
            reply.status(400).send({
                message: error?.message || "Failed to regenerate the rental agreement PDF.",
            });
        }
    };
})(rentalAgreementController || (rentalAgreementController = {}));
//# sourceMappingURL=rentalAgreement.controller.js.map