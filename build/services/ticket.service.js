import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { sendMail } from "../Gmail/gmail.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";
export var ticketService;
(function (ticketService) {
    ticketService.getTicketDynamic = async (request) => {
        try {
            const userid = request.query.userid;
            const keys = Object.keys(request.query);
            const pageNumber = request.query.page;
            const recordCount = request.query.count;
            const queryParams = [];
            let whereClauses = [];
            let offset;
            let parameterIndex = 1;
            Object.entries(request.query).forEach(([key, value], index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues = Array.isArray(value) ? value : [value];
                    if (key === "createddate" || key === "modifieddate") {
                        let rangeWhereClause = paramValues
                            .map((range) => {
                            const [lowerBound, upperBound] = range.split("-");
                            queryParams.push(lowerBound, upperBound);
                            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                            parameterIndex += 2;
                            return clause;
                        })
                            .join(" OR ");
                        whereClauses.push(`(${rangeWhereClause})`);
                    }
                    else {
                        whereClauses.push(`(${paramValues.map((_, idx) => `${key} = $${parameterIndex}`).join(" OR ")})`);
                        queryParams.push(...paramValues);
                        parameterIndex += paramValues.length;
                    }
                }
            });
            if (pageNumber && recordCount) {
                offset = (pageNumber - 1) * recordCount;
            }
            let querydata = `select * from tickets`;
            if (whereClauses.length > 0) {
                querydata += ` WHERE ${whereClauses.join(" AND ")} ORDER BY modifieddate DESC`;
            }
            else {
                querydata += ` ORDER BY modifieddate DESC`;
            }
            if (offset != null && recordCount != null) {
                querydata += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2}`;
                queryParams.push(offset, recordCount);
            }
            let data = await query(querydata, queryParams);
            if (keys.length == 1 && keys[0] == 'userid') {
                const invoiceQuery = `
                SELECT DISTINCT r.invoiceurl, t.ticketnumber, t.userid
                FROM revoinvoice AS r 
                JOIN tickets AS t ON r.ticketnumber = t.ticketnumber 
                WHERE t.userid = $1 AND r.invoicefor = 'service';
            `;
                const invoiceurldata = await query(invoiceQuery, [userid]);
                const invoiceMap = new Map(invoiceurldata.rows.map(row => [row.ticketnumber, row.invoiceurl]));
                data.rows = data.rows.map(row => ({
                    ...row,
                    invoiceurl: invoiceMap.get(row.ticketnumber) || null
                }));
            }
            else {
            }
            return data.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getTicketDynamic", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ticketService.getTicketData = async (request) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "t.modifieddate";
            let orderByDirection = "DESC";
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (key === "range") {
                    const rangeClauses = paramValues.map((range) => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                        parameterIndex += 2;
                        return clause;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                }
                else if (key === "sortby") {
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
            const baseConditions = `
      (isarchive = FALSE OR isarchive IS NULL) AND 
      (isdeleted = FALSE OR isdeleted IS NULL) AND  
      (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `
      SELECT t.*, i.id as inventoryuserid,i.firstname as username,i.role as userrole,p.warranty AS product_warranty
      FROM tickets t
      LEFT JOIN (
    SELECT id,firstname,role
    FROM inventoryusers 
) AS i ON i.id = t.assignedid
   LEFT JOIN (
    SELECT id,warranty
    FROM product_revo p
) AS p ON p.id = t.productid
      ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            let ErrorData = ErrorHandler.handleQueryError(error);
            return ErrorData;
        }
    };
    ticketService.getQueueTicketData = async (request) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "t.queuenumber";
            let orderByDirection = "ASC";
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (key === "range") {
                    const rangeClauses = paramValues.map((range) => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                        parameterIndex += 2;
                        return clause;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                }
                else if (key === "sortby") {
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
            const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `
       SELECT t.*, i.id as userid,i.firstname as username,i.role as userrole,i.location as userlocation
      FROM tickets t
      LEFT JOIN inventoryusers i ON t.assignedid = i.id
      ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            let ErrorData = ErrorHandler.handleQueryError(error);
            return ErrorData;
        }
    };
    ticketService.upsertTickets = async (ticketData, files, host) => {
        try {
            let querydata;
            let params;
            const { id, inventoryuserid, product_warranty, ...upsertFields } = ticketData;
            console.log(id, inventoryuserid, product_warranty, "id,inventoryuserid,product_warranty");
            console.log("Upsert Fields", upsertFields);
            if (files && files.length > 0) {
                for (const file of files) {
                    upsertFields.recipturl =
                        PROTOCOL + "://" + host + "/" + file.filename;
                }
            }
            const fieldNames = Object.keys(upsertFields);
            console.log("Field Names", fieldNames);
            const fieldValues = Object.values(upsertFields);
            console.log("Field Values", fieldValues);
            if (id) {
                querydata = `UPDATE tickets SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                console.log("Query Data", querydata);
            }
            else {
                querydata = `INSERT INTO tickets (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            console.log(querydata, "querydata in Upsert Normal Tickets");
            const result = await query(querydata, params);
            if (result && result.rows.length > 0) {
                let userdata = await query(`SELECT * FROM users WHERE id = $1`, [
                    result.rows[0].userid,
                ]);
                if (userdata && userdata.rows.length > 0) {
                    const ticketStatus = result.rows[0].ticketstatus;
                    const ticketNumber = result.rows[0].ticketnumber;
                    if (emailTemplates.tickets[ticketStatus]) {
                        const { subject, text } = emailTemplates.tickets[ticketStatus];
                        let maildata = {
                            body: {
                                to: userdata.rows[0].useremail,
                                subject,
                                text: text.replace("{ticketNumber}", ticketNumber),
                            },
                        };
                        try {
                            let sendingmail = await sendMail(maildata, false);
                        }
                        catch (error) {
                            console.log(error.message || error, "error in sending mail");
                        }
                    }
                }
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertTickets", error);
            let ErrorData = ErrorHandler.handleQueryError(error);
            return ErrorData;
        }
    };
    ticketService.upsertGcpTickets = async (ticketData) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = ticketData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE tickets SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO tickets (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            console.log(querydata, " querydata in Upsert GCP Tickets");
            const result = await query(querydata, params);
            if (result && result.rows.length > 0) {
                let userdata = await query(`SELECT * FROM users WHERE id = $1`, [
                    result.rows[0].userid,
                ]);
                if (userdata && userdata.rows.length > 0) {
                    const ticketStatus = result.rows[0].ticketstatus;
                    const ticketNumber = result.rows[0].ticketnumber;
                    if (emailTemplates.tickets[ticketStatus]) {
                        const { subject, text } = emailTemplates.tickets[ticketStatus];
                        let maildata = {
                            body: {
                                to: userdata.rows[0].useremail,
                                subject,
                                text: text.replace("{ticketNumber}", ticketNumber),
                            },
                        };
                        try {
                            let sendingmail = await sendMail(maildata, false);
                        }
                        catch (error) {
                            console.log(error.message || error, "error in sending mail");
                        }
                    }
                }
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertGcpTickets", error);
            let ErrorData = ErrorHandler.handleQueryError(error);
            return ErrorData;
        }
    };
    ticketService.upsertTicketspayment = async (ticketData, files, host) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = ticketData;
            if (files && files.length > 0) {
                for (const file of files) {
                    upsertFields.recipturl =
                        PROTOCOL + "://" + host + "/" + file.filename;
                }
            }
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE tickets SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO tickets (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertTicketspayment", error);
            let ErrorData = ErrorHandler.handleQueryError(error);
            return ErrorData;
        }
    };
    ticketService.upsertTicketstatus = async (ticketdata) => {
        try {
            let querydata;
            let params;
            const { ticketnumber, ...upsertFields } = ticketdata;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (ticketnumber) {
                querydata = `UPDATE tickets SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE ticketnumber = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, ticketnumber];
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertTicketstatus", error);
            let ErrorData = ErrorHandler.handleQueryError(error);
            return ErrorData;
        }
    };
})(ticketService || (ticketService = {}));
//# sourceMappingURL=ticket.service.js.map