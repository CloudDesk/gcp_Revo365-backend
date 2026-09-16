import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import { accessScopeService } from "./accessScope.service.js";

export module addressService {

    export const getAddressData = async (request: any) => {

        try {
            const whereClauses: string[] = [];
            const queryParams: any[] = [];
            await accessScopeService.appendVendorCustomerColumnScope(
                request,
                whereClauses,
                queryParams,
                1,
                { tableAlias: "address", customerColumn: "userid" }
            );
            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
            const queryText = `SELECT * FROM address ${whereSql} ORDER BY modifieddate DESC`;
            const result: QueryResult = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };
    export const getUserAddressData = async (request: any) => {
        try {

            const { userId } = request.params
            const whereClauses = [`address.userid = $1`];
            const queryParams: any[] = [Number(userId)];
            await accessScopeService.appendVendorCustomerColumnScope(
                request,
                whereClauses,
                queryParams,
                2,
                { tableAlias: "address", customerColumn: "userid" }
            );
            const queryText = `SELECT * FROM address where ${whereClauses.join(" AND ")} ORDER BY modifieddate DESC`;
            const result: QueryResult = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getUserAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const deleteAddress = async (id: number) => {
        try {
            const result: any = await query(`DELETE FROM address WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} Address deleted successfully`;
            } else {
                return `Address not found with id ${id}`;
            }
        } catch (error) {
            console.error("Query Execution Error: IN deleteAddress", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const upsertAddress = async (addressData: any) => {
        try {
            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = addressData;
            const allowedInputFields = [
                "userid",
                "name",
                "mobilenumber",
                "pincode",
                "address",
                "landmark",
                "state",
                "city",
                "email",
                "doornumber",
            ];

            const filteredEntries = Object.entries(upsertFields).filter(
                ([field, value]) =>
                    allowedInputFields.includes(field) && value !== undefined
            );

            const filteredFields = Object.fromEntries(filteredEntries);
            const now = Date.now();

            if (id) {
                filteredFields.modifieddate = now;
            } else {
                filteredFields.createddate = now;
                filteredFields.modifieddate = now;
            }

            const fieldNames = Object.keys(filteredFields);
            const fieldValues = Object.values(filteredFields);

            if (fieldNames.length === 0) {
                return {
                    command: "Fail",
                    message: "No valid address fields provided",
                };
            }

            if (id) {
                querydata = `UPDATE address SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO address (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }

            const result = await query(querydata, params);
            console.log(`[DEBUG][POST /address] address ${id ? "updated" : "created"}:`, {
                id: result.rows?.[0]?.id,
                userid: result.rows?.[0]?.userid,
                city: result.rows?.[0]?.city,
            });
            return result;
        } catch (error) {
            console.error("Query Execution Error: IN upsertAddress", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

}
