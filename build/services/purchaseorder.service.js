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
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getPurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    purchaseOrderService.getEachPurchaseOrderData = async (request) => {
        try {
            const { id } = request.params;
            const queryText = `SELECT * FROM purchaseorder where id = $${1}`;
            const result = await query(queryText, [id]);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getEachPurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
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
            });
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
            let data = await query(updateQuery, params);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertInvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    purchaseOrderService.updatePoStatus = async (ponumber, total, po_status) => {
        try {
            const purchaseordernumber = ponumber;
            const poinvoiceData = await query(`SELECT paymentdata FROM poinvoice WHERE ponumber = $1`, [purchaseordernumber]);
            let paymentData = poinvoiceData.rows;
            const allPaymentAmounts = paymentData.flatMap((item) => item.paymentdata.map((payment) => payment.paymentamount));
            const paidAmount = allPaymentAmounts.reduce((sum, amount) => sum + amount, 0);
            if (po_status === "cancelled") {
                const result = await query(`UPDATE purchaseorder SET po_status = 'cancelled' WHERE ponumber ='${purchaseordernumber}'`, []);
            }
            else if (po_status === "void") {
                const result = await query(`UPDATE purchaseorder SET po_status = 'void' WHERE ponumber ='${purchaseordernumber}'`, []);
            }
            else {
                if (paidAmount === Number(total)) {
                    const result = await query(`UPDATE purchaseorder SET po_status = 'fulfilled' WHERE ponumber ='${purchaseordernumber}'`, []);
                }
                else if (paidAmount === 0 || po_status === null) {
                    const result = await query(`UPDATE purchaseorder SET po_status = 'in_progress' WHERE ponumber ='${purchaseordernumber}'`, []);
                }
                else if (paidAmount < Number(total)) {
                    const result = await query(`UPDATE purchaseorder SET po_status = 'partially_fulfilled' WHERE ponumber ='${purchaseordernumber}'`, []);
                }
            }
            return "Purchase Order Status Updated Successfully";
        }
        catch (error) {
            console.error("Query Execution Error: IN updatePoStatus", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    purchaseOrderService.upsertGcpInvoice = async (request) => {
        try {
            const { id } = request.params;
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
            let data = await query(updateQuery, params);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertGcpInvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
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
            let data = await query(updateQuery, params);
            return data;
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteUrl", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
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
            return ErrorMessage;
        }
    };
    purchaseOrderService.upsertPurchaseOrder = async (purchaseorderData) => {
        try {
            let querydata;
            let params;
            const { id, product, ...upsertFields } = purchaseorderData;
            if (product) {
                upsertFields.product = JSON.stringify(product);
            }
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
            const pr = result.rows[0].prnumber;
            const drStatus = result.rows[0].po_status;
            const queryPr = await query(`SELECT demandrequestid, isdemandrequest FROM purchaserequest WHERE prnumber = $1`, [pr]);
            console.log("Query Result in upsertQuote:", queryPr.rows);
            if (queryPr.rows.length > 0 && queryPr.rows[0].isdemandrequest === true) {
                const updateDR = await query(`UPDATE demandrequest SET postatus = $1 WHERE id = $2 RETURNING *`, [drStatus, queryPr.rows[0].demandrequestid]);
                console.log("Update Demand Request Result in upsertQuote:", updateDR.rows);
                console.log("Quote Upserted Successfully");
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertPurchaseOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(purchaseOrderService || (purchaseOrderService = {}));
//# sourceMappingURL=purchaseorder.service.js.map