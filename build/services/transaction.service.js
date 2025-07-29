import crypto from "crypto";
import axios from "axios";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
import { ordersService } from "./orders.service.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import Razorpay from "razorpay";
import { ENV_RAZORPAY_KEY_ID, ENV_RAZORPAY_KEY_SECRET, REDIRECT_URL_PAYMENT_STATUS, REDIRECT_URL_SUCCESS, } from "../config/config.js";
import { productrevoService } from "./productrevo.service.js";
import { createHttpTask } from "../googletask/createtask.js";
import { cartservice } from "./cart.service.js";
import { messageinitialization } from "../firebase/firebasepushmessage.js";
import { thirdPartyOrdersService } from "./thirdpartyorders.service.js";
//phonepe pay
const MERCHANT_ID = "PGTESTPAYUAT86";
const SALT_KEY = "96434309-7796-489d-8924-ab56988a6076";
//razorpay pay
const RAZORPAY_KEY_ID = ENV_RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = ENV_RAZORPAY_KEY_SECRET;
const keyIndex = 1;
console.log("Razorpay Key ID:", RAZORPAY_KEY_ID);
console.log("Razorpay Key Secret:", RAZORPAY_KEY_SECRET);
let transactionDataset = {};
let dummyorderdata = [];
let cartIddata = [];
let productupdateorderqty = [];
let insersertdordderdatawithprocessing = [];
const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
});
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
            const { merchanttransactionId, name, amount, mobilenumber, productid, transactionfor, userId, transactiondata, } = transactionData.transaction;
            console.log("Transaction Data:>", transactionData);
            console.log("Transaction Data:>", transactionData.transaction);
            console.log("razorpay_payment_id>", transactionData.transaction.transactiondata.id);
            console.log("razorpay_order_id>", transactionData.transaction.transactiondata.order_id);
            // console.log("razorpay_signature:>", razorpay_signature);
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
                razorpay_signature
            ];
            const transactionResult = await query(insertTransactionQuery, values);
            if (transactionResult.command === "INSERT") {
                const insertedTransaction = transactionResult.rows[0];
                const finalResult = {
                    order: insersertdordderdatawithprocessing,
                    transactiondata: { ...insertedTransaction },
                };
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
                let orderupdated = { status: null, data: null };
                let thirdpartyorderupdate = { status: null, data: null };
                const shouldUpdateOrder = orderdata.order && orderdata.order.length > 0;
                const shouldUpdateThirdPartyOrder = thirdpartyorderdata.order && thirdpartyorderdata.order.length > 0;
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
            console.log('1111', request.body);
            console.log('1111', request.body.transaction);
            console.log('1111', request.body.order);
            // Step 1: Inventory check (same as PhonePe)
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
            console.log("Transaction Data from inital:", transactionDataset);
            console.log('Merc Id:', merchanttransactionId);
            // Step 2: Create Razorpay order
            const order = await razorpay.orders.create({
                amount: Number(transactionDataset.transaction.amount) * 100,
                currency: "INR",
                receipt: merchanttransactionId,
                notes: {
                    name,
                    mobilenumber,
                    userid,
                    transactionfor,
                },
            });
            console.log("order is : " + JSON.stringify(order));
            console.log("Razorpay Order ID:", order);
            // Step 3: Update order data with Razorpay order ID
            request.body.order.forEach((e) => {
                e.merchanttransactionid = merchanttransactionId; // Use Razorpay order ID
            });
            request.body.order.forEach((e) => {
                cartIddata.push(e.cartId);
            });
            // Step 4: Create HTTP task and insert order data
            try {
                let createHttpTaskResult = await createHttpTask(order.id);
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
                console.log(error.message, "Error in Task paymentInitializationRazorpay");
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return {
                    status: 500,
                    message: "Error processing order. Inventory has been reset.",
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
        catch (error) {
            console.error("Query Execution Error: IN paymentInitializationRazorpay", error.message);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            return ErrorMessage;
        }
    };
    transactionService.paymentConfirmationRazorpay = async (request) => {
        console.log("Inside paymentConfirmationRazorpay service");
        console.log(request, 'Request1');
        console.log(transactionDataset, 'from conform');
        try {
            const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = request.body;
            console.log(request.body, "Request body in paymentConfirmationRazorpay");
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
            transactionDataset.transaction.razorpay_signature = razorpay_signature;
            console.log('updated', transactionDataset);
            if (generatedSignature !== razorpay_signature) {
                console.log("Come's inside invalid signature");
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return { status: 400, message: "Invalid payment signature" };
            }
            // Fetch payment details from Razorpay
            const payment = await razorpay.payments.fetch(razorpay_payment_id);
            console.log(payment, "Payment details from Razorpay");
            if (payment.status !== "captured") {
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return { status: 400, message: "Payment not captured" };
            }
            // Check if merchantTransactionId exists in orders
            const merchantTransactionId = transactionDataset.transaction?.merchanttransactionId;
            console.log(merchantTransactionId, "Merchant Transaction ID 1");
            console.log(transactionDataset.transaction?.merchanttransactionId, "Merchant Transaction ID 2");
            if (!merchantTransactionId) {
                return { status: 400, message: "No transaction data found" };
            }
            const checkMerchantId = await query(`SELECT merchanttransactionid FROM orders WHERE merchanttransactionid = $1`, [merchantTransactionId]);
            console.log(checkMerchantId, "Check Merchant ID");
            console.log(checkMerchantId.rows, "Check Merchant ID");
            if (checkMerchantId.rows.length === 0) {
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return { status: 400, message: "Payment timed out, try again." };
            }
            // Update transaction and order data
            console.log(transactionDataset.transaction.transactiondata, "===", payment);
            transactionDataset.transaction.transactiondata = payment;
            const message = { payment: "Payment done successfully" };
            const result = await transactionService.insertTransactionData(transactionDataset, insersertdordderdatawithprocessing);
            console.log(result, "Result after insertTransactionData");
            if (result.orderdata &&
                result.orderdata.length > 0 &&
                result.transactionData &&
                result.transactionData.length > 0) {
                if (productupdateorderqty.length > 0) {
                    const updateproductorderquantiydata = productupdateorderqty.map((e) => ({
                        id: e.productid,
                        orderedquantity: e.quantity,
                    }));
                    const updatedOrderQuantity = await productrevoService.updateOrderedQuantityarray(updateproductorderquantiydata);
                    console.log("Updated Order Quantity:", updatedOrderQuantity);
                    const deleteCartData = await cartservice.deleteCart(cartIddata);
                    console.log('deleteCartData', deleteCartData);
                    // const messageData = {
                    //   title: "Hello User",
                    //   body: "Payment Done Successfully",
                    // };
                    // await messageinitialization(
                    //   transactionDataset.transaction.userId,
                    //   messageData
                    // );
                    // If updateOrderedQuantityarray returns void, check for undefined instead
                    // if (updatedOrderQuantity === undefined) {
                    //   await productrevoService.bulkupsertProducttosetZero(
                    //     dummyorderdata,
                    //     true
                    //   );
                    //   return {
                    //     status: 500,
                    //     message: "Failed to update product quantities",
                    //   };
                    // }
                }
                return {
                    status: 200,
                    message: "Payment verified and processed successfully",
                    data: { redirectUrl: REDIRECT_URL_SUCCESS },
                };
            }
            else {
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return {
                    status: 400,
                    message: "Transaction failure. If payment debited, it will be refunded in 5 business days",
                };
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentConfirmationRazorpay", error);
            await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            return { status: 500, message: "Error verifying Razorpay payment" };
        }
    };
})(transactionService || (transactionService = {}));
//# sourceMappingURL=transaction.service.js.map