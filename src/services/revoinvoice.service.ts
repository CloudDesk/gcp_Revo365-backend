import { error } from "console";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";

export module revoinvoiceservice {
    export const getRevoInvoiceData = async (request: any) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);

            let whereClauses: string[] = [];
            let parameterIndex = 1;
            const queryParams: any[] = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";

            keys.forEach((key, index) => {
                const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                } else if (key !== "page" && key !== "count") {
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });

            const offset = (pageNumber - 1) * recordCount;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : '';
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

            let queryText = `SELECT * FROM revoinvoice ${whereClause} ${orderByClause}`;

            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }

            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;

        } catch (error) {
            console.error("Query Execution Error: IN getRevoInvoiceData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;

        }
    }

    export const generaterevoinvoice = async (request: any, invoicedata: any, reply: any) => {
        try {
            let invoicefor = invoicedata[0].invoicefor
            let template = ''
            if (invoicefor === 'product') {
                template = "invoice/revoinvoiceproduct.docx";

            } else if (invoicefor === 'service') {
                template = "invoice/revoinvoiceservice.docx";
            }
            else {
                return 'Without Invoice Type you cannot create Invoice'
            }
            let result = await GenerateDocx(request, invoicedata, template);
            result.invoiceUrl = result.fileurl;
            delete result.fileurl;
            let data = {
                id: result.id,
                invoiceurl: result.invoiceUrl
            }
            let insertFileinvoice: any = await upsertRevoInvoice(data);
            if (insertFileinvoice.command === "UPDATE" || insertFileinvoice.command === "INSERT") {
                reply.send(result.invoiceUrl);
            }
            else {
                reply.status(404).send("File not inserted.So Please Contact Admin");
            }
        } catch (error) {
            console.error("Query Execution Error: IN generaterevoinvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }

    export const upsertRevoInvoice = async (invoicedata: any) => {
        try {
            console.log('In upsertRevoInvoice with data:', invoicedata);
            console.log('Stop')
            let querydata: string;
            let params: any[];
            const { id, product, ...upsertFields } = invoicedata;

            if (product) {
                upsertFields.product = JSON.stringify(product);
            }
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log('-->',fieldNames)
            console.log('-->',fieldValues)
            console.log('Wait')
            if (id) {
                querydata = `UPDATE revoinvoice SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO revoinvoice (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }

            const result = await query(querydata, params);
            return result;
        } catch (error) {
            console.error("Query Execution Error: IN upsertRevoInvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage;

        }
    }

}