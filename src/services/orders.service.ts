import pool, { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import { stockRevoService } from "./stockRevo.service.js";
import { productrevoService } from "./productrevo.service.js";
import { inventoryReservationService } from "./inventoryReservation.service.js";
import { cancelShiprocketOrderForMerchant } from "./shiprocket.service.js";
import { sendTransactionalMail } from "../Gmail/gmail.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";
import { accessScopeService } from "./accessScope.service.js";


export module ordersService {
    let orderlineColumnCache: Set<string> | null = null;

    const executeQuery = async (runner: any, stmt: string, params: any[] = []) => {
        if (runner?.query) {
            return await runner.query(stmt, params);
        }
        return await query(stmt, params);
    };

    const getOrderlineInsertableColumns = async (runner?: any) => {
        if (orderlineColumnCache) {
            return orderlineColumnCache;
        }

        const result = await executeQuery(
            runner,
            `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'orderline'
            `,
            []
        );

        orderlineColumnCache = new Set(
            (result.rows || []).map((row: any) => String(row.column_name))
        );
        return orderlineColumnCache;
    };

    const toSafeNumber = (value: any, fallback = 0): number => {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : fallback;
    };

    const roundCurrency = (value: any): number =>
        Math.round((toSafeNumber(value, 0) + Number.EPSILON) * 100) / 100;

    const roundPayableAmount = (value: any): number =>
        Math.round(roundCurrency(value));

    const normalizeTaxCalculationMode = (value: any): 'inclusive' | 'exclusive' => {
        const normalizedValue = String(value || '').trim().toLowerCase();
        return normalizedValue === 'exclusive' ? 'exclusive' : 'inclusive';
    };

    const normalizeAddressSnapshot = (value: any) => {
        if (!value) return null;
        if (typeof value === 'object' && !Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed
                    : null;
            } catch {
                return null;
            }
        }
        return null;
    };

    const ORDER_STATUS_RANK: Record<string, number> = {
        payment_failed: 0,
        ordered: 10,
        processing: 20,
        ready_to_dispatch: 30,
        dispatched: 40,
        shipped: 50,
        delivered: 60,
        returned: 70,
        cancelled: 80,
        sold: 90,
    };

    const PRE_DISPATCH_RESERVATION_STATUSES = new Set([
        "ordered",
        "processing",
        "payment_pending",
        "pending",
        "pending_payment",
    ]);

    const TERMINAL_ORDER_STATUSES = new Set([
        "cancelled",
        "delivered",
        "payment_failed",
        "returned",
        "sold",
    ]);

    const normalizeOrderStatus = (status: any): string =>
        String(status || "").trim().toLowerCase();

    const BIGINT_NOW_SQL = `EXTRACT(EPOCH FROM NOW())::bigint`;
    const LATEST_RETURN_REQUEST_SELECT_SQL = `
            lrr.return_request_id,
            lrr.return_request_status,
            lrr.return_request_source,
            lrr.return_reason_id,
            lrr.return_reason_code,
            lrr.return_reason_label,
            lrr.return_reason_text,
            lrr.return_customer_comment,
            lrr.return_admin_comment,
            lrr.return_requested_at,
            lrr.return_approved_at,
            lrr.return_rejected_at,
            lrr.return_received_at,
            lrr.return_finalized_at,
            lrr.return_refund_status,
            lrr.return_refund_reference,
            lrr.return_restock_disposition
    `;
    const LATEST_RETURN_REQUEST_JOIN_SQL = `
        LEFT JOIN LATERAL (
            SELECT
                rr.id AS return_request_id,
                rr.status AS return_request_status,
                rr.request_source AS return_request_source,
                rr.reason_id AS return_reason_id,
                rr.reason_code AS return_reason_code,
                rr.reason_label AS return_reason_label,
                rr.reason_text AS return_reason_text,
                rr.customer_comment AS return_customer_comment,
                rr.admin_comment AS return_admin_comment,
                rr.requested_at AS return_requested_at,
                rr.approved_at AS return_approved_at,
                rr.rejected_at AS return_rejected_at,
                rr.received_at AS return_received_at,
                rr.finalized_at AS return_finalized_at,
                rr.refund_status AS return_refund_status,
                rr.refund_reference AS return_refund_reference,
                rr.restock_disposition AS return_restock_disposition
            FROM orderline_returns rr
            WHERE rr.orderlineid = orderline.id
            ORDER BY rr.created_at DESC, rr.id DESC
            LIMIT 1
        ) AS lrr ON TRUE
    `;
    const LATEST_REFUND_SELECT_SQL = `
            lrf.refund_id,
            lrf.refund_status,
            lrf.refund_gateway_status,
            lrf.refund_amount_paise,
            lrf.refund_currency,
            lrf.refund_reason_code,
            lrf.refund_reason_text,
            lrf.refund_admin_note,
            lrf.razorpay_refund_id,
            lrf.refund_created_at,
            lrf.refund_synced_at,
            rfs.refund_count,
            rfs.total_refund_amount_paise
    `;
    const LATEST_REFUND_JOIN_SQL = `
        LEFT JOIN LATERAL (
            SELECT
                pr.id AS refund_id,
                pr.status AS refund_status,
                pr.gateway_status AS refund_gateway_status,
                pr.amount_paise AS refund_amount_paise,
                pr.currency AS refund_currency,
                pr.reason_code AS refund_reason_code,
                pr.reason_text AS refund_reason_text,
                pr.admin_note AS refund_admin_note,
                pr.razorpay_refund_id,
                pr.created_at AS refund_created_at,
                pr.synced_at AS refund_synced_at
            FROM payment_refunds pr
            WHERE pr.orderlineid = orderline.id
            ORDER BY pr.created_at DESC, pr.id DESC
            LIMIT 1
        ) AS lrf ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*)::int AS refund_count,
                COALESCE(SUM(pr.amount_paise), 0)::bigint AS total_refund_amount_paise
            FROM payment_refunds pr
            WHERE pr.orderlineid = orderline.id
              AND pr.status = ANY(ARRAY['initiated', 'pending', 'processed', 'manual_done']::text[])
        ) AS rfs ON TRUE
    `;

    const getLifecycleTimestampAssignment = (status: string) => {
        switch (normalizeOrderStatus(status)) {
            case "ready_to_dispatch":
                return `readytodispatchdate = COALESCE(readytodispatchdate, ${BIGINT_NOW_SQL})`;
            case "dispatched":
            case "shipped":
                return `dispatcheddate = COALESCE(dispatcheddate, ${BIGINT_NOW_SQL})`;
            case "delivered":
                return `delivereddate = COALESCE(delivereddate, ${BIGINT_NOW_SQL})`;
            case "cancelled":
                return `cancelleddate = COALESCE(cancelleddate, ${BIGINT_NOW_SQL})`;
            case "returned":
                return `returneddate = COALESCE(returneddate, ${BIGINT_NOW_SQL})`;
            default:
                return "";
        }
    };

    const deriveHeaderStatusFromLineRows = (lineRows: any[]) => {
        const normalizedStatuses = lineRows
            .map((row) => normalizeOrderStatus(row?.orderstatus))
            .filter(Boolean);

        if (normalizedStatuses.length === 0) {
            return "ordered";
        }

        const activeStatuses = normalizedStatuses.filter(
            (status) => !["cancelled", "payment_failed", "returned"].includes(status)
        );

        if (activeStatuses.length === 0) {
            if (normalizedStatuses.every((status) => status === "payment_failed")) {
                return "payment_failed";
            }
            if (normalizedStatuses.every((status) => status === "cancelled")) {
                return "cancelled";
            }
            if (normalizedStatuses.every((status) => status === "returned")) {
                return "returned";
            }
            return normalizedStatuses[0];
        }

        const rankedStatuses = activeStatuses
            .map((status) => ({
                status,
                rank: ORDER_STATUS_RANK[status] ?? ORDER_STATUS_RANK.ordered,
            }))
            .sort((left, right) => right.rank - left.rank);

        return rankedStatuses[0]?.status || "ordered";
    };

    const qualifyOrderlineFilterColumn = (rawKey: string): string => {
        const key = String(rawKey || "").trim();
        if (!key) return key;
        if (key.includes(".") || key.includes("(") || key.includes(")") || key.includes(" ")) {
            return key;
        }
        return `orderline.${key}`;
    };

    const getOrderLinesForUniqueOrderId = async (uniqueorderid: string) => {
        if (!uniqueorderid) return [];
        const lineResult = await query(
            `SELECT id, uniqueorderid, orderlinenumber, orderid, thirdpartyorderid, merchanttransactionid, ordertype, orderstatus, productid, quantity, ordername, userid, orderamount, deliveryfrom
             FROM orderline
             WHERE uniqueorderid = $1`,
            [uniqueorderid]
        );
        return lineResult.rows;
    };

    const syncSingleHeaderStatusFromLines = async (uniqueorderid: string, orderTypeHint?: string | null) => {
        if (!uniqueorderid) return null;

        const lineRows = await getOrderLinesForUniqueOrderId(uniqueorderid);
        if (lineRows.length === 0) return null;

        const normalizedOrderType = String(
            orderTypeHint || lineRows[0]?.ordertype || "Orders"
        ).trim().toLowerCase();
        const tableName = normalizedOrderType === "third party orders" ? "thirdpartyorders" : "orders";
        const derivedStatus = deriveHeaderStatusFromLineRows(lineRows);
        const timestampAssignment = getLifecycleTimestampAssignment(derivedStatus);
        const deliveryFromCandidates = Array.from(
            new Set(
                lineRows
                    .map((row) => (typeof row?.deliveryfrom === "string" ? row.deliveryfrom.trim() : row?.deliveryfrom))
                    .filter(Boolean)
            )
        );
        const resolvedDeliveryFrom = deliveryFromCandidates.length === 1 ? deliveryFromCandidates[0] : null;

        const updateClauses = [`orderstatus = $1`];
        const params: any[] = [derivedStatus, uniqueorderid];

        if (timestampAssignment) {
            updateClauses.push(timestampAssignment);
        }

        if (resolvedDeliveryFrom && tableName === "orders") {
            updateClauses.push(`deliveryfrom = COALESCE(NULLIF(deliveryfrom, ''), $3)`);
            params.push(resolvedDeliveryFrom);
        }

        const updateQuery = `
            UPDATE ${tableName}
            SET ${updateClauses.join(", ")}
            WHERE orderid = $2
            RETURNING *
        `;

        const result = await query(updateQuery, params);
        return result.rows[0] || null;
    };

    export const syncOrderHeadersFromOrderLines = async (uniqueOrderIds: string[]) => {
        const dedupedOrderIds = Array.from(new Set((uniqueOrderIds || []).filter(Boolean)));
        const updatedHeaders: any[] = [];

        for (const uniqueorderid of dedupedOrderIds) {
            const header = await syncSingleHeaderStatusFromLines(uniqueorderid);
            if (header) {
                updatedHeaders.push(header);
            }
        }

        return updatedHeaders;
    };

    export const buildFulfillmentBuckets = async (
        orderData: any[],
        merchantTransactionId?: string | null
    ) => {
        const productIds = Array.from(
            new Set((orderData || []).map((item) => Number(item?.productid)).filter((id) => Number.isFinite(id) && id > 0))
        );

        if (productIds.length === 0) {
            return {
                ordersToInsert: [] as any[],
                thirdPartyOrdersToInsert: [] as any[],
                validationErrors: [] as any[],
            };
        }

        const quantityResult = await query(
            `
            SELECT id AS productid, overallavailableqty, rentalavailablequantity
            FROM product_revo
            WHERE id = ANY($1::int[])
            `,
            [productIds]
        );
        const heldRows = await inventoryReservationService.getHeldReservationTotalsByProduct(
            productIds,
            merchantTransactionId || null
        );

        const heldByKey = new Map<string, number>();
        heldRows.forEach((row: any) => {
            heldByKey.set(
                `${row.productid}::${row.reservation_type}`,
                Number(row.held_quantity) || 0
            );
        });

        const remainingByKey = new Map<string, number>();
        quantityResult.rows.forEach((row: any) => {
            const productId = Number(row.productid);
            const normalRemaining = Math.max(
                0,
                (Number(row.overallavailableqty) || 0) - (heldByKey.get(`${productId}::product`) || 0)
            );
            const rentalRemaining = Math.max(
                0,
                (Number(row.rentalavailablequantity) || 0) - (heldByKey.get(`${productId}::rental`) || 0)
            );
            remainingByKey.set(`${productId}::product`, normalRemaining);
            remainingByKey.set(`${productId}::rental`, rentalRemaining);
        });

        const ordersToInsert: any[] = [];
        const thirdPartyOrdersToInsert: any[] = [];
        const validationErrors: any[] = [];

        for (const item of orderData || []) {
            const productId = Number(item?.productid);
            const quantity = Number(item?.quantity);
            if (!Number.isFinite(productId) || productId <= 0) continue;
            if (!Number.isFinite(quantity) || quantity <= 0) continue;

            const isRental =
                String(item?.invoicefor || '').toLowerCase().trim() === 'product rental' ||
                String(item?.ordername || '').toLowerCase().trim() === 'rental';
            const reservationKey = `${productId}::${isRental ? 'rental' : 'product'}`;
            const remainingCapacity = remainingByKey.get(reservationKey) || 0;

            if (isRental) {
                if (quantity > remainingCapacity) {
                    validationErrors.push({
                        productid: productId,
                        requestedQuantity: quantity,
                        availableQuantity: remainingCapacity,
                        reason: 'Insufficient rental inventory',
                    });
                    continue;
                }

                ordersToInsert.push({ ...item, quantity });
                remainingByKey.set(reservationKey, Math.max(0, remainingCapacity - quantity));
                continue;
            }

            const internalQuantity = Math.min(quantity, remainingCapacity);
            if (internalQuantity > 0) {
                ordersToInsert.push({ ...item, quantity: internalQuantity });
            }

            const thirdPartyQuantity = quantity - internalQuantity;
            if (thirdPartyQuantity > 0) {
                thirdPartyOrdersToInsert.push({ ...item, quantity: thirdPartyQuantity });
            }

            remainingByKey.set(reservationKey, Math.max(0, remainingCapacity - internalQuantity));
        }

        return {
            ordersToInsert,
            thirdPartyOrdersToInsert,
            validationErrors,
        };
    };
    const normalizeComparableText = (value: any) =>
        String(value ?? "").trim().toLowerCase();

    const isLikelyEmailAddress = (value: any) => {
        const normalized = String(value ?? "").trim();
        return normalized.includes("@") && normalized.includes(".");
    };

    const sendOrderCancellationEmail = async (userid: any, orderId: any, orderAmount: any) => {
        if (!userid) return;

        const getuser = await query(`SELECT useremail FROM users WHERE id = $1 LIMIT 1`, [userid]);
        const useremail = getuser.rows[0]?.useremail;
        if (!useremail) return;

        const template = emailTemplates.orders.cancelled;
        await sendTransactionalMail({
            to: useremail,
            subject: template.subject,
            text: template.text
                .replace("{orderId}", String(orderId ?? ""))
                .replace("{orderAmount}", String(orderAmount ?? "")),
        });
    };

    export const getlatestOrderData = async (request: any) => {
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
            const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} ` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

            let queryText = `SELECT * FROM orders ${whereClause} ${orderByClause}`;

            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }

            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result)
            return datatypeCheckResult
        } catch (error) {
            console.error("Query Execution Error: IN getlatestOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };


    export const getOrderData = async (request: any) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses: string[] = [];
            let parameterIndex = 1;
            const queryParams: any[] = [];
            let orderByField = "o.modifieddate";
            let orderByDirection = "DESC";

            keys.forEach((key, index) => {
                const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
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
                } else if (key !== "page" && key !== "count") {
                    if (key === "id") {
                        key = "o.id";
                    }
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });

            parameterIndex = await accessScopeService.appendVendorCustomerColumnScope(
                request,
                whereClauses,
                queryParams,
                parameterIndex,
                { tableAlias: "o", customerColumn: "userid" }
            );

            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} ` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            // Updated query to include JOIN with address and user tables
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
                CASE
                    WHEN LOWER(COALESCE(o.ordername, '')) = 'rental'
                         AND COALESCE(active_rental.active_billing_line_count, 0) > 0
                    THEN active_rental.active_rental_orderamount
                    ELSE o.orderamount
                END AS displayorderamount,
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
                o.sgst,
                o.cgst,
                o.igst,
                o.taxmode,
                o.taxcalculationmode,
                o.customertaxstate,
                o.customertaxpincode,
                o.billingaddresssnapshot,
                o.shippingaddresssnapshot,
                invoice as invoiceurl,
                invoicecreateddate,
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
                u.createddate AS users_createddate,
                rr.return_request_id,
                rr.return_request_status,
                rr.return_request_reason_label,
                rr.return_request_requested_at,
                rr.return_request_count
                FROM orders o
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) FILTER (
                            WHERE COALESCE(ol.isactivebillingline, TRUE) = TRUE
                        ) AS active_billing_line_count,
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN COALESCE(ol.isactivebillingline, TRUE) = TRUE
                                    THEN COALESCE(
                                        NULLIF(TRIM(CAST(ol.orderamount AS TEXT)), ''),
                                        '0'
                                    )::numeric
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS active_rental_orderamount
                    FROM orderline ol
                    WHERE ol.uniqueorderid = o.orderid
                      AND LOWER(COALESCE(ol.ordername, o.ordername, '')) = 'rental'
                ) AS active_rental ON TRUE
                LEFT JOIN address a ON o.addressid = a.id
                LEFT JOIN users u ON o.userid = u.id
               LEFT JOIN (
    SELECT orderid, invoiceurl, createddate AS invoicecreateddate
    FROM (
        SELECT orderid, invoiceurl, createddate,
               ROW_NUMBER() OVER (PARTITION BY orderid ORDER BY createddate DESC) AS rn
        FROM revoinvoice
    ) AS ranked
    WHERE rn = 1
) AS invoice ON o.orderid = invoice.orderid
                LEFT JOIN LATERAL (
                    SELECT
                        rr.id AS return_request_id,
                        rr.status AS return_request_status,
                        rr.reason_label AS return_request_reason_label,
                        rr.requested_at AS return_request_requested_at,
                        counts.return_request_count
                    FROM orderline_returns rr
                    JOIN orderline ol ON ol.id = rr.orderlineid
                    CROSS JOIN (
                        SELECT COUNT(*)::integer AS return_request_count
                        FROM orderline_returns rr_count
                        JOIN orderline ol_count ON ol_count.id = rr_count.orderlineid
                        WHERE ol_count.uniqueorderid = o.orderid
                    ) AS counts
                    WHERE ol.uniqueorderid = o.orderid
                    ORDER BY rr.created_at DESC, rr.id DESC
                    LIMIT 1
                ) AS rr ON TRUE
                ${whereClause}
                ${orderByClause}`;

            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }

            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            datatypeCheckResult.forEach((element: any) => {
                if (element.invoiceurl) {
                    element.invoiceurl = element.invoiceurl.split(',')[1]
                }
            }
            )
            return datatypeCheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };

    export const getUserOrderData = async (request: any) => {
        try {
            const userId = request.query.userid;
            const pageNumber = request.query.page;
            const recordCount = request.query.count;
            const queryParams = [];
            let whereClauses = [];
            let offset: any;
            let parameterIndex = 1;

            // Construct WHERE clauses and query parameters
            Object.entries(request.query).forEach(([key, value], index) => {
                if (key !== "page" && key !== "count") {
                    const paramValues = Array.isArray(value) ? value : [value];

                    if (key === "createddate" || key === "delivereddate") {
                        if (key === "createddate") {
                            key = "o.createddate";

                        }
                        else if (key === "delivereddate") {
                            key = "o.delivereddate";
                        }

                        let rangeWhereClause = paramValues
                            .map((range) => {
                                const [lowerBound, upperBound] = range.split("-");
                                queryParams.push(lowerBound, upperBound);
                                const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
                                    })`;
                                parameterIndex += 2;
                                return clause;
                            })
                            .join(" OR ");
                        whereClauses.push(`(${rangeWhereClause})`);
                    } else {
                        const formattedKey =
                            key.toLowerCase() === "userid" ? "o.userid" :
                                key.toLowerCase() === "id" ? "o.id" :
                                    key;
                        whereClauses.push(
                            `(${paramValues
                                .map((_, idx) => `${formattedKey} = $${parameterIndex + idx}`)
                                .join(" OR ")})`
                        );
                        queryParams.push(...paramValues);
                        parameterIndex += paramValues.length; // Increment parameter index
                    }
                }
            });
            // Calculate offset
            if (pageNumber && recordCount) {
                offset = (pageNumber - 1) * recordCount;
            }

            // Construct the main query text
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
                o.sgst,
                o.cgst,
                o.igst,
                o.taxmode,
                o.taxcalculationmode,
                o.customertaxstate,
                o.customertaxpincode,
                o.billingaddresssnapshot,
                o.shippingaddresssnapshot,
                o.orderid,
                ri.invoiceurl AS invoiceurl,
                r.starrating AS rating_starrating,
                r.comments AS rating_comments,
                r.createddate AS rating_createddate,
                r.modifieddate AS rating_modifieddate,
                s.serialnumber AS stock_serialnumber,
                s.rfid AS stock_rfid,
                a.id AS address_id,
                a.userid AS address_userid,
                a."name" AS address_name,
                a.mobilenumber AS address_mobilenumber,
                a.pincode AS address_pincode,
                a.doornumber AS address_doornumber,
                a.landmark AS address_landmark,
                a.state AS address_state,
                a.city AS address_city,
                a.createddate AS address_createddate,
                a.modifieddate AS address_modifieddate,
                p.id AS products_id,
                p.productname AS products_productname,
                p."large" AS products_large,
                p.medium AS products_medium,
                p.small AS products_small,
                p.price AS products_price,
                p.colour AS products_colour,
                p.category AS products_category,
                p.averagerating AS products_averagerating,
                p.brand AS products_brand,
                p.model AS products_model,
                p.orderedquantity AS products_orderedquantity,
                p.warranty AS products_warranty
            FROM 
                orders o
            JOIN 
            product_revo p ON o.productid = p.id
            JOIN 
                address a ON o.addressid = a.id
            Left JOIN 
                rating r ON o.id = r.orderid
            Left JOIN 
                stock_revo s ON o.orderid = s.orderid
            Left JOIN 
                revoinvoice ri ON o.orderid = ri.orderid
                `;

            if (whereClauses.length > 0) {
                queryText += ` WHERE ${whereClauses.join(" AND ")}`;
            }
            queryText += " ORDER BY o.modifieddate DESC";

            if (offset != null && recordCount != null) {
                queryText += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2
                    }`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            const dataTypeCheckResult = await dataTypeCheck(result);
            return dataTypeCheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getUserOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };



    export const getOrderlineDynamic = async (request) => {
        try {
            const userid = request.query.userid;
            const pageNumber = request.query.page;
            const recordCount = request.query.count;
            const queryParams = [];
            let whereClauses = [];
            let offset: any;
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
                        const clauses = [];
                        paramValues.forEach((val) => {
                            if (String(val).toLowerCase() === 'null') {
                                clauses.push(`${key} IS NULL`);
                            } else {
                                clauses.push(`${key} = $${parameterIndex}`);
                                queryParams.push(val);
                                parameterIndex++;
                            }
                        });
                        whereClauses.push(`(${clauses.join(" OR ")})`);
                    }
                }
            });

            if (pageNumber && recordCount) {
                offset = (pageNumber - 1) * recordCount;
            }

            let querydata = `SELECT * FROM orderline`;
            if (whereClauses.length > 0) {
                querydata += ` WHERE ${whereClauses.join(" AND ")} ORDER BY modifieddate DESC`;
            }
            else {
                querydata += ` ORDER BY modifieddate DESC`;
            }

            if (offset != null && recordCount != null) {
                querydata += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            let data = await query(querydata, queryParams)

            if (data.rows.length === 0) {
                return data.rows;
            }

            // get invoiceurl
            const invoiceQuery = `
                    SELECT DISTINCT r.invoiceurl, r.orderid
                    FROM revoinvoice AS r
                    JOIN orderline AS o ON r.orderid = o.uniqueorderid
                    WHERE o.userid = $1 AND r.invoicefor = 'product';
                `
            const invoiceurldata = await query(invoiceQuery, [userid])
            const invoiceMap = new Map(invoiceurldata.rows.map(row => [row.orderid, row.invoiceurl]));

            data.rows = data.rows.map(row => ({
                ...row,
                invoiceurl: invoiceMap.get(row.uniqueorderid) || null
            }));

            // Fetch product images
            if (data.rows.length > 0) {
                const productIds = data.rows.map(row => row.productid).filter(id => id != null);
                if (productIds.length > 0) {
                    const productImageParams = productIds.map((_, idx) => `$${idx + 1}`).join(',');
                    const productimagequery = `
                        SELECT p.id, p.small, p.medium, p.large
                        FROM product_revo AS p
                        WHERE p.id IN (${productImageParams})`;
                    const productimage = await query(productimagequery, productIds);

                    // Create a map of product images
                    const productImageMap = new Map(productimage.rows.map(row => [row.id, {
                        small: row.small,
                        medium: row.medium,
                        large: row.large
                    }]));

                    data.rows = data.rows.map(row => ({
                        ...row,
                        productImages: productImageMap.get(row.productid) || {
                            small: null,
                            medium: null,
                            large: null
                        }
                    }));
                } else {
                    // No product IDs, add empty product images
                    data.rows = data.rows.map(row => ({
                        ...row,
                        productImages: {
                            small: null,
                            medium: null,
                            large: null
                        }
                    }));
                }
            }

            return data.rows
        } catch (error) {
            console.error("Query Execution Error: IN getOrderlineDynamic", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    //     export const getOrderLineData = async (request) => {

    //         try {
    //             const pageNumber = parseInt(request.query.page) || 1;
    //             const recordCount = parseInt(request.query.count) || 5000;
    //             const keys = Object.keys(request.query);
    //             const values = Object.values(request.query);

    //             let whereClauses: string[] = [];
    //             let parameterIndex = 1;
    //             const queryParams: any[] = [];
    //             let orderByField = "modifieddate";
    //             let orderByDirection = "DESC";

    //             keys.forEach((key, index) => {
    //                 const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
    //                 if (key === "delivereddate" || key === "price") {
    //                     const rangeClauses = paramValues.map(range => {
    //                         const [lowerBound, upperBound] = range.split("-");
    //                         queryParams.push(lowerBound, upperBound);
    //                         return `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
    //                     });
    //                     whereClauses.push(`(${rangeClauses.join(" OR ")})`);
    //                     parameterIndex += 2 * paramValues.length;
    //                 } else if (key === "sortby") {
    //                     const [fieldName, direction] = paramValues[0].split("-");
    //                     orderByField = fieldName;
    //                     orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
    //                 } else if (paramValues[0].startsWith("NOT ")) {
    //                     const cleanValue = paramValues[0].slice(4);
    //                     whereClauses.push(`(${key} != $${parameterIndex})`);
    //                     queryParams.push(cleanValue);
    //                     parameterIndex++;
    //                 } else if (key !== "page" && key !== "count") {
    //                     if (key === "userid") {
    //                         key = "orderline.userid";

    //                     }
    //                     const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
    //                     whereClauses.push(`(${clauses.join(" OR ")})`);
    //                     queryParams.push(...paramValues);
    //                     parameterIndex += paramValues.length;
    //                 }
    //             });

    //             const offset = (pageNumber - 1) * recordCount;
    //             const baseConditions = `orderline.orderstatus !=  'payment_failed' AND orderline.orderstatus !=  'order_processing' `;
    //             const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
    //             const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
    //             let queryText = `SELECT orderline.*, invoice.invoiceurl, revorating.starrating, revorating.comments AS rating_comments,revorating.url AS rating_images,
    //             revorating.id AS ratingids,a.name AS address_name,a.mobilenumber AS address_mobilenumber,a.pincode address_pincode,a.doornumber AS address_doornumber,
    //             a.address AS address_address,a.landmark AS address_landmark,a.state AS address_state ,a.city AS address_city
    // FROM orderline
    // JOIN  address a on orderline.addressid = a.id
    // LEFT JOIN (
    //     SELECT orderid, invoiceurl, createddate AS invoicecreateddate
    //     FROM (
    //         SELECT orderid, invoiceurl, createddate,
    //                ROW_NUMBER() OVER (PARTITION BY orderid ORDER BY createddate DESC) AS rn
    //         FROM revoinvoice
    //     ) AS ranked
    //     WHERE rn = 1
    // ) AS invoice ON orderline.uniqueorderid = invoice.orderid

    // LEFT JOIN (
    //     SELECT starrating, productid,id,orderlineid,comments,url
    //     FROM rating
    // ) AS revorating ON revorating.orderlineid = orderline.id
    // ${whereClause} ${orderByClause}`;


    //             if (pageNumber && recordCount) {
    //                 queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
    //                 queryParams.push(offset, recordCount);
    //             }

    //             const result = await query(queryText, queryParams);
    //             let datatypeCheckResult = await dataTypeCheck(result)
    //             const messageData = {
    //                 title: "Hello User",
    //                 body: "Payment Done Successfully",
    //             };
    //             console.log("Dam Dam", datatypeCheckResult);
    //             return datatypeCheckResult
    //         } catch (error) {
    //             console.error("Query Execution Error: IN getOrderLineData", error);
    //             let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //             return ErrorMessage
    //         }

    //     }
    export const getOrderLineData = async (request) => {
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
                if (key === "delivereddate" || key === "price") {
                    const qualifiedRangeKey = qualifyOrderlineFilterColumn(key);
                    const rangeClauses = paramValues.map(range => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        return `(${qualifiedRangeKey} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                    parameterIndex += 2 * paramValues.length;
                } else if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    const qualifiedKey = qualifyOrderlineFilterColumn(key);
                    whereClauses.push(`(${qualifiedKey} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                } 
                else if (key !== "page" && key !== "count") {
    const qualifiedKey =
        key === "userid"
            ? "orderline.userid"
            : key === "id"
                ? "orderline.id"
                : qualifyOrderlineFilterColumn(key);

    const clauses = paramValues.map((_, idx) => `${qualifiedKey} = $${parameterIndex + idx}`);
    whereClauses.push(`(${clauses.join(" OR ")})`);
    queryParams.push(...paramValues);
    parameterIndex += paramValues.length;
}
            });

            parameterIndex = await accessScopeService.appendVendorCustomerColumnScope(
                request,
                whereClauses,
                queryParams,
                parameterIndex,
                { tableAlias: "orderline", customerColumn: "userid" }
            );

            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = `orderline.orderstatus != 'payment_failed' AND orderline.orderstatus != 'order_processing' AND (orderline.ordertype IS NULL OR orderline.ordertype != 'Third Party Orders' OR orderline.thirdpartyorderid IS NULL) `;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT orderline.*, invoice.invoiceurl, revorating.starrating, revorating.comments AS rating_comments, revorating.url AS rating_images,
            revorating.id AS ratingids, a.name AS address_name, a.mobilenumber AS address_mobilenumber, a.pincode AS address_pincode, a.doornumber AS address_doornumber,
            a.address AS address_address, a.landmark AS address_landmark, a.state AS address_state, a.city AS address_city,
            p."large" AS products_large, p.warranty AS products_warranty,
            COALESCE(oh.ispaymentsucceed, th.ispaymentsucceed) AS ispaymentsucceed,
            COALESCE(oh.shiprocket_status, th.shiprocket_status) AS shiprocket_status,
            COALESCE(oh.shiprocket_status_code, th.shiprocket_status_code) AS shiprocket_status_code,
            COALESCE(oh.shiprocket_order_id, th.shiprocket_order_id) AS shiprocket_order_id,
            COALESCE(oh.shiprocket_shipment_id, th.shiprocket_shipment_id) AS shiprocket_shipment_id,
            COALESCE(oh.shiprocket_channel_order_id, th.shiprocket_channel_order_id) AS shiprocket_channel_order_id,
            ${LATEST_RETURN_REQUEST_SELECT_SQL},
            ${LATEST_REFUND_SELECT_SQL}
        FROM orderline
        JOIN address a ON orderline.addressid = a.id
        LEFT JOIN product_revo p ON p.id = orderline.productid
        LEFT JOIN orders oh ON oh.orderid = orderline.uniqueorderid
        LEFT JOIN thirdpartyorders th ON th.orderid = orderline.uniqueorderid
        LEFT JOIN (
            SELECT orderid, invoiceurl, createddate AS invoicecreateddate
            FROM (
                SELECT orderid, invoiceurl, createddate,
                       ROW_NUMBER() OVER (PARTITION BY orderid ORDER BY createddate DESC) AS rn
                FROM revoinvoice
            ) AS ranked
            WHERE rn = 1
        ) AS invoice ON orderline.uniqueorderid = invoice.orderid
        LEFT JOIN (
            SELECT starrating, productid, id, orderlineid, comments, url
            FROM rating
        ) AS revorating ON revorating.orderlineid = orderline.id
        ${LATEST_RETURN_REQUEST_JOIN_SQL}
        ${LATEST_REFUND_JOIN_SQL}
        ${whereClause} ${orderByClause}`;

            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }

            const result = await query(queryText, queryParams);

            // Simple query for third-party orders
            let thirdPartyQueryText = `SELECT orderline.*, NULL AS invoiceurl, revorating.starrating, revorating.comments AS rating_comments, revorating.url AS rating_images,
            revorating.id AS ratingids, a.name AS address_name, a.mobilenumber AS address_mobilenumber, a.pincode AS address_pincode, a.doornumber AS address_doornumber,
            a.address AS address_address, a.landmark AS address_landmark, a.state AS address_state, a.city AS address_city,
            p."large" AS products_large, p.warranty AS products_warranty,
            COALESCE(oh.ispaymentsucceed, th.ispaymentsucceed) AS ispaymentsucceed,
            COALESCE(oh.shiprocket_status, th.shiprocket_status) AS shiprocket_status,
            COALESCE(oh.shiprocket_status_code, th.shiprocket_status_code) AS shiprocket_status_code,
            COALESCE(oh.shiprocket_order_id, th.shiprocket_order_id) AS shiprocket_order_id,
            COALESCE(oh.shiprocket_shipment_id, th.shiprocket_shipment_id) AS shiprocket_shipment_id,
            COALESCE(oh.shiprocket_channel_order_id, th.shiprocket_channel_order_id) AS shiprocket_channel_order_id,
            ${LATEST_RETURN_REQUEST_SELECT_SQL},
            ${LATEST_REFUND_SELECT_SQL}
        FROM orderline
        JOIN address a ON orderline.addressid = a.id
        LEFT JOIN product_revo p ON p.id = orderline.productid
        LEFT JOIN orders oh ON oh.orderid = orderline.uniqueorderid
        LEFT JOIN thirdpartyorders th ON th.orderid = orderline.uniqueorderid
        LEFT JOIN (
            SELECT starrating, productid, id, orderlineid, comments, url
            FROM rating
        ) AS revorating ON revorating.orderlineid = orderline.id
        ${LATEST_RETURN_REQUEST_JOIN_SQL}
        ${LATEST_REFUND_JOIN_SQL}
        WHERE orderline.ordertype = 'Third Party Orders' AND orderline.thirdpartyorderid IS NOT NULL`;

            const thirdPartyQueryParams: any[] = [];
            let thirdPartyParameterIndex = 1;

            // Add userid filter if provided
            if (request.query.userid) {
                thirdPartyQueryText += ` AND orderline.userid = $${thirdPartyParameterIndex}`;
                thirdPartyQueryParams.push(request.query.userid);
                thirdPartyParameterIndex++;
            }

            // Add thirdpartyorderid filter if provided
            if (request.query.thirdpartyorderid) {
                thirdPartyQueryText += ` AND orderline.thirdpartyorderid = $${thirdPartyParameterIndex}`;
                thirdPartyQueryParams.push(request.query.thirdpartyorderid);
                thirdPartyParameterIndex++;
            }

            thirdPartyQueryText += ` ${orderByClause}`;

            if (pageNumber && recordCount) {
                thirdPartyQueryText += ` OFFSET $${thirdPartyParameterIndex} LIMIT $${thirdPartyParameterIndex + 1}`;
                thirdPartyQueryParams.push(offset, recordCount);
            }

            const thirdPartyResult = await query(thirdPartyQueryText, thirdPartyQueryParams);

            // Combine results
            const combinedResult = {
                rows: [...result.rows, ...thirdPartyResult.rows]
                // rowCount: result.rowCount + thirdPartyResult.rowCount
            };
         // console.log("Combined Result:", combinedResult);
            // let datatypeCheckResult = await dataTypeCheck(combinedResult);
            // const messageData = {
            //     title: "Hello User",
            //     body: "Payment Done Successfully",
            // };
            // console.log("Order Line Data:", datatypeCheckResult);
            return { data: combinedResult.rows, total: combinedResult.rows.length };
        } catch (error) {
            console.error("Query Execution Error: IN getOrderLineData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };

    export const getInvOrderLineData = async (request) => {

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
                if (key === "delivereddate" || key === "price") {
                    const qualifiedRangeKey = qualifyOrderlineFilterColumn(key);
                    const rangeClauses = paramValues.map(range => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        return `(${qualifiedRangeKey} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                    parameterIndex += 2 * paramValues.length;
                } else if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    const qualifiedKey = qualifyOrderlineFilterColumn(key);
                    whereClauses.push(`(${qualifiedKey} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                } else if (key !== "page" && key !== "count") {
                    const qualifiedKey = key === "userid"
                        ? "orderline.userid"
                        : key === "id"
                            ? "orderline.id"
                            : qualifyOrderlineFilterColumn(key);
                    const clauses = paramValues.map((_, idx) => `${qualifiedKey} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });

            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = ``;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT orderline.*,
            COALESCE(NULLIF(TRIM(CAST(orderline.assetnumber AS TEXT)), ''), sr_asset.stock_assetnumber) AS assetnumber,
            invoice.invoiceurl, revorating.starrating, revorating.comments AS rating_comments,revorating.url AS rating_images,
            revorating.id AS ratingids,a.name AS address_name,a.mobilenumber AS address_mobilenumber,a.pincode address_pincode,a.doornumber AS address_doornumber,
            a.address AS address_address,a.landmark AS address_landmark,a.state AS address_state ,a.city AS address_city,
            p."large" AS products_large, p.warranty AS products_warranty,
            COALESCE(oh.ispaymentsucceed, th.ispaymentsucceed) AS ispaymentsucceed,
            COALESCE(oh.shiprocket_status, th.shiprocket_status) AS shiprocket_status,
            COALESCE(oh.shiprocket_status_code, th.shiprocket_status_code) AS shiprocket_status_code,
            COALESCE(oh.shiprocket_order_id, th.shiprocket_order_id) AS shiprocket_order_id,
            COALESCE(oh.shiprocket_shipment_id, th.shiprocket_shipment_id) AS shiprocket_shipment_id,
            COALESCE(oh.shiprocket_channel_order_id, th.shiprocket_channel_order_id) AS shiprocket_channel_order_id,
            ${LATEST_RETURN_REQUEST_SELECT_SQL},
            ${LATEST_REFUND_SELECT_SQL}
FROM orderline
JOIN  address a on orderline.addressid = a.id
LEFT JOIN product_revo p ON p.id = orderline.productid
LEFT JOIN orders oh ON oh.orderid = orderline.uniqueorderid
LEFT JOIN thirdpartyorders th ON th.orderid = orderline.uniqueorderid
LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT COALESCE(sr.rfid, sr.assetnumber), ', ') AS stock_assetnumber
    FROM stock_revo sr
    WHERE sr.orderlinenumber = orderline.orderlinenumber
) AS sr_asset ON TRUE
LEFT JOIN (
    SELECT orderid, invoiceurl, createddate AS invoicecreateddate
    FROM (
        SELECT orderid, invoiceurl, createddate,
               ROW_NUMBER() OVER (PARTITION BY orderid ORDER BY createddate DESC) AS rn
        FROM revoinvoice
    ) AS ranked
    WHERE rn = 1
) AS invoice ON orderline.uniqueorderid = invoice.orderid
LEFT JOIN (
    SELECT starrating, productid,id,orderlineid,comments,url
    FROM rating
) AS revorating ON revorating.orderlineid = orderline.id
${LATEST_RETURN_REQUEST_JOIN_SQL}
${LATEST_REFUND_JOIN_SQL}
${whereClause} ${orderByClause}`;


            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result)
            return { data: datatypeCheckResult, total: Array.isArray(datatypeCheckResult) ? datatypeCheckResult.length : 0 };
        } catch (error) {
            console.error("Query Execution Error: IN getInvOrderLineData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    }

    export const getUserOrderData1 = async (request: any) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 10;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);

            let whereClauses: string[] = [];
            let parameterIndex = 1;
            const queryParams: any[] = [];
            let orderByField = "orderline.modifieddate";
            let orderByDirection = "DESC";

            keys.forEach((key, index) => {
                const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "createddate" || key === "delivereddate") {
                    const qualifiedRangeKey = key === "createddate" ? "orderline.createddate" : "orderline.delivereddate";
                    const rangeClauses = paramValues.map((range: string) => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        const clause = `(${qualifiedRangeKey} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                        parameterIndex += 2;
                        return clause;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                } else if (key === "sortby") {
                    const [fieldName, direction] = String(paramValues[0]).split("-");
                    orderByField = qualifyOrderlineFilterColumn(fieldName) || "orderline.modifieddate";
                    orderByDirection = direction?.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (key !== "page" && key !== "count") {
                    const qualifiedKey = key === "userid"
                        ? "orderline.userid"
                        : key === "id"
                            ? "orderline.id"
                            : qualifyOrderlineFilterColumn(key);
                    const clauses = paramValues.map((_: any, idx: number) => `${qualifiedKey} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });

            parameterIndex = await accessScopeService.appendVendorCustomerColumnScope(
                request,
                whereClauses,
                queryParams,
                parameterIndex,
                { tableAlias: "orderline", customerColumn: "userid" }
            );

            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = `orderline.orderstatus != 'payment_failed' AND orderline.orderstatus != 'order_processing' AND (orderline.ordertype IS NULL OR orderline.ordertype != 'Third Party Orders' OR orderline.thirdpartyorderid IS NULL)`;
            const whereClause = whereClauses.length > 0
                ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}`
                : `WHERE ${baseConditions}`;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

            let queryText = `SELECT
                orderline.*,
                invoice.invoiceurl,
                revorating.starrating,
                revorating.comments AS rating_comments,
                revorating.url AS rating_images,
                revorating.id AS ratingids,
                a.name AS address_name,
                a.mobilenumber AS address_mobilenumber,
                a.pincode AS address_pincode,
                a.doornumber AS address_doornumber,
                a.address AS address_address,
                a.landmark AS address_landmark,
                a.state AS address_state,
                a.city AS address_city,
                p."large" AS products_large,
                p.warranty AS products_warranty,
                COALESCE(oh.ispaymentsucceed, th.ispaymentsucceed) AS ispaymentsucceed,
                COALESCE(oh.shiprocket_status, th.shiprocket_status) AS shiprocket_status,
                COALESCE(oh.shiprocket_status_code, th.shiprocket_status_code) AS shiprocket_status_code,
                COALESCE(oh.shiprocket_order_id, th.shiprocket_order_id) AS shiprocket_order_id,
                COALESCE(oh.shiprocket_shipment_id, th.shiprocket_shipment_id) AS shiprocket_shipment_id,
                COALESCE(oh.shiprocket_channel_order_id, th.shiprocket_channel_order_id) AS shiprocket_channel_order_id,
                ${LATEST_RETURN_REQUEST_SELECT_SQL},
                ${LATEST_REFUND_SELECT_SQL}
            FROM orderline
            JOIN address a ON orderline.addressid = a.id
            LEFT JOIN product_revo p ON p.id = orderline.productid
            LEFT JOIN orders oh ON oh.orderid = orderline.uniqueorderid
            LEFT JOIN thirdpartyorders th ON th.orderid = orderline.uniqueorderid
            LEFT JOIN (
                SELECT orderid, invoiceurl, createddate AS invoicecreateddate
                FROM (
                    SELECT orderid, invoiceurl, createddate,
                           ROW_NUMBER() OVER (PARTITION BY orderid ORDER BY createddate DESC) AS rn
                    FROM revoinvoice
                ) AS ranked
                WHERE rn = 1
            ) AS invoice ON orderline.uniqueorderid = invoice.orderid
            LEFT JOIN (
                SELECT starrating, productid, id, orderlineid, comments, url
                FROM rating
            ) AS revorating ON revorating.orderlineid = orderline.id
            ${LATEST_RETURN_REQUEST_JOIN_SQL}
            ${LATEST_REFUND_JOIN_SQL}
            ${whereClause} ${orderByClause}`;

            queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            queryParams.push(offset, recordCount);

            const result = await query(queryText, queryParams);
            return await dataTypeCheck(result);
        } catch (error) {
            console.error("Query Execution Error: IN getUserOrderData1", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };

    const releaseCommittedInventoryForCancellation = async (
        lineRows: any[],
        previousStatuses: Map<number, string>
    ) => {
        const releasableLines = (lineRows || []).filter((line) => {
            if (line?.ordertype !== "Orders") return false;
            const previousStatus = normalizeOrderStatus(
                previousStatuses.get(Number(line.id)) ?? line?.orderstatus
            );
            return PRE_DISPATCH_RESERVATION_STATUSES.has(previousStatus);
        });

        if (releasableLines.length === 0) {
            return;
        }

        await productrevoService.releaseCommittedQuantityForOrderLines(
            releasableLines.map((line) => ({
                merchanttransactionid: line.merchanttransactionid,
                productid: line.productid,
                quantity: line.quantity,
                ordername: line.ordername,
                ordertype: line.ordertype,
                deliveryfrom: line.deliveryfrom,
            })),
            true
        );
        await inventoryReservationService.transitionCommittedReservationsForOrderLines(
            releasableLines.map((line) => ({
                merchanttransactionid: line.merchanttransactionid,
                productid: line.productid,
                quantity: line.quantity,
                ordername: line.ordername,
                ordertype: line.ordertype,
                deliveryfrom: line.deliveryfrom,
            })),
            "released",
            "order_cancelled"
        );
    };

    const restoreInventoryForReturnedLines = async (
        lineRows: any[],
        previousStatuses: Map<number, string>
    ) => {
        const preDispatchLines = (lineRows || []).filter((line) => {
            if (line?.ordertype !== "Orders") return false;
            const previousStatus = normalizeOrderStatus(
                previousStatuses.get(Number(line.id)) ?? line?.orderstatus
            );
            return PRE_DISPATCH_RESERVATION_STATUSES.has(previousStatus);
        });

        if (preDispatchLines.length > 0) {
            await productrevoService.releaseCommittedQuantityForOrderLines(
                preDispatchLines.map((line) => ({
                    merchanttransactionid: line.merchanttransactionid,
                    productid: line.productid,
                    quantity: line.quantity,
                    ordername: line.ordername,
                    ordertype: line.ordertype,
                    deliveryfrom: line.deliveryfrom,
                })),
                true
            );
            await inventoryReservationService.transitionCommittedReservationsForOrderLines(
                preDispatchLines.map((line) => ({
                    merchanttransactionid: line.merchanttransactionid,
                    productid: line.productid,
                    quantity: line.quantity,
                    ordername: line.ordername,
                    ordertype: line.ordertype,
                    deliveryfrom: line.deliveryfrom,
                })),
                "released",
                "order_returned_pre_dispatch"
            );
        }

        const physicallyAllocatedLines = (lineRows || []).filter((line) => {
            if (line?.ordertype !== "Orders") return false;
            const previousStatus = normalizeOrderStatus(
                previousStatuses.get(Number(line.id)) ?? line?.orderstatus
            );
            return ["ready_to_dispatch", "dispatched", "shipped", "delivered", "sold"].includes(previousStatus);
        });

        if (physicallyAllocatedLines.length > 0) {
            await stockRevoService.restoreReturnedStockForOrderLines(physicallyAllocatedLines);
        }
    };

    export const handleReturnedOrderLines = async (
        lineRows: any[],
        previousStatuses: Map<number, string>
    ) => {
        await restoreInventoryForReturnedLines(lineRows, previousStatuses);
    };

  export const upsertOrder = async (orderData: any) => {
    try {
        let querydata: string;
        let params: any[];

        const { id, ...upsertFields } = orderData;
        const fieldNames = Object.keys(upsertFields);
        const fieldValues = Object.values(upsertFields);

        const previousOrderResult = id
            ? await query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [id])
            : { rows: [] };

        const previousOrderRow = previousOrderResult.rows[0] || null;

        if (id) {
            querydata = `UPDATE orders SET ${fieldNames.map((f, i) => `${f} = $${i + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
            params = [...fieldValues, id];
        } else {
            querydata = `INSERT INTO orders (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`;
            params = fieldValues;
        }

        const result = await query(querydata, params);
        const updatedRow = result.rows[0];

        const newStatus = normalizeOrderStatus(updatedRow?.orderstatus);
        const previousStatus = normalizeOrderStatus(previousOrderRow?.orderstatus);
        const orderType = normalizeComparableText(updatedRow?.ordername);

        if (newStatus === 'cancelled' && previousStatus !== 'cancelled') {
            const lineRows = await getOrderLinesForUniqueOrderId(updatedRow?.orderid);

            const previousStatuses = new Map<number, string>();
            lineRows.forEach(line => {
                previousStatuses.set(Number(line.id), normalizeOrderStatus(line.orderstatus));
            });

            await query(
                `UPDATE orderline
                 SET orderstatus = 'cancelled'
                 WHERE uniqueorderid = $1
                 AND COALESCE(orderstatus, '') NOT IN ('cancelled','delivered','returned','payment_failed')`,
                [updatedRow.orderid]
            );

            await releaseCommittedInventoryForCancellation(lineRows, previousStatuses);

            const productIds = Array.isArray(updatedRow.productid)
                ? updatedRow.productid
                : [updatedRow.productid];

            await productrevoService.updateCancelledOrderedQuantity(productIds, Number(updatedRow.quantity));

            if (orderType === "rental") {
                await stockRevoService.releaseReservedRentalStockForOrder(updatedRow.orderid);
            }

            await syncSingleHeaderStatusFromLines(updatedRow.orderid, 'Orders');
            await cancelShiprocketOrderForMerchant(updatedRow.merchanttransactionid);
            await sendOrderCancellationEmail(updatedRow.userid, updatedRow.orderid, updatedRow.orderamount);
        } else if (["delivered", "sold"].includes(newStatus) && !["delivered", "sold"].includes(previousStatus)) {
            const productIds = Array.isArray(updatedRow.productid)
                ? updatedRow.productid
                : [updatedRow.productid];

            await productrevoService.updateCancelledOrderedQuantity(productIds, Number(updatedRow.quantity));
        }

        return result;

    } catch (error) {
        console.error("Query Execution Error: IN upsertOrder", error);
        return await ErrorHandler.handleQueryError(error);
    }
};

 export const updateorderlineitem = async (orderlineData: any) => {
    try {
        const { id, ...upsertFields } = orderlineData.body;

        const fieldNames = Object.keys(upsertFields);
        const fieldValues = Object.values(upsertFields);

        const previousLineResult = id
            ? await query(`SELECT * FROM orderline WHERE id = $1 LIMIT 1`, [id])
            : { rows: [] };

        const previousLineRow = previousLineResult.rows[0] || null;

        let querydata: string;
        let params: any[];

        if (id) {
            querydata = `UPDATE orderline SET ${fieldNames.map((f, i) => `${f} = $${i + 1}`).join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
            params = [...fieldValues, id];
        } else {
            querydata = `INSERT INTO orderline (${fieldNames.join(", ")}) VALUES (${fieldNames.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`;
            params = fieldValues;
        }

        const result = await query(querydata, params);
        const lineRow = result.rows[0];

        const lineStatus = normalizeOrderStatus(lineRow?.orderstatus);
        const previousStatus = normalizeOrderStatus(previousLineRow?.orderstatus);
        const orderType = normalizeComparableText(lineRow?.ordername);

        if (lineStatus === 'cancelled' && previousStatus !== 'cancelled') {
            await releaseCommittedInventoryForCancellation(
                [lineRow],
                new Map([[Number(lineRow.id), previousStatus]])
            );

            if (lineRow?.ordertype === 'Orders') {
                await productrevoService.updateCancelledOrderedQuantity(
                    [lineRow.productid],
                    Number(lineRow.quantity)
                );
            }

            if (orderType === "rental") {
                await stockRevoService.releaseReservedRentalStockForOrderline(lineRow.orderlinenumber);
            }

            await cancelShiprocketOrderForMerchant(lineRow.merchanttransactionid);
            await sendOrderCancellationEmail(lineRow.userid, lineRow.orderid, lineRow.orderamount);
        } else if (
            ["delivered", "sold"].includes(lineStatus) &&
            !["delivered", "sold"].includes(previousStatus) &&
            lineRow?.ordertype === 'Orders'
        ) {
            await productrevoService.updateCancelledOrderedQuantity(
                [lineRow.productid],
                Number(lineRow.quantity)
            );
        }

        if (lineRow?.uniqueorderid) {
            await syncSingleHeaderStatusFromLines(lineRow.uniqueorderid, lineRow?.ordertype);
        }

        return result;

    } catch (error) {
        console.error("Query Execution Error: IN updateorderlineitem", error);
        return await ErrorHandler.handleQueryError(error);
    }
};

    const parseOrderlineIds = (value: any) => {
        if (value == null || value === "") {
            return [] as number[];
        }

        const rawValues = Array.isArray(value)
            ? value
            : String(value)
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean);

        const parsedValues = rawValues
            .map((entry: any) => Number(entry))
            .filter((entry: number) => Number.isFinite(entry) && entry > 0)
            .map((entry: number) => Math.trunc(entry));

        return Array.from(new Set(parsedValues));
    };

    const getBillingChainKey = (row: any) => Number(row.parentorderlineid ?? row.id);

    export const getInvoiceGeneratedData = async (request: any) => {
        try {
            console.log('Inside getInvoiceGeneratedData function with request:', request.params, request.query);
            const orderId = request.params.uniqueorderid;
            const requestedOrderlineIds = parseOrderlineIds(request.query?.orderlineids);

            let result;
            if (requestedOrderlineIds.length > 0) {
                result = await query(
                    `
                    SELECT
                      id,
                      uniqueorderid,
                      orderlinenumber,
                      invoicegenerated,
                      lastgeneratedinvoicedate,
                      generatedmonthscount,
                      rentalfor,
                      parentorderlineid,
                      isactivebillingline,
                      rentalcontractstatus
                    FROM orderline
                    WHERE id = ANY($1::int[])
                      AND COALESCE(isactivebillingline, true) = true
                    `,
                    [requestedOrderlineIds]
                );
            } else {
                result = await query(
                    `
                    SELECT
                      id,
                      uniqueorderid,
                      orderlinenumber,
                      invoicegenerated,
                      lastgeneratedinvoicedate,
                      generatedmonthscount,
                      rentalfor,
                      parentorderlineid,
                      isactivebillingline,
                      rentalcontractstatus
                    FROM orderline
                    WHERE uniqueorderid = $1
                      AND COALESCE(isactivebillingline, true) = true
                    `,
                    [orderId]
                );
            }

            if (result.rows.length === 0) {
                return {
                    invoicegenerated: false,
                    generatedmonthscount: 0,
                    rentalfor: 0,
                    activebillinglineids: [],
                    hasbillingconflict: false,
                    billingconflictchains: []
                };
            }

            const rows = result.rows;
            const chainCounts = rows.reduce((acc: Record<string, number>, row: any) => {
                const chainKey = String(getBillingChainKey(row));
                acc[chainKey] = (acc[chainKey] ?? 0) + 1;
                return acc;
            }, {});
            const billingconflictchains = Object.entries(chainCounts)
                .filter(([, count]) => Number(count) > 1)
                .map(([chainId]) => Number(chainId));

            return {
                invoicegenerated: rows.every((r: any) => r.invoicegenerated === true),
                generatedmonthscount: Math.max(...rows.map((r: any) => r.generatedmonthscount ?? 0)),
                rentalfor: Math.max(...rows.map((r: any) => r.rentalfor ?? 0)),
                activebillinglineids: rows.map((row: any) => row.id),
                hasbillingconflict: billingconflictchains.length > 0,
                billingconflictchains
            };
        } catch (error) {
            console.error("Query Execution Error: IN getInvoiceGeneratedData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;

        }
    }

    export const updateInvoiceGeneratedData = async (request: any) => {
        try {
            console.log("Inside update", request.body);
            const { uniqueorderid } = request.body;
            const requestedOrderlineIds = parseOrderlineIds(request.body?.orderlineids);
            console.log("Unique Order ID:", uniqueorderid, 'Requested orderline ids:', requestedOrderlineIds);

            let rows: any[] = [];
            if (requestedOrderlineIds.length > 0) {
                const result = await query(
                    `
                    SELECT
                      id,
                      rentalfor,
                      generatedmonthscount,
                      parentorderlineid,
                      uniqueorderid,
                      isactivebillingline
                    FROM orderline
                    WHERE id = ANY($1::int[])
                      AND COALESCE(isactivebillingline, true) = true
                    `,
                    [requestedOrderlineIds]
                );
                rows = result.rows;
            } else {
                const result = await query(
                    `
                    SELECT
                      id,
                      rentalfor,
                      generatedmonthscount,
                      parentorderlineid,
                      uniqueorderid,
                      isactivebillingline
                    FROM orderline
                    WHERE uniqueorderid = $1
                      AND COALESCE(isactivebillingline, true) = true
                    `,
                    [uniqueorderid]
                );
                rows = result.rows;
            }

            console.log("Orderlines fetched:", rows);
            if (!rows.length) {
                return { success: false, message: "No active billing orderlines found" };
            }

            const chainCounts = rows.reduce((acc: Record<string, number>, row: any) => {
                const chainKey = String(getBillingChainKey(row));
                acc[chainKey] = (acc[chainKey] ?? 0) + 1;
                return acc;
            }, {});
            const billingconflictchains = Object.entries(chainCounts)
                .filter(([, count]) => Number(count) > 1)
                .map(([chainId]) => Number(chainId));

            if (billingconflictchains.length > 0) {
                return {
                    success: false,
                    message: "Multiple active billing lines exist in the same contract chain. Reconcile the billing chain before generating rental invoices.",
                    billingconflictchains
                };
            }

            const stillActive = rows.filter(
                (row: any) =>
                    Number(row.generatedmonthscount ?? 0) < Number(row.rentalfor ?? 0)
            );
            console.log("Active rentals to update:", stillActive);

            if (!stillActive.length) {
                return { success: false, message: "No active rental products to update" };
            }

            const idsToUpdate = stillActive.map(r => r.id);
            console.log("IDs to update:", idsToUpdate);

            const updateResult = await query(
                `UPDATE orderline
   SET invoicegenerated = true,
       lastgeneratedinvoicedate = CURRENT_DATE,
       generatedmonthscount = generatedmonthscount + 1
   WHERE id = ANY($1::int[])
   RETURNING id, rentalfor, generatedmonthscount, invoicegenerated, lastgeneratedinvoicedate`,
                [idsToUpdate]
            );
            console.log("Update result:", updateResult.rows);
            return {
                success: true,
                message: `Updated ${idsToUpdate.length} active rental items`,
                updatedIds: idsToUpdate
            };

        } catch (error) {
            console.error("Query Execution Error: IN updateInvoiceGeneratedData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    export const upsertOrderrfid = async (orderData: any) => {
        try {
            return await upsertOrderlinerfid(orderData);
        } catch (error) {
            console.error("Query Execution Error: IN upsertOrderrfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
 export const upsertOrderlinerfid = async (orderData: any) => {
    try {
        console.log("Order Data in upsertOrderlinerfid:", orderData);

        // Prevent duplicate barcode scan
        const rfidMap = new Map();
        for (const item of orderData) {
            if (rfidMap.has(item.rfid)) {
                return {
                    error: "Duplicate Barcode Number detected: Same barcode has been scanned multiple times.",
                    errorDetails: [],
                    statusCode: 401
                };
            }
            rfidMap.set(item.rfid, true);
        }

        // ✅ Detect order type (rental or not)
        let ordername = '';
        for (const item of orderData) {
            if (item.ordername) {
                ordername = item.ordername;
                break;
            }
        }

        // fallback: fetch from DB
        if (!ordername && orderData[0]?.orderlinenumber) {
            const orderlineQuery = await query(
                `SELECT ordername FROM orderline WHERE orderlinenumber = $1 LIMIT 1`,
                [orderData[0].orderlinenumber]
            );
            ordername = orderlineQuery.rows[0]?.ordername || '';
        }

        const isRental = normalizeComparableText(ordername) === "rental";

        // ✅ VALIDATION (MERGED LOGIC)
        const validationValues = orderData.flatMap((item) => [item.rfid, item.productid]);
        const validationTuples = orderData
            .map((_, index) => `($${index * 2 + 1}::text, $${index * 2 + 2}::int)`)
            .join(", ");

        const validationQuery = `
            WITH requested(rfid, productid) AS (
                VALUES ${validationTuples}
            )
            SELECT requested.rfid, requested.productid
            FROM requested
            JOIN stock_revo sr
              ON sr.rfid = requested.rfid
             AND (
                sr.stockstatus = 'Available'
                OR (${isRental} = true AND sr.stockstatus = 'Reserved for Rental')
             )
            JOIN product_revo pr
              ON pr.puc = sr.puc
             AND pr.id = requested.productid
        `;

        const validationResult = await query(validationQuery, validationValues);

        // Validate all barcode numbers matched
        if (validationResult.rows.length !== orderData.length) {
            const foundPairs = new Set(
                validationResult.rows.map((row) => `${row.rfid}::${row.productid}`)
            );

            const invalidRfids = orderData.filter(
                (item) => !foundPairs.has(`${item.rfid}::${item.productid}`)
            );

            return {
                error: `Invalid Barcode Numbers: ${invalidRfids.map(i => `${i.rfid} (product ${i.productid})`).join(', ')}`,
                errorDetails: [],
                statusCode: 400
            };
        }

        // ✅ Update stock
        let updateStock: any = await stockRevoService.upsertStockRevoDatarfid(orderData);

        if (updateStock.error) {
            return { error: updateStock.error };
        }

        if (updateStock && (updateStock.command === "UPDATE" || updateStock.command === "INSERT")) {

            const pucArray: string[] = Array.from(
                new Set(updateStock.result.rows.map(row => row.puc))
            );

            // ✅ Fallback rental detection (stock-based)
            let finalIsRental = isRental;

            if (!ordername && pucArray.length > 0) {
                const stockTypeQuery = await query(
                    `SELECT EXISTS (
                        SELECT 1 FROM stock_revo
                        WHERE puc = $1 AND stocktype = 'rental_product'
                        AND (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND (ewaste = false OR ewaste IS NULL)
                    ) AS is_rental`,
                    [pucArray[0]]
                );

                if (stockTypeQuery.rows.length > 0) {
                    finalIsRental = stockTypeQuery.rows[0].is_rental === true;
                }
            }

            console.log("DEBUG: ordername:", ordername, "isRental:", finalIsRental);

            // ✅ Update quantity
            await stockRevoService.updateQuantity(
                pucArray,
                updateStock.result.rowCount,
                true,
                finalIsRental
            );

            const ordersToUpdate = updateStock.result.rows.filter(e => e.orderlinenumber);

            if (ordersToUpdate.length > 0) {
                const rfidsByOrderLine = new Map<string, string[]>();
                ordersToUpdate.forEach((e: any) => {
                    const list = rfidsByOrderLine.get(e.orderlinenumber) || [];
                    const val = String(e.rfid || e.assetnumber || "").trim();
                    if (val && !list.includes(val)) list.push(val);
                    rfidsByOrderLine.set(e.orderlinenumber, list);
                });

                let querydata = `
                    UPDATE orderline 
                    SET 
                        orderstatus = 'ready_to_dispatch',
                        assetnumber = CASE 
                            ${Array.from(rfidsByOrderLine.entries()).map(([ordNo, rfids]) =>
                                `WHEN orderlinenumber = '${ordNo}' THEN '${rfids.join(', ')}'`
                            ).join(' ')}
                            ELSE assetnumber
                        END,
                        deliveryfrom = CASE 
                            ${ordersToUpdate.map((e, idx) =>
                                `WHEN orderlinenumber = $${idx + 1} THEN '${e.location}'`
                            ).join(' ')}
                        END
                    WHERE orderlinenumber IN (${ordersToUpdate.map((_, idx) => `$${idx + 1}`).join(', ')})
                    RETURNING *
                `;

                const params = ordersToUpdate.map(e => e.orderlinenumber);
                const result = await query(querydata, params);

                // ✅ Fix quantity JSON (important)
                await stockRevoService.testinupdateQuantity(pucArray, false);

                // ✅ Reservation → consumed
                await inventoryReservationService.transitionCommittedReservationsForOrderLines(
                    result.rows.map((row: any) => ({
                        merchanttransactionid: row.merchanttransactionid,
                        productid: row.productid,
                        quantity: row.quantity,
                        ordername: row.ordername,
                        ordertype: row.ordertype,
                        deliveryfrom: row.deliveryfrom,
                    })),
                    "consumed",
                    "rfid_dispatch"
                );

                // ✅ Sync order headers
                await syncOrderHeadersFromOrderLines(
                    Array.from(new Set(result.rows.map((r: any) => r.uniqueorderid).filter(Boolean)))
                );

                return result;
            }
        }

        return { error: updateStock };

    } catch (error) {
        console.error("Query Execution Error: IN upsertOrderlinerfid", error);
        return await ErrorHandler.handleQueryError(error);
    }
};
    //     export const bulkInsertOrder = async (transactionData: any, orderData: any) => {
    //     try {
    //         console.log('Transaction data:', transactionData);
    //         console.log('Order data:', orderData);
    //         let cartId: number[] = [];
    //         let productid: number[] = [];
    //         orderData.forEach((e: any) => {
    //             productid.push(e.productid);
    //             cartId.push(e.cartId);
    //             delete e.cartId;
    //         });
    //         console.log('Product IDs:', productid);
    //         console.log('Cart IDs:', cartId);

    //         // Query product_revo table to get availablequantity for each productid
    //         const quantityQuery = `
    //             SELECT id AS productid, availablequantity
    //             FROM product_revo
    //             WHERE id = ANY($1)
    //         `;
    //         const quantityResult = await query(quantityQuery, [productid]);
    //         const availableQuantities = quantityResult.rows.reduce((acc: any, row: any) => {
    //             acc[row.productid] = row.availablequantity;
    //             return acc;
    //         }, {});

    //         // Split orderData into orders and thirdpartyorders based on quantity check
    //         const ordersToInsert: any[] = [];
    //         const thirdPartyOrdersToInsert: any[] = [];
    //         orderData.forEach((item: any) => {
    //             const available = availableQuantities[item.productid] || 0;
    //             if (item.quantity <= available) {
    //                 // Entire quantity can be fulfilled from available stock
    //                 ordersToInsert.push({ ...item });
    //             } else {
    //                 // Split the order
    //                 if (available > 0) {
    //                     // Add available quantity to orders
    //                     const orderItem = { ...item, quantity: available };
    //                     ordersToInsert.push(orderItem);
    //                 }
    //                 // Add remaining quantity to thirdpartyorders
    //                 const thirdPartyQuantity = item.quantity - available;
    //                 if (thirdPartyQuantity > 0) {
    //                     const thirdPartyItem = { ...item, quantity: thirdPartyQuantity };
    //                     thirdPartyOrdersToInsert.push(thirdPartyItem);
    //                 }
    //             }
    //         });

    //         console.log('Orders to insert:', ordersToInsert);
    //         console.log('Third-party orders to insert:', thirdPartyOrdersToInsert);
    //         console.log('Empty After splitting orders and third-party orders');

    //         let combinedResult: any = { rows: [], command: 'INSERT' };

    //         // Process orders for orders table
    //         if (ordersToInsert.length > 0) {
    //             let orderQuantity = ordersToInsert.reduce((acc: number, e: any) => {
    //                 return acc + e.quantity;
    //             }, 0);
    //             console.log('Order quantity for orders:', orderQuantity);
    //             console.log('Empty');

    //             const insertOrderQuery = `
    //                 INSERT INTO orders (orderamount, userid, addressid, merchanttransactionid, quantity, productid)
    //                 VALUES ($1, $2, $3, $4, $5, $6)
    //                 RETURNING *`;
    //             const insertOrderValues = [
    //                 transactionData.amount,
    //                 ordersToInsert[0].userid,
    //                 ordersToInsert[0].addressid,
    //                 ordersToInsert[0].merchanttransactionid,
    //                 orderQuantity,
    //                 transactionData.productid
    //             ];

    //             try {
    //                 const orderResult = await query(insertOrderQuery, insertOrderValues);
    //                 if (orderResult.command === 'INSERT') {
    //                     const orderid = orderResult.rows[0].id;
    //                     const orderidunique = orderResult.rows[0].orderid;
    //                     const orderstatus = orderResult.rows[0].orderstatus;
    //                     ordersToInsert.forEach((e: any) => {
    //                         e.orderid = orderid;
    //                         e.uniqueorderid = orderidunique;
    //                         e.orderstatus = orderstatus;
    //                         e.ordertype = 'Orders';
    //                     });
    //                     const orderlineResult = await bulkInsertOrderlines(ordersToInsert);
    //                     console.log('Order lines inserted from orders:', orderlineResult.rows);
    //                     console.log('Empty After inserting order lines');
    //                     // Add orders rows to combined result
    //                     combinedResult.rows = [...combinedResult.rows, ...orderResult.rows];
    //                 }
    //             } catch (error) {
    //                 console.error("Query Execution Error: BulkinsertOrder result", error);
    //                 let ErrorMessage = await ErrorHandler.handleQueryError(error);
    //                 return ErrorMessage;
    //             }
    //         }

    //         // Process orders for thirdpartyorders table (no order lines insertion)
    //         if (thirdPartyOrdersToInsert.length > 0) {
    //             console.log('Inside third-party orders');
    //             let thirdPartyOrderQuantity = thirdPartyOrdersToInsert.reduce((acc: number, e: any) => {
    //                 return acc + e.quantity;
    //             }, 0);
    //             console.log('Order quantity for thirdpartyorders:', thirdPartyOrderQuantity);
    //             console.log('Empty');

    //             const insertThirdPartyQuery = `
    //                 INSERT INTO thirdpartyorders (orderamount, userid, addressid, merchanttransactionid, quantity, productid)
    //                 VALUES ($1, $2, $3, $4, $5, $6)
    //                 RETURNING *`;
    //             const insertThirdPartyValues = [
    //                 transactionData.amount,
    //                 thirdPartyOrdersToInsert[0].userid,
    //                 thirdPartyOrdersToInsert[0].addressid,
    //                 thirdPartyOrdersToInsert[0].merchanttransactionid,
    //                 thirdPartyOrderQuantity,
    //                 transactionData.productid
    //             ];

    //             try {
    //                 const thirdPartyResult = await query(insertThirdPartyQuery, insertThirdPartyValues);
    //                 console.log('Third-party order result:', thirdPartyResult.rows);
    //                 if (thirdPartyResult.command === 'INSERT') {
    //                     const orderid = thirdPartyResult.rows[0].id;
    //                     const orderidunique = thirdPartyResult.rows[0].orderid;
    //                     const orderstatus = thirdPartyResult.rows[0].orderstatus;
    //                     ordersToInsert.forEach((e: any) => {
    //                         e.orderid = orderid;
    //                         e.uniqueorderid = orderidunique;
    //                         e.orderstatus = orderstatus;
    //                         e.ordertype = 'Third Party Orders'
    //                     });
    //                     const orderlineResult = await bulkInsertOrderlines(ordersToInsert);
    //                     console.log('Order lines inserted from third party:', orderlineResult.rows);
    //                     console.log('Empty After inserting third-party order lines');
    //                     // Add thirdpartyorders rows to combined result
    //                     combinedResult.rows = [...combinedResult.rows, ...thirdPartyResult.rows];
    //                 }
    //             } catch (error) {
    //                 console.error("Query Execution Error: BulkinsertThirdPartyOrder result", error);
    //                 let ErrorMessage = await ErrorHandler.handleQueryError(error);
    //                 return ErrorMessage;
    //             }
    //         }

    //         return combinedResult.rows.length > 0
    //             ? combinedResult
    //             : { rows: [], command: 'NOOP', message: 'No orders processed' };
    //     } catch (error) {
    //         console.error("Query Execution Error: IN BulkinsertOrder", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error);
    //         return ErrorMessage;
    //     }
    // };

 export const bulkInsertOrder = async (transactionData: any, orderData: any) => {
    try {
        console.log('Transaction data:', transactionData);
        console.log('Order data:', orderData);

        const merchantTransactionId =
            transactionData?.merchantTransactionId ??
            transactionData?.merchanttransactionId ??
            transactionData?.merchanttransactionID ??
            null;

        const userId =
            transactionData?.userId ??
            transactionData?.userid ??
            null;

        const cgst = transactionData?.cgst ?? 0;
        const sgst = transactionData?.sgst ?? 0;
        const igst = transactionData?.igst ?? 0;
        const taxmode = transactionData?.taxmode ?? (Number(igst) > 0 ? 'igst' : 'cgst_sgst');
        const taxcalculationmode = normalizeTaxCalculationMode(
            transactionData?.taxcalculationmode
        );
        const customertaxstate = transactionData?.customertaxstate ?? null;
        const customertaxpincode = transactionData?.customertaxpincode ?? null;
        const billingAddressSnapshot = normalizeAddressSnapshot(
            orderData?.[0]?.billingaddresssnapshot ?? transactionData?.billingaddresssnapshot
        );
        const shippingAddressSnapshot = normalizeAddressSnapshot(
            orderData?.[0]?.shippingaddresssnapshot ?? transactionData?.shippingaddresssnapshot
        );

        const storelocation =
            transactionData?.storelocation ??
            transactionData?.storeLocation ??
            null;

        // ✅ Address fallback
        if (orderData[0].addressid === null) {
            const getAddress = await query(
                `SELECT id FROM address WHERE userid = $1 LIMIT 1`,
                [userId]
            );

            const addressId = getAddress.rows[0]?.id;

            orderData.forEach(order => {
                if (order.addressid === null) {
                    order.addressid = addressId;
                }
            });
        }

        // ✅ Extract cart IDs
        let cartId: number[] = [];
        orderData.forEach((e: any) => {
            cartId.push(e.cartId);
            delete e.cartId;
        });

        // ✅ 🔥 USE CENTRALIZED LOGIC (IMPORTANT)
        const fulfillmentBuckets = await buildFulfillmentBuckets(
            orderData,
            merchantTransactionId
        );

        const ordersToInsert = fulfillmentBuckets.ordersToInsert;
        const thirdPartyOrdersToInsert = fulfillmentBuckets.thirdPartyOrdersToInsert;

        // ❌ Stop if rental inventory insufficient
        if (fulfillmentBuckets.validationErrors.length > 0) {
            return {
                error: 'Unable to fulfill one or more items with available rental inventory',
                errorDetails: fulfillmentBuckets.validationErrors,
                statusCode: 400,
            };
        }

        console.log('Orders to insert:', ordersToInsert);
        console.log('Third-party orders to insert:', thirdPartyOrdersToInsert);

        let combinedResult: any = { rows: [], command: 'INSERT' };
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // ============================
            // ✅ ORDERS TABLE
            // ============================
            if (ordersToInsert.length > 0) {

                const orderQuantity = ordersToInsert.reduce((acc: number, e: any) => acc + e.quantity, 0);
                const taxRate = toSafeNumber(cgst, 0) + toSafeNumber(sgst, 0) + toSafeNumber(igst, 0);
                const transactionAmount = roundPayableAmount(transactionData?.amount);
                const computedOrderAmount = ordersToInsert.reduce((acc: number, e: any) => {
                    const quantity = toSafeNumber(e.quantity, 0);
                    const productAmount = toSafeNumber(e.productamount, 0);
                    const discountAmount = Math.max(0, toSafeNumber(e.discountamount, 0));
                    const lineOrderAmount = toSafeNumber(e.orderamount, 0);

                    if (taxcalculationmode === 'exclusive') {
                        const taxableAmount = Math.max(0, productAmount * quantity - discountAmount);
                        return acc + (
                            lineOrderAmount > 0
                                ? lineOrderAmount
                                : taxableAmount * (1 + taxRate / 100)
                        );
                    }

                    return acc + Math.max(0, productAmount * quantity - discountAmount);
                }, 0);
                const orderAmount =
                    taxcalculationmode === 'exclusive' && transactionAmount > 0
                        ? transactionAmount
                        : roundPayableAmount(computedOrderAmount);
                const orderProductIds = ordersToInsert.map((e: any) => e.productid);

                const normalizedStoreLocation =
                    typeof storelocation === 'string' ? storelocation.trim() : storelocation;

                const normalizedOrderLocation =
                    typeof ordersToInsert[0]?.location === 'string'
                        ? ordersToInsert[0].location.trim()
                        : ordersToInsert[0]?.location;

                const resolvedStoreLocation =
                    normalizedStoreLocation || normalizedOrderLocation || null;

                const finalMerchantTransactionId =
                    merchantTransactionId != null && merchantTransactionId !== ''
                        ? merchantTransactionId
                        : ordersToInsert[0]?.merchanttransactionid;

                const insertOrderQuery = `
                    INSERT INTO orders (
                        orderamount, userid, addressid, merchanttransactionid,
                        quantity, productid, ordername, paymentmethod,
                        totalrentalamount, sgst, cgst, igst, taxmode,
                        taxcalculationmode, customertaxstate, customertaxpincode, storelocation,
                        assetnumber, location, vendorname, empid,
                        deliverydate, brand, invoicefor,
                        billingaddresssnapshot, shippingaddresssnapshot,
                        quotationid, quotationversionid, quotationnumber
                    )
                    VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,
                        $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
                        $27,$28,$29
                    )
                    RETURNING *
                `;

                const insertOrderValues = [
                    orderAmount,
                    ordersToInsert[0].userid,
                    ordersToInsert[0].addressid,
                    finalMerchantTransactionId,
                    orderQuantity,
                    orderProductIds,
                    ordersToInsert[0].ordername,
                    ordersToInsert[0].paymentmethod,
                    ordersToInsert[0].totalrentalamount,
                    sgst,
                    cgst,
                    igst,
                    taxmode,
                    taxcalculationmode,
                    customertaxstate,
                    customertaxpincode,
                    resolvedStoreLocation,
                    ordersToInsert[0].assetnumber,
                    ordersToInsert[0].location,
                    ordersToInsert[0].vendorname,
                    ordersToInsert[0].empid,
                    ordersToInsert[0].deliverydate,
                    ordersToInsert[0].brand,
                    ordersToInsert[0].invoicefor,
                    normalizeAddressSnapshot(ordersToInsert[0].billingaddresssnapshot) ?? billingAddressSnapshot,
                    normalizeAddressSnapshot(ordersToInsert[0].shippingaddresssnapshot) ?? shippingAddressSnapshot,
                    ordersToInsert[0].quotationid ?? transactionData?.quotationid ?? null,
                    ordersToInsert[0].quotationversionid ?? transactionData?.quotationversionid ?? null,
                    ordersToInsert[0].quotationnumber ?? transactionData?.quotationnumber ?? null
                ];

                const orderResult = await client.query(insertOrderQuery, insertOrderValues);

                if (orderResult.command === 'INSERT') {
                    const orderid = orderResult.rows[0].id;
                    const orderidunique = orderResult.rows[0].orderid;
                    const orderstatus = orderResult.rows[0].orderstatus;

                    ordersToInsert.forEach((e: any) => {
                        e.orderid = orderid;
                        e.uniqueorderid = orderidunique;
                        e.orderstatus = orderstatus;
                        e.ordertype = 'Orders';
                    });

                    const orderlineResult = await bulkInsertOrderlines(ordersToInsert, client);

                    if (orderlineResult.command !== 'INSERT' ||
                        orderlineResult.rowCount !== ordersToInsert.length) {
                        throw new Error(`Order line insert mismatch`);
                    }

                    combinedResult.rows.push(...orderResult.rows);
                }
            }

            // ============================
            // ✅ THIRD PARTY ORDERS
            // ============================
            if (thirdPartyOrdersToInsert.length > 0) {

                const quantity = thirdPartyOrdersToInsert.reduce((acc: number, e: any) => acc + e.quantity, 0);
                const amount = roundPayableAmount(
                    thirdPartyOrdersToInsert.reduce((acc: number, e: any) => {
                        const lineOrderAmount = toSafeNumber(e.orderamount, 0);
                        if (lineOrderAmount > 0) {
                            return acc + lineOrderAmount;
                        }

                        const quantity = toSafeNumber(e.quantity, 0);
                        const productAmount = toSafeNumber(e.productamount, 0);
                        const discountAmount = Math.max(0, toSafeNumber(e.discountamount, 0));
                        return acc + Math.max(0, productAmount * quantity - discountAmount);
                    }, 0)
                );
                const productIds = thirdPartyOrdersToInsert.map((e: any) => e.productid);

                const insertThirdPartyQuery = `
                    INSERT INTO thirdpartyorders (
                        orderamount, userid, addressid,
                        merchanttransactionid, quantity, productid
                    )
                    VALUES ($1,$2,$3,$4,$5,$6)
                    RETURNING *
                `;

                const insertValues = [
                    amount,
                    thirdPartyOrdersToInsert[0].userid,
                    thirdPartyOrdersToInsert[0].addressid,
                    thirdPartyOrdersToInsert[0].merchanttransactionid,
                    quantity,
                    productIds
                ];

                const thirdPartyResult = await client.query(insertThirdPartyQuery, insertValues);

                if (thirdPartyResult.command === 'INSERT') {
                    const orderid = thirdPartyResult.rows[0].id;
                    const orderidunique = thirdPartyResult.rows[0].orderid;
                    const orderstatus = thirdPartyResult.rows[0].orderstatus;

                    thirdPartyOrdersToInsert.forEach((e: any) => {
                        e.thirdpartyorderid = orderid;
                        e.uniqueorderid = orderidunique;
                        e.orderstatus = orderstatus;
                        e.ordertype = 'Third Party Orders';
                    });

                    const orderlineResult = await bulkInsertOrderlines(thirdPartyOrdersToInsert, client);

                    if (orderlineResult.command !== 'INSERT' ||
                        orderlineResult.rowCount !== thirdPartyOrdersToInsert.length) {
                        throw new Error(`Third-party order line insert mismatch`);
                    }

                    combinedResult.rows.push(...thirdPartyResult.rows);
                }
            }

            await client.query('COMMIT');

            return combinedResult.rows.length > 0
                ? combinedResult
                : { rows: [], command: 'NOOP' };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Query Execution Error: IN bulkInsertOrder", error);
        return await ErrorHandler.handleQueryError(error);
    }
};


    export const bulkInsertOrderlines = async (orderData: any[], runner?: any) => {
        try {
            console.log('Inside update bulkInsertOrderlines with orderData:', JSON.stringify(orderData, null, 2));
            const allowedColumns = await getOrderlineInsertableColumns(runner);
            const sanitizedOrderData = (orderData || []).map((order) =>
                Object.fromEntries(
                    Object.entries(order || {}).filter(([field]) => allowedColumns.has(field))
                )
            );

            if (sanitizedOrderData.length === 0) {
                throw new Error("No order line data available for insertion");
            }

            const fields = Object.keys(sanitizedOrderData[0]);
            if (fields.length === 0) {
                throw new Error("Order line payload does not contain any valid orderline columns");
            }
            const fieldNames = fields.join(", ");
            const baseQuery = `INSERT INTO orderline (${fieldNames}) VALUES `;
            const valuesClause = sanitizedOrderData.map((order, index) => {
                const valuePlaceholders = fields.map((_, fieldIndex) => `$${index * fields.length + fieldIndex + 1}`);
                return `(${valuePlaceholders.join(", ")})`;
            }).join(", ");

            const querydata = `${baseQuery}${valuesClause} RETURNING *`;

            const values = sanitizedOrderData.flatMap(order =>
                fields.map(field => order[field])
            );
            const result = await executeQuery(runner, querydata, values);

            return result;

        } catch (error) {
            console.error("Query Execution Error: IN bulkInsertOrderlines", error);
            throw await ErrorHandler.handleQueryError(error);
        }
    };


    export const updateOrder = async (data, paymentfailed) => {
        try {
            console.log('Inside updateOrder with data:', data);
            const orders = data.order;
            const transactionid = data.transactiondata.transactionid;
            const emailid = data.transactiondata.name;

            const updateValuesArray = [];

            for (const order of orders) {
                const orderId = parseInt(order.id, 10); // Ensure it's an integer
                updateValuesArray.push([transactionid, orderId]);
            }

            if (updateValuesArray.length > 0) {
                // Create the VALUES part dynamically with parameter placeholders
                const valuePlaceholders = updateValuesArray
                    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::integer)`)
                    .join(", ");
                let updateOrderQuery;
                if (!paymentfailed) {
                    updateOrderQuery = `
                    UPDATE orders
                    SET transactionid = bulk_data.transactionid,
                         orderstatus= 'ordered',
                        ispaymentsucceed = TRUE
                    FROM (
                        VALUES ${valuePlaceholders}
                    ) AS bulk_data(transactionid, id)
                    WHERE orders.id = bulk_data.id
                    RETURNING *`;
                }
                else {
                    updateOrderQuery = `
                    UPDATE orders
                    SET transactionid = bulk_data.transactionid,
                         orderstatus= 'payment_failed',
                        ispaymentsucceed = False
                    FROM (
                        VALUES ${valuePlaceholders}
                    ) AS bulk_data(transactionid, id)
                    WHERE orders.id = bulk_data.id
                    RETURNING *`;
                }
                const updateValues = updateValuesArray.flat();

                const updatedOrderResult = await query(updateOrderQuery, updateValues);
                console.log('Updated Order Result:', updatedOrderResult.rows);
                console.log('end')
                if (updatedOrderResult.command === 'UPDATE') {
                    let orderlinedata = {
                        orderid: updatedOrderResult.rows[0].id,
                        orderstatus: updatedOrderResult.rows[0].orderstatus
                    }
                    const updatedOrderLineData = await ordersService.updateOrderStatus(orderlinedata, emailid, paymentfailed, false)

                    // Filter for rental orders and allocate stock
                    if (!paymentfailed) {
                        const rentalOrders = updatedOrderResult.rows.filter((row: any) => row.ordername === 'rental');
                        if (rentalOrders.length > 0) {
                            console.log(`Found ${rentalOrders.length} rental orders. Allocating stock.`);
                            await stockRevoService.allocateRentalStock(rentalOrders);
                        }
                    }

                    console.log('Updated Order Line Data from orders:', updatedOrderLineData);
                    console.log('cdc line data');
                    return { data: updatedOrderResult.rows, status: 'success' }
                }
                else {
                    return { data: `Orders Not Updated Please contact admin`, status: 'failure' }
                }

            }

        } catch (error) {
            console.error("Error in updateOrder:", error);
            throw error;
        }
    };

    export async function updateOrderStatus(payload: any, emailid: string, paymentfailed: boolean, isThirdParty: boolean) {
        try {
            const { orderid, orderstatus } = payload;
            console.log('Inside updateOrderStatus with data:', payload);
            const updateQuery = isThirdParty ?
                `
                UPDATE orderline
                SET orderstatus = $1
                WHERE thirdpartyorderid = $2
                RETURNING *;
            `
                : `
                UPDATE orderline
                SET orderstatus = $1
                WHERE orderid = $2
                RETURNING *;
            `;
            console.log('Inside updateOrderStatus with data: Update Query:', updateQuery);
            const proceessId = isThirdParty ? payload.thirdpartyorderid : payload.orderid;
            const result = await query(updateQuery, [orderstatus, proceessId]);
            console.log('Inside updateOrderStatus with data: Update Result:', result);
            if (result.rowCount === 0) {
                throw new Error(`No orderline found with orderid: ${orderid}`);
            }
            console.log('Inside updateOrderStatus with data: Update Result:', result);
            let orderedquantity = result.rows[0].quantity

            const template = emailTemplates.orders.orderPlaced;
            let textdata = result.rows.map(e =>
                `Order Id  : ${e.orderlinenumber} and Amount : ${e.orderamount}`
            ).join('\n');

            let maildata
            if (!paymentfailed) {
                maildata = {
                    body: {
                        to: emailid,
                        subject: template.subject,
                        text: `Hi,

Order placed success.
${textdata}

Thank You!`,
                    },
                };
            }
            else {
                maildata = {
                    body: {
                        to: emailid,
                        subject: 'Payement Failed',
                        text: `Hi,

Order Not placed.Please Try Again Later.

Thank You!`,
                    },
                };

            }
            let resolvedRecipient = isLikelyEmailAddress(emailid)
                ? String(emailid).trim()
                : null;

            const rentalOrderRows = result.rows.filter(
                (row: any) =>
                    normalizeComparableText(row?.ordername) === "rental" ||
                    normalizeComparableText(row?.invoicefor) === "product rental"
            );
            const isRentalOrderEmail = rentalOrderRows.length > 0;
            const rentalOrderLogContext = {
                orderid,
                orderstatus,
                paymentfailed,
                recipient: resolvedRecipient,
                orderLineNumbers: rentalOrderRows.map((row: any) => row?.orderlinenumber).filter(Boolean),
                uniqueOrderIds: Array.from(
                    new Set(rentalOrderRows.map((row: any) => row?.uniqueorderid).filter(Boolean))
                ),
            };

            if (!resolvedRecipient) {
                const lineUserId = result.rows.find((row: any) => row?.userid)?.userid;
                if (lineUserId) {
                    const userResult = await query(
                        `SELECT useremail FROM users WHERE id = $1 LIMIT 1`,
                        [lineUserId]
                    );
                    const candidateEmail = userResult.rows[0]?.useremail;
                    if (isLikelyEmailAddress(candidateEmail)) {
                        resolvedRecipient = String(candidateEmail).trim();
                        if (isRentalOrderEmail) {
                            rentalOrderLogContext.recipient = resolvedRecipient;
                        }
                    }
                }
            }

            try {
                if (resolvedRecipient) {
                    if (isRentalOrderEmail) {
                        console.log(
                            "[RentalOrderEmail] Sending rental order confirmation email",
                            rentalOrderLogContext
                        );
                    }
                    await sendTransactionalMail({
                        ...maildata.body,
                        to: resolvedRecipient,
                    });
                    if (isRentalOrderEmail) {
                        console.log(
                            "[RentalOrderEmail] Rental order confirmation email sent successfully",
                            rentalOrderLogContext
                        );
                    }
                } else {
                    console.warn(
                        "Order email notification skipped: no valid recipient email found",
                        { orderid, providedRecipient: emailid || null }
                    );
                    if (isRentalOrderEmail) {
                        console.warn(
                            "[RentalOrderEmail] Rental order confirmation email skipped: no valid recipient email found",
                            {
                                ...rentalOrderLogContext,
                                providedRecipient: emailid || null,
                            }
                        );
                    }
                }
            } catch (mailError: any) {
                if (isRentalOrderEmail) {
                    console.error(
                        "[RentalOrderEmail] Rental order confirmation email failed",
                        {
                            ...rentalOrderLogContext,
                            error: mailError?.message || mailError,
                        }
                    );
                }
                console.error(
                    "Order email notification failed, continuing order flow:",
                    mailError?.message || mailError
                );
            }
            return result.rows;

        } catch (error) {
            console.error('Error updateOrderStatus:', error);
            throw error;
        }
    }

    export const getOrderDataForMerchantid = async (merchantiddata: any) => {
        try {
            const { merchantid } = merchantiddata;
            return await deleteFailedOrder(merchantid);
        } catch (error) {
            console.error("Error in getOrderDataForMerchantid:", error);
            throw error;
        }
    }

    export const getInvoiceDataForOrderid = async (orderid: any) => {
        try {
            const customerId = orderid.body
            if (!(await accessScopeService.canVendorAccessCustomer(orderid, customerId))) {
                return {
                    errorMessage: "Vendor users can view invoices only for assigned business customers.",
                    statusCode: 403,
                };
            }
            // const uniqueOrderIds = [...new Set(orderid.body)];
            // console.log("Unique orderIds:", uniqueOrderIds);

            // const placeholders = uniqueOrderIds.map((_, index) => `$${index + 1}`).join(", ");
            const invoiceQuery = await query(
                `SELECT * FROM revoinvoice WHERE customerId = $1`,
                [customerId]
            );
            console.log("Invoice Query Result:", invoiceQuery.rows);
            return invoiceQuery;

        } catch (error) {
            console.error("Error in getInvoiceDataForOrderid:", error);
            throw error;

        }
    }

    export const deleteFailedOrder = async (merchantid) => {
        try {
            console.log("Deleting failed order for merchantid:", merchantid);
            const pendingHeaderResult = await query(
                `
                SELECT 'orders' AS source, orderid
                FROM orders
                WHERE merchanttransactionid = $1
                  AND ispaymentsucceed = FALSE
                  AND transactionid IS NULL
                UNION ALL
                SELECT 'thirdpartyorders' AS source, orderid
                FROM thirdpartyorders
                WHERE merchanttransactionid = $1
                  AND ispaymentsucceed = FALSE
                  AND transactionid IS NULL
                `,
                [merchantid]
            );

            console.log("Pending headers fetched:", pendingHeaderResult.rows);

            if (pendingHeaderResult.rows.length === 0) {
                return { status: 200, message: 'Merchant Id Payment is successful or no pending orders' };
            }

            await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
                merchantid,
                "payment_failed_cleanup"
            );

            const lockedProductRows = await query(
                `
                SELECT productid, COALESCE(SUM(quantity), 0)::int AS quantity
                FROM orderline
                WHERE merchanttransactionid = $1
                  AND LOWER(COALESCE(ordername, '')) != 'rental'
                GROUP BY productid
                `,
                [merchantid]
            );

            for (const row of lockedProductRows.rows) {
                await query(
                    `UPDATE product_revo
                     SET lock_qty = GREATEST(0, COALESCE(lock_qty, 0) - $1)
                     WHERE id = $2`,
                    [Number(row.quantity) || 0, row.productid]
                );
            }

            await query(
                `DELETE FROM orderline WHERE merchanttransactionid = $1`,
                [merchantid]
            );
            await query(
                `DELETE FROM orders
                 WHERE merchanttransactionid = $1
                   AND ispaymentsucceed = FALSE
                   AND transactionid IS NULL`,
                [merchantid]
            );
            await query(
                `DELETE FROM thirdpartyorders
                 WHERE merchanttransactionid = $1
                   AND ispaymentsucceed = FALSE
                   AND transactionid IS NULL`,
                [merchantid]
            );

            return { status: 200, message: 'Data Deleted Successfully' };

        } catch (error) {
            console.error("Error in getOrderDataForMerchantid Service:", error);
            return { status: 500, message: 'Error processing order cleanup' };
        }
    };

}
