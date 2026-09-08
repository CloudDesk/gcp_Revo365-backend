import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
export var demandrequestService;
(function (demandrequestService) {
    demandrequestService.getDemandRequest = async (request) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 10;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(' OR ')})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
            let dataQuery = `SELECT * FROM demandrequest ${whereClause} ORDER BY id DESC`;
            if (pageNumber && recordCount) {
                dataQuery += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(dataQuery, queryParams);
            const datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
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