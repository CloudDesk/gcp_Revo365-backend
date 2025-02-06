import { query } from "../database/postgres.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import test from "node:test";
export module cartservice {
    export const getCartDatatest = async (request: any) => {
        try {
            let offset: any
            const pageNumber = request.query.page
            const recordcount = request.query.count
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            const queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
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
                queryText += ` WHERE ${whereClause} ORDER BY modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
            } else {
                queryText += `ORDER BY modifieddate DESC  Limit 500`;
            }
            if (offset && recordcount) {
                queryParams.push(offset, recordcount);
            }
            const result: QueryResult = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result)
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getCartDatatest", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const getCartData = async (request: any) => {
        try {
            let offset: any
            const pageNumber = request.query.page
            const recordcount = request.query.count
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            const queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
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
            p.availablequantity AS products_availablequantity,
            p.quantity AS products_quantity,
            p.soldquantity AS products_soldquantity,
            p.orderedquantity AS products_orderedquantity,
            p.discount AS products_discount
            FROM cart c
            INNER JOIN product_revo p ON p.id = c.productid where iscart = true  and iswishlist = false`;
            if (whereClause && pageNumber && recordcount) {
                queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            else if (whereClause) {
                queryText += ` AND ${whereClause} ORDER BY c.modifieddate DESC`;
            }
            else if (pageNumber && recordcount) {
                queryText += ` ORDER BY c.modifieddate DESC  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`

            }
            else {
                queryText += ` ORDER BY c.modifieddate DESC Limit 500`;
            }
            if (offset >= 0 && recordcount) {
                queryParams.push(offset, recordcount);
            }

            const result: QueryResult = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result)
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getCartData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const deleteCart = async (ids: any[]) => {
        try {

            if (ids.length === 0) {
                return `No IDs provided for deletion.`;
            }


            const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
            const queryText = `DELETE FROM cart WHERE id IN (${placeholders})`;
            const result: any = await query(queryText, ids);
            if (result.rowCount != 0) {
                return `${result.rowCount} Cart items deleted successfully`;
            } else {
                return `No Cart items found with the provided ids`;
            }
        } catch (error) {
            console.error("Query Execution Error: IN deleteCart", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };


    export const upsertCart = async (cartData: any) => {
        try {
            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = cartData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);

            if (id) {
                querydata = `UPDATE cart SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            } else {
                querydata = `INSERT INTO cart (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }

            const result = await query(querydata, params);
            return result;
        } catch (error) {
            console.error("Query Execution Error: IN upsertCart", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const upsertCartQuantity = async (cartData: any) => {

        try {
            const { productid, availablequantity } = cartData;
            let getcartData = `select * from cart where productid = ${productid}`
            let result = await query(getcartData, [])
            let updates = []
            let updateQuantityNullData = []
            if (result.rows.length > 0) {
                result.rows.forEach((e) => {
                    if (Number(e.quantity) !== 0 && (Number(e.quantity) > availablequantity)) {
                        updates.push({ id: e.id, quantity: availablequantity })
                    }
                    if (Number(e.quantity) === 0 && availablequantity > 0) {
                        updateQuantityNullData.push({ id: e.id, quantity: 1 })
                    }
                })
            }
            if (updates.length > 0) {
                const ids = updates.map((_, index) => `$${index * 2 + 1}`).join(", ");
                let cases = ''
                cases = updates
                    .map((_, index) => `WHEN id = $${index * 2 + 1} THEN $${index * 2 + 2}`)
                    .join(" ");
                const queryParams = updates.flatMap(update => [update.id, update.quantity]);

                const querydata = `UPDATE cart SET quantity = CASE ${cases} ELSE quantity END WHERE id IN (${ids});`;
                let data = await query(querydata, queryParams)
                if (data.command === 'update') {
                    return "Cart Quantity Updated Successfully";
                }
                else {
                    return data
                }
            }


            if (updateQuantityNullData.length > 0) {
                const ids = updateQuantityNullData.map((_, index) => `$${index * 2 + 1}`).join(", ");
                let cases = ''
                cases = updateQuantityNullData
                    .map((_, index) => `WHEN id = $${index * 2 + 1} THEN $${index * 2 + 2}`)
                    .join(" ");
                const queryParams = updateQuantityNullData.flatMap(update => [update.id, update.quantity]);

                const querydata = `UPDATE cart SET quantity = CASE ${cases} ELSE quantity END WHERE id IN (${ids});`;
                let data = await query(querydata, queryParams)
                if (data.command === 'update') {
                    return "Cart Quantity Updated Successfully";
                }
                else {
                    return data
                }
            }

        } catch (error) {
            console.error("Query Execution Error: IN upsertCartQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }


}