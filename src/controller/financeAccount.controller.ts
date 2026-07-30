import { financeAccountService } from "../services/financeAccount.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";

export module financeAccountController {
  export const create = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.createBankCashAccount(request);
      return reply.status(201).send({
        success: true,
        message: "Bank/Cash account created successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const list = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.listBankCashAccounts(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getById = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.getBankCashAccount(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const update = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.updateBankCashAccount(request);
      return reply.send({
        success: true,
        message: "Bank/Cash account updated successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listLedgers = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.listFinanceAccounts(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const postDirectLedgerTransaction = async (
    request: any,
    reply: any
  ) => {
    try {
      const data =
        await financeAccountService.postDirectLedgerTransaction(request);
      return reply.status(201).send({
        success: true,
        message: "Bank/Cash transaction posted successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listTransactions = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.listBankTransactions(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };
}
