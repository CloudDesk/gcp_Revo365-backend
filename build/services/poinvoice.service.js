import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { purchaseOrderService } from "./purchaseorder.service.js";
export var poinvoiceservice;
(function (poinvoiceservice) {
    poinvoiceservice.getPoInvoiceData = async (request) => {
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
                const paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
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
            let queryText = `SELECT * FROM poinvoice ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.log("Error in getPoInvoiceData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    poinvoiceservice.upsertPoInvoice = async (poinvocedata, files, host) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = poinvocedata;
            for (const file of files) {
                upsertFields.invoiceurl = PROTOCOL + "://" + host + "/" + file.filename;
            }
            let amount = 0;
            JSON.parse(upsertFields.paymentdata).forEach((e) => {
                amount += e.paymentamount;
            });
            upsertFields.balanceamount = upsertFields.invoiceamount - amount;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let findindex = fieldNames.indexOf('paymentduedate');
            if (findindex !== -1 && fieldValues[findindex] === 'null') {
                fieldValues[findindex] = null;
            }
            if (id) {
                querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            const updatedValue = await poinvoiceservice.updateInvoiceStatus(result.rows[0]);
            return result;
        }
        catch (error) {
            console.log("Error in upsertPoInvoice data in PO invoice ", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    poinvoiceservice.upsertGcpPoInvoice = async (poinvocedata) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = poinvocedata;
            let amount = 0;
            JSON.parse(upsertFields.paymentdata).forEach((e) => {
                amount += e.paymentamount;
            });
            upsertFields.balanceamount = upsertFields.invoiceamount - amount;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let findindex = fieldNames.indexOf('paymentduedate');
            if (findindex !== -1 && fieldValues[findindex] === 'null') {
                fieldValues[findindex] = null;
            }
            if (id) {
                querydata = `UPDATE poinvoice SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO poinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            const updatedValue = await poinvoiceservice.updateInvoiceStatus(result.rows[0]);
            return result;
        }
        catch (error) {
            console.log("Error in upsertGcpPoInvoice in PO invoice ", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    poinvoiceservice.updateInvoiceStatus = async (poinvocedata) => {
        try {
            let { id, invoiceamount, paymentdata, paymentduedate, invoicestatus, iscreditpayment, } = poinvocedata;
            let total = 0;
            const parsedPaymentData = paymentdata;
            for (let i = 0; i < parsedPaymentData.length; i++) {
                total += parsedPaymentData[i].paymentamount || 0;
            }
            const currentUTCDate = new Date();
            const indiaOffset = 5.5 * 60 * 60 * 1000;
            const currentISTDate = new Date(currentUTCDate.getTime() + indiaOffset);
            const unixTimestampInSeconds = Math.floor(currentISTDate.getTime() / 1000);
            if (invoicestatus === "cancelled") {
                const paidAmount = paymentdata.reduce((sum, payment) => sum + payment.paymentamount, 0);
                const remainingAmount = total - paidAmount;
                paymentdata.forEach(payment => {
                    payment.paymentamount = remainingAmount;
                });
                let modifiedPaymentData = JSON.stringify(paymentdata);
                const result = await query(`UPDATE poinvoice 
               SET invoicestatus = 'cancelled', balanceamount = 0,
               paymentdata = '${modifiedPaymentData}'::jsonb 
               WHERE id = ${id}`, []);
            }
            else if (Number(invoiceamount) - total === 0) {
                if (unixTimestampInSeconds > Number(paymentduedate) &&
                    iscreditpayment === true) {
                    const result = await query(`UPDATE poinvoice SET invoicestatus = 'overdue_complete' where id =${id}`, []);
                }
                else {
                    const result = await query(`UPDATE poinvoice SET invoicestatus = 'complete' where id =${id}`, []);
                }
            }
            else if (total - Number(invoiceamount) !== 0) {
                if (unixTimestampInSeconds > Number(paymentduedate) &&
                    iscreditpayment === true) {
                    const result = await query(`UPDATE poinvoice SET invoicestatus = 'overdue' where id =${id}`, []);
                }
                else {
                    const result = await query(`UPDATE poinvoice SET invoicestatus = 'in_progress' where id =${id}`, []);
                }
            }
            const posetstatus = await purchaseOrderService.updatePoStatus(poinvocedata.ponumber, poinvocedata.pototal, poinvocedata.purchaseorderstatus);
            return 'PO Invoice Status Updated Success';
        }
        catch (error) {
            console.error("An error in updateInvoiceStatus:", error);
            throw error; // Re-throw the error to handle it at a higher level
        }
    };
    poinvoiceservice.deletePoInvoice = async (id) => {
        try {
            const invoiceResult = await query(`SELECT invoiceurl FROM poinvoice WHERE id = $1`, [id]);
            const invoiceUrl = invoiceResult.rows[0].invoiceurl;
            const result = await query(`DELETE FROM poinvoice WHERE id = $1`, [
                id,
            ]);
            if (result.rowCount != 0) {
                return `Purchase Order invoice Deleted Successfully`;
            }
            else {
                return `Purchase Order invoice not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deletePoInvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(poinvoiceservice || (poinvoiceservice = {}));
//# sourceMappingURL=poinvoice.service.js.map