import crypto from "crypto";
import axios from "axios";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
import { ordersService } from "./orders.service.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import Razorpay from "razorpay";
import { ENV_RAZORPAY_KEY_ID, ENV_RAZORPAY_KEY_SECRET, ENV_RAZORPAY_WEBHOOK_SECRET, REDIRECT_URL_PAYMENT_STATUS, REDIRECT_URL_SUCCESS, } from "../config/config.js";
import { productrevoService } from "./productrevo.service.js";
import { createHttpTask } from "../googletask/createtask.js";
import { cartservice } from "./cart.service.js";
import { messageinitialization } from "../firebase/firebasepushmessage.js";
import { thirdPartyOrdersService } from "./thirdpartyorders.service.js";
import loginShiprocket from "../shiprocket/shiprocketAuth.js";
import { redisClient } from "../database/redis.session.js";
//phonepe pay
const MERCHANT_ID = "PGTESTPAYUAT86";
const SALT_KEY = "96434309-7796-489d-8924-ab56988a6076";
//razorpay pay
const RAZORPAY_KEY_ID = ENV_RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = ENV_RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = ENV_RAZORPAY_WEBHOOK_SECRET;
const RAZORPAY_WEBHOOK_LOG_PREFIX = "[RazorpayWebhook]";
const keyIndex = 1;
console.log("Razorpay gateway initialized");
let transactionDataset = {};
let dummyorderdata = [];
let cartIddata = [];
let productupdateorderqty = [];
let insersertdordderdatawithprocessing = [];
const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
});
const toSafeNumber = (value, defaultValue = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};
const computePayableAmountFromOrderInput = (orderItems, fallbackAmount) => {
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
        return toSafeNumber(fallbackAmount, 0);
    }
    const computed = orderItems.reduce((total, item) => {
        const quantity = toSafeNumber(item?.quantity, 0);
        const productAmount = toSafeNumber(item?.productamount, 0);
        const lineOrderAmount = toSafeNumber(item?.orderamount, 0);
        if (productAmount > 0 && quantity > 0) {
            return total + productAmount * quantity;
        }
        if (lineOrderAmount > 0) {
            return total + lineOrderAmount;
        }
        return total;
    }, 0);
    return computed > 0 ? computed : toSafeNumber(fallbackAmount, 0);
};
const groupOrderQuantities = (orderItems = []) => {
    const grouped = new Map();
    for (const item of orderItems) {
        const productId = toSafeNumber(item?.productid, 0);
        const qty = toSafeNumber(item?.quantity, 0);
        if (!productId || qty <= 0)
            continue;
        grouped.set(productId, (grouped.get(productId) || 0) + qty);
    }
    return grouped;
};
const releaseInventoryLocksByOrderItems = async (orderItems = []) => {
    const grouped = groupOrderQuantities(orderItems);
    if (grouped.size === 0) {
        return;
    }
    const entries = Array.from(grouped.entries());
    const values = [];
    const cases = [];
    const inClauses = [];
    entries.forEach(([productId, qty], index) => {
        const productIdPlaceholder = index * 2 + 1;
        const qtyPlaceholder = index * 2 + 2;
        values.push(productId, qty);
        cases.push(`WHEN id = $${productIdPlaceholder} THEN GREATEST(lock_qty - $${qtyPlaceholder}, 0)`);
        inClauses.push(`$${productIdPlaceholder}`);
    });
    const releaseQuery = `
    UPDATE product_revo
    SET lock_qty = CASE
      ${cases.join(" ")}
      ELSE lock_qty
    END
    WHERE id IN (${inClauses.join(", ")})
  `;
    await query(releaseQuery, values);
};
const safeCleanupPendingOrder = async (merchantTransactionId) => {
    if (!merchantTransactionId)
        return;
    try {
        await ordersService.deleteFailedOrder(merchantTransactionId);
    }
    catch (cleanupError) {
        console.error("Failed to cleanup pending order:", cleanupError?.message || cleanupError);
    }
};
const parseHeaderValue = (headerValue) => {
    if (!headerValue)
        return null;
    if (Array.isArray(headerValue)) {
        return headerValue[0] || null;
    }
    return String(headerValue);
};
const shortRef = (value, prefix = 6, suffix = 4) => {
    if (!value)
        return null;
    const str = String(value);
    if (str.length <= prefix + suffix)
        return str;
    return `${str.slice(0, prefix)}...${str.slice(-suffix)}`;
};
const resolveWebhookTraceId = (eventId, paymentId) => {
    if (eventId)
        return eventId;
    if (paymentId)
        return `payment-${paymentId}`;
    return `trace-${Date.now()}`;
};
const logWebhookStep = (traceId, step, details) => {
    if (details && Object.keys(details).length > 0) {
        console.log(`${RAZORPAY_WEBHOOK_LOG_PREFIX} [${traceId}] ${step}`, details);
        return;
    }
    console.log(`${RAZORPAY_WEBHOOK_LOG_PREFIX} [${traceId}] ${step}`);
};
const summarizeStatusCounts = (rows, field) => {
    const counts = {};
    rows.forEach((row) => {
        const key = row?.[field] === null || row?.[field] === undefined
            ? "null"
            : String(row[field]);
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
};
const summarizeWebhookPayload = (eventPayload) => {
    const paymentEntity = eventPayload?.payload?.payment?.entity || {};
    const orderEntity = eventPayload?.payload?.order?.entity || {};
    return {
        event: eventPayload?.event || null,
        accountId: eventPayload?.account_id || null,
        createdAt: eventPayload?.created_at || null,
        contains: Object.keys(eventPayload?.payload || {}),
        payment: {
            id: paymentEntity?.id || null,
            orderId: paymentEntity?.order_id || orderEntity?.id || null,
            status: paymentEntity?.status || null,
            amount: paymentEntity?.amount || null,
            currency: paymentEntity?.currency || null,
            method: paymentEntity?.method || null,
            captured: paymentEntity?.captured || null,
            errorCode: paymentEntity?.error_code || null,
            errorDescription: paymentEntity?.error_description || null,
        },
        order: {
            id: orderEntity?.id || null,
            amount: orderEntity?.amount || null,
            status: orderEntity?.status || null,
            paidAt: orderEntity?.paid_at || null,
        },
    };
};
const getMerchantTransactionStateSnapshot = async (merchantTransactionId) => {
    if (!merchantTransactionId)
        return null;
    try {
        const [ordersResult, thirdPartyOrdersResult, orderLineResult, transactionResult] = await Promise.all([
            query(`SELECT orderstatus, ispaymentsucceed FROM orders WHERE merchanttransactionid = $1`, [merchantTransactionId]),
            query(`SELECT orderstatus, ispaymentsucceed FROM thirdpartyorders WHERE merchanttransactionid = $1`, [merchantTransactionId]),
            query(`SELECT orderstatus FROM orderline WHERE merchanttransactionid = $1`, [merchantTransactionId]),
            query(`SELECT transactionid, razorpay_payment_id, razorpay_order_id
           FROM transaction
           WHERE merchanttransactionid = $1
           ORDER BY createddate DESC
           LIMIT 5`, [merchantTransactionId]),
        ]);
        return {
            merchantTransactionId,
            orders: {
                count: ordersResult.rowCount,
                statusCounts: summarizeStatusCounts(ordersResult.rows, "orderstatus"),
                paymentSuccessCounts: summarizeStatusCounts(ordersResult.rows, "ispaymentsucceed"),
            },
            thirdPartyOrders: {
                count: thirdPartyOrdersResult.rowCount,
                statusCounts: summarizeStatusCounts(thirdPartyOrdersResult.rows, "orderstatus"),
                paymentSuccessCounts: summarizeStatusCounts(thirdPartyOrdersResult.rows, "ispaymentsucceed"),
            },
            orderLine: {
                count: orderLineResult.rowCount,
                statusCounts: summarizeStatusCounts(orderLineResult.rows, "orderstatus"),
            },
            transactions: {
                count: transactionResult.rowCount,
                latest: transactionResult.rows.map((row) => ({
                    transactionid: row?.transactionid,
                    razorpayPaymentId: row?.razorpay_payment_id,
                    razorpayOrderId: row?.razorpay_order_id,
                })),
            },
        };
    }
    catch (error) {
        return {
            merchantTransactionId,
            snapshotError: error?.message || "Unable to fetch state snapshot",
        };
    }
};
const timingSafeHexEqual = (expectedHex, receivedHex) => {
    try {
        const expected = Buffer.from(expectedHex || "", "hex");
        const received = Buffer.from(receivedHex || "", "hex");
        if (expected.length === 0 || received.length === 0)
            return false;
        if (expected.length !== received.length)
            return false;
        return crypto.timingSafeEqual(new Uint8Array(expected), new Uint8Array(received));
    }
    catch {
        return false;
    }
};
const acquireProcessingLock = async (lockKey, ttlSeconds = 120) => {
    if (!lockKey || !redisClient || !redisClient.isOpen) {
        return { acquired: true, key: null };
    }
    const redisKey = `payment:lock:${lockKey}`;
    const result = await redisClient.set(redisKey, "1", {
        NX: true,
        EX: ttlSeconds,
    });
    return { acquired: result === "OK", key: redisKey };
};
const releaseProcessingLock = async (lockKey) => {
    if (!lockKey || !redisClient || !redisClient.isOpen)
        return;
    try {
        await redisClient.del(lockKey);
    }
    catch (lockReleaseError) {
        console.error("Unable to release processing lock:", lockReleaseError?.message || lockReleaseError);
    }
};
const createWebhookEventLedgerEntry = async (eventId, eventName, payload) => {
    if (!eventId)
        return null;
    try {
        const insertResult = await query(`INSERT INTO payment_webhook_events (provider, event_id, event_name, payload, status)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`, ["razorpay", eventId, eventName || null, JSON.stringify(payload || {}), "received"]);
        if (insertResult.rows.length === 0) {
            return { duplicate: true, id: null };
        }
        return { duplicate: false, id: insertResult.rows[0].id };
    }
    catch (error) {
        return null;
    }
};
const markWebhookEventLedgerStatus = async (ledgerId, status, errorMessage) => {
    if (!ledgerId)
        return;
    try {
        await query(`UPDATE payment_webhook_events
       SET status = $1,
           error_message = $2,
           processed_at = NOW()
       WHERE id = $3`, [status, errorMessage || null, ledgerId]);
    }
    catch (error) {
        console.error("Unable to update webhook ledger status:", error?.message || error);
    }
};
const hasProcessedWebhookEvent = async (eventId) => {
    if (!eventId || !redisClient || !redisClient.isOpen) {
        return false;
    }
    const redisKey = `razorpay:webhook:event:${eventId}`;
    const existing = await redisClient.get(redisKey);
    if (existing)
        return true;
    await redisClient.setEx(redisKey, 60 * 60 * 24 * 7, "1");
    return false;
};
const getOrderContextByMerchantTransactionId = async (merchantTransactionId) => {
    const ordersResult = await query(`SELECT * FROM orders WHERE merchanttransactionid = $1`, [merchantTransactionId]);
    const thirdPartyOrdersResult = await query(`SELECT * FROM thirdpartyorders WHERE merchanttransactionid = $1`, [merchantTransactionId]);
    const orderLineResult = await query(`SELECT * FROM orderline WHERE merchanttransactionid = $1`, [merchantTransactionId]);
    const combinedOrderRows = [...ordersResult.rows, ...thirdPartyOrdersResult.rows];
    if (combinedOrderRows.length === 0) {
        return null;
    }
    const expectedAmountRupees = ordersResult.rows.reduce((sum, row) => sum + toSafeNumber(row?.orderamount, 0), 0) +
        thirdPartyOrdersResult.rows.reduce((sum, row) => sum + toSafeNumber(row?.orderamount, 0), 0);
    const primaryOrderRow = orderLineResult.rows[0] || combinedOrderRows[0];
    const userId = primaryOrderRow?.userid;
    const addressId = primaryOrderRow?.addressid;
    const userResult = userId
        ? await query(`SELECT firstname, lastname, useremail, usermobilenumber FROM users WHERE id = $1`, [userId])
        : { rows: [] };
    const addressResult = addressId
        ? await query(`SELECT address, city, state, pincode, mobilenumber FROM address WHERE id = $1`, [addressId])
        : { rows: [] };
    const orderLineItems = orderLineResult.rows.map((row) => ({
        id: row.id,
        uniqueorderid: row.uniqueorderid,
        productid: row.productid,
        quantity: row.quantity,
        ordername: row.ordername,
        userid: row.userid,
        addressid: row.addressid,
        invoicefor: row.invoicefor,
        paymentmethod: row.paymentmethod,
        orderamount: row.orderamount,
        productamount: row.productamount,
        productname: row.productname,
    }));
    const productIdsFromOrderLine = orderLineItems
        .map((row) => row.productid)
        .filter((id) => id !== null && id !== undefined);
    const productIds = productIdsFromOrderLine.length > 0
        ? Array.from(new Set(productIdsFromOrderLine))
        : Array.from(new Set(combinedOrderRows.flatMap((row) => Array.isArray(row?.productid) ? row.productid : [row?.productid]))).filter((id) => id !== null && id !== undefined);
    const transactionFor = primaryOrderRow?.invoicefor ||
        primaryOrderRow?.transactionfor ||
        "product";
    return {
        merchantTransactionId,
        combinedOrderRows,
        orderLineItems,
        primaryOrderRow,
        user: userResult.rows[0] || null,
        address: addressResult.rows[0] || null,
        userId,
        transactionFor,
        productIds,
        expectedAmountRupees,
    };
};
const resolveUniqueOrderIdFromContext = (context) => {
    const candidates = [
        context?.primaryOrderRow?.uniqueorderid,
        context?.orderLineItems?.[0]?.uniqueorderid,
        context?.combinedOrderRows?.[0]?.orderid,
        context?.combinedOrderRows?.[0]?.uniqueorderid,
    ];
    for (const candidate of candidates) {
        if (candidate != null && String(candidate).trim() !== "") {
            return String(candidate).trim();
        }
    }
    return null;
};
const createShiprocketOrderForTransaction = async (context, transactionData) => {
    try {
        const token = await loginShiprocket();
        const orderData = context.orderLineItems[0] || context.primaryOrderRow;
        if (!orderData || !context.user || !context.address) {
            return;
        }
        const shiprocketPayload = {
            order_id: transactionData.merchanttransactionId,
            order_date: new Date().toISOString(),
            pickup_location: "warehouse",
            billing_customer_name: context.user?.firstname || "Customer",
            billing_last_name: context.user?.lastname || "Customer",
            billing_address: context.address?.address || "Not Provided",
            billing_address_2: "Not Given",
            billing_city: context.address?.city || "Unknown City",
            billing_pincode: context.address?.pincode || "000000",
            billing_state: context.address?.state || "Unknown State",
            billing_country: "India",
            billing_email: context.user?.useremail || transactionData.name,
            billing_phone: context.user?.usermobilenumber || transactionData.mobilenumber,
            shipping_customer_name: context.user?.firstname || "Customer",
            shipping_last_name: context.user?.lastname || "Customer",
            shipping_address: context.address?.address || "Not Provided",
            shipping_address_2: "Not Given",
            shipping_city: context.address?.city || "Unknown City",
            shipping_pincode: context.address?.pincode || "000000",
            shipping_state: context.address?.state || "Unknown State",
            shipping_country: "India",
            shipping_is_billing: true,
            shipping_email: context.user?.useremail || transactionData.name,
            shipping_phone: context.user?.usermobilenumber || transactionData.mobilenumber,
            order_items: [
                {
                    name: orderData.productname || "Product",
                    sku: `SKU-${orderData.productid}`,
                    units: toSafeNumber(orderData.quantity, 1),
                    selling_price: toSafeNumber(orderData.productamount, 0),
                },
            ],
            payment_method: orderData.paymentmethod === "COD" ? "COD" : "Prepaid",
            sub_total: toSafeNumber(orderData.orderamount, transactionData.amount),
            length: 10,
            breadth: 10,
            height: 10,
            weight: 0.5,
        };
        let shiprocketOrderData = null;
        try {
            const shiprocketResponse = await axios.post(`${process.env.SHIPROCKET_BASE_URL}/orders/create/adhoc`, shiprocketPayload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });
            shiprocketOrderData = shiprocketResponse.data;
        }
        catch (error) {
            console.error("Shiprocket order creation failed:", error.response?.data || error.message);
            return;
        }
        if (!shiprocketOrderData) {
            return;
        }
        await query(`UPDATE orders 
       SET shiprocket_order_id = $1, shiprocket_shipment_id = $2, shiprocket_status_code = $3, shiprocket_status = $4, shiprocket_channel_order_id = $5
       WHERE merchanttransactionid = $6`, [
            shiprocketOrderData.order_id,
            shiprocketOrderData.shipment_id,
            shiprocketOrderData.status_code,
            shiprocketOrderData.status,
            shiprocketOrderData.channel_order_id,
            transactionData.merchanttransactionId,
        ]);
        await query(`UPDATE thirdpartyorders 
       SET shiprocket_order_id = $1, shiprocket_shipment_id = $2, shiprocket_status_code = $3, shiprocket_status = $4, shiprocket_channel_order_id = $5
       WHERE merchanttransactionid = $6`, [
            shiprocketOrderData.order_id,
            shiprocketOrderData.shipment_id,
            shiprocketOrderData.status_code,
            shiprocketOrderData.status,
            shiprocketOrderData.channel_order_id,
            transactionData.merchanttransactionId,
        ]);
    }
    catch (error) {
        console.error("Shiprocket integration failed:", error?.message || error);
    }
};
const finalizeCapturedRazorpayPayment = async ({ razorpayPaymentId, razorpayOrderId, razorpaySignature, verifyCheckoutSignature, source, traceId = null, }) => {
    const resolvedTraceId = traceId || `finalize-${source || "unknown"}`;
    logWebhookStep(resolvedTraceId, "FINALIZE_START", {
        source,
        razorpayPaymentId: shortRef(razorpayPaymentId),
        razorpayOrderId: shortRef(razorpayOrderId),
        verifyCheckoutSignature,
    });
    const gatewayOrder = await razorpay.orders.fetch(razorpayOrderId);
    const merchantTransactionId = gatewayOrder?.receipt;
    logWebhookStep(resolvedTraceId, "GATEWAY_ORDER_FETCHED", {
        razorpayOrderId: gatewayOrder?.id || razorpayOrderId,
        merchantTransactionId,
    });
    if (!merchantTransactionId) {
        logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
            status: 400,
            message: "Unable to map Razorpay order to merchant transaction",
        });
        return { status: 400, message: "Unable to map Razorpay order to merchant transaction" };
    }
    const lock = await acquireProcessingLock(`razorpay:${merchantTransactionId}:${razorpayPaymentId}`, 180);
    logWebhookStep(resolvedTraceId, "LOCK_ATTEMPT", {
        merchantTransactionId,
        lockAcquired: lock.acquired,
    });
    if (!lock.acquired) {
        const existingTransaction = await query(`SELECT transactionid FROM transaction WHERE razorpay_payment_id = $1 OR razorpay_order_id = $2 OR merchanttransactionid = $3 LIMIT 1`, [razorpayPaymentId, razorpayOrderId, merchantTransactionId]);
        if (existingTransaction.rows.length > 0) {
            const existingContext = await getOrderContextByMerchantTransactionId(merchantTransactionId);
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 200,
                message: "Payment already processed",
                reason: "lock-not-acquired-existing-transaction",
            });
            return {
                status: 200,
                message: "Payment already processed",
                data: {
                    redirectUrl: REDIRECT_URL_SUCCESS,
                    uniqueorderid: resolveUniqueOrderIdFromContext(existingContext),
                },
            };
        }
        logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
            merchantTransactionId,
            status: 202,
            message: "Payment processing in progress",
            reason: "lock-not-acquired-no-transaction",
        });
        return { status: 202, message: "Payment processing in progress" };
    }
    try {
        const existingTransaction = await query(`SELECT transactionid FROM transaction WHERE razorpay_payment_id = $1 OR razorpay_order_id = $2 OR merchanttransactionid = $3 LIMIT 1`, [razorpayPaymentId, razorpayOrderId, merchantTransactionId]);
        if (existingTransaction.rows.length > 0) {
            const existingContext = await getOrderContextByMerchantTransactionId(merchantTransactionId);
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 200,
                message: "Payment already processed",
                reason: "existing-transaction-before-process",
            });
            return {
                status: 200,
                message: "Payment already processed",
                data: {
                    redirectUrl: REDIRECT_URL_SUCCESS,
                    uniqueorderid: resolveUniqueOrderIdFromContext(existingContext),
                },
            };
        }
        if (verifyCheckoutSignature) {
            const generatedSignature = crypto
                .createHmac("sha256", RAZORPAY_KEY_SECRET)
                .update(`${gatewayOrder.id}|${razorpayPaymentId}`)
                .digest("hex");
            logWebhookStep(resolvedTraceId, "CHECKOUT_SIGNATURE_VERIFICATION", {
                merchantTransactionId,
                generatedSignatureRef: shortRef(generatedSignature),
                receivedSignatureRef: shortRef(razorpaySignature),
            });
            if (!timingSafeHexEqual(generatedSignature, razorpaySignature || "")) {
                await safeCleanupPendingOrder(merchantTransactionId);
                const cleanupSnapshot = await getMerchantTransactionStateSnapshot(merchantTransactionId);
                logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                    merchantTransactionId,
                    status: 400,
                    message: "Invalid payment signature",
                    cleanupSnapshot,
                });
                return { status: 400, message: "Invalid payment signature" };
            }
        }
        const payment = await razorpay.payments.fetch(razorpayPaymentId);
        logWebhookStep(resolvedTraceId, "PAYMENT_FETCHED", {
            merchantTransactionId,
            paymentStatus: payment?.status,
            paymentAmount: payment?.amount,
            paymentCurrency: payment?.currency,
            paymentMethod: payment?.method,
            paymentOrderId: payment?.order_id,
        });
        if (payment?.order_id !== gatewayOrder.id) {
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 400,
                message: "Payment does not belong to the expected order",
            });
            return { status: 400, message: "Payment does not belong to the expected order" };
        }
        if (payment.status !== "captured") {
            if (payment.status === "failed") {
                await safeCleanupPendingOrder(merchantTransactionId);
                const failedCleanupSnapshot = await getMerchantTransactionStateSnapshot(merchantTransactionId);
                logWebhookStep(resolvedTraceId, "PAYMENT_FAILED_CLEANUP", {
                    merchantTransactionId,
                    failedCleanupSnapshot,
                });
            }
            if (source === "webhook" && payment.status === "authorized") {
                logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                    merchantTransactionId,
                    status: 200,
                    message: "Payment authorized, waiting for capture",
                });
                return { status: 200, message: "Payment authorized, waiting for capture" };
            }
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 400,
                message: "Payment not captured",
            });
            return { status: 400, message: "Payment not captured" };
        }
        const context = await getOrderContextByMerchantTransactionId(merchantTransactionId);
        if (!context) {
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 400,
                message: "Payment timed out, try again.",
            });
            return { status: 400, message: "Payment timed out, try again." };
        }
        logWebhookStep(resolvedTraceId, "ORDER_CONTEXT_RESOLVED", {
            merchantTransactionId,
            totalOrderRows: context?.combinedOrderRows?.length || 0,
            totalOrderLineRows: context?.orderLineItems?.length || 0,
            transactionFor: context?.transactionFor,
            expectedAmountRupees: context?.expectedAmountRupees,
        });
        const alreadySucceeded = context.combinedOrderRows.some((row) => row?.ispaymentsucceed === true || row?.ispaymentsucceed === "true");
        if (alreadySucceeded) {
            const alreadyProcessedSnapshot = await getMerchantTransactionStateSnapshot(merchantTransactionId);
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 200,
                message: "Payment already processed",
                alreadyProcessedSnapshot,
            });
            return {
                status: 200,
                message: "Payment already processed",
                data: {
                    redirectUrl: REDIRECT_URL_SUCCESS,
                    uniqueorderid: resolveUniqueOrderIdFromContext(context),
                },
            };
        }
        const expectedAmountPaise = Math.round(toSafeNumber(context.expectedAmountRupees, 0) * 100);
        if (expectedAmountPaise > 0 && Number(payment.amount) !== expectedAmountPaise) {
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 400,
                message: "Amount mismatch between order and payment",
                expectedAmountPaise,
                receivedAmountPaise: Number(payment.amount),
            });
            return { status: 400, message: "Amount mismatch between order and payment" };
        }
        const transactionPayload = {
            transaction: {
                merchanttransactionId: merchantTransactionId,
                name: context.user?.useremail || "unknown",
                amount: toSafeNumber(context.expectedAmountRupees, 0),
                mobilenumber: context.user?.usermobilenumber || context.address?.mobilenumber || null,
                productid: context.productIds,
                transactionfor: context.transactionFor,
                userId: context.userId,
                transactiondata: payment,
                razorpay_signature: razorpaySignature || "",
            },
            order: context.orderLineItems,
        };
        let result;
        try {
            logWebhookStep(resolvedTraceId, "TRANSACTION_INSERT_START", {
                merchantTransactionId,
                orderLineItems: context.orderLineItems.length,
            });
            result = await transactionService.insertTransactionData(transactionPayload, context.combinedOrderRows);
        }
        catch (error) {
            if (error?.code === "23505") {
                const duplicateSnapshot = await getMerchantTransactionStateSnapshot(merchantTransactionId);
                logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                    merchantTransactionId,
                    status: 200,
                    message: "Payment already processed",
                    reason: "unique-constraint",
                    duplicateSnapshot,
                });
                return {
                    status: 200,
                    message: "Payment already processed",
                    data: {
                        redirectUrl: REDIRECT_URL_SUCCESS,
                        uniqueorderid: resolveUniqueOrderIdFromContext(await getOrderContextByMerchantTransactionId(merchantTransactionId)),
                    },
                };
            }
            throw error;
        }
        logWebhookStep(resolvedTraceId, "TRANSACTION_INSERT_RESULT", {
            merchantTransactionId,
            transactionCount: Array.isArray(result?.transactionData)
                ? result.transactionData.length
                : 0,
            orderDataRows: Array.isArray(result?.orderdata) ? result.orderdata.length : 0,
        });
        if (!result?.orderdata ||
            !result?.transactionData ||
            result.orderdata.length === 0 ||
            result.transactionData.length === 0) {
            const failedProcessSnapshot = await getMerchantTransactionStateSnapshot(merchantTransactionId);
            logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
                merchantTransactionId,
                status: 400,
                message: "Transaction failure. If payment debited, it will be refunded in 5 business days",
                failedProcessSnapshot,
            });
            return {
                status: 400,
                message: "Transaction failure. If payment debited, it will be refunded in 5 business days",
            };
        }
        const updateProductQtyData = context.orderLineItems.map((item) => ({
            id: item.productid,
            orderedquantity: item.quantity,
            ordername: item.ordername,
        }));
        if (updateProductQtyData.length > 0) {
            logWebhookStep(resolvedTraceId, "PRODUCT_QTY_UPDATE_START", {
                merchantTransactionId,
                items: updateProductQtyData,
            });
            await productrevoService.updateOrderedQuantityarray(updateProductQtyData);
            logWebhookStep(resolvedTraceId, "PRODUCT_QTY_UPDATE_DONE", {
                merchantTransactionId,
                updatedProducts: updateProductQtyData.length,
            });
        }
        logWebhookStep(resolvedTraceId, "SHIPROCKET_SYNC_START", {
            merchantTransactionId,
        });
        await createShiprocketOrderForTransaction(context, transactionPayload.transaction);
        logWebhookStep(resolvedTraceId, "SHIPROCKET_SYNC_DONE", {
            merchantTransactionId,
        });
        const successSnapshot = await getMerchantTransactionStateSnapshot(merchantTransactionId);
        logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
            merchantTransactionId,
            status: 200,
            message: "Payment verified and processed successfully",
            successSnapshot,
        });
        return {
            status: 200,
            message: "Payment verified and processed successfully",
            uniqueorderid: resolveUniqueOrderIdFromContext(context),
            data: {
                redirectUrl: REDIRECT_URL_SUCCESS,
                uniqueorderid: resolveUniqueOrderIdFromContext(context),
            },
        };
    }
    finally {
        logWebhookStep(resolvedTraceId, "LOCK_RELEASE", {
            lockKey: lock.key,
        });
        await releaseProcessingLock(lock.key);
    }
};
export var transactionService;
(function (transactionService) {
    transactionService.getTransactionData = async (request) => {
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
                if (key === "displaysize" || key === "price") {
                    const rangeClauses = paramValues.map((range) => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        return `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                    parameterIndex += 2 * paramValues.length;
                }
                else if (key === "sortby") {
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
            const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} ` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM transaction ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getTransactionData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionService.paymentInitialization = async (request) => {
        try {
            let { merchanttransactionId, name, amount, mobilenumber, userid, productid, transactionfor, } = request.body.transaction;
            let orderdata = request.body.order;
            dummyorderdata = orderdata.map((element) => ({ ...element }));
            productupdateorderqty = orderdata.map((element) => ({ ...element }));
            let insertdata = await productrevoService.bulkupsertProducttosetZero(orderdata, false);
            const productId = productid && productid.map((_, index) => `$${index + 1}`).join(", ");
            const queryText = `SELECT id, overallavailableqty, orderedquantity, lock_qty FROM product_revo WHERE id IN (${productId})`;
            const result = await query(queryText, productid);
            const allQuantitiesAvailable = result.rows.every((product) => Number(product.overallavailableqty) - Number(product.lock_qty) >= 0 &&
                Number(product.overallavailableqty - Number(product.orderedquantity)) >= 0);
            if (!allQuantitiesAvailable) {
                return {
                    status: 400,
                    message: "One or more products are out of stock. Please try again later.",
                };
            }
            transactionDataset = request.body;
            const data = {
                merchantId: MERCHANT_ID,
                merchantTransactionId: merchanttransactionId,
                name: name,
                amount: Number(amount) * 100,
                redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/status?id=${merchanttransactionId}&token=${request.headers.authorization}`,
                redirectMode: "POST",
                mobileNumber: mobilenumber,
                paymentInstrument: {
                    type: "PAY_PAGE",
                },
            };
            const payload = JSON.stringify(data);
            const payloadMain = Buffer.from(payload).toString("base64");
            const string = payloadMain + "/pg/v1/pay" + SALT_KEY;
            const sha256 = crypto.createHash("sha256").update(string).digest("hex");
            const checksum = sha256 + "###" + keyIndex;
            const prod_url = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
            const options = {
                method: "POST",
                url: prod_url,
                headers: {
                    accept: "application/json",
                    "Content-Type": "application/json",
                    "X-VERIFY": checksum,
                },
                data: {
                    request: payloadMain,
                },
            };
            let response;
            try {
                response = await axios(options);
            }
            catch (error) {
                console.log(error.message, "Error in axios options");
                return REDIRECT_URL_SUCCESS;
            }
            request.body.order.forEach((e) => {
                e.merchanttransactionid = response.data.data.merchantTransactionId;
            });
            request.body.order.forEach((e) => {
                cartIddata.push(e.cartId);
            });
            try {
                let createHttpTaskResult = await createHttpTask(response.data.data.merchantTransactionId);
                console.log(createHttpTaskResult, " ===>> createHttpTaskResult");
                if (createHttpTaskResult?.success === false) {
                    return {
                        status: 400,
                        message: "Task Not Created For Making Order. Please contact Admin",
                    };
                }
                let insertorderdata = await ordersService.bulkInsertOrder(request.body.transaction, request.body.order);
                insersertdordderdatawithprocessing = insertorderdata.rows;
            }
            catch (error) {
                console.log(error.message, "Error in Task paymentInitialization");
                let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return {
                    status: 500,
                    message: "Error processing order. Inventory has been reset.",
                };
            }
            console.log(response, " ===>> response in axios");
            return response.data.data.instrumentResponse.redirectInfo.url;
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization", error.message);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            return ErrorMessage;
        }
    };
    transactionService.paymentConfirmation = async (request, reply) => {
        try {
            const merchantTransactionId = request.query.id;
            const checkMerchantId = await query(`SELECT merchanttransactionid FROM orders WHERE merchanttransactionid = $1`, [merchantTransactionId]);
            if (checkMerchantId.rows.length === 0) {
                return { message: "Payment timed out, try again." };
            }
            const cloudflaretoken = request.query.token;
            const transactionfor = request.query.transactionfor;
            const merchantId = MERCHANT_ID;
            const keyIndex = 1;
            const string = `/pg/v1/status/${merchantId}/${merchantTransactionId}` + SALT_KEY;
            const sha256 = crypto.createHash("sha256").update(string).digest("hex");
            const checksum = sha256 + `###` + keyIndex;
            const options = {
                method: "GET",
                url: `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchantId}/${merchantTransactionId}`,
                headers: {
                    accept: "application/json",
                    "Content-Type": "application/json",
                    "X-VERIFY": checksum,
                    "X-MERCHANT-ID": `${merchantId}`,
                },
            };
            const response = await axios(options);
            let message = {};
            if (response.data.code && response.data.code == "PAYMENT_SUCCESS") {
                transactionDataset.transaction.transactiondata = response.data;
                message.payment = "Payment done Successfully";
                let result = await transactionService.insertTransactionData(transactionDataset, insersertdordderdatawithprocessing);
                if (result.orderdata &&
                    result.orderdata.length > 0 &&
                    result.transactionData &&
                    result.transactionData.length > 0) {
                    if (productupdateorderqty.length > 0) {
                        let updateproductorderquantiydata = [];
                        productupdateorderqty.forEach((e) => {
                            updateproductorderquantiydata.push({
                                id: e.productid,
                                orderedquantity: e.quantity,
                                ordername: e.ordername, // needed to distinguish rental vs normal
                            });
                        });
                        const updatedOrderQuantity = await productrevoService.updateOrderedQuantityarray(updateproductorderquantiydata);
                        let deleteCartData = await cartservice.deleteCart(cartIddata);
                        const messageData = {
                            title: "Hello User",
                            body: "Payment Done Successfully",
                        };
                        let resut = await messageinitialization(transactionDataset.transaction.userId, messageData);
                        if (updatedOrderQuantity == "UPDATE") {
                        }
                        else {
                        }
                    }
                }
                else {
                    let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                    return "Transaction Failure If payment debited it will be refunded in 5 business Days";
                }
            }
            else {
                let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                transactionDataset.transaction.transactiondata = response.data;
                message.payment = "Payment done Successfully";
                const messageData = {
                    title: "Hello User",
                    body: "Payment Not Done. If Any Payment Debited it will be refunded in 5 business Days",
                };
                messageinitialization(transactionDataset.transaction.userId, messageData);
                let result = await transactionService.insertTransactionData(transactionDataset, insersertdordderdatawithprocessing, 
                // razorpay_signature,
                true);
            }
            const queryParams = new URLSearchParams(response.data).toString();
            let url = REDIRECT_URL_SUCCESS;
            if (!response.data.success) {
                url = `${REDIRECT_URL_SUCCESS}`;
            }
            reply.redirect(url);
        }
        catch (error) {
            let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            console.error("Query Execution Error: IN paymentConfirmation", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionService.insertTransaction = async (transactiondata) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = transactiondata;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            querydata = `INSERT INTO transaction (${fieldNames.join(", ")}) VALUES (${fieldNames
                .map((_, index) => `$${index + 1}`)
                .join(", ")}) RETURNING *`;
            params = fieldValues;
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN insertTransaction", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionService.insertTransactionData = async (transactionData, insersertdordderdatawithprocessing, 
    // razorpay_signature: string,
    paymentfailed = false) => {
        try {
            console.log("Inside insertTransactionData service");
            console.log("Transaction Data:", transactionData);
            let { merchanttransactionId, name, amount, mobilenumber, productid, transactionfor, userId, transactiondata, } = transactionData.transaction;
            if (mobilenumber === "") {
                mobilenumber = null;
            }
            console.log("Transaction Data:>", transactionData);
            console.log("Transaction Data:>", transactionData.transaction);
            console.log("razorpay_payment_id>", transactionData.transaction.transactiondata.id);
            console.log("razorpay_order_id>", transactionData.transaction.transactiondata.order_id);
            // console.log("razorpay_signature:>", razorpay_signature);
            console.log("end");
            const razorpay_payment_id = transactionData.transaction.transactiondata.id;
            const razorpay_order_id = transactionData.transaction.transactiondata.order_id;
            const razorpay_signature = transactionData.transaction.razorpay_signature;
            const order = transactionData.order;
            const insertTransactionQuery = `
                INSERT INTO transaction (merchanttransactionId, name, amount, mobilenumber, productid, transactionfor, userId, transactiondata,razorpay_payment_id,razorpay_order_id, razorpay_signature)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`;
            const values = [
                merchanttransactionId,
                name,
                amount,
                mobilenumber,
                productid,
                transactionfor,
                userId,
                transactiondata,
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_signature,
            ];
            const transactionResult = await query(insertTransactionQuery, values);
            console.log("Transaction Result:", transactionResult.rows);
            console.log("end");
            if (transactionResult.command === "INSERT") {
                const insertedTransaction = transactionResult.rows[0];
                const finalResult = {
                    order: insersertdordderdatawithprocessing,
                    transactiondata: { ...insertedTransaction },
                };
                console.log("Final Result:", finalResult);
                const orderdata = {
                    order: finalResult.order.filter((order) => order.orderid && order.orderid.startsWith("TEQIT")),
                    transactiondata: finalResult.transactiondata,
                };
                const thirdpartyorderdata = {
                    order: finalResult.order.filter((order) => !order.orderid || !order.orderid.startsWith("TEQIT")),
                    transactiondata: finalResult.transactiondata,
                };
                console.log("Order Data:", orderdata);
                console.log("Third Party Order Data:", thirdpartyorderdata);
                console.log("Payment Failed:");
                let orderupdated = { status: null, data: null };
                let thirdpartyorderupdate = { status: null, data: null };
                const shouldUpdateOrder = orderdata.order && orderdata.order.length > 0;
                const shouldUpdateThirdPartyOrder = thirdpartyorderdata.order && thirdpartyorderdata.order.length > 0;
                console.log("Should Update Order:", shouldUpdateOrder);
                console.log("Should Update Third Party Order:", shouldUpdateThirdPartyOrder);
                console.log("end");
                if (shouldUpdateOrder) {
                    console.log("Going to update order");
                    orderupdated = await ordersService.updateOrder(orderdata, paymentfailed);
                }
                if (shouldUpdateThirdPartyOrder) {
                    console.log("Going to update third party order");
                    thirdpartyorderupdate =
                        await thirdPartyOrdersService.updateThirdPartyOrder(thirdpartyorderdata, paymentfailed);
                }
                const isOrderUpdateSuccess = shouldUpdateOrder
                    ? orderupdated.status === "success"
                    : true;
                const isThirdPartyUpdateSuccess = shouldUpdateThirdPartyOrder
                    ? thirdpartyorderupdate.status === "success"
                    : true;
                console.log("Is Order Update Success:", isOrderUpdateSuccess);
                console.log("Is Third Party Update Success:", isThirdPartyUpdateSuccess);
                console.log("end");
                if (isOrderUpdateSuccess && isThirdPartyUpdateSuccess) {
                    return {
                        orderdata: orderupdated.data || thirdpartyorderupdate.data || null,
                        transactionData: [finalResult.transactiondata],
                    };
                }
                else {
                    console.log("Order update failed");
                    return {
                        orderdata: "Order Not Updated Please contact Admin",
                        transactionData: finalResult.transactiondata,
                    };
                }
            }
            else {
                console.log("Transaction Not Inserted");
                return {
                    orderdata: "Order Not Updated Please contact Admin",
                    transactionData: "Order Not Updated Please contact Admin",
                };
            }
        }
        catch (error) {
            console.error("Error insertTransactionData:", error);
            throw error;
        }
    };
    transactionService.paymentInitializationRazorpay = async (request) => {
        try {
            console.log("Inside paymentInitializationRazorpay service");
            let { merchanttransactionId, name, amount, mobilenumber, userid, productid, transactionfor, } = request.body.transaction;
            let orderdata = request.body.order;
            console.log(">>body", request.body, ">>body");
            console.log(">>Tran", request.body.transaction, ">>Tran");
            console.log(">>orde", request.body.order, ">>orde");
            console.log("End");
            // Ensure rental quantities are up-to-date before reserving inventory.
            // Rental stock availability should consider both ecompublish=true/false items.
            if (request.body?.order?.[0]?.invoicefor === "product rental") {
                try {
                    const productIds = Array.from(new Set((orderdata || [])
                        .map((item) => Number(item?.productid))
                        .filter((id) => Number.isFinite(id) && id > 0)));
                    if (productIds.length > 0) {
                        const pucResult = await query(`SELECT DISTINCT puc FROM product_revo WHERE id = ANY($1)`, [productIds]);
                        const pucs = (pucResult.rows || [])
                            .map((row) => String(row?.puc || "").trim())
                            .filter(Boolean);
                        await Promise.all(pucs.map((puc) => productrevoService.updateCatalogueQuantities(puc)));
                    }
                }
                catch (error) {
                    console.warn("Failed to refresh rental catalogue quantities before checkout:", error?.message || error);
                }
            }
            if (request.body.order[0].paymentmethod === "Cash") {
                console.log("Inside Cash");
                dummyorderdata = orderdata.map((element) => ({ ...element }));
                productupdateorderqty = orderdata.map((element) => ({
                    ...element,
                }));
                let insertdata = await productrevoService.bulkupsertProducttosetZero(orderdata, false);
                const productId = productid && productid.map((_, index) => `$${index + 1}`).join(", ");
                const queryText = `SELECT id, overallavailableqty, rentalavailablequantity,rentalorderedquantity, orderedquantity, lock_qty FROM product_revo WHERE id IN (${productId})`;
                const result = await query(queryText, productid);
                console.log("Result from product_revo:", result.rows);
                console.log("Result from product_revo:", result.rows);
                const allQuantitiesAvailable = result.rows.every((product) => {
                    console.log("Product:", product);
                    console.log("Request Body:", request.body);
                    console.log("Request Body Order:", request.body.order);
                    if (request.body.order[0].invoicefor === "product rental") {
                        return (toSafeNumber(product.rentalavailablequantity, 0) -
                            toSafeNumber(product.lock_qty, 0) >=
                            0);
                    }
                    else {
                        return (Number(product.overallavailableqty) - Number(product.lock_qty) >= 0 &&
                            Number(product.overallavailableqty) - Number(product.orderedquantity) >= 0);
                    }
                });
                console.log("All quantities available:", allQuantitiesAvailable);
                if (!allQuantitiesAvailable) {
                    await releaseInventoryLocksByOrderItems(orderdata);
                    return {
                        status: 400,
                        message: "One or more products are out of stock. Please try again later.",
                    };
                }
                transactionDataset = request.body;
                console.log("Transaction Data from inital:", transactionDataset);
                console.log("Merc Id:", merchanttransactionId);
                let insertorderdata = await ordersService.bulkInsertOrder(request.body.transaction, request.body.order);
                console.log("Insert Order Data Result:", insertorderdata.rows);
                console.log(">>body", request.body, ">>body");
                const transactionData = {
                    ...request.body.transaction,
                    transactiondata: JSON.stringify({
                        Amount: request.body.transaction.amount,
                        status: "Cash Paid",
                    }),
                };
                console.log("Final transactionData:", transactionData);
                console.log(">>Tran");
                let { userId, transactiondata } = transactionData;
                mobilenumber === ""
                    ? (mobilenumber = null)
                    : (mobilenumber = mobilenumber);
                const insertTransactionQuery = `
                INSERT INTO transaction (merchanttransactionid, name, amount, mobilenumber, productid, transactionfor, userId, transactiondata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *`;
                const values = [
                    merchanttransactionId,
                    name,
                    amount,
                    mobilenumber,
                    productid,
                    transactionfor,
                    userId,
                    transactiondata,
                ];
                const transactionResult = await query(insertTransactionQuery, values);
                console.log("Transaction Result:", transactionResult.rows);
                const updateOrderStatus = await query(`UPDATE orders SET orderstatus = 'ordered', merchanttransactionid = $1, transactionid = $3, ispaymentsucceed = true WHERE id = $2 `, [
                    merchanttransactionId,
                    insertorderdata.rows[0].id,
                    transactionResult.rows[0].transactionid,
                ]);
                // console.log("Update Order Status:", updateOrderStatus);
                console.log(">>>>>", productupdateorderqty, ">>>>>");
                console.log("---------------");
                const updateOrderlineStatus = await query(`UPDATE orderline SET orderstatus = 'ordered', merchanttransactionid = $1 WHERE uniqueorderid = $2`, [merchanttransactionId, insertorderdata.rows[0].orderid]);
                console.log("Update Orderline Status:", updateOrderlineStatus.rows);
                if (productupdateorderqty.length > 0) {
                    console.log("Come's inside if productupdateorderqty");
                    const updateproductorderquantiydata = productupdateorderqty.map((e) => ({
                        id: e.productid,
                        orderedquantity: e.quantity,
                        ordername: e.ordername
                    }));
                    console.log("Update Product Order Quantity Data:", updateproductorderquantiydata);
                    console.log("ggg");
                    const updatedOrderQuantity = await productrevoService.updateOrderedQuantityarray(updateproductorderquantiydata);
                    // console.log("Updated Order Quantity:", updatedOrderQuantity);
                    console.log(cartIddata, "cart id to delete");
                    console.log("final");
                }
                console.log("end");
                return {
                    status: 200,
                    uniqueorderid: insertorderdata.rows[0].orderid,
                    data: {
                        status: "success",
                        message: "Order placed successfully",
                        uniqueorderid: insertorderdata.rows[0].orderid,
                        // orderId: order.id,
                        // amount: order.amount,
                        // currency: order.currency,
                        // key: RAZORPAY_KEY_ID,
                        // redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/confirmation-razorpay?id=${order.id}&token=${request.headers.authorization}`,
                    },
                };
            }
            else {
                console.log("online pay");
                // Step 1: Reserve inventory for this checkout attempt
                await productrevoService.bulkupsertProducttosetZero(orderdata, false);
                const productId = productid && productid.map((_, index) => `$${index + 1}`).join(", ");
                const queryText = `SELECT id, overallavailableqty,rentalavailablequantity,rentalorderedquantity, orderedquantity, lock_qty FROM product_revo WHERE id IN (${productId})`;
                const result = await query(queryText, productid);
                console.log("Result from product_revo:", result);
                console.log("Result from product_revo:", result.rows);
                console.log("Request Body:", request.body);
                const allQuantitiesAvailable = result.rows.every((product) => {
                    if (request.body.order[0].invoicefor === "product rental") {
                        console.log("product.rentalavailablequantity", product.rentalavailablequantity);
                        console.log("product.lock_qty", product.lock_qty);
                        console.log("product.rentalorderedquantity", product.rentalorderedquantity);
                        console.log("rental - lock", Number(product.rentalavailablequantity) - Number(product.lock_qty));
                        console.log("rental - order", Number(product.rentalavailablequantity) - Number(product.rentalorderedquantity));
                        return (toSafeNumber(product.rentalavailablequantity, 0) -
                            toSafeNumber(product.lock_qty, 0) >=
                            0);
                    }
                    else {
                        console.log("eles product.overallavailableqty", product.overallavailableqty);
                        console.log("eles product.lock_qty", product.lock_qty);
                        console.log("eles product.orderedquantity", product.orderedquantity);
                        return (Number(product.overallavailableqty) - Number(product.lock_qty) >= 0 &&
                            Number(product.overallavailableqty) - Number(product.orderedquantity) >= 0);
                    }
                });
                console.log("All quantities available:", allQuantitiesAvailable);
                if (!allQuantitiesAvailable) {
                    await releaseInventoryLocksByOrderItems(orderdata);
                    return {
                        status: 400,
                        message: "One or more products are out of stock. Please try again later.",
                    };
                }
                console.log("Merc Id:", merchanttransactionId);
                const authoritativeAmount = computePayableAmountFromOrderInput(orderdata, amount);
                // Step 2: Create Razorpay order
                const order = await razorpay.orders.create({
                    amount: Math.round(toSafeNumber(authoritativeAmount, 0) * 100),
                    currency: "INR",
                    receipt: merchanttransactionId,
                    notes: {
                        name,
                        mobilenumber,
                        userid,
                        transactionfor,
                    },
                });
                // Step 3: Persist provisional order rows tied to merchant transaction id
                request.body.order.forEach((e) => {
                    e.merchanttransactionid = merchanttransactionId;
                });
                // Step 4: Create HTTP task and insert order data
                try {
                    let createHttpTaskResult = await createHttpTask(merchanttransactionId);
                    console.log("Create Http Task Result:", createHttpTaskResult);
                    if (createHttpTaskResult?.success === false) {
                        console.warn("Cloud Task could not be created for transaction cleanup. Proceeding with order placement anyway. Error:", createHttpTaskResult.error);
                    }
                    console.log("Insert Order Data Result:", request.body.order);
                    let insertorderdata = await ordersService.bulkInsertOrder(request.body.transaction, request.body.order);
                    console.log("Insert Order Data Result:", insertorderdata.rows);
                }
                catch (error) {
                    console.log(error.message, "Error in Task paymentInitializationRazorpay");
                    await releaseInventoryLocksByOrderItems(orderdata);
                    return {
                        status: 500,
                        message: "Error processing order. Inventory reservation has been released.",
                    };
                }
                // Step 5: Return Razorpay order details for frontend
                return {
                    status: 200,
                    data: {
                        orderId: order.id,
                        amount: order.amount,
                        currency: order.currency,
                        key: RAZORPAY_KEY_ID,
                        redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/confirmation-razorpay?id=${order.id}&token=${request.headers.authorization}`,
                    },
                };
            }
            // Step 1: Inventory check (same as PhonePe)
            // dummyorderdata = orderdata.map((element: any) => ({ ...element }));
            // productupdateorderqty = orderdata.map((element: any) => ({ ...element }));
            // let insertdata = await productrevoService.bulkupsertProducttosetZero(
            //   orderdata,
            //   false
            // );
            // const productId =
            //   productid && productid.map((_, index) => `$${index + 1}`).join(", ");
            // const queryText = `SELECT id, overallavailableqty, orderedquantity, lock_qty FROM product_revo WHERE id IN (${productId})`;
            // const result = await query(queryText, productid);
            // console.log("Result from product_revo:", result);
            // console.log("Result from product_revo:", result.rows);
            // const allQuantitiesAvailable = result.rows.every(
            //   (product) =>
            //     Number(product.overallavailableqty) - Number(product.lock_qty) >= 0 &&
            //     Number(
            //       product.overallavailableqty - Number(product.orderedquantity)
            //     ) >= 0
            // );
            // console.log("All quantities available:", allQuantitiesAvailable);
            // if (!allQuantitiesAvailable) {
            //   return {
            //     status: 400,
            //     message:
            //       "One or more products are out of stock. Please try again later.",
            //   };
            // }
            // transactionDataset = request.body;
            // console.log("Transaction Data from inital:", transactionDataset);
            // console.log('Merc Id:', merchanttransactionId);
            // // Step 2: Create Razorpay order
            // const order = await razorpay.orders.create({
            //   amount: Number(transactionDataset.transaction.amount)*100,
            //   currency: "INR",
            //   receipt: merchanttransactionId,
            //   notes: {
            //     name,
            //     mobilenumber,
            //     userid,
            //     transactionfor,
            //   },
            // });
            // console.log("order is : " + JSON.stringify(order));
            // console.log("Razorpay Order ID:", order);
            // // Step 3: Update order data with Razorpay order ID
            // request.body.order.forEach((e) => {
            //   e.merchanttransactionid = merchanttransactionId; // Use Razorpay order ID
            // });
            // request.body.order.forEach((e) => {
            //   cartIddata.push(e.cartId);
            // });
            // // Step 4: Create HTTP task and insert order data
            // try {
            //   let createHttpTaskResult = await createHttpTask(order.id);
            //   if (createHttpTaskResult?.success === false) {
            //     return {
            //       status: 400,
            //       message: "Task Not Created For Making Order. Please contact Admin",
            //     };
            //   }
            //   let insertorderdata = await ordersService.bulkInsertOrder(
            //     request.body.transaction,
            //     request.body.order
            //   );
            //   console.log("Insert Order Data Result:", insertorderdata.rows);
            //   insersertdordderdatawithprocessing = insertorderdata.rows;
            // } catch (error) {
            //   console.log(
            //     error.message,
            //     "Error in Task paymentInitializationRazorpay"
            //   );
            //   await productrevoService.bulkupsertProducttosetZero(
            //     dummyorderdata,
            //     true
            //   );
            //   return {
            //     status: 500,
            //     message: "Error processing order. Inventory has been reset.",
            //   };
            // }
            // // Step 5: Return Razorpay order details for frontend
            // return {
            //   status: 200,
            //   data: {
            //     orderId: order.id,
            //     amount: order.amount,
            //     currency: order.currency,
            //     key: RAZORPAY_KEY_ID,
            //     redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/confirmation-razorpay?id=${order.id}&token=${request.headers.authorization}`,
            //   },
            // };
        }
        catch (error) {
            console.error("Query Execution Error: IN test", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            await releaseInventoryLocksByOrderItems(request?.body?.order || []);
            return ErrorMessage;
        }
    };
    transactionService.paymentConfirmationRazorpay = async (request) => {
        try {
            const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = request.body || {};
            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
                return {
                    status: 400,
                    message: "Missing required payment verification fields",
                };
            }
            return await finalizeCapturedRazorpayPayment({
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                razorpaySignature: razorpay_signature,
                verifyCheckoutSignature: true,
                source: "checkout",
            });
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentConfirmationRazorpay", error);
            return { status: 500, message: "Error verifying Razorpay payment" };
        }
    };
    transactionService.paymentWebhookRazorpay = async (request) => {
        let webhookLedgerId = null;
        try {
            const rawEventId = parseHeaderValue(request.headers["x-razorpay-event-id"]);
            const bodyPaymentId = request?.body?.payload?.payment?.entity?.id ||
                request?.body?.payload?.order?.entity?.id ||
                null;
            const traceId = resolveWebhookTraceId(rawEventId, bodyPaymentId);
            logWebhookStep(traceId, "REQUEST_RECEIVED", {
                hasRawBody: Boolean(request.rawBody),
                hasBody: Boolean(request.body),
                headerKeys: Object.keys(request.headers || {}),
            });
            if (!RAZORPAY_WEBHOOK_SECRET) {
                logWebhookStep(traceId, "WEBHOOK_SECRET_MISSING", {
                    responseStatus: 500,
                    responseMessage: "Webhook secret is not configured",
                });
                return { status: 500, message: "Webhook secret is not configured" };
            }
            const receivedSignature = parseHeaderValue(request.headers["x-razorpay-signature"]);
            if (!receivedSignature) {
                logWebhookStep(traceId, "SIGNATURE_MISSING", {
                    responseStatus: 400,
                    responseMessage: "Missing webhook signature",
                });
                return { status: 400, message: "Missing webhook signature" };
            }
            const rawBody = request.rawBody;
            if (!rawBody) {
                logWebhookStep(traceId, "RAW_BODY_MISSING", {
                    responseStatus: 400,
                    responseMessage: "Missing raw webhook body",
                });
                return { status: 400, message: "Missing raw webhook body" };
            }
            const expectedSignature = crypto
                .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
                .update(rawBody)
                .digest("hex");
            logWebhookStep(traceId, "SIGNATURE_COMPUTED", {
                expectedSignatureRef: shortRef(expectedSignature),
                receivedSignatureRef: shortRef(receivedSignature),
            });
            if (!timingSafeHexEqual(expectedSignature, receivedSignature)) {
                logWebhookStep(traceId, "SIGNATURE_INVALID", {
                    responseStatus: 400,
                    responseMessage: "Invalid webhook signature",
                });
                return { status: 400, message: "Invalid webhook signature" };
            }
            const eventPayload = request.body || {};
            const eventName = eventPayload?.event;
            const eventId = rawEventId;
            const payloadSummary = summarizeWebhookPayload(eventPayload);
            logWebhookStep(traceId, "PAYLOAD_PARSED", payloadSummary);
            if (eventId) {
                const ledgerResult = await createWebhookEventLedgerEntry(eventId, eventName, eventPayload);
                logWebhookStep(traceId, "LEDGER_ENTRY_RESULT", {
                    eventId,
                    duplicate: ledgerResult?.duplicate || false,
                    ledgerId: ledgerResult?.id || null,
                });
                if (ledgerResult?.duplicate) {
                    logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
                        responseStatus: 200,
                        responseMessage: "Duplicate webhook ignored",
                    });
                    return { status: 200, message: "Duplicate webhook ignored" };
                }
                if (ledgerResult?.id) {
                    webhookLedgerId = ledgerResult.id;
                }
                else if (await hasProcessedWebhookEvent(eventId)) {
                    logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
                        responseStatus: 200,
                        responseMessage: "Duplicate webhook ignored",
                        reason: "redis-dedupe",
                    });
                    return { status: 200, message: "Duplicate webhook ignored" };
                }
            }
            const paymentEntity = eventPayload?.payload?.payment?.entity;
            const paymentId = paymentEntity?.id;
            const orderId = paymentEntity?.order_id || eventPayload?.payload?.order?.entity?.id;
            if (eventName === "order.paid" ||
                eventName === "payment.captured" ||
                eventName === "payment.authorized") {
                if (!paymentId || !orderId) {
                    await markWebhookEventLedgerStatus(webhookLedgerId, "ignored");
                    logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
                        eventName,
                        responseStatus: 200,
                        responseMessage: "Webhook event ignored due to missing IDs",
                    });
                    return { status: 200, message: "Webhook event ignored due to missing IDs" };
                }
                logWebhookStep(traceId, "EVENT_ROUTED_TO_FINALIZE", {
                    eventName,
                    paymentId,
                    orderId,
                });
                const result = await finalizeCapturedRazorpayPayment({
                    razorpayPaymentId: paymentId,
                    razorpayOrderId: orderId,
                    razorpaySignature: "",
                    verifyCheckoutSignature: false,
                    source: "webhook",
                    traceId,
                });
                await markWebhookEventLedgerStatus(webhookLedgerId, result?.status === 500 ? "failed" : "processed", result?.status === 500 ? result?.message : undefined);
                logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
                    eventName,
                    responseStatus: result?.status || 200,
                    responseMessage: result?.message || "Webhook processed",
                });
                return result;
            }
            if (eventName === "payment.failed" && orderId) {
                let merchantTransactionId = null;
                try {
                    const gatewayOrder = await razorpay.orders.fetch(orderId);
                    if (gatewayOrder?.receipt) {
                        merchantTransactionId = gatewayOrder.receipt;
                        await safeCleanupPendingOrder(gatewayOrder.receipt);
                        const failedEventSnapshot = await getMerchantTransactionStateSnapshot(gatewayOrder.receipt);
                        logWebhookStep(traceId, "PAYMENT_FAILED_CLEANUP_DONE", {
                            eventName,
                            orderId,
                            merchantTransactionId: gatewayOrder.receipt,
                            failedEventSnapshot,
                        });
                    }
                }
                catch (error) {
                    console.error("Failed to process payment.failed webhook:", error?.message || error);
                }
                await markWebhookEventLedgerStatus(webhookLedgerId, "processed");
                logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
                    eventName,
                    orderId,
                    merchantTransactionId,
                    responseStatus: 200,
                    responseMessage: "Failure webhook processed",
                });
                return { status: 200, message: "Failure webhook processed" };
            }
            await markWebhookEventLedgerStatus(webhookLedgerId, "ignored");
            logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
                eventName,
                responseStatus: 200,
                responseMessage: "Webhook event ignored",
            });
            return { status: 200, message: "Webhook event ignored" };
        }
        catch (error) {
            const traceId = resolveWebhookTraceId(parseHeaderValue(request.headers["x-razorpay-event-id"]), request?.body?.payload?.payment?.entity?.id);
            await markWebhookEventLedgerStatus(webhookLedgerId, "failed", error?.message || "Webhook processing failed");
            logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
                responseStatus: 500,
                responseMessage: "Error processing Razorpay webhook",
                errorMessage: error?.message || "Webhook processing failed",
            });
            console.error("Query Execution Error: IN paymentWebhookRazorpay", error);
            return { status: 500, message: "Error processing Razorpay webhook" };
        }
    };
    transactionService.paymentInitializationRazorpayTicket = async (request) => {
        try {
            console.log("Inside paymentInitializationRazorpayTicket service");
            console.log(request.body, "req values");
            // Extract the amount payable from servicetype in the request body
            const amount = Number(request.body.servicetype); // amount in paise for Razorpay
            console.log(amount, "amount");
            // Generate a unique receipt id, can use any unique string generator or timestamp here
            const receiptId = `ticket_receipt_${Date.now()}`;
            // Create Razorpay order
            const order = await razorpay.orders.create({
                amount: Number(amount) * 100,
                currency: "INR",
                receipt: receiptId,
                notes: {
                    userid: request.body.userid || "unknown",
                    tickettype: request.body.tickettype || "unknown",
                },
            });
            console.log("Razorpay order created:", order);
            console.log('Vanakam');
            // Return the order info for the frontend to initiate payment
            return {
                status: 200,
                data: {
                    status: 200,
                    orderId: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    key: RAZORPAY_KEY_ID,
                    redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/confirmation-razorpay?id=${order.id}&token=${request.headers.authorization}`,
                },
            };
        }
        catch (error) {
            console.error("Error in paymentInitializationRazorpayTicket:", error.message);
            // Handle errors appropriately
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    transactionService.paymentConfirmationRazorpayTicket = async (request) => {
        console.log("Inside paymentConfirmationRazorpay service");
        console.log("Dummy");
        try {
            let transactionDataset = request.body.transactionData;
            const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = request.body;
            console.log(request.body, "Request body in paymentConfirmationRazorpay");
            console.log(transactionDataset, "from conform");
            console.log("end");
            // Validate input
            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
                console.log("Come's inside first if");
                return {
                    status: 400,
                    message: "Missing required payment verification fields",
                };
            }
            // Verify Razorpay signature
            const generatedSignature = crypto
                .createHmac("sha256", RAZORPAY_KEY_SECRET)
                .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                .digest("hex");
            console.log(generatedSignature, "Generated Signature");
            console.log(razorpay_signature, "Existing Signature");
            if (generatedSignature !== razorpay_signature) {
                console.log("Come's inside invalid signature");
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return { status: 400, message: "Invalid payment signature" };
            }
            // Fetch payment details from Razorpay
            const payment = await razorpay.payments.fetch(razorpay_payment_id);
            payment.amount = Number(payment.amount) / 100; // Convert amount from paise to rupees
            console.log(payment, "Payment details from Razorpay");
            if (payment.status !== "captured") {
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return { status: 400, message: "Payment not captured" };
            }
            console.log("Stop");
            const message = { payment: "Payment done successfully" };
            console.log("updated", transactionDataset);
            const insertTransaction = await query(`
        Insert into transaction (
        transactiondata,
        userid,
        productid,
        merchanttransactionid,
        name,
        amount,
        mobilenumber,
        transactionfor,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [payment,
                transactionDataset.userId,
                transactionDataset.productid,
                transactionDataset.merchanttransactionId,
                transactionDataset.name,
                transactionDataset.amount,
                transactionDataset.mobilenumber,
                transactionDataset.transactionfor,
                razorpay_payment_id,
                razorpay_order_id,
                razorpay_signature
            ]);
            console.log(insertTransaction.command, "Insert Transaction Result:");
            console.log("end");
            if (insertTransaction.command === "INSERT") {
                return {
                    status: 200,
                    message: "Payment verified and processed successfully",
                };
            }
            else {
                return {
                    status: 400,
                    message: "Transaction failure. If payment debited, it will be refunded in 5 business days",
                };
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentConfirmationRazorpay", error);
            return { status: 500, message: "Error verifying Razorpay payment" };
        }
    };
})(transactionService || (transactionService = {}));
//# sourceMappingURL=transaction.service.js.map