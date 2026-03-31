import { ticketReplacementService } from "../services/ticketReplacement.service.js";

export module ticketReplacementController {
  export const getRentalReplacementContext = async (request: any, reply: any) => {
    try {
      const result =
        await ticketReplacementService.getRentalReplacementContext(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'getRentalReplacementContext':", error);
      const message = error?.message || "Failed to load rental replacement context.";
      reply.status(400).send({ message });
    }
  };

  export const getRentalReplacementHistory = async (request: any, reply: any) => {
    try {
      const result =
        await ticketReplacementService.getRentalReplacementHistory(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'getRentalReplacementHistory':", error);
      const message = error?.message || "Failed to load rental replacement history.";
      reply.status(400).send({ message });
    }
  };

  export const initiateRentalReplacement = async (request: any, reply: any) => {
    try {
      const result =
        await ticketReplacementService.initiateRentalReplacement(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'initiateRentalReplacement':", error);
      const message =
        error?.message || "Failed to initiate rental replacement.";
      reply.status(400).send({ message });
    }
  };

  export const receiveOldAsset = async (request: any, reply: any) => {
    try {
      const result = await ticketReplacementService.receiveOldAsset(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'receiveOldAsset':", error);
      const message = error?.message || "Failed to receive the old asset.";
      reply.status(400).send({ message });
    }
  };

  export const assignTechnicalReplacement = async (request: any, reply: any) => {
    try {
      const result = await ticketReplacementService.assignTechnicalReplacement(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'assignTechnicalReplacement':", error);
      const message = error?.message || "Failed to assign the technical replacement asset.";
      reply.status(400).send({ message });
    }
  };

  export const assignCommercialReplacement = async (request: any, reply: any) => {
    try {
      const result = await ticketReplacementService.assignCommercialReplacement(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'assignCommercialReplacement':", error);
      const message =
        error?.message || "Failed to assign the commercial replacement asset.";
      reply.status(400).send({ message });
    }
  };

  export const rejectReplacement = async (request: any, reply: any) => {
    try {
      const result = await ticketReplacementService.rejectReplacement(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'rejectReplacement':", error);
      const message = error?.message || "Failed to reject the rental replacement flow.";
      reply.status(400).send({ message });
    }
  };

  export const stopRental = async (request: any, reply: any) => {
    try {
      const result = await ticketReplacementService.stopRental(request);
      reply.status(200).send(result);
    } catch (error: any) {
      console.error("Error in 'stopRental':", error);
      const message = error?.message || "Failed to stop the rental contract.";
      reply.status(400).send({ message });
    }
  };
}

