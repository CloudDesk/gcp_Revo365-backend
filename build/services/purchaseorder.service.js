import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
export var purchaseOrderService;
(function (purchaseOrderService) {
    purchaseOrderService.getPurchaseOrderData = async (request) => {
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
                    whereClauses.push(`(${key} != $${parameterIndex} OR ${key} IS NULL)`);
                    console.log(whereClauses, 'whereClause');
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
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM purchaseorder ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            console.log("Query Text:", queryText);
            console.log("Query Params:", queryParams);
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getPurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    purchaseOrderService.getEachPurchaseOrderData = async (request) => {
        try {
            const { id } = request.params;
            const queryText = `SELECT * FROM purchaseorder where id = $${1}`;
            const result = await query(queryText, [id]);
            // console.log(result);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getEachPurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    purchaseOrderService.upsertInvoice = async (request) => {
        try {
            const { id } = request.params;
            let fileurlarray = [];
            request.files.forEach((element) => {
                let fileurl = request.protocol + "://" + request.headers.host + '/' + element.filename;
                fileurlarray.push(fileurl);
                console.log(fileurl, 'File url is');
            });
            console.log(fileurlarray);
            const fetchQuery = `
            SELECT invoiceurl
            FROM purchaseorder
            WHERE id = $1;
            `;
            let currentUrls;
            const result = await query(fetchQuery, [id]);
            currentUrls = result.rows[0].invoiceurl || [];
            const combinedUrls = currentUrls.concat(fileurlarray);
            const updateQuery = `
            UPDATE purchaseorder
            SET invoiceurl = $1
            WHERE id = $2;
            `;
            let params = [combinedUrls, id];
            console.log(updateQuery);
            let data = await query(updateQuery, params);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertInvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    purchaseOrderService.upsertGcpInvoice = async (request) => {
        try {
            const { id } = request.params;
            // let fileurlarray = [];
            // request.files.forEach((element) => {
            //     let fileurl = request.protocol + "://" + request.headers.host + '/' + element.filename;
            //     fileurlarray.push(fileurl);
            //     console.log(fileurl, 'File url is');
            // });
            // console.log(fileurlarray);
            const fetchQuery = `
            SELECT invoiceurl
            FROM purchaseorder
            WHERE id = $1;
            `;
            let currentUrls;
            const result = await query(fetchQuery, [id]);
            currentUrls = result.rows[0].invoiceurl || [];
            const combinedUrls = currentUrls.concat(request.body.invoiceUrl);
            const updateQuery = `
            UPDATE purchaseorder
            SET invoiceurl = $1
            WHERE id = $2;
            `;
            let params = [combinedUrls, id];
            console.log(updateQuery);
            let data = await query(updateQuery, params);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertInvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    purchaseOrderService.deleteUrl = async (request) => {
        try {
            const { id } = request.params;
            const { invoiceUrl } = request.body;
            const updateQuery = `
            UPDATE purchaseorder
            SET invoiceurl = $1
            WHERE id = $2;
            `;
            let params = [invoiceUrl, id];
            console.log(updateQuery);
            let data = await query(updateQuery, params);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteUrl", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    purchaseOrderService.deletePurchaseOrder = async (id) => {
        try {
            const result = await query(`DELETE FROM purchaseorder WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} Purchaseorder deleted successfully`;
            }
            else {
                return `Purchaseorder not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deletePurchaseOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    purchaseOrderService.upsertPurchaseOrder = async (purchaseorderData) => {
        try {
            console.log(purchaseorderData, 'data');
            let querydata;
            let params;
            const { id, product, ...upsertFields } = purchaseorderData;
            if (product) {
                upsertFields.product = JSON.stringify(product);
            }
            console.log(upsertFields);
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE purchaseorder SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO purchaseorder (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            console.log(result.command, 'Result is');
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertPurchaseOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(purchaseOrderService || (purchaseOrderService = {}));
//# sourceMappingURL=purchaseorder.service.js.map