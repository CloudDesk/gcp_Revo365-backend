import { financeAccountService } from "../services/financeAccount.service.js";
import { retailReceiptFinanceService } from "../services/retailReceiptFinance.service.js";
import { supplierPaymentFinanceService } from "../services/supplierPaymentFinance.service.js";
import { customerStatementService } from "../services/customerStatement.service.js";
import { deliveryChallanService } from "../services/deliveryChallan.service.js";
import { supplierStatementService } from "../services/supplierStatement.service.js";
import { onAccountReferenceService } from "../services/onAccountReference.service.js";
import { customerOnAccountApplicationService } from "../services/customerOnAccountApplication.service.js";
import { supplierOnAccountApplicationService } from "../services/supplierOnAccountApplication.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";

export module financeAccountController {
  export const listCustomerOnAccountReferences = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await onAccountReferenceService.listCustomerReferences(
        request
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getCustomerOnAccountReference = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await onAccountReferenceService.getCustomerReference(
        request
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listSupplierOnAccountReferences = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await onAccountReferenceService.listSupplierReferences(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getSupplierOnAccountReference = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await onAccountReferenceService.getSupplierReference(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getCustomerOnAccountApplicationContext = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await customerOnAccountApplicationService.getApplicationContext(
        request
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const applyCustomerOnAccountToInvoices = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await customerOnAccountApplicationService.applyToInvoices(
        request
      );
      return reply.status(201).send({
        success: true,
        message: "Customer On Account balance applied successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getSupplierOnAccountApplicationContext = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await supplierOnAccountApplicationService.getApplicationContext(
        request
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const applySupplierOnAccountToBills = async (
    request: any,
    reply: any
  ) => {
    try {
      const data = await supplierOnAccountApplicationService.applyToBills(request);
      return reply.status(201).send({
        success: true,
        message: "Supplier On Account balance applied successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listStatementCustomers = async (request: any, reply: any) => {
    try {
      const data = await customerStatementService.listCustomers(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getSupplierStatement = async (request: any, reply: any) => {
    try {
      const data = await supplierStatementService.getSupplierStatement(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getCustomerStatement = async (request: any, reply: any) => {
    try {
      const data = await customerStatementService.getCustomerStatement(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listCustomerEstimates = async (request: any, reply: any) => {
    try {
      const data = await customerStatementService.listCustomerEstimates(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listCustomerInvoices = async (request: any, reply: any) => {
    try {
      const data = await customerStatementService.listCustomerInvoices(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listCustomerPayments = async (request: any, reply: any) => {
    try {
      const data = await customerStatementService.listCustomerPayments(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listDeliveryChallans = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await deliveryChallanService.list(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listDeliveryChallanInvoices = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await deliveryChallanService.listEligibleInvoices(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getDeliveryChallanInvoiceLines = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await deliveryChallanService.getInvoiceLines(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const createDeliveryChallan = async (request: any, reply: any) => {
    try {
      const data = await deliveryChallanService.create(request);
      return reply.status(201).send({ success: true, message: "Delivery Challan created successfully.", data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getDeliveryChallan = async (request: any, reply: any) => {
    try {
      return reply.send({ success: true, data: await deliveryChallanService.getById(request) });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const retryDeliveryChallanDocument = async (request: any, reply: any) => {
    try {
      const data = await deliveryChallanService.retryDocument(request);
      return reply.status(202).send({ success: true, message: "Delivery Challan PDF generation started.", data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const createDeliveryChallanCustomerAddress = async (request: any, reply: any) => {
    try {
      const data = await deliveryChallanService.createCustomerAddress(request);
      return reply.status(201).send({ success: true, message: "Customer address created successfully.", data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listChartAccountTypes = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.listChartAccountTypes();
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const createChartAccount = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.createChartAccount(request);
      return reply.status(201).send({
        success: true,
        message: "Account created successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listChartAccounts = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.listChartAccounts(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const getChartAccount = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.getChartAccount(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listChartAccountEntries = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.listChartAccountEntries(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

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

  export const listAllTransactions = async (request: any, reply: any) => {
    try {
      const data = await financeAccountService.listBankTransactions(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listRetailCustomers = async (request: any, reply: any) => {
    try {
      const data = await retailReceiptFinanceService.listCustomers(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listRetailOutstandingInvoices = async (
    request: any,
    reply: any
  ) => {
    try {
      const data =
        await retailReceiptFinanceService.listOutstandingInvoices(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const postRetailReceipt = async (request: any, reply: any) => {
    try {
      const data = await retailReceiptFinanceService.postReceipt(request);
      const allocationMethod = String(
        request.body?.allocationmethod || "against_document"
      ).toLowerCase();
      if (allocationMethod === "on_account") {
        return reply.status(201).send({
          success: true,
          message: "Customer advance posted On Account successfully.",
          data,
        });
      }
      const receiptMode = String(
        request.body?.receiptmode || "retail"
      ).toLowerCase();
      const receiptLabel = receiptMode === "rental"
        ? "Rental"
        : receiptMode === "all"
          ? "Customer"
          : "Retail";
      return reply.status(201).send({
        success: true,
        message: `${receiptLabel} receipt posted and allocated successfully.`,
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listSuppliers = async (request: any, reply: any) => {
    try {
      const data = await supplierPaymentFinanceService.listSuppliers(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const listSupplierOutstandingBills = async (
    request: any,
    reply: any
  ) => {
    try {
      const data =
        await supplierPaymentFinanceService.listOutstandingBills(request);
      return reply.send({ success: true, data });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };

  export const postSupplierPayment = async (request: any, reply: any) => {
    try {
      const data = await supplierPaymentFinanceService.postPayment(request);
      const allocationMethod = String(
        request.body?.allocationmethod || "against_document"
      ).toLowerCase();
      return reply.status(201).send({
        success: true,
        message:
          allocationMethod === "on_account"
            ? "Supplier advance posted On Account successfully."
            : "Supplier payment posted and allocated successfully.",
        data,
      });
    } catch (error) {
      return sendFinanceError(reply, error);
    }
  };
}
