import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { FinanceValidationError } from "../utils/finance/finance.utils.js";
import { assertSupplierBillCanBeModified, getSupplierBillPaymentState } from "../utils/finance/supplierBill.utils.js";

const DIRECT_BILL_FIELDS = new Set([
  "billtype",
  "supplierid",
  "expenseaccountid",
  "expensecategory",
  "payeename",
  "invoicenumber",
  "invoicedate",
  "iscreditpayment",
  "paymentduedate",
  "discount",
  "cgst",
  "sgst",
  "igst",
  "taxmode",
  "suppliergstin",
  "placeofsupply",
  "productdata",
]);

const toNumber = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const money = (value: number) => Number(value.toFixed(2));

const normalizePage = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseLines = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getTrackingState = (bill: any) => {
  const invoiceAmount = Math.max(toNumber(bill?.invoiceamount), 0);
  const entries = parseLines(bill?.paymentdata);
  const paidAmount = money(Math.min(entries.reduce((total, entry) => total + Math.max(toNumber(entry?.amount), 0), 0), invoiceAmount));
  return { entries, invoiceAmount, settledAmount: paidAmount, outstandingAmount: money(Math.max(invoiceAmount - paidAmount, 0)) };
};

const normalizeText = (value: unknown, fieldName: string, max = 255) => {
  const normalized = String(value ?? "").trim();
  if (normalized.length > max) {
    throw new FinanceValidationError(`${fieldName} must not exceed ${max} characters.`);
  }
  return normalized || null;
};

const resolveStatus = (balance: number, isCredit: boolean, dueDate: unknown) => {
  const due = Number(dueDate);
  const overdue = isCredit && Number.isFinite(due) && due > 0 && Math.floor(Date.now() / 1000) > due;
  if (balance === 0) return overdue ? "overdue_complete" : "complete";
  return overdue ? "overdue" : "in_progress";
};

const assertNoPostedTransactions = async (id: number) => {
  const result: any = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM bank_transaction_allocations allocation
       JOIN bank_transactions transaction ON transaction.id = allocation.banktransactionid
       WHERE allocation.documenttype = 'purchase_bill'
         AND allocation.documentid = bill.id
         AND allocation.status = 'applied'
         AND transaction.postingstatus = 'posted'
     ) AS hastransactions
     FROM poinvoice bill WHERE bill.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new FinanceValidationError("Direct Expense Bill was not found.", 404);
  assertSupplierBillCanBeModified(result.rows[0].hastransactions === true);
};

const validateSupplier = async (supplierId: number | null) => {
  if (supplierId == null) return;
  const supplierResult: any = await query(
    `SELECT id FROM supplier WHERE id = $1 AND COALESCE(isdeleted, FALSE) = FALSE LIMIT 1`,
    [supplierId]
  );
  if (!supplierResult.rows[0]) throw new FinanceValidationError("The selected Supplier was not found.");
};

const validateExpenseAccount = async (expenseAccountId: number) => {
  const accountResult: any = await query(
    `SELECT id FROM finance_accounts
     WHERE id = $1 AND status = 'active' AND accounttype = 'expense'
     LIMIT 1`,
    [expenseAccountId]
  );
  if (!accountResult.rows[0]) {
    throw new FinanceValidationError("Select an active Expense Chart of Accounts ledger.");
  }
};

export module directBillService {
  const listExpenseBills = async (supplierlessOnly = false) => {
    const result: any = await query(
      `SELECT bill.*, supplier.suppliername, account.accountname AS expenseaccountname, COALESCE((
         SELECT SUM(allocation.totalsettledamount)
         FROM bank_transaction_allocations allocation
         JOIN bank_transactions transaction ON transaction.id = allocation.banktransactionid
         WHERE allocation.documenttype = 'purchase_bill'
           AND allocation.documentid = bill.id
           AND allocation.status = 'applied'
           AND transaction.postingstatus = 'posted'
       ), 0) AS finance_settled_amount
       FROM poinvoice bill
       LEFT JOIN supplier ON supplier.id = bill.supplierid
       LEFT JOIN finance_accounts account ON account.id = bill.expenseaccountid
       WHERE bill.billtype = 'expense'
         ${supplierlessOnly ? "AND bill.supplierid IS NULL" : ""}
       ORDER BY COALESCE(bill.invoicedate, bill.createddate) DESC, bill.id DESC`
    );
    return result.rows.map((bill: any) => {
      const state = bill.supplierid == null ? getTrackingState(bill) : getSupplierBillPaymentState(bill);
      return {
        id: Number(bill.id),
        billtype: "expense",
        invoicenumber: bill.invoicenumber || `BILL-${bill.id}`,
        supplierid: bill.supplierid == null ? null : Number(bill.supplierid),
        suppliername: bill.suppliername || null,
        payeename: bill.payeename || null,
        invoicedate: bill.invoicedate || bill.createddate || null,
        invoiceamount: state.invoiceAmount,
        settledamount: state.settledAmount,
        outstandingamount: state.outstandingAmount,
        invoicestatus: bill.invoicestatus || "in_progress",
        expenseaccountid: bill.expenseaccountid ? Number(bill.expenseaccountid) : null,
        expenseaccountname: bill.expenseaccountname || null,
      };
    });
  };

  export const listHistory = async (requestedPage?: unknown, requestedLimit?: unknown) => {
    const page = normalizePage(requestedPage, 1);
    const limit = Math.min(normalizePage(requestedLimit, 25), 100);
    const offset = (page - 1) * limit;
    const [result, countResult]: any = await Promise.all([
      query(
        `SELECT bill.*, supplier.suppliername, account.accountname AS expenseaccountname, COALESCE((
           SELECT SUM(allocation.totalsettledamount)
           FROM bank_transaction_allocations allocation
           JOIN bank_transactions transaction ON transaction.id = allocation.banktransactionid
           WHERE allocation.documenttype = 'purchase_bill'
             AND allocation.documentid = bill.id
             AND allocation.status = 'applied'
             AND transaction.postingstatus = 'posted'
         ), 0) AS finance_settled_amount
         FROM poinvoice bill
         LEFT JOIN supplier ON supplier.id = bill.supplierid
         LEFT JOIN finance_accounts account ON account.id = bill.expenseaccountid
         WHERE bill.billtype = 'expense'
         ORDER BY bill.invoicedate DESC NULLS LAST, bill.id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query(`SELECT COUNT(*)::integer AS count FROM poinvoice WHERE billtype = 'expense'`),
    ]);
    const records = result.rows.map((bill: any) => {
      const state = bill.supplierid == null ? getTrackingState(bill) : getSupplierBillPaymentState(bill);
      return {
        id: Number(bill.id), billtype: "expense", invoicenumber: bill.invoicenumber || `BILL-${bill.id}`,
        supplierid: bill.supplierid == null ? null : Number(bill.supplierid), suppliername: bill.suppliername || null,
        payeename: bill.payeename || null, invoicedate: bill.invoicedate || bill.createddate || null,
        invoiceamount: state.invoiceAmount, settledamount: state.settledAmount, outstandingamount: state.outstandingAmount,
        invoicestatus: bill.invoicestatus || "in_progress", expenseaccountid: bill.expenseaccountid ? Number(bill.expenseaccountid) : null,
        expenseaccountname: bill.expenseaccountname || null,
      };
    });
    const totalRecords = Number(countResult.rows[0]?.count || 0);
    return { records, pagination: { currentPage: page, recordsPerPage: limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) } };
  };

  export const getById = async (id: unknown) => {
    const billId = Number(id);
    if (!Number.isSafeInteger(billId) || billId <= 0) {
      throw new FinanceValidationError("Direct Expense Bill id must be a positive integer.");
    }
    const result: any = await query(
      `SELECT bill.*, supplier.suppliername, account.accountname AS expenseaccountname, COALESCE((
         SELECT SUM(allocation.totalsettledamount)
         FROM bank_transaction_allocations allocation
         JOIN bank_transactions transaction ON transaction.id = allocation.banktransactionid
         WHERE allocation.documenttype = 'purchase_bill'
           AND allocation.documentid = bill.id
           AND allocation.status = 'applied'
           AND transaction.postingstatus = 'posted'
       ), 0) AS finance_settled_amount
       FROM poinvoice bill
       LEFT JOIN supplier ON supplier.id = bill.supplierid
       LEFT JOIN finance_accounts account ON account.id = bill.expenseaccountid
       WHERE bill.id = $1 AND bill.billtype = 'expense'
       LIMIT 1`,
      [billId]
    );
    const bill = result.rows[0];
    if (!bill) throw new FinanceValidationError("Direct Expense Bill was not found.", 404);
    const state = bill.supplierid == null ? getTrackingState(bill) : getSupplierBillPaymentState(bill);
    return {
      ...bill,
      id: Number(bill.id),
      supplierid: bill.supplierid == null ? null : Number(bill.supplierid),
      expenseaccountid: bill.expenseaccountid == null ? null : Number(bill.expenseaccountid),
      productdata: parseLines(bill.productdata),
      invoiceamount: state.invoiceAmount,
      settledamount: state.settledAmount,
      outstandingamount: state.outstandingAmount,
      paymenttrackingdata: bill.supplierid == null ? (state as any).entries : [],
    };
  };

  export const addPaymentTracking = async (id: unknown, data: any, actor: string) => {
    const billId = Number(id);
    if (!Number.isSafeInteger(billId) || billId <= 0) throw new FinanceValidationError("Direct Expense Bill id must be a positive integer.");
    const amount = money(toNumber(data?.amount));
    if (amount <= 0) throw new FinanceValidationError("Payment tracking amount must be greater than zero.");
    const paymentDate = String(data?.paymentdate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new FinanceValidationError("paymentdate must be YYYY-MM-DD.");
    const result: any = await query(`SELECT * FROM poinvoice WHERE id = $1 AND billtype = 'expense' AND supplierid IS NULL LIMIT 1`, [billId]);
    const bill = result.rows[0];
    if (!bill) throw new FinanceValidationError("Only supplier-less Direct Expense Bills can use payment tracking.", 404);
    const state = getTrackingState(bill);
    if (amount > state.outstandingAmount) throw new FinanceValidationError("Payment tracking amount exceeds the remaining Bill balance.");
    const entry = { id: `tracking-${Date.now()}`, paymentdate: paymentDate, amount, reference: normalizeText(data?.reference, "Reference", 100), remarks: normalizeText(data?.remarks, "Remarks", 2000), createdby: actor, createddate: Math.floor(Date.now() / 1000) };
    const updated: any = await query(`UPDATE poinvoice SET paymentdata = $1, modifieddate = $2 WHERE id = $3 RETURNING *`, [JSON.stringify([...state.entries, entry]), Math.floor(Date.now() / 1000), billId]);
    return { bill: updated.rows[0], entry };
  };

  export const attachFile = async (id: unknown, files: any[] = [], host?: string) => {
    const billId = Number(id);
    if (!Number.isSafeInteger(billId) || billId <= 0) {
      throw new FinanceValidationError("Direct Expense Bill id must be a positive integer.");
    }
    if (!files.length || !files[0]?.filename || !host) {
      throw new FinanceValidationError("Select a Bill attachment to upload.");
    }
    await assertNoPostedTransactions(billId);
    const result: any = await query(
      `UPDATE poinvoice
       SET invoiceurl = $1, modifieddate = $2
       WHERE id = $3 AND billtype = 'expense'
       RETURNING *`,
      [`${PROTOCOL}://${host}/${files[0].filename}`, Math.floor(Date.now() / 1000), billId]
    );
    if (!result.rows[0]) throw new FinanceValidationError("Direct Expense Bill was not found.", 404);
    return result.rows[0];
  };

  export const listOutstanding = async () => {
    return (await listExpenseBills(true))
      .filter((bill: any) => !["cancelled", "complete", "overdue_complete"].includes(String(bill.invoicestatus).toLowerCase()))
      .filter((bill: any) => bill.outstandingamount > 0);
  };

  export const upsert = async (data: any, files: any[] = [], host?: string) => {
    const { id, ...rawFields } = data || {};
    const billId = id == null ? null : Number(id);
    if (billId != null && (!Number.isSafeInteger(billId) || billId <= 0)) {
      throw new FinanceValidationError("id must be a positive integer.");
    }
    if (billId) await assertNoPostedTransactions(billId);

    const fields = Object.keys(rawFields).reduce((result: any, key) => {
      if (DIRECT_BILL_FIELDS.has(key)) result[key] = rawFields[key];
      return result;
    }, {});
    fields.billtype = "expense";
    fields.ponumber = null;

    const existingResult: any = billId
      ? await query(`SELECT * FROM poinvoice WHERE id = $1`, [billId])
      : { rows: [] };
    const existing = existingResult.rows[0];
    if (billId && !existing) throw new FinanceValidationError("Direct Expense Bill was not found.", 404);
    if (existing && String(existing.billtype || "inventory") !== "expense") {
      throw new FinanceValidationError("A PO Bill cannot be converted into a Direct Expense Bill.");
    }

    const supplierIdRaw = fields.supplierid ?? existing?.supplierid ?? null;
    const supplierId = supplierIdRaw == null || supplierIdRaw === "" ? null : Number(supplierIdRaw);
    if (supplierId != null && (!Number.isSafeInteger(supplierId) || supplierId <= 0)) {
      throw new FinanceValidationError("supplierid must be a positive integer when supplied.");
    }
    const expenseAccountRaw = fields.expenseaccountid ?? existing?.expenseaccountid ?? null;
    const expenseAccountId = expenseAccountRaw == null || expenseAccountRaw === ""
      ? null
      : Number(expenseAccountRaw);
    if (expenseAccountId != null && (!Number.isSafeInteger(expenseAccountId) || expenseAccountId <= 0)) {
      throw new FinanceValidationError("expenseaccountid must be a positive integer when supplied.");
    }
    await Promise.all([
      validateSupplier(supplierId),
      ...(expenseAccountId == null ? [] : [validateExpenseAccount(expenseAccountId)]),
    ]);

    const invoiceNumber = normalizeText(fields.invoicenumber ?? existing?.invoicenumber, "Bill Number");
    if (!invoiceNumber) throw new FinanceValidationError("Bill Number is required.");
    const invoiceDate = Number(fields.invoicedate ?? existing?.invoicedate);
    if (!Number.isFinite(invoiceDate) || invoiceDate <= 0) throw new FinanceValidationError("Bill Date is required.");

    const inputLines = parseLines(fields.productdata ?? existing?.productdata);
    if (!inputLines.length) throw new FinanceValidationError("At least one expense line is required.");
    const lines = inputLines.map((line, index) => {
      const name = normalizeText(line?.name, "Expense line description", 500);
      const quantity = toNumber(line?.quantity);
      const unitPrice = toNumber(line?.unitPrice);
      if (!name || quantity <= 0 || unitPrice < 0) {
        throw new FinanceValidationError("Each expense line requires a description, positive quantity, and valid unit price.");
      }
      return {
        id: line?.id ?? index + 1,
        lineid: String(line?.lineid ?? `expense-${index + 1}`),
        name,
        quantity,
        unitPrice: money(unitPrice),
        total: money(quantity * unitPrice),
      };
    });
    const subtotal = money(lines.reduce((total, line) => total + line.total, 0));
    const discount = money(toNumber(fields.discount ?? existing?.discount));
    if (discount < 0 || discount > subtotal) throw new FinanceValidationError("Bill discount must be between zero and subtotal.");
    const taxMode = String(fields.taxmode ?? existing?.taxmode ?? "cgst_sgst").toLowerCase();
    if (!["cgst_sgst", "igst"].includes(taxMode)) throw new FinanceValidationError("taxmode must be cgst_sgst or igst.");
    const cgst = taxMode === "igst" ? 0 : money(toNumber(fields.cgst ?? existing?.cgst));
    const sgst = taxMode === "igst" ? 0 : money(toNumber(fields.sgst ?? existing?.sgst));
    const igst = taxMode === "igst" ? money(toNumber(fields.igst ?? existing?.igst)) : 0;
    if ([cgst, sgst, igst].some((rate) => rate < 0 || rate > 100)) throw new FinanceValidationError("GST rate must be between zero and 100.");
    const taxableAmount = money(Math.max(subtotal - discount, 0));
    const taxAmount = money(taxableAmount * ((cgst + sgst + igst) / 100));
    const invoiceAmount = money(taxableAmount + taxAmount);
    const settled = existing ? Math.max(toNumber(existing.invoiceamount) - toNumber(existing.balanceamount), 0) : 0;
    if (invoiceAmount < settled) throw new FinanceValidationError(`Bill amount cannot be less than the settled amount ${settled}.`);
    const balanceAmount = money(invoiceAmount - settled);
    const isCreditPayment = fields.iscreditpayment ?? existing?.iscreditpayment ?? false;
    const paymentDueDateRaw = fields.paymentduedate ?? existing?.paymentduedate ?? null;
    const paymentDueDate = paymentDueDateRaw === "null" || paymentDueDateRaw === "" ? null : paymentDueDateRaw;

    const saveFields: any = {
      billtype: "expense", ponumber: null, supplierid: supplierId,
      expenseaccountid: expenseAccountId,
      expensecategory: normalizeText(fields.expensecategory ?? existing?.expensecategory, "Expense Category", 100),
      payeename: normalizeText(fields.payeename ?? existing?.payeename, "Payee Name"),
      invoicenumber: invoiceNumber, invoicedate: invoiceDate,
      iscreditpayment: isCreditPayment === true || isCreditPayment === "true",
      paymentduedate: paymentDueDate, productdata: JSON.stringify(lines),
      subtotal, discount, cgst, sgst, igst, taxmode: taxMode, taxableamount: taxableAmount,
      payabletaxamount: taxAmount, invoiceamount: invoiceAmount,
      balanceamount: balanceAmount,
      invoicestatus: resolveStatus(balanceAmount, isCreditPayment === true || isCreditPayment === "true", paymentDueDate),
      suppliergstin: normalizeText(fields.suppliergstin ?? existing?.suppliergstin, "Supplier GSTIN", 64),
      placeofsupply: normalizeText(fields.placeofsupply ?? existing?.placeofsupply, "Place of Supply", 100),
    };
    if (!existing) saveFields.paymentdata = JSON.stringify([]);
    if (files?.length && host) saveFields.invoiceurl = `${PROTOCOL}://${host}/${files[0].filename}`;

    const names = Object.keys(saveFields);
    const values = Object.values(saveFields);
    const result = billId
      ? await query(`UPDATE poinvoice SET ${names.map((name, index) => `${name} = $${index + 1}`).join(", ")}, modifieddate = $${names.length + 1} WHERE id = $${names.length + 2} RETURNING *`, [...values, Math.floor(Date.now() / 1000), billId])
      : await query(`INSERT INTO poinvoice (${names.join(", ")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`, values);
    return result.rows[0];
  };
}
