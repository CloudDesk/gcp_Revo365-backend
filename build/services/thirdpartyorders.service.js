import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
import { ordersService } from "./orders.service.js";
export var thirdPartyOrdersService;
(function (thirdPartyOrdersService) {
    thirdPartyOrdersService.getThirdPartyOrderData = async (request) => {
        try {
            console.log("Inside thirdparty service Request Query:", request.query);
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "o.modifieddate";
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
                    if (key === "id") {
                        key = "o.id";
                    }
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} ` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `
            SELECT 
                o.id AS id,
                o.productid AS order_productid,
                o.userid AS order_userid,
                o.addressid AS order_addressid,
                o.createddate AS order_createddate,
                o.modifieddate AS order_modifieddate,
                o.transactionid AS order_transactionId,
                o.orderamount,
                o.orderstatus,
                o.delivereddate,
                o.readytodispatchdate,
                o.dispatcheddate,
                o.cancelleddate,
                o.returneddate,
                o.quantity,
                o.productamount,
                o.discountamount,
                o.orderid,
                a.name, 
                a.state, 
                a.city, 
                a.address,
                a.mobilenumber, 
                a.modifieddate AS address_modifieddate,
                a.createddate AS address_createddate,
                u.useremail, 
                u.usermobilenumber,
                u.modifieddate AS users_modifieddate,
                u.createddate AS users_createddate
            FROM thirdpartyorders o
            LEFT JOIN address a ON o.addressid = a.id
            LEFT JOIN users u ON o.userid = u.id
            ${whereClause}
            ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            console.log('Third party order result:', result);
            console.log('Third party order result1:', result.rows);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getThirdPartyOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    thirdPartyOrdersService.updateThirdPartyOrder = async (data, paymentfailed) => {
        try {
            console.log('Inside thirdPartyOrder with data:', data);
            const orders = data.order;
            const transactionid = data.transactiondata.transactionid;
            const emailid = data.transactiondata.name;
            const updateValuesArray = [];
            for (const order of orders) {
                const orderId = parseInt(order.id, 10); // Ensure it's an integer
                updateValuesArray.push([transactionid, orderId]);
            }
            // console.log('Update Values Array>>:', updateValuesArray);
            if (updateValuesArray.length > 0) {
                // Create the VALUES part dynamically with parameter placeholders
                const valuePlaceholders = updateValuesArray
                    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::integer)`)
                    .join(", ");
                let updateOrderQuery;
                if (!paymentfailed) {
                    console.log("Inside !paymentfailed condition", valuePlaceholders);
                    updateOrderQuery = `
                        UPDATE thirdpartyorders
                        SET transactionid = bulk_data.transactionid,
                             orderstatus= 'ordered',
                            ispaymentsucceed = TRUE
                        FROM (
                            VALUES ${valuePlaceholders}
                        ) AS bulk_data(transactionid, id)
                        WHERE thirdpartyorders.id = bulk_data.id
                        RETURNING *`;
                }
                else {
                    console.log("Inside paymentfailed condition", valuePlaceholders);
                    updateOrderQuery = `
                        UPDATE thirdpartyorders
                        SET transactionid = bulk_data.transactionid,
                             orderstatus= 'payment_failed',
                            ispaymentsucceed = False
                        FROM (
                            VALUES ${valuePlaceholders}
                        ) AS bulk_data(transactionid, id)
                        WHERE thirdpartyorders.id = bulk_data.id
                        RETURNING *`;
                }
                const updateValues = updateValuesArray.flat();
                const updatedOrderResult = await query(updateOrderQuery, updateValues);
                // console.log('-->Updated Order Result:', updatedOrderResult);   
                if (updatedOrderResult.command === 'UPDATE') {
                    console.log('Inside if');
                    let orderlinedata = {
                        thirdpartyorderid: updatedOrderResult.rows[0].id,
                        orderstatus: updatedOrderResult.rows[0].orderstatus
                    };
                    const updatedOrderLineData = await ordersService.updateOrderStatus(orderlinedata, emailid, paymentfailed, true);
                    // console.log('Updated Order Line Data in third party:', updatedOrderLineData);
                    // console.log('Updated Order line after third party');
                    return { data: updatedOrderResult.rows, status: 'success' };
                }
                else {
                    // console.log('Inside else')
                    return { data: `Orders Not Updated Please contact admin`, status: 'failure' };
                }
            }
            else {
                // console.log('Update Values Array is empty, no orders to update.')
                return { data: `No orders to update`, status: 'failure' };
            }
        }
        catch (error) {
            console.error("Error in updateThirdPartyOrder:", error);
            throw error;
        }
    };
    thirdPartyOrdersService.updateThirdPartyOrderStatus = async (data) => {
        try {
            const { id, orderstatus } = data;
            // Allowed statuses admin can set on a 3rd-party order
            const allowedStatuses = ['dispatched', 'shipped', 'delivered', 'cancelled', 'processing', 'ordered'];
            if (!allowedStatuses.includes(orderstatus)) {
                return { error: `Invalid status '${orderstatus}'. Allowed: ${allowedStatuses.join(', ')}` };
            }
            // 1. Update thirdpartyorders row
            const dateField = orderstatus === 'delivered' ? ', delivereddate = EXTRACT(EPOCH FROM NOW())::bigint'
                : orderstatus === 'dispatched' ? ', dispatcheddate = EXTRACT(EPOCH FROM NOW())::bigint'
                    : orderstatus === 'cancelled' ? ', cancelleddate = EXTRACT(EPOCH FROM NOW())::bigint'
                        : '';
            const orderUpdateResult = await query(`UPDATE thirdpartyorders SET orderstatus = $1 ${dateField} WHERE id = $2 RETURNING *`, [orderstatus, id]);
            if (orderUpdateResult.rowCount === 0) {
                return { error: `No thirdpartyorder found with id: ${id}` };
            }
            // 2. Update all linked orderlines to the same status
            const orderlineUpdateResult = await query(`UPDATE orderline SET orderstatus = $1 WHERE thirdpartyorderid = $2 RETURNING *`, [orderstatus, id]);
            // 3. Trigger branch JSONB recompute whenever status changes in a way that
            // affects third-party reserved or fulfilled quantities.
            if (['cancelled', 'shipped', 'delivered', 'ordered', 'processing'].includes(orderstatus) && orderlineUpdateResult.rows.length > 0) {
                const pucSet = new Set();
                for (const row of orderlineUpdateResult.rows) {
                    if (row.puc)
                        pucSet.add(row.puc);
                    else {
                        // Fetch puc from product_revo via productid
                        const pucResult = await query(`SELECT puc FROM product_revo WHERE id = $1 LIMIT 1`, [row.productid]);
                        if (pucResult.rows[0]?.puc)
                            pucSet.add(pucResult.rows[0].puc);
                    }
                }
                if (pucSet.size > 0) {
                    const { stockRevoService } = await import('./stockRevo.service.js');
                    await stockRevoService.testinupdateQuantity(Array.from(pucSet), false);
                }
            }
            return {
                success: true,
                order: orderUpdateResult.rows[0],
                orderlines: orderlineUpdateResult.rows,
                message: `3rd-party order ${id} marked as '${orderstatus}'`
            };
        }
        catch (error) {
            console.error('Error in updateThirdPartyOrderStatus:', error);
            throw error;
        }
    };
})(thirdPartyOrdersService || (thirdPartyOrdersService = {}));
//# sourceMappingURL=thirdpartyorders.service.js.map