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
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getQuotedata", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    // export const upsertQuotes = async (quotedata: any) => {
    //     try {
    //         console.log("Quotedata in upsertQuote:", quotedata);
    //         let querydata: string;
    //         let params: any[];
    //         const { id, ...upsertFields } = quotedata;
    //         const fieldNames = Object.keys(upsertFields);
    //         const fieldValues = Object.values(upsertFields);
    //         if (id) {
    //             querydata = `UPDATE quotes SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
    //             WHERE id = $${fieldNames.length + 1} 
    //             RETURNING *`;
    //             params = [...fieldValues, id];
    //         } else {
    //             querydata = `INSERT INTO quotes (${fieldNames.join(
    //                 ", "
    //             )}) VALUES (${fieldNames
    //                 .map((_, index) => `$${index + 1}`)
    //                 .join(", ")}) RETURNING *`;
    //             params = fieldValues;
    //         }
    //         const result = await query(querydata, params);
    //         console.log("Result in upsertQuote:", result.rows);
    //         const pr = result.rows[0].prnumber;
    //         const quoteStatus = result.rows[0].status;
    //         const quoteid = result.rows[0].id;
    //         const queryPr = await query(`SELECT demandrequestid, isdemandrequest FROM purchaserequest WHERE prnumber = $1`, [pr]);
    //         console.log("Query Result in upsertQuote:", queryPr.rows);
    //         if(queryPr.rows.length>0 && queryPr.rows[0].isdemandrequest === true){
    //             console.log('inside demand request update');
    //             const updateDR = await query(`UPDATE demandrequest SET quotestatus = $1 WHERE id = $2 RETURNING *`, [quoteStatus, queryPr.rows[0].demandrequestid]);
    //             console.log("Update Demand Request Result in upsertQuote:", updateDR.rows);
    //             console.log("Quote Upserted Successfully");
    //         }
    //         if (result.rows.length > 0) {
    //             if (result.rows[0].status === "closed_won") {
    //                 console.log("Quote Status is closed_won, updating purchase request status");
    //                 let value = {
    //                     prstatus: 'Completed',
    //                     prnumber: result.rows[0].prnumber
    //                 }
    //                 let updatevalues = await purchaseRequestService.upsertstatusfield(value);
    //                 if (updatevalues.rows.length > 0) {
    //                     let message = {
    //                         Quote: "Quote Inserted or Updated Successfully",
    //                         purchaseRequest: "Purchase Request Updated Successfully"
    //                     }
    //                     return result;
    //                 }
    //                 else {
    //                     let message = {
    //                         Quote: "Quote Inserted or Updated Successfully",
    //                         purchaseRequest: "Purchase Request Updation Failed !!!"
    //                     }
    //                     return result
    //                 }
    //             }
    //             else {
    //                 let message = {
    //                     Quote: "Quote Inserted or Updated Successfully",
    //                     purchaseRequest: "Purchase Request Updation Failed !!!"
    //                 }
    //                 return result
    //             }
    //         }
    //         else {
    //             return result
    //         }
    //     } catch (error) {
    //         console.error("Query Execution Error: IN upsertQuote", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error);
    //         return ErrorMessage;
    //     }
    // }
    quoteService.upsertQuotes = async (quotedata) => {
        try {
            console.log("Quotedata in upsertQuote:", quotedata);
            let querydata;
            let params;
            const { id, ...upsertFields } = quotedata;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            // Upsert logic for quotes table
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
            console.log("Result in upsertQuote:", result.rows);
            if (!result.rows.length) {
                throw new Error("No rows returned from upsert query.");
            }
            const quoteRow = result.rows[0];
            const pr = quoteRow.prnumber;
            const quoteStatus = quoteRow.status;
            const quoteid = quoteRow.id;
            const quotenumber = quoteRow.quotenumber;
            // Find demandrequest for current PR, but only if isdemandrequest true
            const queryPr = await query(`SELECT demandrequestid, isdemandrequest FROM purchaserequest WHERE prnumber = $1`, [pr]);
            console.log("Query Result in upsertQuote:", queryPr.rows);
            if (queryPr.rows.length > 0 && queryPr.rows[0].isdemandrequest === true) {
                const demandRequestId = queryPr.rows[0].demandrequestid;
                console.log('inside demand request update');
                // 1. Update quotestatus on demandrequest (as you do now)
                const updateDR = await query(`UPDATE demandrequest SET quotestatus = $1 WHERE id = $2 RETURNING *`, [quoteStatus, demandRequestId]);
                console.log("Update Demand Request Result in upsertQuote:", updateDR.rows);
                // 2. Fetch demandrequestdata array from this Demand Request
                const demandReqRes = await query(`SELECT demandrequestdata FROM demandrequest WHERE id = $1`, [demandRequestId]);
                if (!demandReqRes.rows.length) {
                    throw new Error(`Demand request with ID ${demandRequestId} not found.`);
                }
                let demandrequestdata = demandReqRes.rows[0].demandrequestdata;
                if (!demandrequestdata)
                    demandrequestdata = [];
                if (typeof demandrequestdata === "string") {
                    try {
                        demandrequestdata = JSON.parse(demandrequestdata);
                    }
                    catch {
                        demandrequestdata = [];
                    }
                }
                // 3. Update each matching item by prnumber with quoteid & quotenumber
                let updated = false;
                if (Array.isArray(demandrequestdata)) {
                    demandrequestdata = demandrequestdata.map(item => {
                        if (item.prnumber === pr) {
                            updated = true;
                            return {
                                ...item,
                                quoteid,
                                quotenumber
                            };
                        }
                        return item;
                    });
                }
                // 4. If any item was updated, persist the updated array
                if (updated) {
                    await query(`UPDATE demandrequest SET demandrequestdata = $1 WHERE id = $2`, [JSON.stringify(demandrequestdata), demandRequestId]);
                    console.log("Updated demandrequestdata with quoteid and quotenumber for prnumber:", pr);
                }
            }
            console.log("Quote Upserted Successfully");
            // Continue your quote->PR status handling as before
            if (result.rows.length > 0) {
                if (result.rows[0].status === "closed_won") {
                    console.log("Quote Status is closed_won, updating purchase request status");
                    let value = {
                        prstatus: 'Completed',
                        prnumber: result.rows[0].prnumber
                    };
                    let updatevalues = await purchaseRequestService.upsertstatusfield(value);
                    // ...rest of your message logic
                    return result;
                }
                else {
                    // ...rest of your message logic
                    return result;
                }
            }
            else {
                return result;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertQuote", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
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
            console.error("Query Execution Error: IN attachQuotefiles", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    quoteService.attachGcpQuotefiles = async (quotedata) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = quotedata.body;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
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
            console.log("Result in attachGcpQuotefiles:", result.rows);
            console.log('stop');
            if (!result.rows.length) {
                throw new Error("No rows returned from upsert query.");
            }
            const quoteRow = result.rows[0];
            const pr = quoteRow.prnumber;
            const quoteStatus = quoteRow.status;
            const quoteid = quoteRow.id;
            const quotenumber = quoteRow.quotenumber;
            // Find demandrequest for current PR, but only if isdemandrequest true
            const queryPr = await query(`SELECT demandrequestid, isdemandrequest FROM purchaserequest WHERE prnumber = $1`, [pr]);
            console.log("Query Result in upsertQuote:", queryPr.rows);
            if (queryPr.rows.length > 0 && queryPr.rows[0].isdemandrequest === true) {
                const demandRequestId = queryPr.rows[0].demandrequestid;
                console.log('inside demand request update');
                // 1. Update quotestatus on demandrequest (as you do now)
                const updateDR = await query(`UPDATE demandrequest SET quotestatus = $1 WHERE id = $2 RETURNING *`, [quoteStatus, demandRequestId]);
                console.log("Update Demand Request Result in upsertQuote:", updateDR.rows);
                // 2. Fetch demandrequestdata array from this Demand Request
                const demandReqRes = await query(`SELECT demandrequestdata FROM demandrequest WHERE id = $1`, [demandRequestId]);
                if (!demandReqRes.rows.length) {
                    throw new Error(`Demand request with ID ${demandRequestId} not found.`);
                }
                let demandrequestdata = demandReqRes.rows[0].demandrequestdata;
                if (!demandrequestdata)
                    demandrequestdata = [];
                if (typeof demandrequestdata === "string") {
                    try {
                        demandrequestdata = JSON.parse(demandrequestdata);
                    }
                    catch {
                        demandrequestdata = [];
                    }
                }
                // 3. Update each matching item by prnumber with quoteid & quotenumber
                let updated = false;
                if (Array.isArray(demandrequestdata)) {
                    demandrequestdata = demandrequestdata.map(item => {
                        if (item.prnumber === pr) {
                            updated = true;
                            return {
                                ...item,
                                quoteid,
                                quotenumber
                            };
                        }
                        return item;
                    });
                }
                // 4. If any item was updated, persist the updated array
                if (updated) {
                    await query(`UPDATE demandrequest SET demandrequestdata = $1 WHERE id = $2`, [JSON.stringify(demandrequestdata), demandRequestId]);
                    console.log("Updated demandrequestdata with quoteid and quotenumber for prnumber:", pr);
                }
            }
            console.log("Quote Upserted Successfully");
            if (result && result.rows && result.rows.length > 0) {
                if (result.rows[0].status === "closed_won") {
                    let value = {
                        prstatus: 'Completed',
                        prnumber: result.rows[0].prnumber
                    };
                    let updatevalues = await purchaseRequestService.upsertstatusfield(value);
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
            console.error("Query Execution Error: IN attachGcpQuotefiles", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(quoteService || (quoteService = {}));
//# sourceMappingURL=quote.service.js.map