import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";
import { ticketService } from "./ticket.service.js";
export var costEstimationService;
(function (costEstimationService) {
    costEstimationService.getCostEstimationData = async (request) => {
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
                let paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (key === "sortby") {
                    let [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                }
                else if (paramValues[0].startsWith("NOT ")) {
                    let cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(s.${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                }
                else if (key !== "page" && key !== "count") {
                    let clauses = paramValues.map((_, idx) => `s.${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            let offset = (pageNumber - 1) * recordCount;
            let baseConditions = ``;
            let whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
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
        }
        catch (error) {
            console.error("Error in getCostEstimationData:", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    costEstimationService.upsertCostEstimation = async (request, costEstimationData) => {
        try {
            if (costEstimationData.productdata) {
                costEstimationData.productdata = JSON.parse(costEstimationData.productdata);
            }
            if (costEstimationData.servicedata) {
                costEstimationData.servicedata = JSON.parse(costEstimationData.servicedata);
            }
            costEstimationData.estimationdate = new Date().toLocaleDateString();
            let data = [costEstimationData];
            const { id, ...upsertFields } = costEstimationData;
            let template = "costestimation/costestimation.docx";
            if (!id) {
                let docxrestult = await GenerateDocx(request, data, template);
                upsertFields.estimationurl = docxrestult.fileurl;
                delete docxrestult.fileurl;
            }
            delete upsertFields.estimationdate;
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
            let querydata;
            let params;
            if (id) {
                querydata = `UPDATE servicecostestimation SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO servicecostestimation (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            let datavalue;
            const result = await query(querydata, params);
            if (result && result.rows.length > 0) {
                let ticketnumber = result.rows[0].ticketnumber;
                if (result.rows[0].estimationstatus === 'waiting_for_approval') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "waiting_for_cost_estimation_approval"
                    };
                }
                if (result.rows[0].estimationstatus === 'rejected') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "unresolved_closed"
                    };
                }
                if (result.rows[0].estimationstatus === 're_quote') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "open"
                    };
                }
                if (result.rows[0].estimationstatus === 'approved') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "service_in_progress",
                        approvedcostestimationid: result.rows[0].id
                    };
                }
                let upsertticket = await ticketService.upsertTicketstatus(datavalue);
            }
            return result;
        }
        catch (error) {
            console.error("Error in 'upsertCostEstimation':", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    costEstimationService.upsertGcpCostEstimation = async (request, costEstimationData) => {
        try {
            if (costEstimationData.productdata) {
                costEstimationData.productdata = JSON.parse(costEstimationData.productdata);
            }
            if (costEstimationData.servicedata) {
                costEstimationData.servicedata = JSON.parse(costEstimationData.servicedata);
            }
            costEstimationData.estimationdate = new Date().toLocaleDateString();
            let data = [costEstimationData];
            const { id, ...upsertFields } = costEstimationData;
            let template = "costestimation/costestimation.docx";
            delete upsertFields.estimationdate;
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
            let querydata;
            let params;
            if (id) {
                querydata = `UPDATE servicecostestimation SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO servicecostestimation (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            let datavalue;
            const result = await query(querydata, params);
            if (result && result.rows.length > 0) {
                let ticketnumber = result.rows[0].ticketnumber;
                if (result.rows[0].estimationstatus === 'waiting_for_approval') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "waiting_for_cost_estimation_approval"
                    };
                }
                if (result.rows[0].estimationstatus === 'rejected') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "unresolved_closed"
                    };
                }
                if (result.rows[0].estimationstatus === 're_quote') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "open"
                    };
                }
                if (result.rows[0].estimationstatus === 'approved') {
                    datavalue = {
                        ticketnumber: ticketnumber,
                        ticketstatus: "service_in_progress",
                        approvedcostestimationid: result.rows[0].id
                    };
                }
                let upsertticket = await ticketService.upsertTicketstatus(datavalue);
            }
            return result;
        }
        catch (error) {
            console.error("Error in 'upsertGcpCostEstimation':", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(costEstimationService || (costEstimationService = {}));
//# sourceMappingURL=costestimation.service.js.map