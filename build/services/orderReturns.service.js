import { query } from "../database/postgres.js";
import { ordersService } from "./orders.service.js";
export var orderReturnsService;
(function (orderReturnsService) {
    const BIGINT_NOW_SQL = `EXTRACT(EPOCH FROM NOW())::bigint`;
    const OPEN_RETURN_STATUSES = ["requested", "approved", "received"];
    const ACTIVE_FINALIZATION_STATUSES = ["approved", "received"];
    const resolveSessionUserId = (request) => {
        const raw = request?.session?.id ?? request?.user?.id ?? request?.body?.userid ?? request?.query?.userid;
        const numeric = Number(raw);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    };
    const normalizeStatus = (status) => String(status || "").trim().toLowerCase();
    const resolveTargetOrderLine = async (input) => {
        if (input?.orderlineid) {
            const result = await query(`SELECT * FROM orderline WHERE id = $1 LIMIT 1`, [Number(input.orderlineid)]);
            return result.rows[0] || null;
        }
        if (input?.orderlinenumber) {
            const result = await query(`SELECT * FROM orderline WHERE orderlinenumber = $1 LIMIT 1`, [String(input.orderlinenumber)]);
            return result.rows[0] || null;
        }
        if (input?.uniqueorderid && input?.productid) {
            const result = await query(`SELECT *
                 FROM orderline
                 WHERE uniqueorderid = $1 AND productid = $2
                 ORDER BY id DESC
                 LIMIT 1`, [String(input.uniqueorderid), Number(input.productid)]);
            return result.rows[0] || null;
        }
        if (input?.merchanttransactionid && input?.productid) {
            const result = await query(`SELECT *
                 FROM orderline
                 WHERE merchanttransactionid = $1 AND productid = $2
                 ORDER BY id DESC
                 LIMIT 1`, [String(input.merchanttransactionid), Number(input.productid)]);
            return result.rows[0] || null;
        }
        return null;
    };
    const resolveReturnReason = async (input) => {
        if (input?.reasonId) {
            const result = await query(`SELECT * FROM order_return_reasons WHERE id = $1 LIMIT 1`, [Number(input.reasonId)]);
            return result.rows[0] || null;
        }
        if (input?.reasonCode) {
            const result = await query(`SELECT * FROM order_return_reasons WHERE code = $1 LIMIT 1`, [String(input.reasonCode)]);
            return result.rows[0] || null;
        }
        return null;
    };
    const assertReturnableLine = async (lineRow) => {
        if (!lineRow) {
            return { status: 404, message: "Order line not found" };
        }
        if (lineRow?.ordertype && String(lineRow.ordertype).trim() !== "Orders") {
            return { status: 400, message: "Return requests are only supported for normal order lines" };
        }
        const orderStatus = normalizeStatus(lineRow.orderstatus);
        if (orderStatus !== "delivered") {
            return { status: 400, message: "Return can only be requested for delivered order lines" };
        }
        const deliveredEpoch = Number(lineRow.delivereddate);
        if (Number.isFinite(deliveredEpoch) && deliveredEpoch > 0) {
            const deliveredAt = new Date(deliveredEpoch * 1000);
            const expiry = new Date(deliveredAt);
            expiry.setDate(expiry.getDate() + 6);
            if (new Date() > expiry) {
                return { status: 400, message: "Return window has expired for this order line" };
            }
        }
        const activeResult = await query(`SELECT id, status
             FROM orderline_returns
             WHERE orderlineid = $1
               AND status = ANY($2::text[])
             ORDER BY id DESC
             LIMIT 1`, [Number(lineRow.id), OPEN_RETURN_STATUSES]);
        if (activeResult.rows[0]) {
            return {
                status: 409,
                message: `A return request is already ${activeResult.rows[0].status} for this order line`,
            };
        }
        return null;
    };
    orderReturnsService.getReturnReasons = async (request) => {
        const includeInactive = String(request?.query?.includeInactive || "").toLowerCase() === "true";
        const result = await query(`SELECT id, code, label, description, isactive, sortorder, created_at, updated_at
             FROM order_return_reasons
             ${includeInactive ? "" : "WHERE isactive = TRUE"}
             ORDER BY sortorder ASC, label ASC`, []);
        return {
            success: true,
            data: result.rows,
        };
    };
    orderReturnsService.upsertReturnReason = async (request) => {
        const body = request?.body || {};
        const id = body?.id ? Number(body.id) : null;
        const code = String(body?.code || "").trim().toLowerCase();
        const label = String(body?.label || "").trim();
        const description = body?.description ? String(body.description).trim() : null;
        const sortorder = Number(body?.sortorder ?? 0);
        const isactive = body?.isactive === undefined || body?.isactive === null
            ? true
            : Boolean(body.isactive);
        if (!code || !label) {
            return { status: 400, success: false, message: "code and label are required" };
        }
        const params = [code, label, description, sortorder, isactive];
        const result = id
            ? await query(`UPDATE order_return_reasons
                 SET code = $1,
                     label = $2,
                     description = $3,
                     sortorder = $4,
                     isactive = $5,
                     updated_at = NOW()
                 WHERE id = $6
                 RETURNING *`, [...params, id])
            : await query(`INSERT INTO order_return_reasons (code, label, description, sortorder, isactive)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`, params);
        return {
            success: true,
            data: result.rows[0] || null,
        };
    };
    orderReturnsService.createReturnRequest = async (request) => {
        const body = request?.body || {};
        const actorId = resolveSessionUserId(request);
        const lineRow = await resolveTargetOrderLine(body);
        const validationError = await assertReturnableLine(lineRow);
        if (validationError) {
            return { success: false, ...validationError };
        }
        const reasonRow = await resolveReturnReason(body);
        if (!reasonRow && !String(body?.reasonText || "").trim()) {
            return { status: 400, success: false, message: "Please select a return reason" };
        }
        const requestSource = String(body?.requestSource || "").trim().toLowerCase() || "customer";
        const customerComment = body?.customerComment ? String(body.customerComment).trim() : null;
        const reasonText = body?.reasonText ? String(body.reasonText).trim() : null;
        const result = await query(`INSERT INTO orderline_returns (
                orderlineid,
                uniqueorderid,
                merchanttransactionid,
                userid,
                productid,
                status,
                request_source,
                reason_id,
                reason_code,
                reason_label,
                reason_text,
                customer_comment
            ) VALUES (
                $1, $2, $3, $4, $5, 'requested', $6, $7, $8, $9, $10, $11
            )
            RETURNING *`, [
            Number(lineRow.id),
            lineRow.uniqueorderid,
            lineRow.merchanttransactionid,
            Number(lineRow.userid || actorId || 0) || null,
            Number(lineRow.productid),
            requestSource,
            reasonRow?.id || null,
            reasonRow?.code || null,
            reasonRow?.label || null,
            reasonText,
            customerComment,
        ]);
        return {
            success: true,
            data: result.rows[0] || null,
            message: "Return request submitted successfully",
        };
    };
    orderReturnsService.getReturnRequests = async (request) => {
        const queryParams = [];
        const whereClauses = [];
        let parameterIndex = 1;
        Object.entries(request?.query || {}).forEach(([rawKey, rawValue]) => {
            if (rawValue === undefined || rawValue === null || rawValue === "")
                return;
            const key = String(rawKey);
            const values = Array.isArray(rawValue) ? rawValue : [rawValue];
            values.forEach((value) => {
                switch (key) {
                    case "id":
                        whereClauses.push(`orr.id = $${parameterIndex}`);
                        queryParams.push(Number(value));
                        parameterIndex++;
                        break;
                    case "orderlineid":
                        whereClauses.push(`orr.orderlineid = $${parameterIndex}`);
                        queryParams.push(Number(value));
                        parameterIndex++;
                        break;
                    case "uniqueorderid":
                        whereClauses.push(`orr.uniqueorderid = $${parameterIndex}`);
                        queryParams.push(String(value));
                        parameterIndex++;
                        break;
                    case "userid":
                        whereClauses.push(`orr.userid = $${parameterIndex}`);
                        queryParams.push(Number(value));
                        parameterIndex++;
                        break;
                    case "status":
                        whereClauses.push(`orr.status = $${parameterIndex}`);
                        queryParams.push(String(value));
                        parameterIndex++;
                        break;
                    default:
                        break;
                }
            });
        });
        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
        const result = await query(`SELECT
                orr.*,
                ol.orderlinenumber,
                ol.orderstatus AS orderline_status,
                ol.quantity,
                ol.orderamount,
                ol.productamount,
                ol.discountamount,
                ol.deliveryfrom,
                ol.delivereddate,
                ol.returneddate,
                ol.productname,
                ol.productcolour,
                p.large AS products_large
             FROM orderline_returns orr
             JOIN orderline ol ON ol.id = orr.orderlineid
             LEFT JOIN product_revo p ON p.id = orr.productid
             ${whereSql}
             ORDER BY orr.created_at DESC, orr.id DESC`, queryParams);
        return {
            success: true,
            data: result.rows,
        };
    };
    const updateReturnRequestStatus = async (requestId, nextStatus, actorId, adminComment, extraAssignments) => {
        const existing = await query(`SELECT * FROM orderline_returns WHERE id = $1 LIMIT 1`, [requestId]);
        const row = existing.rows[0];
        if (!row) {
            return { status: 404, success: false, message: "Return request not found" };
        }
        const assignments = [`status = $1`, `updated_at = NOW()`];
        const params = [nextStatus];
        let nextIndex = 2;
        if (adminComment !== undefined) {
            assignments.push(`admin_comment = $${nextIndex}`);
            params.push(adminComment || null);
            nextIndex++;
        }
        if (nextStatus === "approved") {
            assignments.push(`approved_at = NOW()`, `approved_by = $${nextIndex}`);
            params.push(actorId);
            nextIndex++;
        }
        else if (nextStatus === "rejected") {
            assignments.push(`rejected_at = NOW()`, `rejected_by = $${nextIndex}`, `resolved_at = NOW()`);
            params.push(actorId);
            nextIndex++;
        }
        else if (nextStatus === "received") {
            assignments.push(`received_at = NOW()`, `received_by = $${nextIndex}`);
            params.push(actorId);
            nextIndex++;
        }
        else if (nextStatus === "finalized") {
            assignments.push(`finalized_at = NOW()`, `finalized_by = $${nextIndex}`, `resolved_at = NOW()`);
            params.push(actorId);
            nextIndex++;
        }
        Object.entries(extraAssignments || {}).forEach(([column, value]) => {
            assignments.push(`${column} = $${nextIndex}`);
            params.push(value);
            nextIndex++;
        });
        params.push(requestId);
        const result = await query(`UPDATE orderline_returns
             SET ${assignments.join(", ")}
             WHERE id = $${nextIndex}
             RETURNING *`, params);
        return { success: true, data: result.rows[0] || row };
    };
    orderReturnsService.approveReturnRequest = async (request) => {
        const actorId = resolveSessionUserId(request);
        const requestId = Number(request?.body?.id);
        const adminComment = request?.body?.adminComment ? String(request.body.adminComment).trim() : null;
        return await updateReturnRequestStatus(requestId, "approved", actorId, adminComment);
    };
    orderReturnsService.rejectReturnRequest = async (request) => {
        const actorId = resolveSessionUserId(request);
        const requestId = Number(request?.body?.id);
        const adminComment = request?.body?.adminComment ? String(request.body.adminComment).trim() : null;
        if (!adminComment) {
            return { status: 400, success: false, message: "adminComment is required for rejection" };
        }
        return await updateReturnRequestStatus(requestId, "rejected", actorId, adminComment);
    };
    orderReturnsService.receiveReturnRequest = async (request) => {
        const actorId = resolveSessionUserId(request);
        const requestId = Number(request?.body?.id);
        const adminComment = request?.body?.adminComment ? String(request.body.adminComment).trim() : null;
        return await updateReturnRequestStatus(requestId, "received", actorId, adminComment);
    };
    orderReturnsService.finalizeReturnRequest = async (request) => {
        const actorId = resolveSessionUserId(request);
        const requestId = Number(request?.body?.id);
        const adminComment = request?.body?.adminComment ? String(request.body.adminComment).trim() : null;
        const refundStatus = request?.body?.refundStatus ? String(request.body.refundStatus).trim() : "not_requested";
        const refundReference = request?.body?.refundReference ? String(request.body.refundReference).trim() : null;
        const restockDisposition = request?.body?.restockDisposition
            ? String(request.body.restockDisposition).trim().toLowerCase()
            : "available";
        const existing = await query(`SELECT * FROM orderline_returns WHERE id = $1 LIMIT 1`, [requestId]);
        const requestRow = existing.rows[0];
        if (!requestRow) {
            return { status: 404, success: false, message: "Return request not found" };
        }
        if (normalizeStatus(requestRow.status) !== "received") {
            return {
                status: 400,
                success: false,
                message: "Only received return requests can be finalized",
            };
        }
        const previousLineResult = await query(`SELECT * FROM orderline WHERE id = $1 LIMIT 1`, [Number(requestRow.orderlineid)]);
        const previousLineRow = previousLineResult.rows[0];
        if (!previousLineRow) {
            return { status: 404, success: false, message: "Order line not found for this return request" };
        }
        const lineResult = await query(`UPDATE orderline
             SET orderstatus = 'returned',
                 returneddate = COALESCE(returneddate, ${BIGINT_NOW_SQL})
             WHERE id = $1
             RETURNING *`, [Number(requestRow.orderlineid)]);
        const lineRow = lineResult.rows[0];
        await ordersService.handleReturnedOrderLines([lineRow], new Map([[Number(lineRow.id), normalizeStatus(previousLineRow.orderstatus)]]));
        await ordersService.syncOrderHeadersFromOrderLines([lineRow.uniqueorderid]);
        const updatedRequest = await updateReturnRequestStatus(requestId, "finalized", actorId, adminComment, {
            refund_status: refundStatus,
            refund_reference: refundReference,
            restock_disposition: restockDisposition,
        });
        return {
            success: true,
            message: "Return finalized successfully",
            data: updatedRequest.data,
        };
    };
})(orderReturnsService || (orderReturnsService = {}));
//# sourceMappingURL=orderReturns.service.js.map