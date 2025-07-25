import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var demandrequestService;
(function (demandrequestService) {
    demandrequestService.getDemandRequest = async () => {
        try {
            const querydata = `select * from demandrequest`;
            const result = await query(querydata, []);
            // console.log("Query Result in getDemandRequest:", result);
            console.log("Query Result in getDemandRequest:", result.rows);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getDemandRequest", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    demandrequestService.upsertDemandRequest = async (demandrequestData) => {
        try {
            console.log("Request Body in upsertDemandRequest in service:", demandrequestData);
            let querydata;
            let params;
            const { id, ...upsertFields } = demandrequestData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log("Field Names:", fieldNames);
            console.log("Field Values:", fieldValues);
            if (id) {
                querydata = `UPDATE demandrequest SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO demandrequest (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            console.log("Query Result in upsertDemandRequest:", result.rows);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertDemandRequest", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(demandrequestService || (demandrequestService = {}));
//# sourceMappingURL=demandrequest.service.js.map