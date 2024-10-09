import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";

export module addressService {

    export const getAddressData = async (request: any) => {
        try {
            const queryText = `SELECT * FROM address ORDER BY modifieddate DESC`;
            const result: QueryResult = await query(queryText, []);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    };
    export const getUserAddressData = async (request: any) => {
        try {

            const { userId } = request.params
            const queryText = `SELECT * FROM address where userId =${userId} ORDER BY modifieddate DESC`;
            const result: QueryResult = await query(queryText, []);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getUserAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
            return ErrorMessage
        }
    };

    export const upsertAddress = async (addressData: any) => {
        try {
            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = addressData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);

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
            return result;
        } catch (error) {
            console.error("Query Execution Error: IN upsertAddress", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    };

}
