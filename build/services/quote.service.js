import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { purchaseRequestService } from "./purchaseRequest.Service.js";
export var quoteService;
(function (quoteService) {
    quoteService.getQuoteData = async (request) => {
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
            let queryText = `SELECT * FROM quotes ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            console.log("Query Text:", queryText);
            console.log("Query Params:", queryParams);
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN get Quote data", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    quoteService.upsertQuotes = async (quotedata) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = quotedata;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log(id, "recId");
            if (id) {
                querydata = `UPDATE quotes SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
                WHERE id = $${fieldNames.length + 1} 
                RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO quotes (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            console.log(result.rows);
            if (result.rows.length > 0) {
                if (result.rows[0].status === "closed_won") {
                    let value = {
                        prstatus: 'Completed',
                        prnumber: result.rows[0].prnumber
                    };
                    console.log(value, ' Value is data ');
                    let updatevalues = await purchaseRequestService.upsertstatusfield(value);
                    console.log(JSON.stringify(updatevalues), ' Updated data');
                    if (updatevalues.rows.length > 0) {
                        let message = {
                            Quote: "Quote Inserted or Updated Successfully",
                            purchaseRequest: "Purchase Request Updated Successfully"
                        };
                        return result;
                    }
                    else {
                        let message = {
                            Quote: "Quote Inserted or Updated Successfully",
                            purchaseRequest: "Purchase Request Updation Failed !!!"
                        };
                        return result;
                    }
                }
                else {
                    let message = {
                        Quote: "Quote Inserted or Updated Successfully",
                        purchaseRequest: "Purchase Request Updation Failed !!!"
                    };
                    return result;
                }
            }
            else {
                return result;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsert Service Quote data", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    quoteService.attachQuotefiles = async (quotedata) => {
        try {
            const { id, ...upsertFields } = quotedata.files;
            for (const file of quotedata.files) {
                upsertFields.quoteurl = PROTOCOL + "://" + quotedata.headers.host + '/' + file.filename;
            }
            quotedata.body.quoteurl = upsertFields.quoteurl;
            let result = await quoteService.upsertQuotes(quotedata.body);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsert Service Quote data", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    quoteService.attachGcpQuotefiles = async (quotedata) => {
        try {
            let querydata;
            let params;
            console.log(quotedata.body, "quotedata.body");
            const { id, ...upsertFields } = quotedata.body;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log(id, "recId");
            if (id) {
                querydata = `UPDATE quotes SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
                WHERE id = $${fieldNames.length + 1} 
                RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO quotes (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            console.log(querydata, "querydata");
            console.log(params, "params");
            const result = await query(querydata, params);
            console.log(result.rows, 'Result Data is ');
            if (result && result.rows && result.rows.length > 0) {
                if (result.rows[0].status === "closed_won") {
                    let value = {
                        prstatus: 'Completed',
                        prnumber: result.rows[0].prnumber
                    };
                    console.log(value, ' Value is data ');
                    let updatevalues = await purchaseRequestService.upsertstatusfield(value);
                    console.log(JSON.stringify(updatevalues), ' Updated data');
                    if (updatevalues.rows.length > 0) {
                        let message = {
                            Quote: "Quote Inserted or Updated Successfully",
                            purchaseRequest: "Purchase Request Updated Successfully"
                        };
                        return result;
                    }
                    else {
                        let message = {
                            Quote: "Quote Inserted or Updated Successfully",
                            purchaseRequest: "Purchase Request Updation Failed !!!"
                        };
                        return result;
                    }
                }
                else {
                    let message = {
                        Quote: "Quote Inserted or Updated Successfully",
                        purchaseRequest: "Purchase Request Updation Failed !!!"
                    };
                    return result;
                }
            }
            else {
                return result;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsert Service Quote data", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(quoteService || (quoteService = {}));
//# sourceMappingURL=quote.service.js.map