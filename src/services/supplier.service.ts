import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";

export module supplierSerivce {
    export const getSupplierData = async (request) => {
        try {
            let offset: any
            const pageNumber = request.query.page || 1
            const recordcount = request.query.count || 500
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            const queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        whereClause += " AND ";
                    }
                    whereClause += `(${paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`).join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            if (pageNumber && recordcount) {
                offset = (pageNumber - 1) * recordcount;
            }

            let queryText = `SELECT * FROM supplier`;
            if (whereClause && offset >= 0 && recordcount) {
                queryText += ` WHERE ${whereClause} ORDER BY modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
            } else if (offset >= 0 && recordcount && !whereClause) {
                queryText += ` ORDER BY modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
            }
            else {
                queryText += ` ORDER BY modifieddate DESC Limit 500`;
            }

            if (offset >= 0 && recordcount) {
                queryParams.push(offset, recordcount);

            }
            const result: QueryResult = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result)
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getSupplierData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const getSupplierProductdata = async (id) => {
        try {
            const queryString = `SELECT * from supplier where id = $1 `;
            const result = await query(queryString, [id]);
            return result.rows;
        } catch (error) {
            console.error("Query Execution Error: IN getSupplierProductdata", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const getSupplierName = async (querydata) => {
        try {
            let { suppliername } = querydata
            let queryString: any
            let result: any
            if (suppliername) {
                queryString = `SELECT suppliername, id FROM supplier WHERE suppliername ::text ILIKE $1 ORDER BY modifieddate DESC`;
                result = await query(queryString, [`%${suppliername}%`]);

            }
            else {
                queryString = `SELECT suppliername, id FROM supplier ORDER BY modifieddate DESC Limit 3`;
                result = await query(queryString, []);
            }
            return result.rows;
        } catch (error) {
            console.error("Query Execution Error: IN getSupplierName", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const upsertSupplierData = async (supplierData: any) => {
        try {

            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = supplierData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE supplier SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO supplier (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            return result;
        } catch (error) {
            console.error("Query Execution Error: IN upsertSupplierData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const deleteSupplierData = async (id: number) => {
        try {
            const result: any = await query(`DELETE FROM supplier WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} Item deleted successfully from Supplier`;
            }
            else {
                return `Item not found in Supplier with id ${id}`;
            }
        } catch (error) {
            console.error("Query Execution Error: IN deleteSupplierData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
}