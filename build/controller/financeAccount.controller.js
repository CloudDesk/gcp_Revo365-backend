import { financeAccountService } from "../services/financeAccount.service.js";
import { retailReceiptFinanceService } from "../services/retailReceiptFinance.service.js";
import { supplierPaymentFinanceService } from "../services/supplierPaymentFinance.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";
export var financeAccountController;
(function (financeAccountController) {
    financeAccountController.listChartAccountTypes = async (request, reply) => {
        try {
            const data = await financeAccountService.listChartAccountTypes();
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.createChartAccount = async (request, reply) => {
        try {
            const data = await financeAccountService.createChartAccount(request);
            return reply.status(201).send({
                success: true,
                message: "Account created successfully.",
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listChartAccounts = async (request, reply) => {
        try {
            const data = await financeAccountService.listChartAccounts(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.getChartAccount = async (request, reply) => {
        try {
            const data = await financeAccountService.getChartAccount(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listChartAccountEntries = async (request, reply) => {
        try {
            const data = await financeAccountService.listChartAccountEntries(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.create = async (request, reply) => {
        try {
            const data = await financeAccountService.createBankCashAccount(request);
            return reply.status(201).send({
                success: true,
                message: "Bank/Cash account created successfully.",
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.list = async (request, reply) => {
        try {
            const data = await financeAccountService.listBankCashAccounts(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.getById = async (request, reply) => {
        try {
            const data = await financeAccountService.getBankCashAccount(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.update = async (request, reply) => {
        try {
            const data = await financeAccountService.updateBankCashAccount(request);
            return reply.send({
                success: true,
                message: "Bank/Cash account updated successfully.",
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listLedgers = async (request, reply) => {
        try {
            const data = await financeAccountService.listFinanceAccounts(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.postDirectLedgerTransaction = async (request, reply) => {
        try {
            const data = await financeAccountService.postDirectLedgerTransaction(request);
            return reply.status(201).send({
                success: true,
                message: "Bank/Cash transaction posted successfully.",
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listTransactions = async (request, reply) => {
        try {
            const data = await financeAccountService.listBankTransactions(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listAllTransactions = async (request, reply) => {
        try {
            const data = await financeAccountService.listBankTransactions(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listRetailCustomers = async (request, reply) => {
        try {
            const data = await retailReceiptFinanceService.listCustomers(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listRetailOutstandingInvoices = async (request, reply) => {
        try {
            const data = await retailReceiptFinanceService.listOutstandingInvoices(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.postRetailReceipt = async (request, reply) => {
        try {
            const data = await retailReceiptFinanceService.postReceipt(request);
            const isRentalReceipt = String(request.body?.receiptmode || "retail").toLowerCase() === "rental";
            return reply.status(201).send({
                success: true,
                message: `${isRentalReceipt ? "Rental" : "Retail"} receipt posted and allocated successfully.`,
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listSuppliers = async (request, reply) => {
        try {
            const data = await supplierPaymentFinanceService.listSuppliers(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.listSupplierOutstandingBills = async (request, reply) => {
        try {
            const data = await supplierPaymentFinanceService.listOutstandingBills(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    financeAccountController.postSupplierPayment = async (request, reply) => {
        try {
            const data = await supplierPaymentFinanceService.postPayment(request);
            return reply.status(201).send({
                success: true,
                message: "Supplier payment posted and allocated successfully.",
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
})(financeAccountController || (financeAccountController = {}));
//# sourceMappingURL=financeAccount.controller.js.map