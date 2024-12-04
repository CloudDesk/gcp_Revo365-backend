import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";

export module poinvoiceservice {
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
      console.log("Erro in get Invoce data in PO invoice ", error);
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
      const { id, ...upsertFields } = poinvocedata;
      for (const file of files) {
        upsertFields.invoiceurl = PROTOCOL + "://" + host + "/" + file.filename;
      }
      let amount = 0
      JSON.parse(upsertFields.paymentdata).forEach((e) => {
        amount += e.paymentamount
      })
      upsertFields.balanceamount = upsertFields.invoiceamount - amount
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      let findindex = fieldNames.indexOf('paymentduedate');
      console.log(findindex, 'findindex');
      if (findindex !== -1 && fieldValues[findindex] === 'null') {
        fieldValues[findindex] = null
      }
      console.log(upsertFields, 'Upsert Fileds Data')
      if (id) {
        querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, id];
      } else {
        querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
        params = fieldValues;
      }
      const result = await query(querydata, params);
      return result;
    } catch (error) {
      console.log("Erro in upsert Invoce data in PO invoice ", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };


  export const upsertGcpPoInvoice = async (poinvocedata: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...upsertFields } = poinvocedata;
      let amount = 0
      JSON.parse(upsertFields.paymentdata).forEach((e) => {
        amount += e.paymentamount
      })
      upsertFields.balanceamount = upsertFields.invoiceamount - amount
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      let findindex = fieldNames.indexOf('paymentduedate');
      console.log(findindex, 'findindex');
      if (findindex !== -1 && fieldValues[findindex] === 'null') {
        fieldValues[findindex] = null
      }
      console.log(upsertFields, 'Upsert Fileds Data')
      if (id) {
        querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, id];
      } else {
        querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
        params = fieldValues;
      }
      const result = await query(querydata, params);
      return result;
    } catch (error) {
      console.log("Erro in upsert Invoce data in PO invoice ", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const deletePoInvoice = async (id: number) => {
    try {
      const invoiceResult: any = await query(
        `SELECT invoiceurl FROM poinvoice WHERE id = $1`,
        [id]
      );
      const invoiceUrl = invoiceResult.rows[0].invoiceurl;
      console.log(invoiceUrl, "<<");

      const result: any = await query(`DELETE FROM poinvoice WHERE id = $1`, [
        id,
      ]);

      if (result.rowCount != 0) {
        // const updateResult = await purchaseOrderService.updateInvoiceurlAfterDelete(invoiceUrl);
        // console.log(updateResult)
        return `Purchase Order invoice Deleted Successfully`;
      } else {
        return `Purchase Order invoice not found with id ${id}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN deletePoInvoice", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };
}
