import { query } from "../database/postgres.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { productrevoService } from "./productrevo.service.js";
export var cartservice;
(function (cartservice) {
    cartservice.getCartDatatest = async (request) => {
        try {
            let offset;
            const pageNumber = request.query.page;
            const recordcount = request.query.count;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            const queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        whereClause += " AND ";
                    }
                    whereClause += `(${paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`).join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            if (pageNumber && recordcount) {
                offset = (pageNumber - 1) * recordcount;
            }
            let queryText = `SELECT c.id as id ,c.quantity as quantity,c.productid as c_productid,c.userid,
            c.createddate as c_createddate,c.iscart as iscart,c.iswishlist,  p.id AS products_id,
            p.productname AS products_productname,
            p."large" AS products_large,
            p.medium AS products_medium,
            p.small AS products_small,
            p.price AS products_price,
            p.colour AS products_colour,
            p.category AS products_category,
            FROM cart c
            INNER JOIN product_revo p ON p.id = c.productid where iscart = true  and iswishlist = false`;
            if (whereClause) {
                queryText += ` WHERE ${whereClause} ORDER BY modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            else {
                queryText += `ORDER BY modifieddate DESC  Limit 500`;
            }
            if (offset && recordcount) {
                queryParams.push(offset, recordcount);
            }
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getCartDatatest", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    // export const getCartData = async (request: any) => {
    //     try {
    //         let offset: any
    //         const pageNumber = request.query.page
    //         const recordcount = request.query.count
    //         const keys = Object.keys(request.query);
    //         const values = Object.values(request.query);
    //         console.log("keys--",keys,"values",values)
    //         let whereClause = "";
    //         let parameterIndex = 1;
    //         const queryParams = [];
    //         keys.forEach((key, index) => {
    //             if (key !== 'page' && key !== 'count') {
    //                 const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
    //                 if (index !== 0) {
    //                     whereClause += " AND ";
    //                 }
    //                 whereClause += `(${paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`).join(" OR ")})`;
    //                 parameterIndex += paramValues.length;
    //                 queryParams.push(...paramValues);
    //             }
    //         });
    //         console.log("queryParams--",queryParams,"whereClause",whereClause,"parameterIndex",parameterIndex)
    //         if (pageNumber && recordcount) {
    //             offset = (pageNumber - 1) * recordcount;
    //         }
    //         const isthirdPartyStockCheck = `select productid from cart where userid = ${values}`
    //         const isthirdPartyStockCheckResult: any = await query(isthirdPartyStockCheck, [])
    //         console.log("isthirdPartyStockCheckResult--", isthirdPartyStockCheckResult.rows)
    //         const productid = isthirdPartyStockCheckResult.rows[0]?.productid || null;
    //         const findPuc = await query(`SELECT puc FROM product_revo WHERE id = $1`, [productid]);
    //         console.log("findPuc--", findPuc.rows[0].puc)
    //         const puc = findPuc.rows[0]?.puc || null;
    //         const isthirdPartyStockAvailable = await query(`select id from stock_revo where puc ='${puc}' and stocktype='third_party_product'`,[])
    //         console.log("isthirdPartyStockAvailable--", isthirdPartyStockAvailable.rows)
    //         if (isthirdPartyStockAvailable.rows.length === 0) {
    //             console.log("No third party stock available for this product");
    //             let queryText = `SELECT c.id as id ,c.quantity as quantity,c.productid as c_productid,c.userid,
    //         c.createddate as c_createddate,c.iscart as iscart,c.iswishlist,  p.id AS products_id,
    //         p.productname AS products_productname,
    //         p."large" AS products_large,
    //         p.medium AS products_medium,
    //         p.small AS products_small,
    //         p.price AS products_price,
    //         p.colour AS products_colour,
    //         p.category AS products_category,
    //         p.brand AS products_brand,
    //         p.productname AS products_productname,
    //         p.subcategory AS products_subcategory,
    //         p.model AS products_model,
    //         p.storagecapacity AS products_storagecapacity,
    //         p.ram AS products_ram,
    //         p.processor AS products_processor,
    //         p.graphicscard AS products_graphicscard,
    //         p.productstatus AS products_productstatus,
    //         p.ecompublishedquantity AS products_ecompublishedquantity,
    //         p.availablequantity AS products_availablequantity,
    //         p.quantity AS products_quantity,
    //         p.soldquantity AS products_soldquantity,
    //         p.orderedquantity AS products_orderedquantity,
    //         p.discount AS products_discount
    //         FROM cart c
    //         INNER JOIN product_revo p ON p.id = c.productid where iscart = true  and iswishlist = false`;
    //         if (whereClause && pageNumber && recordcount) {
    //             queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
    //         }
    //         else if (whereClause) {
    //             queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC`;
    //         }
    //         else if (pageNumber && recordcount) {
    //             queryText += ` ORDER BY c.modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`
    //         }
    //         else {
    //             queryText += ` ORDER BY c.modifieddate DESC Limit 500`;
    //         }
    //         if (offset >= 0 && recordcount) {
    //             queryParams.push(offset, recordcount);
    //         }
    //         const result: QueryResult = await query(queryText, queryParams);
    //         let datatypecheckResult = await dataTypeCheck(result)
    //         return datatypecheckResult;
    //         }
    //         else{
    //             console.log("Third party stock available for this product");
    //             let thirdPartyStockCount = await query(`select thirdpartyquantity from stock_revo where puc ='${puc}' and stocktype='third_party_product'`,[])
    //             console.log("thirdPartyStockCount--", thirdPartyStockCount.rows[0].thirdpartyquantity)
    //             const thirdPartyStockQuantity = thirdPartyStockCount.rows[0]?.thirdpartyquantity || 0;
    //             let sample = await query(`SELECT (availablequantity + $1) AS total_quantity FROM product_revo WHERE puc = $2`,[thirdPartyStockQuantity, puc]);
    //             console.log("sample--", sample.rows[0].total_quantity)
    //             const totalQuantity = sample.rows[0]?.total_quantity || 0;
    //             let queryText = `SELECT c.id as id ,c.quantity as quantity,c.productid as c_productid,c.userid,
    //         c.createddate as c_createddate,c.iscart as iscart,c.iswishlist,  p.id AS products_id,
    //         p.productname AS products_productname,
    //         p."large" AS products_large,
    //         p.medium AS products_medium,
    //         p.small AS products_small,
    //         p.price AS products_price,
    //         p.colour AS products_colour,
    //         p.category AS products_category,
    //         p.brand AS products_brand,
    //         p.productname AS products_productname,
    //         p.subcategory AS products_subcategory,
    //         p.model AS products_model,
    //         p.storagecapacity AS products_storagecapacity,
    //         p.ram AS products_ram,
    //         p.processor AS products_processor,
    //         p.graphicscard AS products_graphicscard,
    //         p.productstatus AS products_productstatus,
    //         p.ecompublishedquantity AS products_ecompublishedquantity,
    //         ${totalQuantity} AS products_availablequantity,
    //         p.quantity AS products_quantity,
    //         p.soldquantity AS products_soldquantity,
    //         p.orderedquantity AS products_orderedquantity,
    //         p.discount AS products_discount
    //         FROM cart c
    //         INNER JOIN product_revo p ON p.id = c.productid where iscart = true  and iswishlist = false`;
    //         if (whereClause && pageNumber && recordcount) {
    //             queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
    //         }
    //         else if (whereClause) {
    //             queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC`;
    //         }
    //         else if (pageNumber && recordcount) {
    //             queryText += ` ORDER BY c.modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`
    //         }
    //         else {
    //             queryText += ` ORDER BY c.modifieddate DESC Limit 500`;
    //         }
    //         if (offset >= 0 && recordcount) {
    //             queryParams.push(offset, recordcount);
    //         }
    //         const result: QueryResult = await query(queryText, queryParams);
    //         let datatypecheckResult = await dataTypeCheck(result)
    //         return datatypecheckResult;
    //         }
    //     } catch (error) {
    //         console.error("Query Execution Error: IN getCartData", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //         return ErrorMessage
    //     }
    // };
    cartservice.getCartData = async (request) => {
        try {
            let offset;
            const pageNumber = request.query.page;
            const recordcount = request.query.count;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            console.log("keys--", keys, "values", values);
            let whereClause = "";
            let parameterIndex = 1;
            const queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        whereClause += " AND ";
                    }
                    whereClause += `(${paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`).join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            console.log("queryParams--", queryParams, "whereClause", whereClause, "parameterIndex", parameterIndex);
            if (pageNumber && recordcount) {
                offset = (pageNumber - 1) * recordcount;
            }
            // Fetch all products from the cart for the given user
            const isthirdPartyStockCheck = `SELECT productid FROM cart WHERE userid = $1 AND iscart = true AND iswishlist = false`;
            const isthirdPartyStockCheckResult = await query(isthirdPartyStockCheck, [values[0]]);
            console.log("isthirdPartyStockCheckResult--", isthirdPartyStockCheckResult.rows);
            // Group products by productid to handle duplicates and avoid redundant queries
            const productGroups = {};
            isthirdPartyStockCheckResult.rows.forEach((row) => {
                const productid = row.productid;
                productGroups[productid] = (productGroups[productid] || 0) + 1;
            });
            // Object to store PUC and total quantities for each unique product
            const productPucs = {};
            const thirdPartyQuantities = {};
            // Process each unique product
            for (const productid of Object.keys(productGroups)) {
                // Fetch PUC for the current product
                const findPuc = await query(`SELECT puc FROM product_revo WHERE id = $1`, [productid]);
                console.log("findPuc for productid", productid, "--", findPuc.rows[0]?.puc);
                const puc = findPuc.rows[0]?.puc || null;
                console.log("--PUC--", puc);
                const updateoverallAvailableQty = await productrevoService.updateoverallAvailableQuantity(puc);
                console.log("updateoverallAvailableQty--", updateoverallAvailableQty);
                if (!puc) {
                    console.log(`No PUC found for productid: ${productid}`);
                    thirdPartyQuantities[productid] = 0;
                    continue;
                }
                productPucs[productid] = puc;
                // Check if third-party stock exists for this PUC
                // const isthirdPartyStockAvailable = await query(
                //     `SELECT id, thirdpartyquantity FROM stock_revo WHERE puc = $1 AND stocktype = 'third_party_product'`,
                //     [puc]
                // );
                // console.log("isthirdPartyStockAvailable for productid", productid, "--", isthirdPartyStockAvailable.rows);
                // if (isthirdPartyStockAvailable.rows.length === 0) {
                //     console.log(`No third-party stock available for productid: ${productid}`);
                //     thirdPartyQuantities[productid] = 0;
                // } else {
                //     console.log(`Third-party stock available for productid: ${productid}`);
                //     const thirdPartyStockQuantity = isthirdPartyStockAvailable.rows[0]?.thirdpartyquantity || 0;
                //     console.log("thirdPartyStockCount for productid", productid, "--", thirdPartyStockQuantity);
                //     thirdPartyQuantities[productid] = thirdPartyStockQuantity;
                // }
            }
            // Base query to fetch cart data
            let queryText = `
            SELECT 
                c.id AS id,
                c.quantity AS quantity,
                c.productid AS c_productid,
                c.userid,
                c.createddate AS c_createddate,
                c.iscart AS iscart,
                c.iswishlist,
                p.id AS products_id,
                p.productname AS products_productname,
                p."large" AS products_large,
                p.medium AS products_medium,
                p.small AS products_small,
                p.price AS products_price,
                p.colour AS products_colour,
                p.category AS products_category,
                p.brand AS products_brand,
                p.productname AS products_productname,
                p.subcategory AS products_subcategory,
                p.model AS products_model,
                p.storagecapacity AS products_storagecapacity,
                p.ram AS products_ram,
                p.processor AS products_processor,
                p.graphicscard AS products_graphicscard,
                p.productstatus AS products_productstatus,
                p.ecompublishedquantity AS products_ecompublishedquantity,
                p.overallavailableqty AS products_availablequantity,
                p.quantity AS products_quantity,
                p.soldquantity AS products_soldquantity,
                p.orderedquantity AS products_orderedquantity,
                p.discount AS products_discount,
                p.weight AS products_weight
            FROM cart c
            INNER JOIN product_revo p ON p.id = c.productid 
            WHERE iscart = true AND iswishlist = false
        `;
            // Add product IDs and third-party quantities to query parameters
            // const productIds = Object.keys(thirdPartyQuantities);
            // const thirdPartyValues = Object.values(thirdPartyQuantities);
            // queryParams.push(...productIds, ...thirdPartyValues);
            // parameterIndex += productIds.length * 2;
            // Add conditions to the query
            if (whereClause && pageNumber && recordcount) {
                queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            else if (whereClause) {
                queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC`;
            }
            else if (pageNumber && recordcount) {
                queryText += ` ORDER BY c.modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            else {
                queryText += ` ORDER BY c.modifieddate DESC LIMIT 500`;
            }
            if (offset >= 0 && recordcount) {
                queryParams.push(offset, recordcount);
            }
            // Execute the final query (unchanged as per your instruction)
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            console.log("Final Query Result:", datatypecheckResult);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getCartData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    cartservice.deleteCart = async (ids) => {
        try {
            if (ids.length === 0) {
                return `No IDs provided for deletion.`;
            }
            const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
            const queryText = `DELETE FROM cart WHERE id IN (${placeholders})`;
            const result = await query(queryText, ids);
            if (result.rowCount != 0) {
                return `${result.rowCount} Cart items deleted successfully`;
            }
            else {
                return `No Cart items found with the provided ids`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteCart", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    cartservice.upsertCart = async (cartData) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = cartData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE cart SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                querydata = `INSERT INTO cart (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertCart", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    cartservice.upsertCartQuantity = async (cartData) => {
        try {
            const { productid, availablequantity } = cartData;
            let getcartData = `select * from cart where productid = ${productid}`;
            let result = await query(getcartData, []);
            let updates = [];
            let updateQuantityNullData = [];
            if (result.rows.length > 0) {
                result.rows.forEach((e) => {
                    if (Number(e.quantity) !== 0 && (Number(e.quantity) > availablequantity)) {
                        updates.push({ id: e.id, quantity: availablequantity });
                    }
                    if (Number(e.quantity) === 0 && availablequantity > 0) {
                        updateQuantityNullData.push({ id: e.id, quantity: 1 });
                    }
                });
            }
            if (updates.length > 0) {
                const ids = updates.map((_, index) => `$${index * 2 + 1}`).join(", ");
                let cases = '';
                cases = updates
                    .map((_, index) => `WHEN id = $${index * 2 + 1} THEN $${index * 2 + 2}`)
                    .join(" ");
                const queryParams = updates.flatMap(update => [update.id, update.quantity]);
                const querydata = `UPDATE cart SET quantity = CASE ${cases} ELSE quantity END WHERE id IN (${ids});`;
                let data = await query(querydata, queryParams);
                if (data.command === 'update') {
                    return "Cart Quantity Updated Successfully";
                }
                else {
                    return data;
                }
            }
            if (updateQuantityNullData.length > 0) {
                const ids = updateQuantityNullData.map((_, index) => `$${index * 2 + 1}`).join(", ");
                let cases = '';
                cases = updateQuantityNullData
                    .map((_, index) => `WHEN id = $${index * 2 + 1} THEN $${index * 2 + 2}`)
                    .join(" ");
                const queryParams = updateQuantityNullData.flatMap(update => [update.id, update.quantity]);
                const querydata = `UPDATE cart SET quantity = CASE ${cases} ELSE quantity END WHERE id IN (${ids});`;
                let data = await query(querydata, queryParams);
                if (data.command === 'update') {
                    return "Cart Quantity Updated Successfully";
                }
                else {
                    return data;
                }
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertCartQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(cartservice || (cartservice = {}));
//# sourceMappingURL=cart.service.js.map