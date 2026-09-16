import { query } from "../database/postgres.js";
import Razorpay from "razorpay";
import { ENV_RAZORPAY_KEY_ID, ENV_RAZORPAY_KEY_SECRET, } from "../config/config.js";
const razorpay = new Razorpay({
    key_id: ENV_RAZORPAY_KEY_ID,
    key_secret: ENV_RAZORPAY_KEY_SECRET,
});
export var refundsService;
(function (refundsService) {
    const ACTIVE_REFUND_STATUSES = ["initiated", "pending", "processed", "manual_done"];
    const resolveSessionUserId = (request) => {
        const raw = request?.session?.id ??
            request?.user?.id ??
            request?.body?.userid ??
            request?.query?.userid;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
    const toPaise = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0)
            return null;
        return Math.round(parsed * 100);
    };
    const fromPaise = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed / 100 : 0;
    };
    const safeJson = (value) => {
        try {
            return value ? JSON.stringify(value) : null;
        }
        catch {
            return null;
        }
    };
    const normalizeGatewayRefundStatus = (value) => {
        const status = normalizeStatus(value);
        if (status === "processed")
            return "processed";
        if (status === "failed")
            return "failed";
        if (status === "pending")
            return "pending";
        if (status === "created")
            return "pending";
        if (!status)
            return "initiated";
        return status;
    };
    const resolveTargetOrderLine = async (input) => {
        if (input?.orderlineid) {
            const result = await query(`SELECT * FROM orderline WHERE id = $1 LIMIT 1`, [Number(input.orderlineid)]);
            return result.rows[0] || null;
        }
        if (input?.orderlinenumber) {
            const result = await query(`SELECT * FROM orderline WHERE orderlinenumber = $1 LIMIT 1`, [String(input.orderlinenumber)]);
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
    const getLatestReturnRequest = async (orderlineId) => {
        const result = await query(`SELECT *
       FROM orderline_returns
       WHERE orderlineid = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`, [orderlineId]);
        return result.rows[0] || null;
    };
    const getLatestPaymentContext = async (merchanttransactionid) => {
        const result = await query(`SELECT transactionid, razorpay_payment_id, razorpay_order_id, transactiondata
       FROM transaction
       WHERE merchanttransactionid = $1
       ORDER BY createddate DESC
       LIMIT 1`, [merchanttransactionid]);
        return result.rows[0] || null;
    };
    const getRefundSummary = async (orderlineId, razorpayPaymentId) => {
        const [lineSummary, paymentSummary] = await Promise.all([
            query(`SELECT
            COALESCE(SUM(amount_paise), 0)::bigint AS total_amount_paise,
            COUNT(*)::int AS refund_count
         FROM payment_refunds
         WHERE orderlineid = $1
           AND status = ANY($2::text[])`, [orderlineId, ACTIVE_REFUND_STATUSES]),
            query(`SELECT COALESCE(SUM(amount_paise), 0)::bigint AS total_amount_paise
         FROM payment_refunds
         WHERE razorpay_payment_id = $1
           AND status = ANY($2::text[])`, [razorpayPaymentId, ACTIVE_REFUND_STATUSES]),
        ]);
        return {
            lineRefundedPaise: Number(lineSummary.rows[0]?.total_amount_paise || 0),
            lineRefundCount: Number(lineSummary.rows[0]?.refund_count || 0),
            paymentRefundedPaise: Number(paymentSummary.rows[0]?.total_amount_paise || 0),
        };
    };
    const updateLinkedReturnRefundState = async (orderlineId, status, refundReference) => {
        await query(`UPDATE orderline_returns
       SET refund_status = $1,
           refund_reference = COALESCE($2, refund_reference),
           updated_at = NOW()
       WHERE id = (
         SELECT id
         FROM orderline_returns
         WHERE orderlineid = $3
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       )`, [status, refundReference, orderlineId]);
    };
    const getRefundEligibilityContext = async (input) => {
        const lineRow = await resolveTargetOrderLine(input);
        if (!lineRow) {
            return { status: 404, success: false, message: "Order line not found" };
        }
        if (String(lineRow?.ordertype || "Orders").trim() !== "Orders") {
            return { status: 400, success: false, message: "Refunds are only supported for normal order lines" };
        }
        const latestReturn = await getLatestReturnRequest(Number(lineRow.id));
        const orderStatus = normalizeStatus(lineRow.orderstatus);
        const returnStatus = normalizeStatus(latestReturn?.status);
        const isCancellationRefund = orderStatus === "cancelled";
        const isReturnRefund = ["received", "finalized"].includes(returnStatus) || orderStatus === "returned";
        if (!isCancellationRefund && !isReturnRefund) {
            return {
                status: 400,
                success: false,
                message: "Refund is allowed only for cancelled orders or verified returns",
            };
        }
        const paymentContext = await getLatestPaymentContext(lineRow.merchanttransactionid);
        if (!paymentContext?.razorpay_payment_id) {
            return {
                status: 400,
                success: false,
                message: "No Razorpay payment found for this order line",
            };
        }
        const payment = await razorpay.payments.fetch(paymentContext.razorpay_payment_id);
        if (normalizeStatus(payment?.status) !== "captured") {
            return {
                status: 400,
                success: false,
                message: "Refund can be initiated only for captured Razorpay payments",
            };
        }
        const summary = await getRefundSummary(Number(lineRow.id), String(paymentContext.razorpay_payment_id));
        const lineAmountPaise = Math.max(0, Math.round(Number(lineRow.orderamount || 0) * 100));
        const paymentAmountPaise = Number(payment?.amount || 0);
        const remainingLinePaise = Math.max(0, lineAmountPaise - summary.lineRefundedPaise);
        const remainingPaymentPaise = Math.max(0, paymentAmountPaise - summary.paymentRefundedPaise);
        const maxRefundablePaise = Math.min(remainingLinePaise, remainingPaymentPaise);
        if (maxRefundablePaise <= 0) {
            return {
                status: 409,
                success: false,
                message: "No refundable balance remaining for this order line",
            };
        }
        return {
            success: true,
            data: {
                lineRow,
                latestReturn,
                paymentContext,
                payment,
                lineAmountPaise,
                maxRefundablePaise,
                refundedPaise: summary.lineRefundedPaise,
                lineRefundCount: summary.lineRefundCount,
                refundFlow: isCancellationRefund ? "cancelled_order" : "verified_return",
            },
        };
    };
    refundsService.getRefunds = async (request) => {
        const queryParams = [];
        const whereClauses = [];
        let parameterIndex = 1;
        Object.entries(request?.query || {}).forEach(([rawKey, rawValue]) => {
            if (rawValue === undefined || rawValue === null || rawValue === "")
                return;
            const key = String(rawKey);
            const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
            switch (key) {
                case "id":
                case "orderlineid":
                case "return_request_id":
                    whereClauses.push(`pr.${key} = $${parameterIndex}`);
                    queryParams.push(Number(value));
                    parameterIndex++;
                    break;
                case "merchanttransactionid":
                case "razorpay_payment_id":
                case "razorpay_refund_id":
                case "status":
                    whereClauses.push(`pr.${key} = $${parameterIndex}`);
                    queryParams.push(String(value));
                    parameterIndex++;
                    break;
                default:
                    break;
            }
        });
        const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
        const result = await query(`SELECT pr.*
       FROM payment_refunds pr
       ${whereSql}
       ORDER BY pr.created_at DESC, pr.id DESC`, queryParams);
        return {
            success: true,
            data: result.rows,
        };
    };
    refundsService.getRefundEligibility = async (request) => {
        const context = await getRefundEligibilityContext({
            ...request?.query,
            ...request?.body,
        });
        if (!context?.success)
            return context;
        const data = context.data;
        return {
            success: true,
            data: {
                orderlineid: data.lineRow.id,
                orderlinenumber: data.lineRow.orderlinenumber,
                merchanttransactionid: data.lineRow.merchanttransactionid,
                razorpayPaymentId: data.paymentContext.razorpay_payment_id,
                lineAmount: fromPaise(data.lineAmountPaise),
                refundedAmount: fromPaise(data.refundedPaise),
                maxRefundableAmount: fromPaise(data.maxRefundablePaise),
                refundFlow: data.refundFlow,
                returnRequestStatus: data.latestReturn?.status || null,
            },
        };
    };
    refundsService.initiateRefund = async (request) => {
        const actorId = resolveSessionUserId(request);
        const body = request?.body || {};
        const context = await getRefundEligibilityContext(body);
        if (!context?.success)
            return context;
        const { lineRow, latestReturn, paymentContext, maxRefundablePaise, refundFlow, } = context.data;
        const requestedAmountPaise = toPaise(body?.amount) ?? maxRefundablePaise;
        if (requestedAmountPaise <= 0) {
            return { status: 400, success: false, message: "Refund amount must be greater than zero" };
        }
        if (requestedAmountPaise > maxRefundablePaise) {
            return {
                status: 400,
                success: false,
                message: `Refund amount exceeds refundable balance of INR ${fromPaise(maxRefundablePaise).toFixed(2)}`,
            };
        }
        const reasonCode = String(body?.reasonCode || refundFlow).trim().toLowerCase() || null;
        const reasonText = body?.reasonText ? String(body.reasonText).trim() : null;
        const adminNote = body?.adminNote ? String(body.adminNote).trim() : null;
        try {
            const refund = await razorpay.payments.refund(String(paymentContext.razorpay_payment_id), {
                amount: requestedAmountPaise,
                speed: "normal",
                notes: {
                    merchanttransactionid: String(lineRow.merchanttransactionid || ""),
                    orderlineid: String(lineRow.id),
                    uniqueorderid: String(lineRow.uniqueorderid || ""),
                    reason_code: String(reasonCode || ""),
                },
            });
            const normalizedStatus = normalizeGatewayRefundStatus(refund?.status);
            const insertResult = await query(`INSERT INTO payment_refunds (
            orderlineid,
            uniqueorderid,
            merchanttransactionid,
            userid,
            productid,
            transactionid,
            return_request_id,
            razorpay_payment_id,
            razorpay_refund_id,
            amount_paise,
            currency,
            status,
            gateway_status,
            reason_code,
            reason_text,
            admin_note,
            gateway_response,
            requested_by,
            processed_by,
            synced_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
        )
        RETURNING *`, [
                Number(lineRow.id),
                lineRow.uniqueorderid,
                lineRow.merchanttransactionid,
                Number(lineRow.userid || actorId || 0) || null,
                Number(lineRow.productid || 0) || null,
                paymentContext.transactionid || null,
                latestReturn?.id || null,
                paymentContext.razorpay_payment_id,
                refund?.id || null,
                requestedAmountPaise,
                refund?.currency || "INR",
                normalizedStatus,
                normalizeStatus(refund?.status) || normalizedStatus,
                reasonCode,
                reasonText,
                adminNote,
                safeJson(refund),
                actorId,
                actorId,
            ]);
            if (latestReturn?.id) {
                await updateLinkedReturnRefundState(Number(lineRow.id), normalizedStatus, refund?.id || null);
            }
            return {
                success: true,
                message: "Refund initiated successfully",
                data: insertResult.rows[0] || null,
            };
        }
        catch (error) {
            const gatewayError = error?.error || error?.response?.data || error?.message || error;
            return {
                status: 400,
                success: false,
                message: gatewayError?.description || gatewayError?.message || "Unable to initiate refund",
                data: gatewayError,
            };
        }
    };
    refundsService.syncRefund = async (request) => {
        const body = request?.body || {};
        let refundRow = null;
        if (body?.id) {
            const result = await query(`SELECT * FROM payment_refunds WHERE id = $1 LIMIT 1`, [Number(body.id)]);
            refundRow = result.rows[0] || null;
        }
        else if (body?.razorpayRefundId) {
            const result = await query(`SELECT * FROM payment_refunds WHERE razorpay_refund_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [String(body.razorpayRefundId)]);
            refundRow = result.rows[0] || null;
        }
        else if (body?.orderlineid) {
            const result = await query(`SELECT * FROM payment_refunds WHERE orderlineid = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [Number(body.orderlineid)]);
            refundRow = result.rows[0] || null;
        }
        if (!refundRow?.razorpay_payment_id || !refundRow?.razorpay_refund_id) {
            return { status: 404, success: false, message: "Refund record not found" };
        }
        try {
            const refund = await razorpay.payments.fetchRefund(String(refundRow.razorpay_payment_id), String(refundRow.razorpay_refund_id));
            const normalizedStatus = normalizeGatewayRefundStatus(refund?.status);
            const updateResult = await query(`UPDATE payment_refunds
         SET status = $1,
             gateway_status = $2,
             currency = COALESCE($3, currency),
             gateway_response = $4,
             gateway_error = NULL,
             synced_at = NOW(),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`, [
                normalizedStatus,
                normalizeStatus(refund?.status) || normalizedStatus,
                refund?.currency || null,
                safeJson(refund),
                Number(refundRow.id),
            ]);
            if (refundRow?.return_request_id) {
                await updateLinkedReturnRefundState(Number(refundRow.orderlineid), normalizedStatus, refund?.id || refundRow.razorpay_refund_id);
            }
            return {
                success: true,
                message: "Refund synchronized successfully",
                data: updateResult.rows[0] || refundRow,
            };
        }
        catch (error) {
            await query(`UPDATE payment_refunds
         SET gateway_error = $1,
             synced_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`, [safeJson(error?.error || error?.response?.data || error?.message || error), Number(refundRow.id)]);
            return {
                status: 400,
                success: false,
                message: error?.error?.description || error?.response?.data?.message || error?.message || "Unable to sync refund",
            };
        }
    };
})(refundsService || (refundsService = {}));
//# sourceMappingURL=refunds.service.js.map