import { journalService } from "../services/journal.service.js";
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
}
