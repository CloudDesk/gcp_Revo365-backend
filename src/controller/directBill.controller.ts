import { directBillService } from "../services/directBill.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";
import { resolveFinanceContext } from "../utils/finance/finance.utils.js";

export module directBillController {
  export const listHistory = async (request: any, reply: any) => {
    try {
      const data = await directBillService.listHistory(request.query?.page, request.query?.limit);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listOutstanding = async (_request: any, reply: any) => {
    try {
      const data = await directBillService.listOutstanding();
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getById = async (request: any, reply: any) => {
    try {
      const data = await directBillService.getById(request.params?.id);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const upsert = async (request: any, reply: any) => {
    try {
      const data = await directBillService.upsert(
        request.body,
        request.files || [],
        request.headers.host
      );
      return reply.status(201).send({
        success: true,
        message: request.body?.id ? "Direct Expense Bill updated successfully." : "Direct Expense Bill created successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const attachFile = async (request: any, reply: any) => {
    try {
      const data = await directBillService.attachFile(
        request.params?.id,
        request.files || [],
        request.headers.host
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const addPaymentTracking = async (request: any, reply: any) => {
    try {
      const data = await directBillService.addPaymentTracking(request.params?.id, request.body, resolveFinanceContext(request).actor);
      return reply.status(201).send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

}
