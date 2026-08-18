import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { purchaseOrderService } from "./purchaseorder.service.js";

export module poinvoiceservice {
  const poInvoiceFieldNames = new Set([
    "invoiceamount",
    "ponumber",
    "invoicedate",
    "invoicenumber",
    "invoiceurl",
    "paymentdata",
    "balanceamount",
    "iscreditpayment",
    "paymentduedate",
    "invoicestatus",
    "pototal",
    "purchaseorderstatus",
    "productdata",
    "subtotal",
    "discount",
    "sgst",
    "cgst",
    "igst",
    "taxmode",
    "payabletaxamount",
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
        // node-postgres converts JavaScript arrays into PostgreSQL array
        // literals, which are invalid values for JSONB columns.
        upsertFields[field] = JSON.stringify(parseJsonArray(upsertFields[field]));
      }
    });
  };

  const validateAndNormalizeProductData = async (
    upsertFields: any,
    id?: any
  ) => {
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
      `SELECT po.product, po.subtotal, po.discount, po.sgst, po.cgst,
              supplier.state AS supplierstate
       FROM purchaseorder po
       LEFT JOIN supplier ON supplier.id = po.supplierid
       WHERE po.ponumber = $1`,
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
    const supplierState = String(purchaseOrder?.supplierstate || "").trim().toLowerCase();
    const isInterstate = Boolean(supplierState) && supplierState !== "tamil nadu" && supplierState !== "tamilnadu" && supplierState !== "tn";
    const gstRate = toNumber(purchaseOrder?.sgst) + toNumber(purchaseOrder?.cgst) || 18;
    upsertFields.sgst = isInterstate ? 0 : toNumber(purchaseOrder?.sgst);
    upsertFields.cgst = isInterstate ? 0 : toNumber(purchaseOrder?.cgst);
    upsertFields.igst = isInterstate ? gstRate : 0;
    upsertFields.taxmode = isInterstate ? "igst" : "cgst_sgst";

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

      const quantity = toNumber(product.quantity);
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error(
          `Bill quantity for ${purchaseOrderProduct.name} must be a whole number`
        );
      }

      const alreadyBilledQuantity = billedQuantityByLine.get(lineid) || 0;
      const remainingQuantity =
        purchaseOrderProduct.quantity - alreadyBilledQuantity;

      if (quantity > remainingQuantity) {
        throw new Error(
          `Bill quantity for ${purchaseOrderProduct.name} cannot exceed remaining quantity ${remainingQuantity}`
        );
      }

      if (quantity > 0) {
        const unitPrice = toNumber(
          product.unitPrice ?? purchaseOrderProduct.unitPrice
        );
        normalizedProducts.push({
          id: purchaseOrderProduct.id,
          lineid,
          name: product?.name || purchaseOrderProduct.name,
          originalname: purchaseOrderProduct.name,
          unitPrice,
          poquantity: purchaseOrderProduct.quantity,
          quantity,
          total: Number((unitPrice * quantity).toFixed(2)),
        });
      }
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
    const igst = toNumber(upsertFields.igst);

    if (discount < 0) {
      throw new Error("Bill discount cannot be negative");
    }
    if (discount > subtotal) {
      throw new Error("Bill discount cannot exceed subtotal");
    }
    if (sgst < 0 || cgst < 0 || igst < 0) {
      throw new Error("Bill GST percentage cannot be negative");
    }

    const taxableAmount = Math.max(subtotal - discount, 0);
    const payabletaxamount = Math.round(taxableAmount * ((sgst + cgst + igst) / 100));

    upsertFields.subtotal = subtotal;
    upsertFields.discount = discount;
    upsertFields.sgst = sgst;
    upsertFields.cgst = cgst;
    upsertFields.igst = igst;
    upsertFields.taxmode = igst > 0 ? "igst" : "cgst_sgst";
    upsertFields.payabletaxamount = payabletaxamount;
    upsertFields.invoiceamount = Math.round(taxableAmount + payabletaxamount);
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
      let queryText = `SELECT * FROM poinvoice ${whereClause} ${orderByClause}`;
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
      for (const file of files || []) {
        upsertFields.invoiceurl = PROTOCOL + "://" + host + "/" + file.filename;
      }
      let amount = 0
      parseJsonArray(upsertFields.paymentdata).forEach((e) => {
        amount += toNumber(e.paymentamount)
      })
      await validateAndNormalizeProductData(upsertFields, id);
      if (Object.prototype.hasOwnProperty.call(upsertFields, "productdata")) {
        normalizeBillTaxFields(upsertFields);
      }
      upsertFields.balanceamount = toNumber(upsertFields.invoiceamount) - amount
      serializeJsonArrayFields(upsertFields);
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      let findindex = fieldNames.indexOf('paymentduedate');
      if (findindex !== -1 && fieldValues[findindex] === 'null') {
        fieldValues[findindex] = null
      }
      if (id) {
        querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, id];
      } else {
        querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
        params = fieldValues;
      }
      const result = await query(querydata, params);
      const updatedValue = await updateInvoiceStatus(result.rows[0]);
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
      let amount = 0
      parseJsonArray(upsertFields.paymentdata).forEach((e) => {
        amount += toNumber(e.paymentamount)
      })
      await validateAndNormalizeProductData(upsertFields, id);
      if (Object.prototype.hasOwnProperty.call(upsertFields, "productdata")) {
        normalizeBillTaxFields(upsertFields);
      }
      upsertFields.balanceamount = toNumber(upsertFields.invoiceamount) - amount
      serializeJsonArrayFields(upsertFields);
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      let findindex = fieldNames.indexOf('paymentduedate');
      if (findindex !== -1 && fieldValues[findindex] === 'null') {
        fieldValues[findindex] = null
      }
      if (id) {
        querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, id];
      } else {
        querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
        params = fieldValues;
      }
      const result = await query(querydata, params);
      const updatedValue = await updateInvoiceStatus(result.rows[0]);
      return result;
    } catch (error) {
      console.log("Error in upsertGcpPoInvoice in PO invoice ", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const updateInvoiceStatus = async (poinvocedata) => {
    try {

        let {
            id,
            invoiceamount,
            paymentdata,
            paymentduedate,
            invoicestatus,
            iscreditpayment,
        } = poinvocedata;

        let total = 0;
        const parsedPaymentData = paymentdata;

        for (let i = 0; i < parsedPaymentData.length; i++) {
            total += parsedPaymentData[i].paymentamount || 0;
        }

        const currentUTCDate = new Date();
        const indiaOffset = 5.5 * 60 * 60 * 1000;
        const currentISTDate = new Date(currentUTCDate.getTime() + indiaOffset);
        const unixTimestampInSeconds = Math.floor(
            currentISTDate.getTime() / 1000
        );

        if (invoicestatus === "cancelled") {
            const paidAmount = paymentdata.reduce((sum, payment) => sum + payment.paymentamount, 0);
            const remainingAmount = total - paidAmount;
            paymentdata.forEach(payment => {
              payment.paymentamount = remainingAmount;
            });
            let modifiedPaymentData = JSON.stringify(paymentdata);
            const result = await query(
              `UPDATE poinvoice 
               SET invoicestatus = 'cancelled', balanceamount = 0,
               paymentdata = '${modifiedPaymentData}'::jsonb 
               WHERE id = ${id}`,[]
          );
        } else if (Number(invoiceamount) - total === 0) {
            if (
                unixTimestampInSeconds > Number(paymentduedate) &&
                iscreditpayment === true
            ) {
                const result = await query(`UPDATE poinvoice SET invoicestatus = 'overdue_complete' where id =${id}`,[])
            } else {
                const result = await query(`UPDATE poinvoice SET invoicestatus = 'complete' where id =${id}`,[])
            }
        } else if (total - Number(invoiceamount) !== 0) {
            if (
                unixTimestampInSeconds > Number(paymentduedate) &&
                iscreditpayment === true
            ) {
              const result = await query(`UPDATE poinvoice SET invoicestatus = 'overdue' where id =${id}`,[])

            } else {
                const result = await query(`UPDATE poinvoice SET invoicestatus = 'in_progress' where id =${id}`,[])
            }
        }
        const posetstatus = await purchaseOrderService.updatePoStatus(
            poinvocedata.ponumber,
            poinvocedata.pototal,
            poinvocedata.purchaseorderstatus
        );
        return 'PO Bill Status Updated Success';
    } catch (error) {
        console.error("An error in updateInvoiceStatus:", error);
        throw error; // Re-throw the error to handle it at a higher level
    }
};

  export const deletePoInvoice = async (id: number) => {
    try {
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
