import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";

export module purchaseOrderService {

    export const getPurchaseOrderData = async (request: any) => {
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
                    whereClauses.push(`(${key} != $${parameterIndex} OR ${key} IS NULL)`);
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
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM purchaseorder ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result)
            return datatypecheckResult
        } catch (error) {
            console.error("Query Execution Error: IN getPurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const getEachPurchaseOrderData = async (request: any) => {
        try {
            const { id } = request.params
            const queryText = `SELECT * FROM purchaseorder where id = $${1}`;
            const result: QueryResult = await query(queryText, [id]);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getEachPurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const upsertInvoice = async (request: any) => {

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
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    };

    export const updatePoStatus = async (ponumber, total, po_status) => {
        try {
          const purchaseordernumber = ponumber;
    
          const poinvoiceData = await query(
            `SELECT paymentdata FROM poinvoice WHERE ponumber = $1`,
            [purchaseordernumber]
          );
    
          let paymentData = poinvoiceData.rows;
    
          const allPaymentAmounts = paymentData.flatMap((item) =>
            item.paymentdata.map((payment) => payment.paymentamount)
          );
    
          const paidAmount = allPaymentAmounts.reduce(
            (sum, amount) => sum + amount,
            0
          );
          if (po_status === "cancelled") {
            const result = await query(
              `UPDATE purchaseorder SET po_status = 'cancelled' WHERE ponumber ='${purchaseordernumber}'`,
              []
            );
          } else if (po_status === "void") {
            const result = await query(
              `UPDATE purchaseorder SET po_status = 'void' WHERE ponumber ='${purchaseordernumber}'`,
              []
            );
          } else {
            if (paidAmount === Number(total)) {
              const result = await query(
                `UPDATE purchaseorder SET po_status = 'fulfilled' WHERE ponumber ='${purchaseordernumber}'`,
                []
              );
            } else if (paidAmount === 0 || po_status === null) {
              const result = await query(
                `UPDATE purchaseorder SET po_status = 'in_progress' WHERE ponumber ='${purchaseordernumber}'`,
                []
              );
            } else if (paidAmount < Number(total)) {
              const result = await query(
                `UPDATE purchaseorder SET po_status = 'partially_fulfilled' WHERE ponumber ='${purchaseordernumber}'`,
                []
              );
            }
          }
          return "Purchase Order Status Updated Successfully";
        } catch (error) {
            console.error("Query Execution Error: IN updatePoStatus", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
      };

    export const upsertGcpInvoice = async (request: any) => {

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
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    };
    export const deleteUrl = async (request: any) => {

        try {
            const { id } = request.params;
            const { invoiceUrl } = request.body
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
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    };


    export const deletePurchaseOrder = async (id: number) => {
        try {
            const result: any = await query(`DELETE FROM purchaseorder WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} Purchaseorder deleted successfully`;
            } else {
                return `Purchaseorder not found with id ${id}`;
            }
        } catch (error) {
            console.error("Query Execution Error: IN deletePurchaseOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    // export const upsertPurchaseOrder = async (purchaseorderData: any) => {
    //     try {
    //         console.log("Received purchaseorderData:", purchaseorderData);
    //         let querydata: string;
    //         let params: any[];
    //         const { id, product, ...upsertFields } = purchaseorderData;

    //         if (product) {
    //             upsertFields.product = JSON.stringify(product);
    //         }
    //         const fieldNames = Object.keys(upsertFields);
    //         const fieldValues = Object.values(upsertFields);
    //         if (id) {
    //             querydata = `UPDATE purchaseorder SET ${fieldNames
    //                 .map((field, index) => `${field} = $${index + 1}`)
    //                 .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
    //             params = [...fieldValues, id];
    //         } else {
    //             querydata = `INSERT INTO purchaseorder (${fieldNames.join(
    //                 ", "
    //             )}) VALUES (${fieldNames
    //                 .map((_, index) => `$${index + 1}`)
    //                 .join(", ")}) RETURNING *`;
    //             params = fieldValues;
    //         }

    //         const result = await query(querydata, params);
    //         console.log("Query Result in upsertPurchaseOrder:", result.rows);
    //         const pr = result.rows[0].prnumber;
    //         const drStatus = result.rows[0].po_status;
    //         const queryPr = await query(`SELECT demandrequestid, isdemandrequest FROM purchaserequest WHERE prnumber = $1`, [pr]);
    //         console.log("Query Result in upsertQuote:", queryPr.rows);
    //         if(queryPr.rows.length>0 && queryPr.rows[0].isdemandrequest === true){
    //             const updateDR = await query(`UPDATE demandrequest SET postatus = $1 WHERE id = $2 RETURNING *`, [drStatus, queryPr.rows[0].demandrequestid]);
    //             console.log("Update Demand Request Result in upsertQuote:", updateDR.rows);
    //             console.log("Quote Upserted Successfully");
    //         }
    //         return result;
    //     } catch (error) {
    //         console.error("Query Execution Error: IN upsertPurchaseOrder", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //         return ErrorMessage
    //     }
    // }

    export const upsertPurchaseOrder = async (purchaseorderData: any) => {
    try {
        console.log("Received purchaseorderData:", purchaseorderData);

        let querydata: string;
        let params: any[];
        const { id, product, ...upsertFields } = purchaseorderData;

        // Always store product as a string (database consistency)
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
        } else {
            querydata = `INSERT INTO purchaseorder (${fieldNames.join(
                ", "
            )}) VALUES (${fieldNames
                .map((_, index) => `$${index + 1}`)
                .join(", ")}) RETURNING *`;
            params = fieldValues;
        }

        const result = await query(querydata, params);
        console.log("Query Result in upsertPurchaseOrder:", result.rows);

        if (!result.rows.length) throw new Error("No rows returned from po upsert.");

        const row = result.rows[0];
        const ponumber = row.ponumber;
        const poid = row.id;
        const pr = row.prnumber;
        const drStatus = row.po_status;

        // Find related demand request via purchasing request table
        const queryPr = await query(
            `SELECT demandrequestid, isdemandrequest FROM purchaserequest WHERE prnumber = $1`,
            [pr]
        );
        console.log("Query Result in upsertQuote:", queryPr.rows);

        if (
            queryPr.rows.length > 0 &&
            queryPr.rows[0].isdemandrequest === true
        ) {
            const demandRequestId = queryPr.rows[0].demandrequestid;

            // Update postatus on demandrequest (as before)
            const updateDR = await query(
                `UPDATE demandrequest SET postatus = $1 WHERE id = $2 RETURNING *`,
                [drStatus, demandRequestId]
            );
            console.log("Update Demand Request Result in upsertQuote:", updateDR.rows);

            // Fetch demandrequestdata array
            const demandReqRes = await query(
                `SELECT demandrequestdata FROM demandrequest WHERE id = $1`,
                [demandRequestId]
            );
            if (!demandReqRes.rows.length)
                throw new Error(`Demand request ${demandRequestId} not found.`);

            let demandrequestdata = demandReqRes.rows[0].demandrequestdata;
            if (!demandrequestdata) demandrequestdata = [];
            if (typeof demandrequestdata === "string") {
                try {
                    demandrequestdata = JSON.parse(demandrequestdata);
                } catch {
                    demandrequestdata = [];
                }
            }

            // Patch ponumber, poid, and postatus ONLY for matching prnumber inside demandrequestdata.prdata
            let updated = false;
            if (Array.isArray(demandrequestdata)) {
                demandrequestdata = demandrequestdata.map(item => {
                    if (Array.isArray(item.prdata)) {
                        const newPrdata = item.prdata.map(pritem => {
                            if (pritem.prnumber === pr) {
                                updated = true;
                                return {
                                    ...pritem,
                                    ponumber,
                                    poid,
                                    postatus: drStatus
                                };
                            }
                            return pritem;
                        });
                        return { ...item, prdata: newPrdata };
                    }
                    return item;
                });
            }

            if (updated) {
                await query(
                    `UPDATE demandrequest SET demandrequestdata = $1 WHERE id = $2`,
                    [JSON.stringify(demandrequestdata), demandRequestId]
                );
                console.log(
                    "Updated demandrequestdata.prdata with ponumber, poid, and postatus for prnumber:",
                    pr
                );
            }
        }

        return result;
    } catch (error) {
        console.error("Query Execution Error: IN upsertPurchaseOrder", error);
        let ErrorMessage = await ErrorHandler.handleQueryError(error);
        return ErrorMessage;
    }
};



}