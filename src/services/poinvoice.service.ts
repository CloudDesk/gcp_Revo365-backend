import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import {
  assertSupplierBillCanBeModified,
  assertSupplierBillTotalWithinPurchaseOrder,
  validateSupplierBillProductInput,
} from "../utils/finance/supplierBill.utils.js";

export module poinvoiceservice {
  const poInvoiceFieldNames = new Set([
    "organizationid",
    "invoiceamount",
    "ponumber",
    "invoicedate",
    "invoicenumber",
    "invoiceurl",
    "iscreditpayment",
    "paymentduedate",
    "pototal",
    "purchaseorderstatus",
    "productdata",
    "subtotal",
    "discount",
    "sgst",
    "cgst",
    "payabletaxamount",
    "billtype",
    "expensecategory",
    "expenseaccountid",
    "supplierid",
    "suppliergstin",
    "placeofsupply",
    "taxableamount",
    "igst",
  ]);

  const parseJsonArray = (value: any): any[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const trimmedValue = value.trim();
      if (!trimmedValue || trimmedValue === "null") return [];
      try {
        const parsedValue = JSON.parse(trimmedValue);
        return Array.isArray(parsedValue) ? parsedValue : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const toNumber = (value: any) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  };

  const getProductLineId = (product: any, index: number) =>
    String(
      product?.lineid ??
        product?.productlineid ??
        `${product?.id ?? product?.name ?? "product"}-${index + 1}`
    );

  const pickPoInvoiceFields = (data: any) => {
    return Object.keys(data || {}).reduce((fields: any, key) => {
      if (poInvoiceFieldNames.has(key)) {
        fields[key] = data[key];
      }
      return fields;
    }, {});
  };

  const serializeJsonArrayFields = (upsertFields: any) => {
    ["productdata", "paymentdata"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(upsertFields, field)) {
        // node-postgres serializes JavaScript arrays as PostgreSQL array
        // literals. These columns are JSONB, so send valid JSON text instead.
        upsertFields[field] = JSON.stringify(parseJsonArray(upsertFields[field]));
      }
    });
  };

  const isTrue = (value: any) => value === true || value === "true";

  const getBillTransactionState = async (id: any) => {
    const result: any = await query(
      `SELECT
         EXISTS (
           SELECT 1
           FROM bank_transaction_allocations allocation
           JOIN bank_transactions bank_tx
             ON bank_tx.id = allocation.banktransactionid
           WHERE allocation.documenttype = 'purchase_bill'
             AND allocation.documentid = bill.id
             AND allocation.status = 'applied'
             AND bank_tx.postingstatus = 'posted'
         ) AS hastransactions
       FROM poinvoice bill
       WHERE bill.id = $1`,
      [id]
    );
    if (!result.rows[0]) {
      throw new Error(`Supplier bill ${id} was not found`);
    }
    return result.rows[0].hastransactions === true;
  };

  const assertBillHasNoTransactions = async (id: any) => {
    assertSupplierBillCanBeModified(await getBillTransactionState(id));
  };

  const resolveBillStatus = (
    balanceAmount: number,
    isCreditPayment: any,
    paymentDueDate: any
  ) => {
    const dueDate = Number(paymentDueDate);
    const isOverdue =
      isTrue(isCreditPayment) &&
      Number.isFinite(dueDate) &&
      dueDate > 0 &&
      Math.floor(Date.now() / 1000) > dueDate;

    if (balanceAmount === 0) {
      return isOverdue ? "overdue_complete" : "complete";
    }
    return isOverdue ? "overdue" : "in_progress";
  };

  const applyCashAccountSettlementState = async (
    upsertFields: any,
    id?: any
  ) => {
    if (!id) {
      const invoiceAmount = toNumber(upsertFields.invoiceamount);
      upsertFields.paymentdata = [];
      upsertFields.balanceamount = invoiceAmount;
      upsertFields.invoicestatus = resolveBillStatus(
        invoiceAmount,
        upsertFields.iscreditpayment,
        upsertFields.paymentduedate
      );
      return;
    }

    const existingResult: any = await query(
      `SELECT invoiceamount, balanceamount, iscreditpayment, paymentduedate
       FROM poinvoice
       WHERE id = $1`,
      [id]
    );
    const existingBill = existingResult?.rows?.[0];
    if (!existingBill) {
      throw new Error(`Supplier bill ${id} was not found`);
    }

    const invoiceAmount = Object.prototype.hasOwnProperty.call(
      upsertFields,
      "invoiceamount"
    )
      ? toNumber(upsertFields.invoiceamount)
      : toNumber(existingBill.invoiceamount);
    const settledAmount = Math.max(
      toNumber(existingBill.invoiceamount) -
        toNumber(existingBill.balanceamount),
      0
    );
    if (invoiceAmount < settledAmount) {
      throw new Error(
        `Bill amount cannot be less than the settled Cash and Bank amount ${settledAmount}`
      );
    }

    const balanceAmount = Number((invoiceAmount - settledAmount).toFixed(2));
    upsertFields.balanceamount = balanceAmount;
    upsertFields.invoicestatus = resolveBillStatus(
      balanceAmount,
      upsertFields.iscreditpayment ?? existingBill.iscreditpayment,
      upsertFields.paymentduedate ?? existingBill.paymentduedate
    );
  };

  const validateAndNormalizeProductData = async (
    upsertFields: any,
    id?: any
  ) => {
    let billType = String(upsertFields.billtype || "").trim().toLowerCase();
    if (!billType && id) {
      const existingResult: any = await query(
        "SELECT COALESCE(billtype, 'inventory') AS billtype FROM poinvoice WHERE id = $1",
        [id]
      );
      billType = String(existingResult.rows[0]?.billtype || "inventory").toLowerCase();
    }
    billType = billType || "inventory";
    if (!["inventory", "expense"].includes(billType)) {
      throw new Error("Bill type must be inventory or expense");
    }
    upsertFields.billtype = billType;
    if (billType === "expense") {
      if (!upsertFields.expenseaccountid && !id) {
        throw new Error("Expense account is required for an expense bill");
      }
      if (!upsertFields.supplierid && !id) {
        throw new Error("Supplier is required for an expense bill");
      }
      upsertFields.productdata = parseJsonArray(upsertFields.productdata);
      return;
    }

    const hasProductData = Object.prototype.hasOwnProperty.call(
      upsertFields,
      "productdata"
    );
    if (!hasProductData) {
      if (id) return;
      throw new Error("At least one bill product is required");
    }

    const ponumber = upsertFields.ponumber;
    if (!ponumber) {
      throw new Error("PO Number is required for bill product validation");
    }

    const billProducts = parseJsonArray(upsertFields.productdata);
    if (!billProducts.length) {
      throw new Error("At least one bill product is required");
    }

    const purchaseOrderResult: any = await query(
      `SELECT product, subtotal, discount, sgst, cgst FROM purchaseorder WHERE ponumber = $1`,
      [ponumber]
    );
    const purchaseOrder = purchaseOrderResult?.rows?.[0];
    const purchaseOrderProducts = parseJsonArray(
      purchaseOrder?.product
    );
    if (!purchaseOrderProducts.length) {
      throw new Error("Purchase order products are not available for validation");
    }
    const purchaseOrderSubtotal =
      toNumber(purchaseOrder?.subtotal) ||
      purchaseOrderProducts.reduce(
        (sum: number, product: any) =>
          sum + toNumber(product?.unitPrice) * toNumber(product?.quantity),
        0
      );
    const purchaseOrderDiscount = Math.min(
      Math.max(toNumber(purchaseOrder?.discount), 0),
      purchaseOrderSubtotal
    );
    upsertFields.sgst = toNumber(purchaseOrder?.sgst);
    upsertFields.cgst = toNumber(purchaseOrder?.cgst);

    const purchaseOrderProductMap = new Map<string, any>();
    purchaseOrderProducts.forEach((product: any, index: number) => {
      const lineid = getProductLineId(product, index);
      purchaseOrderProductMap.set(lineid, {
        id: product?.id ?? index + 1,
        lineid,
        name: product?.name ?? "",
        unitPrice: toNumber(product?.unitPrice),
        quantity: toNumber(product?.quantity),
      });
    });

    const existingParams: any[] = [ponumber];
    let existingWhere = `ponumber = $1 AND COALESCE(invoicestatus, '') != 'cancelled'`;
    if (id) {
      existingParams.push(id);
      existingWhere += ` AND id != $2`;
    }

    const existingBillResult: any = await query(
      `SELECT id, productdata FROM poinvoice WHERE ${existingWhere}`,
      existingParams
    );

    const billedQuantityByLine = new Map<string, number>();
    existingBillResult.rows.forEach((bill: any) => {
      parseJsonArray(bill.productdata).forEach((product: any, index: number) => {
        const lineid = getProductLineId(product, index);
        billedQuantityByLine.set(
          lineid,
          (billedQuantityByLine.get(lineid) || 0) + toNumber(product.quantity)
        );
      });
    });

    const normalizedProducts: any[] = [];
    billProducts.forEach((product: any, index: number) => {
      const lineid = getProductLineId(product, index);
      const purchaseOrderProduct = purchaseOrderProductMap.get(lineid);
      if (!purchaseOrderProduct) {
        throw new Error(
          `Bill product ${product?.name || lineid} is not part of this purchase order`
        );
      }

      const { productName, quantity } = validateSupplierBillProductInput(
        product?.name,
        product?.quantity,
        purchaseOrderProduct.name
      );

      const alreadyBilledQuantity = billedQuantityByLine.get(lineid) || 0;
      const remainingQuantity =
        purchaseOrderProduct.quantity - alreadyBilledQuantity;

      if (quantity > remainingQuantity) {
        throw new Error(
          `Bill quantity for ${purchaseOrderProduct.name} cannot exceed remaining quantity ${remainingQuantity}`
        );
      }

      // Bill pricing is always inherited from the PO. Never trust a client
      // supplied unit price when enforcing the PO amount ceiling.
      const unitPrice = purchaseOrderProduct.unitPrice;
      normalizedProducts.push({
        id: purchaseOrderProduct.id,
        lineid,
        name: productName,
        originalname: purchaseOrderProduct.name,
        unitPrice,
        poquantity: purchaseOrderProduct.quantity,
        quantity,
        total: Number((unitPrice * quantity).toFixed(2)),
      });
    });

    if (!normalizedProducts.length) {
      throw new Error("At least one bill product quantity should be greater than 0");
    }

    upsertFields.productdata = normalizedProducts;
    const billSubtotal = normalizedProducts.reduce(
      (sum: number, product: any) => sum + toNumber(product.total),
      0
    );
    const discountRate =
      purchaseOrderSubtotal > 0
        ? purchaseOrderDiscount / purchaseOrderSubtotal
        : 0;
    upsertFields.discount = Number((billSubtotal * discountRate).toFixed(2));
  };

  const normalizeBillTaxFields = (upsertFields: any) => {
    const billProducts = parseJsonArray(upsertFields.productdata);
    const subtotal = Number(
      billProducts
        .reduce((sum: number, product: any) => sum + toNumber(product.total), 0)
        .toFixed(2)
    );
    const discount = toNumber(upsertFields.discount);
    const sgst = toNumber(upsertFields.sgst);
    const cgst = toNumber(upsertFields.cgst);

    if (discount < 0) {
      throw new Error("Bill discount cannot be negative");
    }
    if (discount > subtotal) {
      throw new Error("Bill discount cannot exceed subtotal");
    }
    if (sgst < 0 || cgst < 0) {
      throw new Error("Bill GST percentage cannot be negative");
    }

    const taxableAmount = Math.max(subtotal - discount, 0);
    const payabletaxamount = Math.round(taxableAmount * ((sgst + cgst) / 100));

    upsertFields.subtotal = subtotal;
    upsertFields.discount = discount;
    upsertFields.sgst = sgst;
    upsertFields.cgst = cgst;
    upsertFields.payabletaxamount = payabletaxamount;
    upsertFields.invoiceamount = Math.round(taxableAmount + payabletaxamount);
  };

  const normalizeExpenseBillFields = (upsertFields: any) => {
    const invoiceAmount = toNumber(upsertFields.invoiceamount);
    const taxAmount = toNumber(upsertFields.payabletaxamount);
    if (invoiceAmount <= 0) throw new Error("Expense Bill Amount must be greater than 0");
    if (taxAmount < 0 || taxAmount > invoiceAmount) throw new Error("Expense Bill GST must be between 0 and Bill Amount");
    if (!["laptop", "mobile"].includes(String(upsertFields.expensecategory || "").toLowerCase())) {
      throw new Error("Expense Category must be Laptop or Mobile");
    }
    upsertFields.productdata = [];
    upsertFields.discount = 0;
    upsertFields.taxableamount = Number((invoiceAmount - taxAmount).toFixed(2));
    upsertFields.subtotal = upsertFields.taxableamount;
  };

  const validateBillAmountWithinPurchaseOrder = async (
    upsertFields: any,
    id?: any
  ) => {
    const ponumber = upsertFields.ponumber;
    const purchaseOrderResult: any = await query(
      `SELECT total
       FROM purchaseorder
       WHERE ponumber = $1
       ORDER BY id DESC
       LIMIT 1`,
      [ponumber]
    );
    const purchaseOrderTotal = toNumber(purchaseOrderResult?.rows?.[0]?.total);
    if (purchaseOrderTotal <= 0) {
      throw new Error("Purchase order total is not available for bill validation");
    }

    const existingParams: any[] = [ponumber];
    let existingWhere =
      `ponumber = $1 AND COALESCE(invoicestatus, '') != 'cancelled'`;
    if (id) {
      existingParams.push(id);
      existingWhere += ` AND id != $2`;
    }
    const existingBillResult: any = await query(
      `SELECT COALESCE(SUM(invoiceamount), 0) AS total
       FROM poinvoice
       WHERE ${existingWhere}`,
      existingParams
    );
    const existingBillTotal = toNumber(existingBillResult?.rows?.[0]?.total);
    const currentBillTotal = toNumber(upsertFields.invoiceamount);

    assertSupplierBillTotalWithinPurchaseOrder(
      purchaseOrderTotal,
      existingBillTotal,
      currentBillTotal
    );
  };

  export const getPoInvoiceData = async (request) => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);
      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "modifieddate";
      let orderByDirection = "DESC";
      keys.forEach((key, index) => {
        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (paramValues[0].startsWith("NOT ")) {
          const cleanValue = paramValues[0].slice(4);
          whereClauses.push(`(${key} != $${parameterIndex})`);
          queryParams.push(cleanValue);
          parameterIndex++;
        } else if (key !== "page" && key !== "count") {
          const clauses = paramValues.map(
            (_, idx) => `${key} = $${parameterIndex + idx}`
          );
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });
      const offset = (pageNumber - 1) * recordCount;
      const baseConditions = ``;
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
      let queryText = `SELECT
        poinvoice.*,
        EXISTS (
          SELECT 1
          FROM bank_transaction_allocations allocation
          JOIN bank_transactions bank_tx
            ON bank_tx.id = allocation.banktransactionid
          WHERE allocation.documenttype = 'purchase_bill'
            AND allocation.documentid = poinvoice.id
            AND allocation.status = 'applied'
            AND bank_tx.postingstatus = 'posted'
        ) AS hastransactions
        FROM poinvoice ${whereClause} ${orderByClause}`;
      if (pageNumber && recordCount) {
        queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
      }
      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result);
      return datatypeCheckResult;
    } catch (error) {
      console.log("Error in getPoInvoiceData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const upsertPoInvoice = async (
    poinvocedata: any,
    files: any,
    host: string
  ) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...rawUpsertFields } = poinvocedata;
      const upsertFields = pickPoInvoiceFields(rawUpsertFields);
      if (id) await assertBillHasNoTransactions(id);
      for (const file of files || []) {
        upsertFields.invoiceurl = PROTOCOL + "://" + host + "/" + file.filename;
      }
      await validateAndNormalizeProductData(upsertFields, id);
      if (upsertFields.billtype === "expense") {
        normalizeExpenseBillFields(upsertFields);
      } else if (Object.prototype.hasOwnProperty.call(upsertFields, "productdata")) {
        normalizeBillTaxFields(upsertFields);
        await validateBillAmountWithinPurchaseOrder(upsertFields, id);
      }
      await applyCashAccountSettlementState(upsertFields, id);
      serializeJsonArrayFields(upsertFields);
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      let findindex = fieldNames.indexOf('paymentduedate');
      if (findindex !== -1 && fieldValues[findindex] === 'null') {
        fieldValues[findindex] = null
      }
      if (id) {
        querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} AND organizationid = $${fieldNames.length + 2} RETURNING *`;
        params = [...fieldValues, id, Number(upsertFields.organizationid || 1)];
      } else {
        querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
        params = fieldValues;
      }
      const result = await query(querydata, params);
      return result;
    } catch (error) {
      console.log("Error in upsertPoInvoice data in PO invoice ", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };


  export const upsertGcpPoInvoice = async (poinvocedata: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...rawUpsertFields } = poinvocedata;
      const upsertFields = pickPoInvoiceFields(rawUpsertFields);
      if (id) await assertBillHasNoTransactions(id);
      await validateAndNormalizeProductData(upsertFields, id);
      if (upsertFields.billtype === "expense") {
        normalizeExpenseBillFields(upsertFields);
      } else if (Object.prototype.hasOwnProperty.call(upsertFields, "productdata")) {
        normalizeBillTaxFields(upsertFields);
        await validateBillAmountWithinPurchaseOrder(upsertFields, id);
      }
      await applyCashAccountSettlementState(upsertFields, id);
      serializeJsonArrayFields(upsertFields);
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      let findindex = fieldNames.indexOf('paymentduedate');
      if (findindex !== -1 && fieldValues[findindex] === 'null') {
        fieldValues[findindex] = null
      }
      if (id) {
        querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} AND organizationid = $${fieldNames.length + 2} RETURNING *`;
        params = [...fieldValues, id, Number(upsertFields.organizationid || 1)];
      } else {
        querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
        params = fieldValues;
      }
      const result = await query(querydata, params);
      return result;
    } catch (error) {
      console.log("Error in upsertGcpPoInvoice in PO invoice ", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const deletePoInvoice = async (id: number) => {
    try {
      await assertBillHasNoTransactions(id);
      const invoiceResult: any = await query(
        `SELECT invoiceurl FROM poinvoice WHERE id = $1`,
        [id]
      );
      const invoiceUrl = invoiceResult.rows[0].invoiceurl;

      const result: any = await query(`DELETE FROM poinvoice WHERE id = $1`, [
        id,
      ]);

      if (result.rowCount != 0) {
        return `Purchase Order bill Deleted Successfully`;
      } else {
        return `Purchase Order bill not found with id ${id}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN deletePoInvoice", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };
}
