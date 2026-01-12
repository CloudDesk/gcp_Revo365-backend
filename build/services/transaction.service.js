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
import loginShiprocket from "../shiprocket/shiprocketAuth.js";
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
            console.log(request.body.order[0].ordername, "Vada");
            console.log("End");
            if (request.body.order[0].paymentmethod === "Cash") {
                console.log("Inside Cash");
                dummyorderdata = orderdata.map((element) => ({ ...element }));
                productupdateorderqty = orderdata.map((element) => ({
                    ...element,
                }));
                let insertdata = await productrevoService.bulkupsertProducttosetZero(orderdata, false);
                const productId = productid && productid.map((_, index) => `$${index + 1}`).join(", ");
                const queryText = `SELECT id, overallavailableqty, orderedquantity, lock_qty FROM product_revo WHERE id IN (${productId})`;
                const result = await query(queryText, productid);
                console.log("Result from product_revo:", result.rows);
                console.log("Result from product_revo:", result.rows);
                const allQuantitiesAvailable = result.rows.every((product) => Number(product.overallavailableqty) - Number(product.lock_qty) >=
                    0 &&
                    Number(product.overallavailableqty - Number(product.orderedquantity)) >= 0);
                console.log("All quantities available:", allQuantitiesAvailable);
                if (!allQuantitiesAvailable) {
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
                    data: {
                        status: "success",
                        message: "Order placed successfully",
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
                // Step 1: Inventory check
                dummyorderdata = orderdata.map((element) => ({ ...element }));
                productupdateorderqty = orderdata.map((element) => ({
                    ...element,
                }));
                let insertdata = await productrevoService.bulkupsertProducttosetZero(orderdata, false);
                const productId = productid && productid.map((_, index) => `$${index + 1}`).join(", ");
                const queryText = `SELECT id, overallavailableqty, orderedquantity, lock_qty FROM product_revo WHERE id IN (${productId})`;
                const result = await query(queryText, productid);
                console.log("Result from product_revo:", result);
                console.log("Result from product_revo:", result.rows);
                const allQuantitiesAvailable = result.rows.every((product) => Number(product.overallavailableqty) - Number(product.lock_qty) >=
                    0 &&
                    Number(product.overallavailableqty - Number(product.orderedquantity)) >= 0);
                console.log("All quantities available:", allQuantitiesAvailable);
                if (!allQuantitiesAvailable) {
                    return {
                        status: 400,
                        message: "One or more products are out of stock. Please try again later.",
                    };
                }
                transactionDataset = request.body;
                console.log("Transaction Data from inital:", transactionDataset);
                console.log("Merc Id:", merchanttransactionId);
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
                    let createHttpTaskResult = await createHttpTask(merchanttransactionId);
                    if (createHttpTaskResult?.success === false) {
                        return {
                            status: 400,
                            message: "Task Not Created For Making Order. Please contact Admin",
                        };
                    }
                    let insertorderdata = await ordersService.bulkInsertOrder(request.body.transaction, request.body.order);
                    console.log("Insert Order Data Result:", insertorderdata.rows);
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
            console.error("Query Execution Error: IN paymentInitializationRazorpay", error.message);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            return ErrorMessage;
        }
    };
    transactionService.paymentConfirmationRazorpay = async (request) => {
        console.log("Inside paymentConfirmationRazorpay service");
        console.log(request, "Request1");
        console.log(transactionDataset, "from conform");
        console.log("Dummy");
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
            console.log("updated", transactionDataset);
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
            console.log(checkMerchantId.rows, "Check Merchant ID in orders");
            // Step 2: If not found in orders, check in thirdpartyorders
            let checkMerchantIdThirdParty = { rows: [] };
            if (checkMerchantId.rows.length === 0) {
                checkMerchantIdThirdParty = await query(`SELECT merchanttransactionid FROM thirdpartyorders WHERE merchanttransactionid = $1`, [merchantTransactionId]);
                console.log(checkMerchantIdThirdParty.rows, "Check Merchant ID in thirdpartyorders");
            }
            if (checkMerchantId.rows.length === 0 &&
                checkMerchantIdThirdParty.rows.length === 0) {
                await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                return { status: 400, message: "Payment timed out, try again." };
            }
            const token = await loginShiprocket();
            // ✅ Shiprocket Payload Construction
            const orderData = transactionDataset.order[0];
            const transactionData = transactionDataset.transaction;
            // Fetch user & address from DB (since Shiprocket needs name, phone, address, etc.)
            const userQuery = await query(`SELECT firstname, lastname, useremail, usermobilenumber FROM users WHERE id = $1`, [transactionData.userId]);
            const addressQuery = await query(`SELECT address, city, state, pincode FROM address WHERE id = $1`, [orderData.addressid]);
            const user = userQuery.rows[0];
            const address = addressQuery.rows[0];
            // Construct payload
            const shiprocketPayload = {
                order_id: transactionData.merchanttransactionId, // your order unique ID
                order_date: new Date().toISOString(), // current date or order.createddate if available
                pickup_location: "warehouse",
                // pickup_location: orderData.storelocation || "73, Singanna Chetty St, Chindatripet, Anna Salai, Chintadripet, Chennai, Tamil Nadu 600002",
                billing_customer_name: user?.firstname || "Customer",
                billing_last_name: user?.lastname || "Customer",
                billing_address: address?.address || "Not Provided",
                billing_address_2: "Not Given",
                billing_city: address?.city || "Unknown City",
                billing_pincode: address?.pincode || "000000",
                billing_state: address?.state || "Unknown State",
                billing_country: "India",
                billing_email: user?.useremail || transactionData.name,
                billing_phone: user?.usermobilenumber || transactionData.mobilenumber,
                shipping_customer_name: user?.firstname || 'Customer',
                shipping_last_name: user?.lastname || 'Customer',
                shipping_address: address?.address || "Not Provided",
                shipping_address_2: 'Not Given',
                shipping_city: address?.city || "Unknown City",
                shipping_pincode: address?.pincode || "000000",
                shipping_state: address?.state || "Unknown State",
                shipping_country: "India",
                shipping_is_billing: true,
                shipping_email: user?.useremail || transactionData.name,
                shipping_phone: user?.usermobilenumber || transactionData.mobilenumber,
                order_items: [
                    {
                        name: orderData.productname,
                        sku: `SKU-${orderData.productid}`,
                        units: orderData.quantity,
                        selling_price: orderData.productamount,
                    },
                ],
                payment_method: orderData.paymentmethod === "COD" ? "COD" : "Prepaid",
                sub_total: orderData.orderamount,
                length: 10,
                breadth: 10,
                height: 10,
                weight: 0.5,
            };
            // 👇 Log payload only for verification
            console.log("🧾 Shiprocket Payload Preview ===>", JSON.stringify(shiprocketPayload, null, 2));
            console.log('Test');
            let shiprocketOrderData = null;
            try {
                const shiprocketResponse = await axios.post(`${process.env.SHIPROCKET_BASE_URL}/orders/create/adhoc`, shiprocketPayload, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });
                shiprocketOrderData = shiprocketResponse.data;
                console.log("✅ Shiprocket order creation response:", shiprocketOrderData);
                console.log('Stop After Shiprocket order creation');
                // Store order + shipment data in DB
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
                console.log("Stop after Update DB1");
            }
            catch (error) {
                console.error("❌ Error creating Shiprocket order:", error.response?.data || error.message);
            }
            // ✅ STEP 2: Assign Courier (Generate AWB)
            if (shiprocketOrderData?.shipment_id) {
                try {
                    console.log(`Before Assign Courier: ${Number(shiprocketOrderData.shipment_id)}`);
                    const readyToShip = await axios.post(`${process.env.SHIPROCKET_BASE_URL}/orders/readytoship`, { shipment_id: [Number(shiprocketOrderData.shipment_id)] }, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                    });
                    console.log("📦 Ready to Ship Response:", readyToShip.data);
                    await new Promise((r) => setTimeout(r, 15000));
                    console.log("Order ID:", shiprocketOrderData.order_id);
                    console.log("Shiprocket Token:", token ? "✅ Present" : "❌ Missing");
                    const courierResponse = await axios.post(`${process.env.SHIPROCKET_BASE_URL}/courier/assign/auto`, { shipment_id: Number(shiprocketOrderData.shipment_id) }, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                    });
                    const courierData = courierResponse.data;
                    console.log("🚚 Courier Assigned Response:", courierData);
                    console.log("Stop After Assign courier");
                    // Update AWB & courier details in DB
                    await query(`UPDATE orders 
       SET shiprocket_awb_code = $1, shiprocket_courier_name = $2, shiprocket_courier_company_id = $3 
       WHERE merchanttransactionid = $4`, [
                        courierData.awb_code || null,
                        courierData.courier_name || null,
                        courierData.courier_company_id || null,
                        transactionData.merchanttransactionId,
                    ]);
                    await query(`UPDATE thirdpartyorders 
       SET shiprocket_awb_code = $1, shiprocket_courier_name = $2, shiprocket_courier_company_id = $3 
       WHERE merchanttransactionid = $4`, [
                        courierData.awb_code || null,
                        courierData.courier_name || null,
                        courierData.courier_company_id || null,
                        transactionData.merchanttransactionId,
                    ]);
                    console.log("✅ Courier assigned and AWB updated in DB");
                }
                catch (error) {
                    console.error("❌ Error assigning courier:", error.response?.data || error.message);
                    console.log('Inside Error');
                }
            }
            else {
                console.log("⚠️ Shipment ID missing — cannot assign courier.");
            }
            // Update transaction and order data
            console.log(transactionDataset.transaction.transactiondata, "===", payment);
            transactionDataset.transaction.transactiondata = payment;
            const message = { payment: "Payment done successfully" };
            const result = await transactionService.insertTransactionData(transactionDataset, insersertdordderdatawithprocessing
            // razorpay_signature
            );
            console.log(result, "Result after insertTransactionData");
            console.log("end");
            if (result.orderdata &&
                result.orderdata.length > 0 &&
                result.transactionData &&
                result.transactionData.length > 0) {
                console.log("Come's inside if orderdata and transactionData");
                if (productupdateorderqty.length > 0) {
                    console.log("Come's inside if productupdateorderqty");
                    const updateproductorderquantiydata = productupdateorderqty.map((e) => ({
                        id: e.productid,
                        orderedquantity: e.quantity,
                    }));
                    const updatedOrderQuantity = await productrevoService.updateOrderedQuantityarray(updateproductorderquantiydata);
                    // console.log("Updated Order Quantity:", updatedOrderQuantity);
                    console.log(cartIddata, "cart id to delete");
                    console.log("final");
                    if (cartIddata[0] === undefined) {
                        console.log("No cart data to delete");
                    }
                    else {
                        const deleteCartData = await cartservice.deleteCart(cartIddata);
                        console.log("deleteCartData", deleteCartData);
                        console.log("Message Data");
                    }
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