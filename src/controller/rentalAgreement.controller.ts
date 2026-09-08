import { rentalAgreementService } from "../services/rentalAgreement.service.js";

export module rentalAgreementController {
  export const getRentalAgreementCreateContext = async (
    request: any,
    reply: any
  ) => {
    try {
      const result =
        await rentalAgreementService.getRentalAgreementCreateContext(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'getRentalAgreementCreateContext':", error);
      reply.status(400).send({
        message:
          error?.message || "Failed to load the rental agreement create context.",
      });
    }
  };

  export const getRentalAgreements = async (request: any, reply: any) => {
    try {
      const result = await rentalAgreementService.getRentalAgreements(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'getRentalAgreements':", error);
      reply.status(400).send({
        message: error?.message || "Failed to load rental agreements.",
      });
    }
  };

  export const getRentalAgreementById = async (request: any, reply: any) => {
    try {
      const result = await rentalAgreementService.getRentalAgreementById(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'getRentalAgreementById':", error);
      reply.status(400).send({
        message: error?.message || "Failed to load the rental agreement.",
      });
    }
  };

  export const createRentalAgreement = async (request: any, reply: any) => {
    try {
      const result = await rentalAgreementService.createRentalAgreement(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'createRentalAgreement':", error);
      reply.status(400).send({
        message: error?.message || "Failed to create the rental agreement.",
      });
    }
  };

  export const regenerateRentalAgreementPdf = async (
    request: any,
    reply: any
  ) => {
    try {
      const result =
        await rentalAgreementService.regenerateRentalAgreementPdf(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'regenerateRentalAgreementPdf':", error);
      reply.status(400).send({
        message:
          error?.message || "Failed to regenerate the rental agreement PDF.",
      });
    }
  };
}
