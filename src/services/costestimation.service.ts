import { json } from "stream/consumers";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";
import { ticketService } from "./ticket.service.js";

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
            console.log(whereClauses, 'whereClauses');
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
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage;

        }
    }

    // export const generatecostestimation = async (request: any, estimationdata: any, reply: any) => {
    //     console.log(JSON.stringify(estimationdata), 'podata');
    //     try {
    //         let template ="invoice/revoinvoice.docx"
    //         let result = await GenerateDocx(request, estimationdata,template)
    //         console.log(result, "result from invoiceData");
    //         result.estimationurl = result.fileurl;
    //         delete result.fileurl;
    //         let data ={
    //             id:result.id,
    //             estimationurl:result.estimationurl
    //         }
    //         console.log(data);
    //         let insertFileinvoice: any = await upsertCostEstimation(data)
    //         if (insertFileinvoice.command === "UPDATE" || insertFileinvoice.command === "INSERT") {
    //             reply.send(result.estimationurl)
    //         }
    //         else {
    //             reply.status(404).send("File not inserted.So Please Contact Admin")
    //         }
    //     } catch (error) {
    //         console.error("Query Execution Error: IN generatepurchaseOrderData", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //         console.log(ErrorMessage);
    //         return ErrorMessage
    //     }
    // }

    export const upsertCostEstimation = async (request: any, costEstimationData: any) => {
        try {
            console.log(costEstimationData, "costEstimationData");
            if (costEstimationData.productdata) {
                costEstimationData.productdata = JSON.parse(costEstimationData.productdata)
            }
            if (costEstimationData.servicedata) {
                costEstimationData.servicedata = JSON.parse(costEstimationData.servicedata)
            }
            costEstimationData.estimationdate = new Date().toLocaleDateString();
            let data = [costEstimationData];
            console.log(data, 'data is');
            const { id, ...upsertFields } = costEstimationData;
            let template = "costestimation/costestimation.docx"

            if (!id) {
                let docxrestult = await GenerateDocx(request, data, template)
                console.log(docxrestult, "result from invoiceData");
                upsertFields.estimationurl = docxrestult.fileurl;
                delete docxrestult.fileurl;
                console.log(costEstimationData, "costEstimationData");
            }
            delete upsertFields.estimationdate
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let productdataIndex = fieldNames.indexOf("productdata");
            let servicedataIndex = fieldNames.indexOf("servicedata");
            console.log(productdataIndex, 'productdataIndex');
            console.log(servicedataIndex, 'servicedataIndex');
            if (productdataIndex !== -1) {
                fieldValues[productdataIndex] = JSON.stringify(fieldValues[productdataIndex]);
                console.log(fieldValues[productdataIndex], 'fieldValues[productdataIndex]');

            }
            if (servicedataIndex !== -1) {
                fieldValues[servicedataIndex] = JSON.stringify(fieldValues[servicedataIndex]);
                console.log(fieldValues[servicedataIndex], 'fieldValues[servicedataIndex]');

            }

            console.log(fieldValues, "fieldValues");

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

            console.log(querydata, `querydata`);
            console.log(params, `params`);
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
                let upsertticket = await ticketService.upsertTicketstatus(datavalue)
                console.log(upsertticket, 'datas for ticket updated')
            }
            return result;
        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }

}