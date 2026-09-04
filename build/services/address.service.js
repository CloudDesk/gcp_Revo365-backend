import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { accessScopeService } from "./accessScope.service.js";
export var addressService;
(function (addressService) {
    addressService.getAddressData = async (request) => {
        try {
            const whereClauses = [];
            const queryParams = [];
            await accessScopeService.appendVendorCustomerColumnScope(request, whereClauses, queryParams, 1, { tableAlias: "address", customerColumn: "userid" });
            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
            const queryText = `SELECT * FROM address ${whereSql} ORDER BY modifieddate DESC`;
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    addressService.getUserAddressData = async (request) => {
        try {
            const { userId } = request.params;
            const whereClauses = [`address.userid = $1`];
            const queryParams = [Number(userId)];
            await accessScopeService.appendVendorCustomerColumnScope(request, whereClauses, queryParams, 2, { tableAlias: "address", customerColumn: "userid" });
            const queryText = `SELECT * FROM address where ${whereClauses.join(" AND ")} ORDER BY modifieddate DESC`;
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getUserAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    addressService.deleteAddress = async (id) => {
        try {
            const result = await query(`DELETE FROM address WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} Address deleted successfully`;
            }
            else {
                return `Address not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteAddress", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    addressService.upsertAddress = async (addressData) => {
        try {
            let querydata;
            let params;
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
            const filteredEntries = Object.entries(upsertFields).filter(([field, value]) => allowedInputFields.includes(field) && value !== undefined);
            const filteredFields = Object.fromEntries(filteredEntries);
            const now = Date.now();
            if (id) {
                filteredFields.modifieddate = now;
            }
            else {
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
            }
            else {
                querydata = `INSERT INTO address (${fieldNames.join(", ")}) VALUES (${fieldNames
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
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertAddress", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(addressService || (addressService = {}));
//# sourceMappingURL=address.service.js.map