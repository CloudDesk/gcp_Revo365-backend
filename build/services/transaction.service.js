import crypto from "crypto";
import axios from "axios";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
import { ordersService } from "./orders.service.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { REDIRECT_URL_FAILURE, REDIRECT_URL_PAYMENT_STATUS, REDIRECT_URL_SUCCESS, } from "../config/config.js";
import { productrevoService } from "./productrevo.service.js";
import { createHttpTask } from "../googletask/createtask.js";
import { cartservice } from "./cart.service.js";
import { messageinitialization } from "../firebase/firebasepushmessage.js";
const MERCHANT_ID = "PGTESTPAYUAT86";
// const MERCHANT_ID = "PGTESTPAYUAT";
const SALT_KEY = "96434309-7796-489d-8924-ab56988a6076";
// const SALT_KEY = "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399";
const keyIndex = 1;
// let transactionDataset: any = {
//     transaction: {
//         merchanttransactionId: 'U13T1727342645542',
//         name: 'pravinsf24@gmail.com',
//         amount: 43490,
//         mobilenumber: '9894325540',
//         userId: 13,
//         productid: [170],
//         transactionfor: 'product'
//     },
//     order: [
//         {
//             productid: 170,
//             productname: 'OnePlus 9 Pro 5G (Stellar Black, 256 GB)  (12 GB RAM)',
//             productcategory: 'new',
//             productcolour: 'Stellar Black',
//             userid: 13,
//             addressid: 25,
//             productamount: 44990,
//             discountamount: 1500,
//             orderamount: 43490,
//             quantity: 1,
//             cartId: 632
//         }
//     ]
// }
let transactionDataset;
let dummyorderdata = [];
let cartIddata = [];
// let dummyorderdata = [{
//     productid: 170,
//     productname: 'OnePlus 9 Pro 5G (Stellar Black, 256 GB)  (12 GB RAM)',
//     productcategory: 'new',
//     productcolour: 'Stellar Black',
//     userid: 13,
//     addressid: 25,
//     productamount: 44990,
//     discountamount: 1500,
//     orderamount: 43490,
//     quantity: 1,
//     cartId: 632
// }]
let productupdateorderqty = [];
// let insersertdordderdatawithprocessing = [{
//     id: 393,
//     userid: 13,
//     addressid: 25,
//     createddate: '1727363580',
//     modifieddate: '1727363580',
//     orderamount: '43490',
//     orderid: 'ord365-0000000393',
//     orderstatus: 'order processing',
//     delivereddate: null,
//     cancelleddate: null,
//     returneddate: null,
//     quantity: 1,
//     transactionid: null,
//     readytodispatchdate: null,
//     dispatcheddate: null,
//     productamount: null,
//     discountamount: null,
//     deliveryfrom: null,
//     orderprocessingtime: '1727363580',
//     ispaymentsucceed: false,
//     merchanttransactionid: 'U13T1727343778379',
//     productid: [170]
// }]
let insersertdordderdatawithprocessing = [];
export var transactionService;
(function (transactionService) {
    transactionService.getTransactionData = async (request) => {
        try {
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
                        orderByDirection =
                            direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
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
                const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
                const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} ` : ``;
                const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
                let queryText = `SELECT * FROM transaction ${whereClause} ${orderByClause}`;
                if (pageNumber && recordCount) {
                    queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                    queryParams.push(offset, recordCount);
                }
                console.log("Query Text:", queryText);
                console.log("Query Params:", queryParams);
                const result = await query(queryText, queryParams);
                let datatypeCheckResult = await dataTypeCheck(result);
                return datatypeCheckResult;
            }
            catch (error) {
                console.error("Query Execution Error: IN getproductsData", error);
                let ErrorMessage = await ErrorHandler.handleQueryError(error);
                console.log(ErrorMessage);
                return ErrorMessage;
            }
        }
        catch (error) { }
    };
    // export const paymentInitialization = async (request: any) => {
    //     try {
    //         let { merchanttransactionId, name, amount, mobilenumber, userid, productid, transactionfor } = request.body.transaction;
    //         console.log(transactionfor, 'Transaction For is');
    //         console.log(productid, 'Product Id is');
    //         console.log(JSON.stringify(request.body), 'Request Body is');
    //         let orderdata = request.body.order;
    //         dummyorderdata = orderdata.map((element: any) => ({ ...element }));
    //         let insertdata = await productrevoService.bulkupsertProducttosetZero(orderdata, false)
    //         const productId = productid && productid.map((_, index) => `$${index + 1}`).join(', ');
    //         console.log(productId, 'Product Id is');
    //         console.log(productid, 'Product Id is');
    //         const queryText = `SELECT id, availablequantity,orderedquantity,lock_qty FROM product_revo WHERE id IN (${productId})`;
    //         const result = await query(queryText, productid);
    //         console.log(result.rows, 'Result from product');;
    //         const allQuantitiesAvailable = result.rows.every(product => (Number(product.availablequantity) - Number(product.lock_qty) >= 0) && (Number(product.availablequantity - Number(product.orderedquantity)) >= 0));
    //         console.log(allQuantitiesAvailable, 'Quantity Check');
    //         if (!allQuantitiesAvailable) {
    //             return {
    //                 status: 400,
    //                 message: "One or more products are out of stock. Please try again later."
    //             }
    //         }
    //         console.log(merchanttransactionId);
    //         transactionDataset = request.body
    //         const data = {
    //             merchantId: MERCHANT_ID,
    //             merchantTransactionId: merchanttransactionId,
    //             name: name,
    //             amount: Number(amount) * 100,
    //             redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/status?id=${merchanttransactionId}&transactionfor=${transactionfor}&orderdata=${orderdata}`,
    //             redirectMode: "POST",
    //             mobileNumber: mobilenumber,
    //             paymentInstrument: {
    //                 type: "PAY_PAGE",
    //             },
    //         };
    //         const payload = JSON.stringify(data);
    //         const payloadMain = Buffer.from(payload).toString("base64");
    //         const string = payloadMain + "/pg/v1/pay" + SALT_KEY;
    //         const sha256 = crypto.createHash("sha256").update(string).digest("hex");
    //         const checksum = sha256 + "###" + keyIndex;
    //         console.log("SHA256 Hash:", sha256);
    //         console.log("Checksum:", checksum);
    //         console.log("Encoded Payload:", payloadMain);
    //         const prod_url = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
    //         const options = {
    //             method: "POST",
    //             url: prod_url,
    //             headers: {
    //                 accept: "application/json",
    //                 "Content-Type": "application/json",
    //                 "X-VERIFY": checksum,
    //             },
    //             data: {
    //                 request: payloadMain,
    //             },
    //         };
    //         const response = await axios(options);
    //         request.body.order.forEach((e) => {
    //             e.merchanttransactionid = response.data.data.merchantTransactionId
    //         })
    //         console.log(request.body.order, 'BEFORE INSERT DATA IS ');
    //         let insertorderdata = await ordersService.bulkInsertOrder(request.body.order)
    //         console.log(insertorderdata, 'REsult for insert Order data is ');
    //         insersertdordderdatawithprocessing = insertorderdata.rows;
    //         return response.data.data.instrumentResponse.redirectInfo.url;
    //         // return 'test'
    //     } catch (error) {
    //         console.error("Query Execution Error: IN paymentInitialization", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //         console.log(ErrorMessage);
    //         return ErrorMessage
    //     }
    // }
    transactionService.paymentInitialization = async (request) => {
        try {
            console.log("Inside PaymentInitialization");
            let { merchanttransactionId, name, amount, mobilenumber, userid, productid, transactionfor, } = request.body.transaction;
            console.log(request.body.order, "Order Data is");
            console.log(request.body.order, "Order Data is");
            let orderdata = request.body.order;
            dummyorderdata = orderdata.map((element) => ({ ...element }));
            productupdateorderqty = orderdata.map((element) => ({ ...element }));
            console.log(orderdata, "FINAL Order Data is");
            let insertdata = await productrevoService.bulkupsertProducttosetZero(orderdata, false);
            const productId = productid && productid.map((_, index) => `$${index + 1}`).join(", ");
            const queryText = `SELECT id, availablequantity,orderedquantity,lock_qty FROM product_revo WHERE id IN (${productId})`;
            const result = await query(queryText, productid);
            console.log(">>>", result, ">>>");
            const allQuantitiesAvailable = result.rows.every((product) => Number(product.availablequantity) - Number(product.lock_qty) >= 0 &&
                Number(product.availablequantity - Number(product.orderedquantity)) >=
                    0);
            if (!allQuantitiesAvailable) {
                return {
                    status: 400,
                    message: "One or more products are out of stock. Please try again later.",
                };
            }
            transactionDataset = request.body;
            console.log(transactionDataset, "Transaction Dataset IN Payment Initialization");
            console.log(merchanttransactionId, "Merchant id IN Payment Initialization");
            console.log(`${REDIRECT_URL_PAYMENT_STATUS}/payment/status?id=${merchanttransactionId}`);
            console.log("test");
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
            console.log(payload, "Payload");
            const payloadMain = Buffer.from(payload).toString("base64");
            const string = payloadMain + "/pg/v1/pay" + SALT_KEY;
            const sha256 = crypto.createHash("sha256").update(string).digest("hex");
            const checksum = sha256 + "###" + keyIndex;
            // console.log("SHA256 Hash:", sha256);
            // console.log("Checksum:", checksum);
            // console.log("Encoded Payload:", payloadMain);
            console.log(payload, "PAYLOAD IS");
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
                console.log(JSON.stringify(error.message));
                console.log(error.response ? error.response.data : error.message);
                console.log("test");
            }
            request.body.order.forEach((e) => {
                e.merchanttransactionid = response.data.data.merchantTransactionId;
            });
            console.log(request.body.order, "BEFORE INSERT DATA IS ");
            request.body.order.forEach((e) => {
                cartIddata.push(e.cartId);
            });
            console.log(cartIddata, "Cartß ID DATA IS");
            console.log(response.data.data.merchantTransactionId, "BEFOR TASK");
            try {
                let createHttpTaskResult = await createHttpTask(response.data.data.merchantTransactionId);
                if (createHttpTaskResult?.success === false) {
                    return {
                        status: 400,
                        message: "Task Not Created For Making Order.Please contact Admin",
                    };
                }
                let insertorderdata = await ordersService.bulkInsertOrder(request.body.transaction, request.body.order);
                insersertdordderdatawithprocessing = insertorderdata.rows;
                console.log(insersertdordderdatawithprocessing, "REsult for insert Order data is ");
            }
            catch (error) {
                console.log(error.message, "Error in Task Creation");
                let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            }
            console.log(response.data, "PAYMENT LOGS ARE ");
            return response.data.data.instrumentResponse.redirectInfo.url;
        }
        catch (error) {
            console.error("Query Execution Error: IN paymentInitialization", error.message);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            // console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    transactionService.paymentConfirmation = async (request, reply) => {
        try {
            console.log("inside payment confirmation");
            console.log(REDIRECT_URL_SUCCESS, "REDIRECT URL SUCCESS");
            console.log(REDIRECT_URL_FAILURE, "REDIRECT URL FAILURE");
            // console.log('status');
            const merchantTransactionId = request.query.id;
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
            // response.data = {
            //     "success": false,
            //     "code": "PAYMENT_ERROR",
            //     "message": "Payment Failed",
            //     "data": {
            //         "merchantId": "PGTESTPAYUAT",
            //         "merchantTransactionId": "MT7850590068188104",
            //         "transactionId": "T2111221437456190170379",
            //         "amount": 100,
            //         "state": "FAILED",
            //         "responseCode": "ZM",
            //         "responseCodeDescription": "Invalid m-pin entered",
            //         "paymentInstrument": null
            //     }
            // }
            if (response.data.code && response.data.code == "PAYMENT_SUCCESS") {
                transactionDataset.transaction.transactiondata = response.data;
                message.payment = "Payment done Successfully";
                let result = await transactionService.insertTransactionData(transactionDataset, insersertdordderdatawithprocessing);
                if (result.orderdata &&
                    result.orderdata.length > 0 &&
                    result.transactionData &&
                    result.transactionData.length > 0) {
                    console.log(productupdateorderqty, "PRoduct Update Quantity");
                    if (productupdateorderqty.length > 0) {
                        let updateproductorderquantiydata = [];
                        productupdateorderqty.forEach((e) => {
                            updateproductorderquantiydata.push({
                                id: e.productid,
                                orderedquantity: e.quantity,
                            });
                        });
                        console.log(updateproductorderquantiydata, "updateproductorderquantiydata");
                        const updatedOrderQuantity = await productrevoService.updateOrderedQuantityarray(updateproductorderquantiydata);
                        console.log(cartIddata, "Cart ID DATA IS");
                        console.log(cartIddata, "PAYMENT  CONFIRMATIN PAGEWß");
                        let deleteCartData = await cartservice.deleteCart(cartIddata);
                        const messageData = {
                            title: "Hello User",
                            body: "Payment Done Successfully",
                        };
                        console.log(transactionDataset.transaction);
                        console.log(transactionDataset.transaction.userId);
                        console.log(messageData);
                        console.log("test");
                        let resut = await messageinitialization(transactionDataset.transaction.userId, messageData);
                        console.log(resut, "MESSAGE ISSS ");
                        if (updatedOrderQuantity == "UPDATE") {
                            console.log("Ordered Quantity updated Successfully");
                        }
                        else {
                            console.log("Order Quantity updation failed.");
                        }
                    }
                }
                else {
                    let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                    return "Transaction Failure If payment debited it will be refunded in 5 business Days";
                }
            }
            else {
                console.log("else message");
                console.log(dummyorderdata, "Dummy Order Data is LOCK QUANTITY");
                let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
                transactionDataset.transaction.transactiondata = response.data;
                message.payment = "Payment done Successfully";
                console.log(transactionDataset, "Transaction Data set is ");
                const messageData = {
                    title: "Hello User",
                    body: "Payment Not Done.If Any Payment Debited it will be refunded in 5 business Days",
                };
                messageinitialization(transactionDataset.transaction.userId, messageData);
                console.log(insersertdordderdatawithprocessing, "Order Data is");
                let result = await transactionService.insertTransactionData(transactionDataset, insersertdordderdatawithprocessing, true);
                console.log(result, "Result in data");
            }
            const queryParams = new URLSearchParams(response.data).toString();
            // console.log(queryParams);
            let url = REDIRECT_URL_SUCCESS;
            console.log(cloudflaretoken, "Cloudflare Token is");
            // Check if the response indicates failure and change the URL accordingly
            if (!response.data.success) {
                // url = `${REDIRECT_URL_FAILURE}` + queryParams;
                url = `${REDIRECT_URL_SUCCESS}`;
            }
            reply.redirect(url);
        }
        catch (error) {
            let insertdata = await productrevoService.bulkupsertProducttosetZero(dummyorderdata, true);
            console.error("Query Execution Error: IN paymentConfirmation", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    transactionService.insertTransaction = async (transactiondata) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = transactiondata;
            console.log(upsertFields, "Upsert Fields Are");
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
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    transactionService.insertTransactionData = async (transactionData, insersertdordderdatawithprocessing, paymentfailed = false) => {
        try {
            const { merchanttransactionId, name, amount, mobilenumber, productid, transactionfor, userId, transactiondata, } = transactionData.transaction;
            const order = transactionData.order;
            const insertTransactionQuery = `
                INSERT INTO transaction (merchanttransactionId, name, amount, mobilenumber, productid, transactionfor, userId,transactiondata)
                VALUES ($1, $2, $3, $4, $5, $6, $7,$8)
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
            if (transactionResult.command === "INSERT") {
                const insertedTransaction = transactionResult.rows[0];
                const finalResult = {
                    order: insersertdordderdatawithprocessing,
                    transactiondata: { ...insertedTransaction },
                };
                console.log(finalResult, "final Reslult is ");
                let orderupdated = await ordersService.updateOrder(finalResult, paymentfailed);
                if (orderupdated.status === "success") {
                    return {
                        orderdata: orderupdated.data,
                        transactionData: [finalResult.transactiondata],
                    };
                }
                else {
                    return {
                        orderdata: "Order Not Updated Please contact Admin",
                        transactionData: finalResult.transactiondata,
                    };
                }
            }
            else {
                return {
                    orderdata: "Order Not Updated Please contact Admin",
                    transactionData: "Order Not Updated Please contact Admin",
                };
            }
            // finalResult.ordercommand = orderupdated;
            // console.log('Final Result:>>',finalResult);
            // // console.log(orderupdated ,'orderupdated');
            // return finalResult;
        }
        catch (error) {
            console.error("Error inserting transaction data:", error);
            throw error;
        }
    };
})(transactionService || (transactionService = {}));
//# sourceMappingURL=transaction.service.js.map