import { financeM4ReconciliationService } from "../services/financeM4Reconciliation.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";

const handle = (operation:(request:any)=>Promise<any>) => async (request:any,reply:any) => {
  try { return reply.send({success:true,data:await operation(request)}); }
  catch(error){ return sendFinanceError(reply,error); }
};

export const financeM4ReconciliationController = {
  analyze: handle(financeM4ReconciliationService.getAnalysis),
  createDryRun: handle(financeM4ReconciliationService.createDryRun),
  listRuns: handle(financeM4ReconciliationService.listRuns),
  approve: handle(financeM4ReconciliationService.approve),
  postApproved: handle(financeM4ReconciliationService.postApproved),
};
