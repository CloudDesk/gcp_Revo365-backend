import { journalService } from "../services/journal.service.js";
import { executeCustomerTransferOrchestration, replaceCustomerOnAccountTransfer } from "../services/journalTransfer.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";

export module journalController {
  export const list = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await journalService.list(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listEligibleAccounts = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await journalService.listEligibleAccounts(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listRelatedEntries = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await journalService.listRelatedEntries(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getById = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await journalService.getById(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const createDraft = async (request: any, reply: any) => {
    try {
      return reply.status(201).send({
        success: true,
        message: "Journal Draft created successfully.",
        data: await journalService.createDraft(request),
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const updateDraft = async (request: any, reply: any) => {
    try {
      return reply.send({
        success: true,
        message: "Journal Draft updated successfully.",
        data: await journalService.updateDraft(request),
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const postDraft = async (request: any, reply: any) => {
    try {
      return reply.send({
        success: true,
        message: "Journal posted successfully.",
        data: await journalService.postDraft(request),
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const reversePosted = async (request: any, reply: any) => {
    try {
      return reply.status(201).send({
        success: true,
        message: "Journal reversed successfully.",
        data: await journalService.reversePosted(request),
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const postCustomerTransfer = async (request: any, reply: any) => {
    try {
      return reply.status(201).send({
        success: true,
        message: "Customer on-account transfer posted successfully.",
        data: await executeCustomerTransferOrchestration(request),
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const replaceCustomerTransfer = async (request: any, reply: any) => {
    try {
      return reply.status(201).send({
        success: true,
        message: "Customer on-account transfer replaced successfully.",
        data: await replaceCustomerOnAccountTransfer(request),
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };
}
