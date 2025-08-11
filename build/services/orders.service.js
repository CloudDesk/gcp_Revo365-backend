import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { stockRevoService } from "./stockRevo.service.js";
import { productrevoService } from "./productrevo.service.js";
import { sendMail } from "../Gmail/gmail.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";
export var ordersService;
(function (ordersService) {
    ordersService.getlatestOrderData = async (request) => {
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
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getlatestOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.getOrderData = async (request) => {
        try {
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
                u.createddate AS users_createddate
                FROM orders o
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
                ${whereClause}
                ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            datatypeCheckResult.forEach((element) => {
                if (element.invoiceurl) {
                    element.invoiceurl = element.invoiceurl.split(',')[1];
                }
            });
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.getUserOrderData = async (request) => {
        try {
            const userId = request.query.userid;
            const pageNumber = request.query.page;
            const recordCount = request.query.count;
            const queryParams = [];
            let whereClauses = [];
            let offset;
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
                            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                            parameterIndex += 2;
                            return clause;
                        })
                            .join(" OR ");
                        whereClauses.push(`(${rangeWhereClause})`);
                    }
                    else {
                        const formattedKey = key.toLowerCase() === "userid" ? "o.userid" :
                            key.toLowerCase() === "id" ? "o.id" :
                                key;
                        whereClauses.push(`(${paramValues
                            .map((_, idx) => `${formattedKey} = $${parameterIndex + idx}`)
                            .join(" OR ")})`);
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
                queryText += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            const dataTypeCheckResult = await dataTypeCheck(result);
            return dataTypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getUserOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.getOrderlineDynamic = async (request) => {
        try {
            const userid = request.query.userid;
            const keys = Object.keys(request.query);
            const pageNumber = request.query.page;
            const recordCount = request.query.count;
            const queryParams = [];
            let whereClauses = [];
            let offset;
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
                        whereClauses.push(`(${paramValues.map((_, idx) => `${key} = $${parameterIndex}`).join(" OR ")})`);
                        queryParams.push(...paramValues);
                        parameterIndex += paramValues.length;
                    }
                }
            });
            if (pageNumber && recordCount) {
                offset = (pageNumber - 1) * recordCount;
            }
            let querydata = `select * from orderline`;
            if (whereClauses.length > 0) {
                querydata += ` WHERE ${whereClauses.join(" AND ")} ORDER BY modifieddate DESC`;
            }
            else {
                querydata += ` ORDER BY modifieddate DESC`;
            }
            if (offset != null && recordCount != null) {
                querydata += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2}`;
                queryParams.push(offset, recordCount);
            }
            let data = await query(querydata, queryParams);
            // get invoiceurl
            const invoiceQuery = `
                    SELECT DISTINCT r.invoiceurl, r.orderid
                    FROM revoinvoice AS r
                    JOIN orderline AS o ON r.orderid = o.uniqueorderid
                    WHERE o.userid = $1 AND r.invoicefor = 'product';
                `;
            const invoiceurldata = await query(invoiceQuery, [userid]);
            const invoiceMap = new Map(invoiceurldata.rows.map(row => [row.orderid, row.invoiceurl]));
            data.rows = data.rows.map(row => ({
                ...row,
                invoiceurl: invoiceMap.get(row.uniqueorderid) || null
            }));
            // Fetch product images
            const productimagequery = `
            SELECT p.id, p.small, p.medium, p.large
            FROM product_revo AS p
            JOIN orderline AS o ON p.id = o.productid
            WHERE o.productid IN (${data.rows.map(row => row.productid).join(',')});`;
            const productimage = await query(productimagequery, []);
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
            return data.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getOrderlineDynamic", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
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
    ordersService.getOrderLineData = async (request) => {
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
                const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "delivereddate" || key === "price") {
                    const rangeClauses = paramValues.map(range => {
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
                    if (key === "userid") {
                        key = "orderline.userid";
                    }
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = `orderline.orderstatus != 'payment_failed' AND orderline.orderstatus != 'order_processing' `;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT orderline.*, invoice.invoiceurl, revorating.starrating, revorating.comments AS rating_comments, revorating.url AS rating_images,
            revorating.id AS ratingids, a.name AS address_name, a.mobilenumber AS address_mobilenumber, a.pincode AS address_pincode, a.doornumber AS address_doornumber,
            a.address AS address_address, a.landmark AS address_landmark, a.state AS address_state, a.city AS address_city
        FROM orderline
        JOIN address a ON orderline.addressid = a.id
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
        ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            // Simple query for third-party orders
            let thirdPartyQueryText = `SELECT orderline.*, NULL AS invoiceurl, revorating.starrating, revorating.comments AS rating_comments, revorating.url AS rating_images,
            revorating.id AS ratingids, a.name AS address_name, a.mobilenumber AS address_mobilenumber, a.pincode AS address_pincode, a.doornumber AS address_doornumber,
            a.address AS address_address, a.landmark AS address_landmark, a.state AS address_state, a.city AS address_city
        FROM orderline
        JOIN address a ON orderline.addressid = a.id
        LEFT JOIN (
            SELECT starrating, productid, id, orderlineid, comments, url
            FROM rating
        ) AS revorating ON revorating.orderlineid = orderline.id
        WHERE orderline.ordertype = 'Third Party Orders' AND orderline.thirdpartyorderid IS NOT NULL`;
            const thirdPartyQueryParams = [];
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
            console.log("Combined Result:", combinedResult);
            // let datatypeCheckResult = await dataTypeCheck(combinedResult);
            // const messageData = {
            //     title: "Hello User",
            //     body: "Payment Done Successfully",
            // };
            // console.log("Order Line Data:", datatypeCheckResult);
            return combinedResult.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getOrderLineData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.getInvOrderLineData = async (request) => {
        try {
            console.log('Inside getInvOrderLineData');
            console.log("Request Query:", request.query);
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            console.log("--keys", keys, "--values", values);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "delivereddate" || key === "price") {
                    const rangeClauses = paramValues.map(range => {
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
                    if (key === "userid") {
                        key = "orderline.userid";
                    }
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = ``;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT orderline.*, invoice.invoiceurl, revorating.starrating, revorating.comments AS rating_comments,revorating.url AS rating_images,
            revorating.id AS ratingids,a.name AS address_name,a.mobilenumber AS address_mobilenumber,a.pincode address_pincode,a.doornumber AS address_doornumber,
            a.address AS address_address,a.landmark AS address_landmark,a.state AS address_state ,a.city AS address_city
FROM orderline
JOIN  address a on orderline.addressid = a.id
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
${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            console.log('Query Result:', result.rows);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getInvOrderLineData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.getUserOrderData1 = async (request) => {
        try {
            const userId = request.query.userid;
            const pageNumber = request.query.page;
            const recordCount = request.query.count;
            const queryParams = [];
            let whereClauses = [];
            let offset;
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
                            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                            parameterIndex += 2;
                            return clause;
                        })
                            .join(" OR ");
                        whereClauses.push(`(${rangeWhereClause})`);
                    }
                    else {
                        const formattedKey = key.toLowerCase() === "userid" ? "o.userid" :
                            key.toLowerCase() === "id" ? "o.id" :
                                key;
                        whereClauses.push(`(${paramValues
                            .map((_, idx) => `${formattedKey} = $${parameterIndex + idx}`)
                            .join(" OR ")})`);
                        queryParams.push(...paramValues);
                        parameterIndex += paramValues.length; // Increment parameter index
                    }
                }
            });
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
                o.orderid,
                ri.invoiceurl AS invoiceurl,
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
                revoinvoice ri ON o.orderid = ri.orderid
                `;
            if (whereClauses.length > 0) {
                queryText += ` WHERE ${whereClauses.join(" AND ")}`;
            }
            queryText += " ORDER BY o.modifieddate DESC";
            if (offset != null && recordCount != null) {
                queryText += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            const dataTypeCheckResult = await dataTypeCheck(result);
            return dataTypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getUserOrderData1", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.upsertOrder = async (orderData) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = orderData;
            let productid = orderData.productid;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE orders SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO orders (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            if (result.rows[0].orderstatus === 'cancelled') {
                let productid = result.rows[0].productid;
                let quantitydata = result.rows[0].quantity;
                let updateQuantity = await productrevoService.updateCancelledOrderedQuantity([productid], Number(quantitydata));
                let userid = result.rows[0].userid;
                let getuser = await query(`SELECT * FROM users WHERE id = $1`, [userid]);
                const template = emailTemplates.orders.cancelled;
                const orderId = result.rows[0].orderid;
                const orderAmount = result.rows[0].orderamount;
                let maildata = {
                    body: {
                        to: getuser.rows[0].useremail,
                        subject: template.subject,
                        text: template.text
                            .replace('{orderId}', orderId)
                            .replace('{orderAmount}', orderAmount),
                    },
                };
                let sendEmailResult = await sendMail(maildata, false);
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.updateorderlineitem = async (orderlineData) => {
        try {
            console.log('Inside updateorderlineitem function with data:', orderlineData);
            let querydata;
            let params;
            const { id, ...upsertFields } = orderlineData.body;
            let productid = orderlineData.productid;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE orderline SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO orderline (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            if (result.rows[0].orderstatus === 'cancelled') {
                let productid = result.rows[0].productid;
                let quantitydata = result.rows[0].quantity;
                let updateQuantity = await productrevoService.updateCancelledOrderedQuantity([productid], Number(quantitydata));
                let userid = result.rows[0].userid;
                let getuser = await query(`SELECT * FROM users WHERE id = $1`, [userid]);
                const template = emailTemplates.orders.cancelled;
                const orderId = result.rows[0].orderid;
                const orderAmount = result.rows[0].orderamount;
                let maildata = {
                    body: {
                        to: getuser.rows[0].useremail,
                        subject: template.subject,
                        text: template.text
                            .replace('{orderId}', orderId)
                            .replace('{orderAmount}', orderAmount),
                    },
                };
                let sendEmailResult = await sendMail(maildata, false);
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN updateorderlineitem", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.upsertOrderrfid = async (orderData) => {
        try {
            let querydata;
            let params;
            const { rfid, orderlinenumber, productid } = orderData;
            let updateStock = await stockRevoService.upsertStockRevoDatarfid(orderData);
            if (updateStock.command === "UPDATE" || updateStock.command === "INSERT") {
                const puc = updateStock.result.puc; // Get the puc from the result
                const pucArray = Array.from(new Set(updateStock.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray, updateStock.result.rowCount, true);
                // if (orderData[0].orderid) {
                //     querydata = `UPDATE orders SET orderstatus=$${1} where orderid=$${2} RETURNING *`;
                //     params = ['ready_to_dispatch', orderData[0].orderid];
                // }
                // else {
                //     return { error: `Stock Status Updated but Order Status Not Updated.Please Contact Support Team` }
                // }
                // const result = await query(querydata, params);
                // return result;
                const ordersToUpdate = updateStock.result.rows.filter(e => e.orderlinenumber); // Only consider rows with an orderid
                if (ordersToUpdate.length > 0) {
                    let querydata = `
        UPDATE orders 
        SET 
            orderstatus = 'ready_to_dispatch',
            deliveryfrom = CASE 
                ${ordersToUpdate.map((e, idx) => `WHEN orderlinenumber = $${idx + 1} THEN '${e.location}'`).join(' ')}
            END
        WHERE orderlinenumber IN (${ordersToUpdate.map((_, idx) => `$${idx + 1}`).join(', ')})
        RETURNING *`;
                    const params = ordersToUpdate.map(e => e.orderlinenumber);
                    const result = await query(querydata, params);
                    return result;
                }
            }
            else {
                return updateStock.error;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertOrderrfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.upsertOrderlinerfid = async (orderData) => {
        try {
            console.log("Order Data in upsertOrderlinerfid:", orderData);
            const rfidMap = new Map();
            for (const item of orderData) {
                if (rfidMap.has(item.rfid)) {
                    return {
                        error: "Duplicate RFID detected: Same RFID has been scanned multiple times. Please scan a different RFID to proceed.",
                        errorDetails: [],
                        statusCode: 401
                    };
                }
                rfidMap.set(item.rfid, true);
            }
            const validationQuery = `
                SELECT rfid, puc 
                FROM stock_revo 
                WHERE rfid = ANY($1)
                AND puc IN (SELECT puc FROM product_revo WHERE id = ANY($2))
                AND stockstatus = 'Available'
            `;
            const rfids = orderData.map(item => item.rfid);
            const productIds = orderData.map(item => item.productid);
            const validationResult = await query(validationQuery, [rfids, productIds]);
            // Check if all RFIDs were found
            if (validationResult.rows.length !== orderData.length) {
                const foundRfids = new Set(validationResult.rows.map(row => row.rfid));
                const invalidRfids = orderData.filter(item => !foundRfids.has(item.rfid));
                return {
                    error: `Invalid RFIDs detected: ${invalidRfids.map(item => item.rfid).join(', ')}`,
                    errorDetails: [],
                    statusCode: 400
                };
            }
            console.log('Before upsertStockRevoDatarfid:', orderData);
            let updateStock = await stockRevoService.upsertStockRevoDatarfid(orderData);
            if (updateStock.error) {
                return { error: updateStock.error };
            }
            else if (updateStock && (updateStock.command === "UPDATE" || updateStock.command === "INSERT")) {
                const pucArray = Array.from(new Set(updateStock.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray, updateStock.result.rowCount, true);
                const ordersToUpdate = updateStock.result.rows.filter(e => e.orderlinenumber);
                if (ordersToUpdate.length > 0) {
                    let querydata = `
                        UPDATE orderline 
                        SET 
                            orderstatus = 'ready_to_dispatch',
                            deliveryfrom = CASE 
                                ${ordersToUpdate.map((e, idx) => `WHEN orderlinenumber = $${idx + 1} THEN '${e.location}'`).join(' ')}
                            END
                        WHERE orderlinenumber IN (${ordersToUpdate.map((_, idx) => `$${idx + 1}`).join(', ')})
                        RETURNING *`;
                    const params = ordersToUpdate.map(e => e.orderlinenumber);
                    const result = await query(querydata, params);
                    return result;
                }
            }
            else {
                return { error: updateStock };
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertOrderlinerfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
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
    ordersService.bulkInsertOrder = async (transactionData, orderData) => {
        try {
            console.log('Transaction data:', transactionData);
            console.log('Order data:', orderData);
            console.log('Empty Before processing order data');
            const { merchantTransactionId, userId, cgst, sgst } = transactionData;
            if (orderData[0].addressid === null) {
                const getAddress = await query(`SELECT id from address where userid = $1 LIMIT 1`, [userId]);
                console.log('getAddress:', getAddress.rows);
                const addressId = getAddress.rows[0]?.id;
                orderData.forEach(order => {
                    if (order.addressid === null) {
                        order.addressid = addressId;
                    }
                });
            }
            console.log('Order Data after setting addressid:', orderData);
            console.log('Empty After processing order data');
            let cartId = [];
            let productid = [];
            orderData.forEach((e) => {
                productid.push(e.productid);
                cartId.push(e.cartId);
                delete e.cartId;
            });
            console.log('Product IDs:', productid);
            console.log('Cart IDs:', cartId);
            // Query product_revo table to get availablequantity for each productid
            const quantityQuery = `
            SELECT id AS productid, availablequantity
            FROM product_revo
            WHERE id = ANY($1)
        `;
            const quantityResult = await query(quantityQuery, [productid]);
            console.log('Available quantities:', quantityResult.rows);
            const availableQuantities = quantityResult.rows.reduce((acc, row) => {
                acc[row.productid] = row.availablequantity;
                return acc;
            }, {});
            // Split orderData into orders and thirdpartyorders based on quantity check
            const ordersToInsert = [];
            const thirdPartyOrdersToInsert = [];
            orderData.forEach((item) => {
                const available = availableQuantities[item.productid] || 0;
                if (item.quantity <= available) {
                    // Entire quantity can be fulfilled from available stock
                    ordersToInsert.push({ ...item });
                }
                else {
                    // Split the order
                    if (available > 0) {
                        // Add available quantity to orders
                        const orderItem = { ...item, quantity: available };
                        ordersToInsert.push(orderItem);
                    }
                    // Add remaining quantity to thirdpartyorders
                    const thirdPartyQuantity = item.quantity - available;
                    if (thirdPartyQuantity > 0) {
                        const thirdPartyItem = { ...item, quantity: thirdPartyQuantity };
                        thirdPartyOrdersToInsert.push(thirdPartyItem);
                    }
                }
            });
            console.log('Orders to insert:', ordersToInsert);
            console.log('Third-party orders to insert:', thirdPartyOrdersToInsert);
            console.log('Empty After splitting orders and third-party orders');
            let combinedResult = { rows: [], command: 'INSERT' };
            // Process orders for orders table
            if (ordersToInsert.length > 0) {
                // Calculate specific order amount, quantity, and product IDs for orders table
                let orderQuantity = ordersToInsert.reduce((acc, e) => {
                    return acc + e.quantity;
                }, 0);
                let orderAmount = ordersToInsert.reduce((acc, e) => {
                    return acc + (e.productamount * e.quantity);
                }, 0);
                let orderProductIds = ordersToInsert.map((e) => e.productid);
                console.log('Order quantity for orders:', orderQuantity);
                console.log('Order amount for orders:', orderAmount);
                console.log('Order product IDs:', orderProductIds);
                console.log('Mid checkpoint: Before inserting orders');
                const finalMerchantTransactionId = merchantTransactionId != null && merchantTransactionId !== ''
                    ? merchantTransactionId
                    : ordersToInsert[0]?.merchanttransactionid;
                console.log('Final Merchant Transaction ID:', finalMerchantTransactionId);
                console.log('Empty');
                const insertOrderQuery = `
                INSERT INTO orders (orderamount, userid, addressid, merchanttransactionid, quantity, productid,ordername,paymentmethod,totalrentalamount,sgst, cgst)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`;
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
                    cgst
                ];
                try {
                    const orderResult = await query(insertOrderQuery, insertOrderValues);
                    if (orderResult.command === 'INSERT') {
                        const orderid = orderResult.rows[0].id;
                        const orderidunique = orderResult.rows[0].orderid;
                        const orderstatus = orderResult.rows[0].orderstatus;
                        ordersToInsert.forEach((e) => {
                            e.orderid = orderid;
                            e.uniqueorderid = orderidunique;
                            e.orderstatus = orderstatus;
                            e.ordertype = 'Orders';
                        });
                        const orderlineResult = await ordersService.bulkInsertOrderlines(ordersToInsert);
                        console.log('Order lines inserted from orders:', orderlineResult.rows);
                        console.log('Empty After inserting order lines');
                        // Add orders rows to combined result
                        combinedResult.rows = [...combinedResult.rows, ...orderResult.rows];
                    }
                }
                catch (error) {
                    console.error("Query Execution Error: BulkinsertOrder result", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error);
                    return ErrorMessage;
                }
            }
            // Process orders for thirdpartyorders table
            if (thirdPartyOrdersToInsert.length > 0) {
                console.log('Inside third-party orders');
                // Calculate specific order amount, quantity, and product IDs for thirdpartyorders table
                let thirdPartyOrderQuantity = thirdPartyOrdersToInsert.reduce((acc, e) => {
                    return acc + e.quantity;
                }, 0);
                let thirdPartyOrderAmount = thirdPartyOrdersToInsert.reduce((acc, e) => {
                    return acc + (e.productamount * e.quantity);
                }, 0);
                let thirdPartyProductIds = thirdPartyOrdersToInsert.map((e) => e.productid);
                console.log('Order quantity for thirdpartyorders:', thirdPartyOrderQuantity);
                console.log('Order amount for thirdpartyorders:', thirdPartyOrderAmount);
                console.log('Third-party product IDs:', thirdPartyProductIds);
                console.log('Empty');
                const insertThirdPartyQuery = `
                INSERT INTO thirdpartyorders (orderamount, userid, addressid, merchanttransactionid, quantity, productid)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`;
                const insertThirdPartyValues = [
                    thirdPartyOrderAmount,
                    thirdPartyOrdersToInsert[0].userid,
                    thirdPartyOrdersToInsert[0].addressid,
                    thirdPartyOrdersToInsert[0].merchanttransactionid,
                    thirdPartyOrderQuantity,
                    thirdPartyProductIds
                ];
                try {
                    const thirdPartyResult = await query(insertThirdPartyQuery, insertThirdPartyValues);
                    console.log('Third-party order result:', thirdPartyResult.rows);
                    if (thirdPartyResult.command === 'INSERT') {
                        const orderid = thirdPartyResult.rows[0].id;
                        const orderidunique = thirdPartyResult.rows[0].orderid;
                        const orderstatus = thirdPartyResult.rows[0].orderstatus;
                        thirdPartyOrdersToInsert.forEach((e) => {
                            e.thirdpartyorderid = orderid;
                            e.uniqueorderid = orderidunique;
                            e.orderstatus = orderstatus;
                            e.ordertype = 'Third Party Orders';
                        });
                        const orderlineResult = await ordersService.bulkInsertOrderlines(thirdPartyOrdersToInsert);
                        console.log('Order lines inserted from third party:', orderlineResult.rows);
                        console.log('Empty After inserting third-party order lines');
                        // Add thirdpartyorders rows to combined result
                        combinedResult.rows = [...combinedResult.rows, ...thirdPartyResult.rows];
                    }
                }
                catch (error) {
                    console.error("Query Execution Error: BulkinsertThirdPartyOrder result", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error);
                    return ErrorMessage;
                }
            }
            return combinedResult.rows.length > 0
                ? combinedResult
                : { rows: [], command: 'NOOP', message: 'No orders processed' };
        }
        catch (error) {
            console.error("Query Execution Error: IN BulkinsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.bulkInsertOrderlines = async (orderData) => {
        try {
            console.log('Inside update bulkInsertOrderlines with orderData:', orderData);
            const fields = Object.keys(orderData[0]);
            const fieldNames = fields.join(", ");
            const baseQuery = `INSERT INTO orderline (${fieldNames}) VALUES `;
            const valuesClause = orderData.map((order, index) => {
                const valuePlaceholders = fields.map((_, fieldIndex) => `$${index * fields.length + fieldIndex + 1}`);
                return `(${valuePlaceholders.join(", ")})`;
            }).join(", ");
            const querydata = `${baseQuery}${valuesClause} RETURNING *`;
            const values = orderData.flatMap(order => fields.map(field => order[field]));
            const result = await query(querydata, values);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN bulkInsertOrderlines", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ordersService.updateOrder = async (data, paymentfailed) => {
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
                console.log('end');
                if (updatedOrderResult.command === 'UPDATE') {
                    let orderlinedata = {
                        orderid: updatedOrderResult.rows[0].id,
                        orderstatus: updatedOrderResult.rows[0].orderstatus
                    };
                    const updatedOrderLineData = await ordersService.updateOrderStatus(orderlinedata, emailid, paymentfailed);
                    console.log('Updated Order Line Data from orders:', updatedOrderLineData);
                    console.log('Empty After updating order line data');
                    return { data: updatedOrderResult.rows, status: 'success' };
                }
                else {
                    return { data: `Orders Not Updated Please contact admin`, status: 'failure' };
                }
            }
        }
        catch (error) {
            console.error("Error in updateOrder:", error);
            throw error;
        }
    };
    async function updateOrderStatus(payload, emailid, paymentfailed) {
        try {
            const { orderid, orderstatus } = payload;
            const updateQuery = `
                UPDATE orderline
                SET orderstatus = $1
                WHERE orderid = $2
                RETURNING *;
            `;
            const result = await query(updateQuery, [orderstatus, orderid]);
            if (result.rowCount === 0) {
                throw new Error(`No orderline found with orderid: ${orderid}`);
            }
            let orderedquantity = result.rows[0].quantity;
            const template = emailTemplates.orders.orderPlaced;
            let textdata = result.rows.map(e => `Order Id  : ${e.orderlinenumber} and Amount : ${e.orderamount}`).join('\n');
            let maildata;
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
            let sendemail = await sendMail(maildata, false);
            return result.rows;
        }
        catch (error) {
            console.error('Error updateOrderStatus:', error);
            throw error;
        }
    }
    ordersService.updateOrderStatus = updateOrderStatus;
    ordersService.getOrderDataForMerchantid = async (merchantiddata) => {
        try {
            const { merchantid } = merchantiddata;
            const orderIdQuery = `SELECT orderid FROM orders WHERE merchanttransactionid = $1 AND ispaymentsucceed = FALSE;`;
            const orderIdResult = await query(orderIdQuery, [merchantid]);
            if (orderIdResult.rows.length === 0) {
                return;
            }
            const uniqueorderid = orderIdResult.rows[0].orderid;
            const productIdOrderlineQuery = `SELECT productid FROM orderline WHERE uniqueorderid = $1`;
            const productIdOrderlineResult = await query(productIdOrderlineQuery, [uniqueorderid]);
            if (productIdOrderlineResult.rows.length > 0) {
                const productIds = productIdOrderlineResult.rows.map(row => row.productid);
                const updateLockQtyQuery = `UPDATE product_revo SET lock_qty = 0 WHERE id = ANY($1::int[])`;
                await query(updateLockQtyQuery, [productIds]);
            }
            const deleteOrderlineQuery = `DELETE FROM orderline WHERE uniqueorderid = $1;`;
            await query(deleteOrderlineQuery, [uniqueorderid]);
            const deleteOrdersQuery = `DELETE FROM orders WHERE orderid = $1;`;
            await query(deleteOrdersQuery, [uniqueorderid]);
        }
        catch (error) {
            console.error("Error in getOrderDataForMerchantid:", error);
            throw error;
        }
    };
})(ordersService || (ordersService = {}));
//# sourceMappingURL=orders.service.js.map