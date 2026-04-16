import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import { cartservice } from "./cart.service.js";
import { stockRevoService } from "./stockRevo.service.js";
import { productrevoService } from "./productrevo.service.js";
import { sendMail } from "../Gmail/gmail.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";
import { transactionService } from "./transaction.service.js";
import { messageinitialization } from "../firebase/firebasepushmessage.js";


export module ordersService {
    const normalizeComparableText = (value: any) =>
        String(value ?? "").trim().toLowerCase();

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
            console.log("keys", keys)
            const values = Object.values(request.query);
            console.log("values", values)
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
                ${whereClause}
                ${orderByClause}`;

            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }

            const result = await query(queryText, queryParams);
            console.log("result", result)
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
            console.log("keys", keys);
            const values = Object.values(request.query);
            console.log("values", values);

            let whereClauses: string[] = [];
            let parameterIndex = 1;
            const queryParams: any[] = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";

            keys.forEach((key, index) => {
                const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "delivereddate" || key === "price") {
                    const rangeClauses = paramValues.map(range => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        return `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                    parameterIndex += 2 * paramValues.length;
                } else if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                } else if (key !== "page" && key !== "count") {
                    if (key === "userid") {
                        key = "orderline.userid";
                    } else if (key === "id") {
                        key = "orderline.id";
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
            a.address AS address_address, a.landmark AS address_landmark, a.state AS address_state, a.city AS address_city,
            p."large" AS products_large, p.warranty AS products_warranty
        FROM orderline
        JOIN address a ON orderline.addressid = a.id
        LEFT JOIN product_revo p ON p.id = orderline.productid
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
            a.address AS address_address, a.landmark AS address_landmark, a.state AS address_state, a.city AS address_city,
            p."large" AS products_large, p.warranty AS products_warranty
        FROM orderline
        JOIN address a ON orderline.addressid = a.id
        LEFT JOIN product_revo p ON p.id = orderline.productid
        LEFT JOIN (
            SELECT starrating, productid, id, orderlineid, comments, url
            FROM rating
        ) AS revorating ON revorating.orderlineid = orderline.id
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
            console.log('Inside getInvOrderLineData');
            console.log("Request Query:", request.query);
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            console.log("--keys", keys, "--values", values);

            let whereClauses: string[] = [];
            let parameterIndex = 1;
            const queryParams: any[] = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";

            keys.forEach((key, index) => {
                const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "delivereddate" || key === "price") {
                    const rangeClauses = paramValues.map(range => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        return `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                    parameterIndex += 2 * paramValues.length;
                } else if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                } else if (key !== "page" && key !== "count") {
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
            a.address AS address_address,a.landmark AS address_landmark,a.state AS address_state ,a.city AS address_city,
            p."large" AS products_large, p.warranty AS products_warranty
FROM orderline
JOIN  address a on orderline.addressid = a.id
LEFT JOIN product_revo p ON p.id = orderline.productid
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
            console.log("Request Query:", request.query);
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
            product_revo p ON p.id = ANY(o.productid)
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
                queryText += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2
                    }`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            const dataTypeCheckResult = await dataTypeCheck(result);
            return dataTypeCheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getUserOrderData1", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };

    export const upsertOrder = async (orderData: any) => {
        try {
            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = orderData;
            let productid = orderData.productid;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);

            if (id) {
                querydata = `UPDATE orders SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO orders (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }

            const result = await query(querydata, params);
            const updatedRow = result.rows[0];
            const newStatus = updatedRow?.orderstatus;
            const orderType = normalizeComparableText(updatedRow?.ordername);

            if (newStatus === 'cancelled') {
                // productid on orders is already an int[] — do NOT double-wrap it
                const productIds = Array.isArray(updatedRow.productid)
                    ? updatedRow.productid
                    : [updatedRow.productid];
                const quantitydata = Number(updatedRow.quantity);
                // Decrement orderedquantity and refresh quantityforlocation JSONB
                await productrevoService.updateCancelledOrderedQuantity(productIds, quantitydata);
                if (orderType === "rental") {
                    await stockRevoService.releaseReservedRentalStockForOrder(updatedRow.orderid);
                }

                const userid = updatedRow.userid;
                const getuser = await query(`SELECT * FROM users WHERE id = $1`, [userid]);
                const template = emailTemplates.orders.cancelled;
                const orderId = updatedRow.orderid;
                const orderAmount = updatedRow.orderamount;
                let maildata = {
                    body: {
                        to: getuser.rows[0].useremail,
                        subject: template.subject,
                        text: template.text
                            .replace('{orderId}', orderId)
                            .replace('{orderAmount}', orderAmount),
                    },
                };
                await sendMail(maildata, false);
            } else if (newStatus === 'delivered' || newStatus === 'Sold') {
                // Order is fully fulfilled — release the reserved orderedquantity
                // so quantityforlocation stops subtracting it from available qty.
                // updateCancelledOrderedQuantity handles both orderedquantity decrement
                // and the testinupdateQuantity JSONB refresh.
                const productIds = Array.isArray(updatedRow.productid)
                    ? updatedRow.productid
                    : [updatedRow.productid];
                const quantitydata = Number(updatedRow.quantity);
                await productrevoService.updateCancelledOrderedQuantity(productIds, quantitydata);
                console.log(`[upsertOrder] Released orderedquantity for ${newStatus} order ${updatedRow.orderid}`);
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };

    export const updateorderlineitem = async (orderlineData: any) => {
        try {
            console.log('Inside updateorderlineitem function with data:', orderlineData);
            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = orderlineData.body;
            let productid = orderlineData.productid;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);

            if (id) {
                querydata = `UPDATE orderline SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO orderline (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            const lineRow = result.rows[0];
            const lineStatus = lineRow?.orderstatus;
            const lineType = lineRow?.ordertype;
            const orderType = normalizeComparableText(lineRow?.ordername);

            if (lineStatus === 'cancelled') {
                // Only normal orders track orderedquantity — 3rd-party orders do not
                if (lineType === 'Orders') {
                    const productid = lineRow.productid;  // single int on orderline
                    const quantitydata = Number(lineRow.quantity);
                    await productrevoService.updateCancelledOrderedQuantity([productid], quantitydata);
                }
                if (orderType === "rental") {
                    await stockRevoService.releaseReservedRentalStockForOrderline(lineRow.orderlinenumber);
                }
                const userid = lineRow.userid;
                const getuser = await query(`SELECT * FROM users WHERE id = $1`, [userid]);
                const template = emailTemplates.orders.cancelled;
                const orderId = lineRow.orderid;
                const orderAmount = lineRow.orderamount;
                let maildata = {
                    body: {
                        to: getuser.rows[0].useremail,
                        subject: template.subject,
                        text: template.text
                            .replace('{orderId}', orderId)
                            .replace('{orderAmount}', orderAmount),
                    },
                };
                await sendMail(maildata, false);
            } else if (lineStatus === 'delivered' || lineStatus === 'Sold') {
                // Orderline fulfilled — release reserved orderedquantity (normal orders only)
                if (lineType === 'Orders') {
                    const productid = lineRow.productid;
                    const quantitydata = Number(lineRow.quantity);
                    await productrevoService.updateCancelledOrderedQuantity([productid], quantitydata);
                    console.log(`[updateorderlineitem] Released orderedquantity for ${lineStatus} orderline ${lineRow.orderlinenumber}`);
                }
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN updateorderlineitem", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
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
            let querydata: string;
            let params: any[];
            const { rfid, orderlinenumber, productid } = orderData;

            let updateStock: any = await stockRevoService.upsertStockRevoDatarfid(orderData);

            if (updateStock.command === "UPDATE" || updateStock.command === "INSERT") {
                const puc = updateStock.result.puc; // Get the puc from the result
                const pucArray: string[] = Array.from(new Set(updateStock.result.rows.map(row => row.puc)));

                // Determine if this is a rental order
                // Try to get ordername from request first, then fall back to database
                console.log("DEBUG: orderData[0]:", JSON.stringify(orderData[0]));
                let ordername = orderData[0]?.ordername || '';

                // If ordername not in request, fetch from database
                if (!ordername && orderData[0]?.orderlinenumber) {
                    console.log("DEBUG: ordername not in request, querying database with orderlinenumber:", orderData[0].orderlinenumber);
                    const orderlineQuery = await query(
                        `SELECT ordername FROM orderline WHERE orderlinenumber = $1 LIMIT 1`,
                        [orderData[0].orderlinenumber]
                    );
                    if (orderlineQuery.rows.length > 0) {
                        ordername = orderlineQuery.rows[0].ordername || '';
                        console.log("DEBUG: Fetched ordername from database:", ordername);
                    }
                }

                const isRental = ordername.toLowerCase().trim() === 'rental';
                console.log("DEBUG: Final ordername:", ordername, "isRental:", isRental);

                let updateQuantity = await stockRevoService.updateQuantity(pucArray, updateStock.result.rowCount, true, isRental);
                // if (orderData[0].orderid) {
                //     querydata = `UPDATE orders SET orderstatus=$${1} where orderid=$${2} RETURNING *`;
                //     params = ['ready_to_dispatch', orderData[0].orderid];
                // }
                // else {
                //     return { error: `Stock Status Updated but Order Status Not Updated.Please Contact Support Team` }
                // }
                // const result = await query(querydata, params);
                // return result;

                const ordersToUpdate = updateStock.result.rows.filter(e => e.orderlinenumber);  // Only consider rows with an orderid
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
                return updateStock.error
            }

        } catch (error) {
            console.error("Query Execution Error: IN upsertOrderrfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    export const upsertOrderlinerfid = async (orderData: any) => {
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

            let ordername = '';
            for (const item of orderData) {
                if (item.ordername) {
                    ordername = item.ordername;
                    break;
                }
            }

            if (!ordername && orderData[0]?.orderlinenumber) {
                const orderlineQuery = await query(
                    `SELECT ordername FROM orderline WHERE orderlinenumber = $1 LIMIT 1`,
                    [orderData[0].orderlinenumber]
                );
                ordername = orderlineQuery.rows[0]?.ordername || '';
            }

            const isRentalValidation = normalizeComparableText(ordername) === "rental";
            const validationParams: any[] = [];
            const validationWhere = orderData.map((item) => {
                validationParams.push(item.rfid);
                const rfidParamIndex = validationParams.length;
                validationParams.push(item.productid);
                const productParamIndex = validationParams.length;
                return isRentalValidation
                    ? `(rfid = $${rfidParamIndex} AND puc IN (SELECT puc FROM product_revo WHERE id = $${productParamIndex}) AND (stockstatus = 'Available' OR stockstatus = 'Reserved for Rental'))`
                    : `(rfid = $${rfidParamIndex} AND puc IN (SELECT puc FROM product_revo WHERE id = $${productParamIndex}) AND stockstatus = 'Available')`;
            }).join(' OR ');

            const validationQuery = `
                SELECT rfid, puc
                FROM stock_revo
                WHERE ${validationWhere}
            `;
            const validationResult = await query(validationQuery, validationParams);

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
            let updateStock: any = await stockRevoService.upsertStockRevoDatarfid(orderData);
            if (updateStock.error) {
                return { error: updateStock.error };
            }
            else if (updateStock && (updateStock.command === "UPDATE" || updateStock.command === "INSERT")) {
                const pucArray: string[] = Array.from(new Set(updateStock.result.rows.map(row => row.puc)));

                // Determine if this is a rental order
                // If ordername not in request, fetch from database using orderlinenumber from updateStock result
                if (!ordername && updateStock.result.rows.length > 0) {
                    const orderlinenumber = updateStock.result.rows[0]?.orderlinenumber;
                    if (orderlinenumber) {
                        console.log("DEBUG: ordername not in request, querying database with orderlinenumber:", orderlinenumber);
                        const orderlineQuery = await query(
                            `SELECT ordername FROM orderline WHERE orderlinenumber = $1 LIMIT 1`,
                            [orderlinenumber]
                        );
                        if (orderlineQuery.rows.length > 0) {
                            ordername = orderlineQuery.rows[0].ordername || '';
                            console.log("DEBUG: Fetched ordername from database:", ordername);
                        }
                    }
                }

                // Additional fallback: Check if product is rental by checking ecompublish status
                let isRental = false;
                if (ordername) {
                    isRental = ordername.toLowerCase().trim() === 'rental';
                } else if (pucArray.length > 0) {
                    // If still no ordername, check product_revo to see if it's a rental product
                    console.log("DEBUG: No ordername found, checking product_revo for rental status");
                    const productQuery = await query(
                        `SELECT ecompublish FROM product_revo WHERE puc = $1 LIMIT 1`,
                        [pucArray[0]]
                    );
                    if (productQuery.rows.length > 0) {
                        // Rental products typically have ecompublish = false
                        isRental = productQuery.rows[0].ecompublish === false;
                        console.log("DEBUG: Product ecompublish status:", productQuery.rows[0].ecompublish, "isRental:", isRental);
                    }
                }

                console.log("DEBUG: Final ordername:", ordername, "isRental:", isRental);

                let updateQuantity = await stockRevoService.updateQuantity(pucArray, updateStock.result.rowCount, true, isRental);
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
                    // Recompute branch-level JSONB after orderline status transition.
                    // ordered_qty excludes ready_to_dispatch, so this clears stale
                    // quantityforlocation[branch].orderedquantity after RFID scan.
                    await stockRevoService.testinupdateQuantity(pucArray, false);
                    return result;
                }
            }
            else {
                return { error: updateStock };
            }

        } catch (error) {
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

    export const bulkInsertOrder = async (transactionData: any, orderData: any) => {
        try {
            console.log('Transaction data:', transactionData);
            console.log('Order data:', orderData);
            console.log('Empty Before processing order data');

            const { merchantTransactionId, userId, cgst, sgst, storelocation } = transactionData;

            if (orderData[0].addressid === null) {
                const getAddress = await query(`SELECT id from address where userid = $1 LIMIT 1`, [userId]);
                console.log('getAddress:', getAddress.rows);
                const addressId = getAddress.rows[0]?.id;
                orderData.forEach(order => {
                    if (order.addressid === null) {
                        order.addressid = addressId;
                    }
                })
            }
            console.log('Order Data after setting addressid:', orderData);
            console.log('Empty After processing order data');
            let cartId: number[] = [];
            let productid: number[] = [];
            orderData.forEach((e: any) => {
                productid.push(e.productid);
                cartId.push(e.cartId);
                delete e.cartId;
            });
            console.log('Product IDs:', productid);
            console.log('Cart IDs:', cartId);

            // Query product_revo table to get stock availability for each productid.
            // Rental orders must use rentalavailablequantity instead of the normal availablequantity column.
            const quantityQuery = `
            SELECT id AS productid, availablequantity, rentalavailablequantity
            FROM product_revo
            WHERE id = ANY($1)
        `;
            const quantityResult = await query(quantityQuery, [productid]);
            console.log('Available quantities:', quantityResult.rows);
            const availableQuantities = quantityResult.rows.reduce((acc: any, row: any) => {
                acc[row.productid] = {
                    availablequantity: Number(row.availablequantity ?? 0),
                    rentalavailablequantity: Number(row.rentalavailablequantity ?? 0),
                };
                return acc;
            }, {});

            // Split orderData into orders and thirdpartyorders based on quantity check
            const ordersToInsert: any[] = [];
            const thirdPartyOrdersToInsert: any[] = [];
            orderData.forEach((item: any) => {
                const productAvailability = availableQuantities[item.productid] || {
                    availablequantity: 0,
                    rentalavailablequantity: 0,
                };
                const isRentalOrder = String(item.invoicefor ?? "").trim().toLowerCase() === "product rental";
                const available = isRentalOrder
                    ? productAvailability.rentalavailablequantity
                    : productAvailability.availablequantity;
                const requestedQuantity = Number(item.quantity ?? 0);

                if (requestedQuantity <= available) {
                    // Entire quantity can be fulfilled from available stock
                    ordersToInsert.push({ ...item });
                } else {
                    // Split the order
                    console.log("available", available);
                    console.log("item.invoicefor", item.invoicefor);
                    if (isRentalOrder) {
                        throw new Error(`Insufficient rental stock available for product ${item.productid}.`);
                    }
                    if (available > 0) {
                        // Add available quantity to orders
                        let orderItem = { ...item, quantity: available };
                        ordersToInsert.push(orderItem);
                    }
                    // Add remaining quantity to thirdpartyorders
                    if (!isRentalOrder) {
                        const thirdPartyQuantity = requestedQuantity - available;
                        if (thirdPartyQuantity > 0) {
                            const thirdPartyItem = { ...item, quantity: thirdPartyQuantity };
                            thirdPartyOrdersToInsert.push(thirdPartyItem);
                        }
                    }

                }
            });

            console.log('Orders to insert:', ordersToInsert);
            console.log('Third-party orders to insert:', thirdPartyOrdersToInsert);
            console.log('Empty After splitting orders and third-party orders');

            let combinedResult: any = { rows: [], command: 'INSERT' };

            // Process orders for orders table
            if (ordersToInsert.length > 0) {
                // Calculate specific order amount, quantity, and product IDs for orders table
                let orderQuantity = ordersToInsert.reduce((acc: number, e: any) => {
                    return acc + e.quantity;
                }, 0);
                let orderAmount = ordersToInsert.reduce((acc: number, e: any) => {
                    return acc + (e.productamount * e.quantity);
                }, 0);
                let orderProductIds = ordersToInsert.map((e: any) => e.productid);

                console.log('Order quantity for orders:', orderQuantity);
                console.log('Order amount for orders:', orderAmount);
                console.log('Order product IDs:', orderProductIds);
                console.log('Mid checkpoint: Before inserting orders');
                const finalMerchantTransactionId =
                    merchantTransactionId != null && merchantTransactionId !== ''
                        ? merchantTransactionId
                        : ordersToInsert[0]?.merchanttransactionid;
                console.log('Final Merchant Transaction ID:', finalMerchantTransactionId);
                console.log('Empty');

                const insertOrderQuery = `
                INSERT INTO orders (orderamount, userid, addressid, merchanttransactionid, quantity, productid,ordername,paymentmethod,totalrentalamount,sgst, cgst,storelocation, assetnumber, location, vendorname, empid, deliverydate, brand, invoicefor)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
                    cgst,
                    storelocation,
                    ordersToInsert[0].assetnumber,
                    ordersToInsert[0].location,
                    ordersToInsert[0].vendorname,
                    ordersToInsert[0].empid,
                    ordersToInsert[0].deliverydate,
                    ordersToInsert[0].brand,
                    ordersToInsert[0].invoicefor
                ];

                try {
                    const orderResult = await query(insertOrderQuery, insertOrderValues);
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
                        const orderlineResult = await bulkInsertOrderlines(ordersToInsert);
                        console.log('Order lines inserted from orders:', orderlineResult.rows);
                        console.log('Empty After inserting order lines');
                        // Add orders rows to combined result
                        combinedResult.rows = [...combinedResult.rows, ...orderResult.rows];
                    }
                } catch (error) {
                    console.error("Query Execution Error: BulkinsertOrder result", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error);
                    return ErrorMessage;
                }
            }

            // Process orders for thirdpartyorders table
            if (thirdPartyOrdersToInsert.length > 0) {
                console.log('Inside third-party orders');
                // Calculate specific order amount, quantity, and product IDs for thirdpartyorders table
                let thirdPartyOrderQuantity = thirdPartyOrdersToInsert.reduce((acc: number, e: any) => {
                    return acc + e.quantity;
                }, 0);
                let thirdPartyOrderAmount = thirdPartyOrdersToInsert.reduce((acc: number, e: any) => {
                    return acc + (e.productamount * e.quantity);
                }, 0);
                let thirdPartyProductIds = thirdPartyOrdersToInsert.map((e: any) => e.productid);

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
                        thirdPartyOrdersToInsert.forEach((e: any) => {
                            e.thirdpartyorderid = orderid;
                            e.uniqueorderid = orderidunique;
                            e.orderstatus = orderstatus;
                            e.ordertype = 'Third Party Orders';
                        });
                        const orderlineResult = await bulkInsertOrderlines(thirdPartyOrdersToInsert);
                        console.log('Order lines inserted from third party:', orderlineResult.rows);
                        console.log('Empty After inserting third-party order lines');
                        // Add thirdpartyorders rows to combined result
                        combinedResult.rows = [...combinedResult.rows, ...thirdPartyResult.rows];
                    }
                } catch (error) {
                    console.error("Query Execution Error: BulkinsertThirdPartyOrder result", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error);
                    return ErrorMessage;
                }
            }

            return combinedResult.rows.length > 0
                ? combinedResult
                : { rows: [], command: 'NOOP', message: 'No orders processed' };
        } catch (error) {
            console.error("Query Execution Error: IN BulkinsertOrder", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    export const bulkInsertOrderlines = async (orderData: any[]) => {
        try {
            console.log('Inside update bulkInsertOrderlines with orderData:', JSON.stringify(orderData, null, 2));
            const fields = Object.keys(orderData[0]);
            const fieldNames = fields.join(", ");
            const baseQuery = `INSERT INTO orderline (${fieldNames}) VALUES `;
            const valuesClause = orderData.map((order, index) => {
                const valuePlaceholders = fields.map((_, fieldIndex) => `$${index * fields.length + fieldIndex + 1}`);
                return `(${valuePlaceholders.join(", ")})`;
            }).join(", ");

            const querydata = `${baseQuery}${valuesClause} RETURNING *`;

            const values = orderData.flatMap(order =>
                fields.map(field => order[field])
            );
            const result = await query(querydata, values);

            return result;

        } catch (error) {
            console.error("Query Execution Error: IN bulkInsertOrderlines", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
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
            let sendemail = await sendMail(maildata, false);
            return result.rows;

        } catch (error) {
            console.error('Error updateOrderStatus:', error);
            throw error;
        }
    }

    export const getOrderDataForMerchantid = async (merchantiddata: any) => {
        try {
            const { merchantid } = merchantiddata;

            const orderIdQuery = `SELECT orderid FROM orders WHERE merchanttransactionid = $1 AND ispaymentsucceed = FALSE;`;
            const orderIdResult = await query(orderIdQuery, [merchantid]);

            if (orderIdResult.rows.length === 0) {
                return;
            }

            const uniqueorderid = orderIdResult.rows[0].orderid;

            const productIdOrderlineQuery = `SELECT productid, ordername FROM orderline WHERE uniqueorderid = $1`;
            const productIdOrderlineResult = await query(productIdOrderlineQuery, [uniqueorderid]);

            if (productIdOrderlineResult.rows.length > 0) {
                const productIds = productIdOrderlineResult.rows
                    .filter(row => String(row.ordername ?? '').trim().toLowerCase() !== 'rental')
                    .map(row => row.productid);

                if (productIds.length > 0) {
                    const updateLockQtyQuery = `UPDATE product_revo SET lock_qty = 0 WHERE id = ANY($1::int[])`;
                    await query(updateLockQtyQuery, [productIds]);
                }
            }

            const deleteOrderlineQuery = `DELETE FROM orderline WHERE uniqueorderid = $1;`;
            await query(deleteOrderlineQuery, [uniqueorderid]);

            const deleteOrdersQuery = `DELETE FROM orders WHERE orderid = $1;`;
            await query(deleteOrdersQuery, [uniqueorderid]);


        } catch (error) {
            console.error("Error in getOrderDataForMerchantid:", error);
            throw error;
        }
    }

    export const getInvoiceDataForOrderid = async (orderid: any) => {
        try {
            const customerId = orderid.body
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
            // Step 1: Fetch orders with merchanttransactionid (unpaid & no transactionid)
            const orderIdQuery = `
      SELECT orderid, transactionid  FROM orders 
      WHERE merchanttransactionid = $1 
      AND ispaymentsucceed = FALSE 
      AND transactionid IS NULL;
    `;
            const orderIdResult = await query(orderIdQuery, [merchantid]);
            console.log("Order IDs fetched:", orderIdResult.rows);

            if (orderIdResult.rows.length === 0) {
                return { status: 200, message: 'Merchant Id Payment is successful or no pending orders' };
            }

            const uniqueorderid = orderIdResult.rows[0].orderid;
            console.log("Unique Order ID to delete:", uniqueorderid);

            // Step 2: Get all product ids associated with order lines
            const productIdOrderlineQuery = `SELECT productid, quantity, ordername FROM orderline WHERE uniqueorderid = $1`;
            const productIdOrderlineResult = await query(productIdOrderlineQuery, [uniqueorderid]);

            console.log("Product IDs from orderline:", productIdOrderlineResult.rows);

            if (productIdOrderlineResult.rows.length > 0) {
                console.log("Updating lock_qty for products associated with the order");
                const products = productIdOrderlineResult.rows.filter(
                    (product) => String(product.ordername ?? '').trim().toLowerCase() !== 'rental'
                );
                console.log("Products to update:", products);
                // Iterate through each product and update individually
                for (const product of products) {
                    console.log(`Updating lock_qty for product ID: ${product}`);
                    const updateLockQtyQuery = `
      UPDATE product_revo
      SET lock_qty = lock_qty - $1
      WHERE id = $2
    `;

                    const res = await query(updateLockQtyQuery, [product.quantity, product.productid]);
                    console.log(`lock_qty updated for product ID:`, res);
                }
            }

            // Step 4: Delete orderline entries for this order
            const deleteOrderlineQuery = `DELETE FROM orderline WHERE uniqueorderid = $1`;
            await query(deleteOrderlineQuery, [uniqueorderid]);

            // Step 5: Delete the order record
            const deleteOrdersQuery = `DELETE FROM orders WHERE orderid = $1`;
            await query(deleteOrdersQuery, [uniqueorderid]);

            return { status: 200, message: 'Data Deleted Successfully' };

        } catch (error) {
            console.error("Error in getOrderDataForMerchantid Service:", error);
            return { status: 500, message: 'Error processing order cleanup' };
        }
    };

}

