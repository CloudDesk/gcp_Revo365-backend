import { tdsSectionService } from "../services/tdsSection.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";

export module tdsSectionController {
  export const list = async (request: any, reply: any) => {
    try {
      const data = await tdsSectionService.list(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getById = async (request: any, reply: any) => {
    try {
      const data = await tdsSectionService.getById(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const create = async (request: any, reply: any) => {
    try {
      const data = await tdsSectionService.create(request);
      return reply.status(201).send({
        success: true,
        message: "TDS section created successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const update = async (request: any, reply: any) => {
    try {
      const data = await tdsSectionService.update(request);
      return reply.send({
        success: true,
        message: "TDS section updated successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };
}
