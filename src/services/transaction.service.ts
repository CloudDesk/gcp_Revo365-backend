import crypto from "crypto";
import axios from "axios";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
import { ordersService } from "./orders.service.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import {
  REDIRECT_URL_FAILURE,
  REDIRECT_URL_PAYMENT_STATUS,
  REDIRECT_URL_SUCCESS,
} from "../config/config.js";
import { productrevoService } from "./productrevo.service.js";
import { createHttpTask } from "../googletask/createtask.js";
import { cartservice } from "./cart.service.js";
import { messageinitialization } from "../firebase/firebasepushmessage.js";
import { config } from "dotenv";
import { thirdPartyOrdersService } from "./thirdpartyorders.service.js";
const MERCHANT_ID = "PGTESTPAYUAT86";
const SALT_KEY = "96434309-7796-489d-8924-ab56988a6076";

const keyIndex = 1;
let transactionDataset: any;
let dummyorderdata = [];
let cartIddata = [];
let productupdateorderqty = [];

let insersertdordderdatawithprocessing = [];

export module transactionService {
  export const getTransactionData = async (request) => {
    try {
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
          const paramValues: any = Array.isArray(values[index])
            ? values[index]
            : [values[index]];
          if (key === "displaysize" || key === "price") {
            const rangeClauses = paramValues.map((range) => {
              const [lowerBound, upperBound] = range.split("-");
              queryParams.push(lowerBound, upperBound);
              return `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
                })`;
            });
            whereClauses.push(`(${rangeClauses.join(" OR ")})`);
            parameterIndex += 2 * paramValues.length;
          } else if (key === "sortby") {
            const [fieldName, direction] = paramValues[0].split("-");
            orderByField = fieldName;
            orderByDirection =
              direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
          } else if (paramValues[0].startsWith("NOT ")) {
            const cleanValue = paramValues[0].slice(4);
            whereClauses.push(`(${key} != $${parameterIndex})`);
            queryParams.push(cleanValue);
            parameterIndex++;
          } else if (key !== "page" && key !== "count") {
            const clauses = paramValues.map(
              (_, idx) => `${key} = $${parameterIndex + idx}`
            );
            whereClauses.push(`(${clauses.join(" OR ")})`);
            queryParams.push(...paramValues);
            parameterIndex += paramValues.length;
          }
        });

        const offset = (pageNumber - 1) * recordCount;
        const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
        const whereClause =
          whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} ` : ``;
        const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

        let queryText = `SELECT * FROM transaction ${whereClause} ${orderByClause}`;

        if (pageNumber && recordCount) {
          queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
            }`;
          queryParams.push(offset, recordCount);
        }
        const result = await query(queryText, queryParams);
        let datatypeCheckResult = await dataTypeCheck(result);
        return datatypeCheckResult;
      } catch (error) {
        console.error("Query Execution Error: IN getTransactionData", error);
        let ErrorMessage = await ErrorHandler.handleQueryError(error);
        return ErrorMessage;
      }
    } catch (error) { }
  };
  export const paymentInitialization = async (request: any) => {
    try {
      // console.log('Inside paymentInitialization service')
      let {
        merchanttransactionId,
        name,
        amount,
        mobilenumber,
        userid,
        productid,
        transactionfor,
      } = request.body.transaction;
      let orderdata = request.body.order;
      dummyorderdata = orderdata.map((element: any) => ({ ...element }));
      productupdateorderqty = orderdata.map((element: any) => ({ ...element }));
      let insertdata = await productrevoService.bulkupsertProducttosetZero(
        orderdata,
        false
      );
      const productId =
        productid && productid.map((_, index) => `$${index + 1}`).join(", ");
      const queryText = `SELECT id, overallavailableqty,orderedquantity,lock_qty FROM product_revo WHERE id IN (${productId})`;
      const result = await query(queryText, productid);
      // console.log('-->',result.rows)
      const allQuantitiesAvailable = result.rows.every(
        (product) =>
          Number(product.overallavailableqty) - Number(product.lock_qty) >= 0 &&
          Number(product.overallavailableqty - Number(product.orderedquantity)) >=
          0
      );
      if (!allQuantitiesAvailable) {
        return {
          status: 400,
          message:
            "One or more products are out of stock. Please try again later.",
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

      const prod_url =
        "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";

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

      } catch (error) {
        console.log(error.message, "Error in axios options");
        // return {
        //   status: 400,
        //   message: "Phonepe Payment Gateway is Failing.please try again",
        // };

        return REDIRECT_URL_SUCCESS;
      }
      // console.log('==>',request.body)
      // console.log('==>',request.body.order)
      request.body.order.forEach((e) => {
        e.merchanttransactionid = response.data.data.merchantTransactionId;
      });
      request.body.order.forEach((e) => {
        cartIddata.push(e.cartId);
      });
      try {
        let createHttpTaskResult = await createHttpTask(
          response.data.data.merchantTransactionId
        );
        if (createHttpTaskResult?.success === false) {
          return {
            status: 400,
            message: "Task Not Created For Making Order.Please contact Admin",
          };
        }
        // console.log('==>',request.body.transaction)
        // console.log('==>',request.body.order)
        let insertorderdata = await ordersService.bulkInsertOrder(
          request.body.transaction,
          request.body.order
        );
        insersertdordderdatawithprocessing = insertorderdata.rows;
        // console.log('====>',insersertdordderdatawithprocessing)
        // console.log('empty3')
      } catch (error) {
        console.log(error.message, "Error in Task paymentInitialization");
        let insertdata = await productrevoService.bulkupsertProducttosetZero(
          dummyorderdata,
          true
        );
      }
      console.log(response, " ===>> response in axios");

      return response.data.data.instrumentResponse.redirectInfo.url;
    } catch (error) {
      console.error(
        "Query Execution Error: IN paymentInitialization",
        error.message
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      let insertdata = await productrevoService.bulkupsertProducttosetZero(
        dummyorderdata,
        true
      );
      return ErrorMessage;
    }
  };
  export const paymentConfirmation = async (request: any, reply: any) => {
    try {
      // console.log('Inside paymentConfirmation service')
      const merchantTransactionId = request.query.id;
      const checkMerchantId = await query(`SELECT merchanttransactionid FROM orders WHERE merchanttransactionid = $1`, [merchantTransactionId])
      if (checkMerchantId.rows.length === 0) {
        return { message: "Payment timed out, try again." };
      }
      const cloudflaretoken = request.query.token;
      const transactionfor = request.query.transactionfor;
      const merchantId = MERCHANT_ID;
      const keyIndex = 1;
      const string =
        `/pg/v1/status/${merchantId}/${merchantTransactionId}` + SALT_KEY;
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
      let message: any = {};
      if (response.data.code && response.data.code == "PAYMENT_SUCCESS") {
        transactionDataset.transaction.transactiondata = response.data;
        message.payment = "Payment done Successfully";
        let result: any = await insertTransactionData(
          transactionDataset,
          insersertdordderdatawithprocessing
        );
        if (
          result.orderdata &&
          result.orderdata.length > 0 &&
          result.transactionData &&
          result.transactionData.length > 0
        ) {
          if (productupdateorderqty.length > 0) {
            let updateproductorderquantiydata = [];
            productupdateorderqty.forEach((e) => {
              updateproductorderquantiydata.push({
                id: e.productid,
                orderedquantity: e.quantity,
              });
            });
            const updatedOrderQuantity: any =
              await productrevoService.updateOrderedQuantityarray(
                updateproductorderquantiydata
              );
            let deleteCartData = await cartservice.deleteCart(cartIddata);
            const messageData = {
              title: "Hello User",
              body: "Payment Done Successfully",
            };
            let resut = await messageinitialization(
              transactionDataset.transaction.userId,
              messageData
            );
            if (updatedOrderQuantity == "UPDATE") {
            } else {
            }
          }
        } else {
          let insertdata = await productrevoService.bulkupsertProducttosetZero(
            dummyorderdata,
            true
          );
          return "Transaction Failure If payment debited it will be refunded in 5 business Days";
        }
      } else {
        let insertdata = await productrevoService.bulkupsertProducttosetZero(
          dummyorderdata,
          true
        );
        transactionDataset.transaction.transactiondata = response.data;
        message.payment = "Payment done Successfully";
        const messageData = {
          title: "Hello User",
          body: "Payment Not Done.If Any Payment Debited it will be refunded in 5 business Days",
        };
        messageinitialization(
          transactionDataset.transaction.userId,
          messageData
        );
        let result: any = await insertTransactionData(
          transactionDataset,
          insersertdordderdatawithprocessing,
          true
        );
      }
      const queryParams = new URLSearchParams(response.data).toString();
      let url = REDIRECT_URL_SUCCESS;
      if (!response.data.success) {
        url = `${REDIRECT_URL_SUCCESS}`;
      }

      reply.redirect(url);
    } catch (error) {
      let insertdata = await productrevoService.bulkupsertProducttosetZero(
        dummyorderdata,
        true
      );
      console.error("Query Execution Error: IN paymentConfirmation", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };
  export const insertTransaction = async (transactiondata: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...upsertFields } = transactiondata;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      querydata = `INSERT INTO transaction (${fieldNames.join(
        ", "
      )}) VALUES (${fieldNames
        .map((_, index) => `$${index + 1}`)
        .join(", ")}) RETURNING *`;
      params = fieldValues;

      const result = await query(querydata, params);
      return result;
    } catch (error) {
      console.error("Query Execution Error: IN insertTransaction", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const insertTransactionData = async (
    transactionData: any,
    insersertdordderdatawithprocessing: any,
    paymentfailed = false
  ) => {
    try {
      // console.log('Inside insertTransactionData service')
      // console.log('=>', transactionData)
      // console.log('==>', insersertdordderdatawithprocessing)
      const {
        merchanttransactionId,
        name,
        amount,
        mobilenumber,
        productid,
        transactionfor,
        userId,
        transactiondata,
      } = transactionData.transaction;

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
      // console.log('===>Result', transactionResult)
      if (transactionResult.command === "INSERT") {
        const insertedTransaction = transactionResult.rows[0];
        const finalResult = {
          order: insersertdordderdatawithprocessing,
          transactiondata: { ...insertedTransaction },
        } as any;
        console.log('===>',finalResult)
        // console.log('Wait')

        // Split orders based on orderid starting with 'TEQIT'
const orderdata = {
  order: finalResult.order.filter(order => order.orderid && order.orderid.startsWith('TEQIT')),
  transactiondata: finalResult.transactiondata,
};

const thirdpartyorderdata = {
  order: finalResult.order.filter(order => !order.orderid || !order.orderid.startsWith('TEQIT')),
  transactiondata: finalResult.transactiondata,
};

console.log('Order Data:', orderdata);
console.log('Third Party Order Data:', thirdpartyorderdata);
// console.log('Wait1');

let orderupdated = { status: null, data: null };
let thirdpartyorderupdate = { status: null, data: null };

// Track if update functions should be called
const shouldUpdateOrder = orderdata.order && orderdata.order.length > 0;
const shouldUpdateThirdPartyOrder = thirdpartyorderdata.order && thirdpartyorderdata.order.length > 0;

if (shouldUpdateOrder) {
  console.log('Going to update order');
  orderupdated = await ordersService.updateOrder(orderdata, paymentfailed);
}

if (shouldUpdateThirdPartyOrder) {
  console.log('Going to update third party order');
  thirdpartyorderupdate = await thirdPartyOrdersService.updateThirdPartyOrder(
    thirdpartyorderdata,
    paymentfailed
  );
}
// console.log('Order details:', shouldUpdateOrder, orderupdated.status);
// console.log('Third Order details:', shouldUpdateThirdPartyOrder, thirdpartyorderupdate.status);
// Check success based on which updates were attempted
const isOrderUpdateSuccess = shouldUpdateOrder ? orderupdated.status === "success" : true;
const isThirdPartyUpdateSuccess = shouldUpdateThirdPartyOrder ? thirdpartyorderupdate.status === "success" : true;
// console.log('Order Update Success:', isOrderUpdateSuccess);
// console.log('Third Party Update Success:', isThirdPartyUpdateSuccess);
if (isOrderUpdateSuccess && isThirdPartyUpdateSuccess) {
  // console.log('Both orders updated successfully');
  return {
    orderdata: orderupdated.data || thirdpartyorderupdate.data || null,
    transactionData: [finalResult.transactiondata],
  };
} else {
  console.log('Order update failed');
  return {
    orderdata: "Order Not Updated Please contact Admin",
    transactionData: finalResult.transactiondata,
  };
}
      } else {
        console.log("Transaction Not Inserted");
        return {
          orderdata: "Order Not Updated Please contact Admin",
          transactionData: "Order Not Updated Please contact Admin",
        };
      }
    } catch (error) {
      console.error("Error insertTransactionData:", error);
      throw error;
    }
  };
}
