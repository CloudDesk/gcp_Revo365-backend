import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { productrevoService } from "./productrevo.service.js";
export var ratingService;
(function (ratingService) {
    ratingService.getRatingData = async (request) => {
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
                if (key === "displaysize" || key === "price") {
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
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : '';
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM rating ${whereClause} ${orderByClause}`;
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
            console.error("Query Execution Error: IN getRatingData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    ratingService.upsertRating = async (request, reply) => {
        try {
            let querydata;
            let params;
            let ratingData = request.body;
            let filedata = request.files;
            let url = [];
            console.log(filedata, 'file Dat');
            filedata && filedata.length > 0 && filedata.forEach((e) => {
                url.push(`${PROTOCOL}://${request.headers.host}/${e.filename}`);
            });
            console.log(url, 'URL IS ');
            ratingData.url = url;
            const { id, ...upsertFields } = ratingData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                const fetchUrlQuery = 'SELECT url FROM rating WHERE id = $1';
                const existingUrlResult = await query(fetchUrlQuery, [id]);
                if (existingUrlResult.rows.length > 0) {
                    const existingUrls = existingUrlResult.rows[0].url;
                    console.log(existingUrls, 'Existing URL');
                    const updatedUrls = existingUrls.concat(url);
                    console.log(updatedUrls);
                    upsertFields.url = updatedUrls;
                    const fieldNames = Object.keys(upsertFields);
                    const fieldValues = Object.values(upsertFields);
                    querydata = `UPDATE rating SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(', ')} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    params = [...fieldValues, id];
                }
                else {
                    return `No rating found with id ${id}`;
                }
            }
            else {
                querydata = `INSERT INTO rating (${fieldNames.join(', ')}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(', ')}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertProductrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    ratingService.upsertGcpRating = async (request, reply) => {
        try {
            let querydata;
            let params;
            let ratingData = request.body;
            const { id, ...upsertFields } = ratingData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                const fetchUrlQuery = 'SELECT url FROM rating WHERE id = $1';
                const existingUrlResult = await query(fetchUrlQuery, [id]);
                if (existingUrlResult.rows.length > 0) {
                    const existingUrls = existingUrlResult.rows[0].url;
                    console.log(existingUrls, 'Existing URL');
                    const updatedUrls = existingUrls.concat(ratingData.url);
                    console.log(updatedUrls);
                    upsertFields.url = updatedUrls;
                    const fieldNames = Object.keys(upsertFields);
                    const fieldValues = Object.values(upsertFields);
                    querydata = `UPDATE rating SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(', ')} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    params = [...fieldValues, id];
                }
                else {
                    return `No rating found with id ${id}`;
                }
            }
            else {
                querydata = `INSERT INTO rating (${fieldNames.join(', ')}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(', ')}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertProductrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    ratingService.deleteImage = async (request, reply) => {
        try {
            let querydata = '';
            let params;
            let ratingData = request.body;
            console.log(ratingData, 'Rating Data is');
            const { id, ...upsertFields } = ratingData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE rating SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(', ')} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            console.log(querydata, 'Query Data is ');
            console.log(params, 'Params is');
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertProductrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    ratingService.deleteRating = async (id) => {
        try {
            const result = await query(`DELETE FROM rating where id = $1`, [id]);
            if (result.rowCount != 0) {
                return `Rating Deleted Successfully`;
            }
            else {
                return `Rating not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteRating", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    ratingService.updateAvgRating = async (productid) => {
        try {
            const result = await query(`SELECT SUM(starrating) AS totalRating, 
                                         COUNT(starrating) AS ratingCount 
                                         FROM rating WHERE productid = $1`, [productid]);
            if (result.rows.length === 0) {
                return `No ratings found for productid ${productid}`;
            }
            const totalRating = result.rows[0].totalrating;
            const ratingCount = result.rows[0].ratingcount;
            console.log(`Total Rating: ${totalRating}, Rating Count: ${ratingCount}`);
            const avgRating = parseFloat((totalRating / ratingCount).toFixed(1));
            console.log(typeof (avgRating), avgRating, '-- AVG Rating');
            const updateAvgRatingInProductrevo = await productrevoService.updateAvgRatingProductrevo(avgRating, productid);
            return updateAvgRatingInProductrevo;
        }
        catch (error) {
            console.error("Query Execution Error: IN updateAvgRating", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(ratingService || (ratingService = {}));
//# sourceMappingURL=rating.service.js.map