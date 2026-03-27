import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
export module wishListService {

    export const getWishlistData = async (request: any) => {
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
            c.createddate as c_createddate,c.iscart as iscart,c.iswishlist, p.id AS products_id,
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
            p.orderedquantity AS products_orderedquantity
            FROM cart c
            INNER JOIN product_revo p ON p.id = c.productid where iscart = false  and iswishlist = true`;
            if (whereClause && offset && recordcount) {
                queryText += ` and ${whereClause}   OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
            }

            else if (whereClause) {
                queryText += ` and ${whereClause}`;
            }

            else {
                queryText += ` Limit 500`;
            }
            if (offset && recordcount) {
                queryParams.push(offset, recordcount);

            }
            const result: QueryResult = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result)
            return datatypecheckResult;

        } catch (error) {
            console.error("Query Execution Error: IN getWishlistData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };
    export const getUserWishlistData = async (request: any) => {
        try {

            let offset: any
            const { userId } = request.params
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

            let queryText = `SELECT c.id as cartid ,c.quantity as quantity,c.productid as c_productid,c.userid,c.createddate as c_createddate,c.iscart as iscart,c.iswishlist, p.*
            FROM cart c
            INNER JOIN product_revo p ON p.id = c.productid where iscart = false  and iswishlist = true and c.userid = ${userId}`;
            if (whereClause) {
                queryText += ` WHERE ${whereClause}   OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
            } else {
                queryText += ` Limit 500`;
            }
            if (offset && recordcount) {
                queryParams.push(offset, recordcount);

            }
            const result: QueryResult = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result)
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error IN getUserWishlistData:", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const deleteFromWishlist = async (id: number) => {
        try {
            const result: any = await query(`DELETE FROM cart WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `${result.rowCount} Item deleted successfully from wishlist`;
            } else {
                return `Item not found in wishlist with id ${id}`;
            }
        } catch (error) {
            console.error("Query Execution Error: IN deleteFromWishlist", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const upsertToWishlist = async (wishlistData: any) => {
        try {
            let querydata: string;
            let params: any[];
            const { id, ...payloadFields } = wishlistData;

            // Wishlist is stored in cart table using flags.
            const upsertFields: any = {
                ...payloadFields,
                iswishlist: true,
                iscart: false,
            };

            if (!id && upsertFields.userid && upsertFields.productid) {
                const existingResult: any = await query(
                    `SELECT id FROM cart WHERE userid = $1 AND productid = $2 LIMIT 1`,
                    [upsertFields.userid, upsertFields.productid]
                );

                if (existingResult.rows.length > 0) {
                    const existingId = existingResult.rows[0].id;
                    const fieldNames = Object.keys(upsertFields);
                    const fieldValues = Object.values(upsertFields);

                    querydata = `UPDATE cart SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    params = [...fieldValues, existingId];
                    const updated = await query(querydata, params);
                    return updated;
                }
            }

            if (!id && upsertFields.quantity === undefined) {
                upsertFields.quantity = 1;
            }

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
            console.error("Query Execution Error: IN upsertToWishlist", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

}
