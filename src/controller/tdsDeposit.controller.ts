import { sendFinanceError } from "./finance.controller.utils.js";
import { tdsDepositService } from "../services/tdsDeposit.service.js";

export module tdsDepositController {
  export const list = async (request:any, reply:any) => {
    try { return reply.send({ success:true, data:await tdsDepositService.list(request) }); }
    catch (error) { return sendFinanceError(reply,error); }
  };
  export const create = async (request:any, reply:any) => {
    try { return reply.status(201).send({ success:true, data:await tdsDepositService.create(request) }); }
    catch (error) { return sendFinanceError(reply,error); }
  };
}
