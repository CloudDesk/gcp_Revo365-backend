import { json } from "stream/consumers";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";
import { ticketService } from "./ticket.service.js";
import { sendTransactionalMail } from "../Gmail/gmail.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";

// ─── Helpers (private to this module) ───────────────────────────────────────

// Resolves the customer's email + key ticket fields from a ticket number.
const getTicketUserInfo = async (ticketnumber: string) => {
    const result = await query(
        `SELECT u.useremail, u.firstname, t.productname, t.tickettype
         FROM tickets t
         JOIN users u ON t.userid = u.id
         WHERE t.ticketnumber = $1
         LIMIT 1`,
        [ticketnumber]
    );
    return result.rows[0] ?? null;
};

// Fires the correct customer notification email for each estimationstatus transition.
// Called from both upsertCostEstimation and upsertGcpCostEstimation to avoid duplication.
const fireEstimationEmail = async (
    estimationstatus: string,
    ticketnumber: string,
    estimationurl: string | null,
    totalpayableamount: number | null
) => {
    try {
        const userInfo = await getTicketUserInfo(ticketnumber);
        if (!userInfo) return;

        const t = emailTemplates.tickets;
        let subject: string;
        let text: string;

        if (estimationstatus === 'waiting_for_approval') {
            subject = t.waiting_for_cost_estimation_approval.subject;
            text = t.waiting_for_cost_estimation_approval.text
                .replace('{ticketNumber}', ticketnumber)
                .replace('{productName}', userInfo.productname || 'your product')
                .replace('{totalPayable}', totalpayableamount != null ? `\u20B9${totalpayableamount}` : 'N/A')
                .replace('{estimationUrl}', estimationurl || 'N/A');
        } else if (estimationstatus === 'approved') {
            subject = t.service_in_progress.subject;
            text = t.service_in_progress.text
                .replace('{ticketNumber}', ticketnumber)
                .replace('{productName}', userInfo.productname || 'your product');
        } else if (estimationstatus === 'rejected') {
            subject = t.unresolved_closed.subject;
            text = t.unresolved_closed.text
                .replace('{ticketNumber}', ticketnumber);
        } else if (estimationstatus === 're_quote') {
            subject = t.re_quote.subject;
            text = t.re_quote.text
                .replace('{ticketNumber}', ticketnumber);
        } else {
            return; // unknown status — no email
        }

        await sendTransactionalMail({ to: userInfo.useremail, subject, text });
    } catch (mailErr: any) {
        console.error(`[costEstimation] Email failed for estimationstatus "${estimationstatus}":`, mailErr?.message || mailErr);
    }
};

export module costEstimationService {

    export const getCostEstimationData = async (request) => {
        try {
            let pageNumber = parseInt(request.query.page) || 1;
            let recordCount = parseInt(request.query.count) || 5000;
            let keys = Object.keys(request.query);
            let values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            let queryParams = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";
            keys.forEach((key, index) => {
                let paramValues: any = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (key === "sortby") {
                    let [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (paramValues[0].startsWith("NOT ")) {
                    let cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(s.${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                } else if (key !== "page" && key !== "count") {
                    let clauses = paramValues.map(
                        (_, idx) => `s.${key} = $${parameterIndex + idx}`
                    );
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            let offset = (pageNumber - 1) * recordCount;
            let baseConditions = ``;
            let whereClause =
                whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            let orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `
    SELECT s.*, ri.invoiceurl AS invoiceurl 
    FROM servicecostestimation s
    LEFT JOIN revoinvoice ri ON s.ticketnumber = ri.ticketnumber
    ${whereClause} 
    ${orderByClause}
`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            let result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        } catch (error) {
            console.error("Error in getCostEstimationData:", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage;

        }
    }


    export const upsertCostEstimation = async (request: any, costEstimationData: any) => {
        try {
            if (costEstimationData.productdata) {
                costEstimationData.productdata = JSON.parse(costEstimationData.productdata)
            }
            if (costEstimationData.servicedata) {
                costEstimationData.servicedata = JSON.parse(costEstimationData.servicedata)
            }
            costEstimationData.estimationdate = new Date().toLocaleDateString();
            let data = [costEstimationData];
            const { id, ...upsertFields } = costEstimationData;
            let template = "costestimation/costestimation.docx"

            if (!id) {
                let docxrestult = await GenerateDocx(request, data, template)
                upsertFields.estimationurl = docxrestult.fileurl;
                delete docxrestult.fileurl;
            }
            delete upsertFields.estimationdate
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let productdataIndex = fieldNames.indexOf("productdata");
            let servicedataIndex = fieldNames.indexOf("servicedata");
            if (productdataIndex !== -1) {
                fieldValues[productdataIndex] = JSON.stringify(fieldValues[productdataIndex]);
            }
            if (servicedataIndex !== -1) {
                fieldValues[servicedataIndex] = JSON.stringify(fieldValues[servicedataIndex]);

            }
            let querydata: string;
            let params: any[];
            if (id) {
                querydata = `UPDATE servicecostestimation SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO servicecostestimation (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            let datavalue
            const result = await query(querydata, params);
            if (result && result.rows.length > 0) {
                let ticketnumber = result.rows[0].ticketnumber;
                if (result.rows[0].estimationstatus === 'waiting_for_approval') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "waiting_for_cost_estimation_approval"
                    }
                }
                if (result.rows[0].estimationstatus === 'rejected') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "unresolved_closed"
                    }
                }
                if (result.rows[0].estimationstatus === 're_quote') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "open"
                    }
                }
                if (result.rows[0].estimationstatus === 'approved') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "service_in_progress",
                        approvedcostestimationid: result.rows[0].id
                    }
                }
                let upsertticket = await ticketService.upsertTicketstatus(datavalue);
                await fireEstimationEmail(
                    result.rows[0].estimationstatus,
                    ticketnumber,
                    result.rows[0].estimationurl ?? null,
                    result.rows[0].totalpayableamount ?? null
                );
            }
            return result;
        } catch (error) {
            console.error("Error in 'upsertCostEstimation':", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }


    export const upsertGcpCostEstimation = async (request: any, costEstimationData: any) => {
        try {
            if (costEstimationData.productdata) {
                costEstimationData.productdata = JSON.parse(costEstimationData.productdata)
            }
            if (costEstimationData.servicedata) {
                costEstimationData.servicedata = JSON.parse(costEstimationData.servicedata)
            }
            costEstimationData.estimationdate = new Date().toLocaleDateString();
            let data = [costEstimationData];
            const { id, ...upsertFields } = costEstimationData;
            let template = "costestimation/costestimation.docx"

            delete upsertFields.estimationdate
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let productdataIndex = fieldNames.indexOf("productdata");
            let servicedataIndex = fieldNames.indexOf("servicedata");

            if (productdataIndex !== -1) {
                fieldValues[productdataIndex] = JSON.stringify(fieldValues[productdataIndex]);

            }
            if (servicedataIndex !== -1) {
                fieldValues[servicedataIndex] = JSON.stringify(fieldValues[servicedataIndex]);

            }

            let querydata: string;
            let params: any[];
            if (id) {
                querydata = `UPDATE servicecostestimation SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO servicecostestimation (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            let datavalue
            const result = await query(querydata, params);
            if (result && result.rows.length > 0) {
                let ticketnumber = result.rows[0].ticketnumber;
                if (result.rows[0].estimationstatus === 'waiting_for_approval') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "waiting_for_cost_estimation_approval"
                    }
                }
                if (result.rows[0].estimationstatus === 'rejected') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "unresolved_closed"
                    }
                }
                if (result.rows[0].estimationstatus === 're_quote') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "open"
                    }
                }
                if (result.rows[0].estimationstatus === 'approved') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "service_in_progress",
                        approvedcostestimationid: result.rows[0].id
                    }
                }
                let upsertticket = await ticketService.upsertTicketstatus(datavalue);
                await fireEstimationEmail(
                    result.rows[0].estimationstatus,
                    ticketnumber,
                    result.rows[0].estimationurl ?? null,
                    result.rows[0].totalpayableamount ?? null
                );
            }
            return result;
        } catch (error) {
            console.error("Error in 'upsertGcpCostEstimation':", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }

}