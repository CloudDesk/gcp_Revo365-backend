import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { demandrequestService } from "./demandrequest.service.js";
export var purchaseRequestService;
(function (purchaseRequestService) {
    purchaseRequestService.getPurchaseRequestData = async (request) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                }
                else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                }
                else if (key !== "page" && key !== "count") {
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = ``;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM purchaserequest ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getPurchaseRequestData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    purchaseRequestService.upsertPurchaseRequestData = async (prData) => {
        delete prData.suppliercode;
        console.log("Data in upsertPurchaseRequestData:", prData);
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = prData;
            let prdataJsonString;
            function ensureJsonString(data) {
                return (typeof data === 'string' || data instanceof String) ? data : JSON.stringify(data);
            }
            if (upsertFields.prdata) {
                prdataJsonString = ensureJsonString(upsertFields.prdata);
                upsertFields.prdata = prdataJsonString;
            }
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE purchaserequest SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
                WHERE id = $${fieldNames.length + 1} 
                RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO purchaserequest (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            console.log("Result in upsertPurchaseRequestData:", result.rows);
            if (result.rows.length > 0 && result.rows[0].isdemandrequest === true) {
                const demandrequestData = { id: result.rows[0].demandrequestid, prstatus: result.rows[0].prstatus, prnumber: result.rows[0].prnumber };
                console.log("Demand Request Data in upsertPurchaseRequestData:", demandrequestData);
                await demandrequestService.upsertDemandRequest(demandrequestData);
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertPurchaseRequestData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    purchaseRequestService.upsertstatusfield = async (prData) => {
        try {
            console.log("Request Body in upsertstatusfield:", prData);
            let querydata;
            let params;
            const { prnumber, ...upsertFields } = prData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log("Field Names:", fieldNames);
            console.log("Field Values:", fieldValues);
            console.log('Sample');
            if (prnumber) {
                querydata = `update purchaserequest SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
                WHERE prnumber = $${fieldNames.length + 1} 
                RETURNING *`;
                params = [...fieldValues, prnumber];
            }
            else {
                querydata = `INSERT INTO purchaserequest (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            console.log("Result in upsertstatusfield:", result.rows);
            const drData = { id: result.rows[0].demandrequestid, prstatus: result.rows[0].prstatus };
            await demandrequestService.upsertDemandRequest(drData);
            console.log('Stop');
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertstatusfield", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(purchaseRequestService || (purchaseRequestService = {}));
//# sourceMappingURL=purchaseRequest.Service.js.map