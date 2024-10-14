import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
export var addressService;
(function (addressService) {
    addressService.getAddressData = async (request) => {
        try {
            const queryText = `SELECT * FROM address ORDER BY modifieddate DESC`;
            const result = await query(queryText, []);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    addressService.getUserAddressData = async (request) => {
        try {
            const { userId } = request.params;
            const queryText = `SELECT * FROM address where userId =${userId} ORDER BY modifieddate DESC`;
            const result = await query(queryText, []);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getUserAddressData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    addressService.upsertAddress = async (addressData) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = addressData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
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
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertAddress", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(addressService || (addressService = {}));
//# sourceMappingURL=address.service.js.map