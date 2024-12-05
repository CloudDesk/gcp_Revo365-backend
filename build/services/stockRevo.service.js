import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { productrevoService } from "./productrevo.service.js";
import { DateCustomize } from "../utils/Date/Date.js";
export var stockRevoService;
(function (stockRevoService) {
    stockRevoService.getStockRevoData = async (request) => {
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
                console.log(paramValues, 'paramValues');
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
                    whereClauses.push(`(${key} != $${parameterIndex} OR ${key} IS NULL)`);
                    console.log(whereClauses, 'whereClause');
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
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM stock_revo ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            console.log("Query Text:", queryText);
            console.log("Query Params:", queryParams);
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.getEachStockRevoData = async (request) => {
        try {
            const { id } = request.params;
            console.log("getEachProducts call");
            console.log(id);
            const result = await query(`SELECT * FROM stock_revo where id=${id}`, []);
            let getvalues = { objectName: "null" };
            getvalues.objectName = "products";
            // let data = await picklistservice.getProductPicklist(getvalues);
            // console.log(data);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getEachStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.upsertStockRevoData = async (stockRevoData) => {
        try {
            let querydata;
            let params;
            console.log(stockRevoData.manufacturedyear);
            if (stockRevoData.manufacturedyear) {
                let converttoutc = await DateCustomize.ConvertDDMMYYYtoutc(stockRevoData.manufacturedyear);
                console.log(converttoutc, 'Convert to utc ');
                stockRevoData.manufacturedyear = converttoutc;
            }
            if (stockRevoData.releaseyear) {
                let converttoutc = await DateCustomize.ConvertDDMMYYYtoutc(stockRevoData.releaseyear);
                stockRevoData.releaseyear = converttoutc;
            }
            const { id, ...upsertFields } = stockRevoData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let command;
            if (id) {
                querydata = `UPDATE stock_revo SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                command = "UPDATE";
            }
            else {
                querydata = `INSERT INTO stock_revo (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
                command = "INSERT";
            }
            console.log(querydata, 'querydata');
            const result = await query(querydata, params);
            const puc = result.rows[0].puc;
            console.log('-- RESULT', puc, 'RESULT --');
            const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
            const countParams = [puc];
            const countResult = await query(countQuery, countParams);
            const totalCount = parseInt(countResult.rows[0].count, 10);
            console.log('-- TOTAL COUNT', totalCount, 'TOTAL COUNT --');
            return { command, result: result, totalCount };
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.getDeletedStocksrevo = async (request) => {
        try {
            const pageNumber = request.query.page || 1;
            const recordCount = request.query.count || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            let queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key != 'count') {
                    const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        if (whereClause.length > 0) {
                            whereClause += " AND ";
                        }
                    }
                    console.log(whereClause, 'Data set');
                    whereClause += `(${paramValues
                        .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                        .join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM stock_revo`;
            console.log(whereClause, 'whereClause');
            console.log(queryParams, 'queryParams');
            if (whereClause) {
                queryText += ` WHERE ${whereClause} AND isdeleted = true AND removefromrecyclebin = false AND ewaste = false OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                if (pageNumber && recordCount) {
                    queryParams.push(offset, recordCount);
                }
            }
            else if (pageNumber && recordCount) {
                queryText += ` WHERE isdeleted = true AND removefromrecyclebin = false AND ewaste = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            else {
                queryText += ` isdeleted = true AND removefromrecyclebin = false AND ewaste = false`;
            }
            console.log(queryText, 'Query text is');
            console.log(queryParams, 'params');
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getArcheivedStocksrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.updateEwaste = async (id) => {
        try {
            const result = await query(`UPDATE stock_revo SET ewaste = true WHERE id = $1`, [id]);
            // console.log('<<<',result,'<<<');
            if (result.command == 'UPDATE') {
                return { message: 'E-waste updated successfully', rowCount: result.rowCount };
            }
            else {
                return { message: 'No stock found with the provided ID', rowCount: 0 };
            }
        }
        catch (error) {
            console.error("Query Execution Error: updateEwaste", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    stockRevoService.getEwasteStocksrevo = async (request) => {
        try {
            const pageNumber = request.query.page || 1;
            const recordCount = request.query.count || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            let queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key != 'count') {
                    const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        if (whereClause.length > 0) {
                            whereClause += " AND ";
                        }
                    }
                    console.log(whereClause, 'Data set');
                    whereClause += `(${paramValues
                        .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                        .join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM stock_revo`;
            console.log(whereClause, 'whereClause');
            console.log(queryParams, 'queryParams');
            if (whereClause) {
                queryText += ` WHERE ${whereClause} AND ewaste = true OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                if (pageNumber && recordCount) {
                    queryParams.push(offset, recordCount);
                }
            }
            else if (pageNumber && recordCount) {
                queryText += ` WHERE ewaste = true OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            else {
                queryText += ` WHERE ewaste = true`;
            }
            console.log(queryText, 'Query text is');
            console.log(queryParams, 'params');
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getEwasteStocksrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.upsertStockRevoDatadelete = async (stockRevoData) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = stockRevoData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let command;
            if (id) {
                querydata = `UPDATE stock_revo SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                command = "UPDATE";
            }
            else {
                return { message: "Id is required to delete the stock", status: 400 };
            }
            console.log(querydata, 'querydata');
            const result = await query(querydata, params);
            if (result.rows.length === 0) {
                return { message: "No stock found with this id", status: 400 };
            }
            const puc = result.rows[0].puc;
            console.log('-- RESULT', puc, 'RESULT --');
            const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
            const countParams = [puc];
            const countResult = await query(countQuery, countParams);
            const totalCount = parseInt(countResult.rows[0].count, 10);
            console.log('-- TOTAL COUNT', totalCount, 'TOTAL COUNT --');
            return { command, result: result, totalCount };
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoDatadelete", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.upsertStockRevoDataarchive = async (stockRevoData) => {
        try {
            let querydata;
            let params;
            const { id, ...upsertFields } = stockRevoData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let command;
            if (id) {
                querydata = `UPDATE stock_revo SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                command = "UPDATE";
            }
            else {
                return { message: "Id is required to Archive the stock", status: 400 };
            }
            console.log(querydata, 'querydata');
            const result = await query(querydata, params);
            if (result.rows.length === 0) {
                return { message: "No stock found with this id", status: 400 };
            }
            const puc = result.rows[0].puc;
            console.log('-- RESULT', puc, 'RESULT --');
            const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
            const countParams = [puc];
            const countResult = await query(countQuery, countParams);
            const totalCount = parseInt(countResult.rows[0].count, 10);
            console.log('-- TOTAL COUNT', totalCount, 'TOTAL COUNT --');
            return { command, result: result, totalCount };
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoDatadelete", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.upsertBulkStockRevoData = async (jsonresult) => {
        try {
            let totalRecords = jsonresult.length;
            let successCount = 0;
            let failureCount = 0;
            console.log(totalRecords, 'TOTAL RECORD IS ');
            console.log(jsonresult.length, 'Json Result Length is');
            for (let i = 0; i < jsonresult.length; i++) {
                if (jsonresult[i].manufacturedyear) {
                    let convertDateToUTC = await DateCustomize.ConvertDDMMYYYtoutc(jsonresult[i].manufacturedyear);
                    console.log(convertDateToUTC, 'Manufctured Year Conversion');
                    jsonresult[i].manufacturedyear = convertDateToUTC;
                }
                if (jsonresult[i].releaseyear) {
                    let convertDateToUTC = await DateCustomize.ConvertDDMMYYYtoutc(jsonresult[i].releaseyear);
                    console.log(convertDateToUTC, 'Manufctured Year Conversion releaseyear');
                    jsonresult[i].releaseyear = convertDateToUTC;
                }
            }
            const fields = Object.keys(jsonresult[0]);
            const fieldNames = fields.join(', ');
            const baseQuery = `INSERT INTO stock_revo (${fieldNames}) VALUES `;
            const valuesClause = jsonresult.map((product, index) => {
                const valuePlaceholders = fields.map((_, fieldIndex) => `$${index * fields.length + fieldIndex + 1}`);
                return `(${valuePlaceholders.join(', ')})`;
            }).join(', ');
            const querydata = `${baseQuery}${valuesClause} RETURNING *`;
            const values = jsonresult.flatMap(product => fields.map(field => product[field]));
            let result;
            try {
                result = await query(querydata, values);
                console.log(JSON.stringify(result.rowCount), 'Result is');
                let successCount = result?.rowCount;
                console.log(successCount, 'sucess Count');
                const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
                const countParams = [result.rows[0]?.puc];
                const countResult = await query(countQuery, countParams);
                const totalCount = parseInt(countResult.rows[0].count, 10);
                console.log(totalCount);
                return { result, totalCount, totalRecords, successCount };
            }
            catch (error) {
                console.error("Query Execution Error: upsertBulkStockRevoData result", error);
                let ErrorMessage = await ErrorHandler.handleQueryError(error);
                console.log(ErrorMessage);
                return ErrorMessage;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertBulkStockRevoData FINAL", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    // export const updateQuantity = async (puc: string) => {
    //     // console.log('puc inside updatequantity',puc);
    //     try {
    //         const qunatityQuery = `
    //             SELECT 
    //                 COUNT(*) FILTER (
    //                     WHERE puc = $1
    //                     AND (isdeleted = false or isdeleted is null)
    //                     AND (isarchive = false or isarchive is null) 
    //                     AND (removefromrecyclebin = false or removefromrecyclebin is null)
    //                 ) AS quantity,
    //                 COUNT(*) FILTER (
    //                     WHERE puc = $1
    //                     AND (isdeleted = false or isdeleted is null)
    //                     AND (isarchive = false or isarchive is null)
    //                     AND (removefromrecyclebin = false or removefromrecyclebin is null)
    //                     AND ecompublish = true
    //                 ) as ecompublishedquantity,
    //                 COUNT(*) FILTER (
    //                     WHERE puc = $1
    //                     AND (isdeleted = false or isdeleted is null)
    //                     AND (isarchive = false or isarchive is null)
    //                     AND (removefromrecyclebin = false or removefromrecyclebin is null)
    //                     AND ecompublish = true AND stockstatus = 'Sold'
    //                 ) AS soldquantity,
    //                 COUNT(*) FILTER (
    //                     WHERE puc = $1
    //                     AND (isdeleted = false or isdeleted is null)
    //                     AND (isarchive = false or isarchive is null)
    //                     AND (removefromrecyclebin = false or removefromrecyclebin is null)
    //                     AND ecompublish = true AND stockstatus = 'Available'
    //                 ) AS availablequantity
    //             FROM stock_revo`;
    //         const quantityResult = await query(qunatityQuery, [puc])
    //         const totalCount = parseInt(quantityResult.rows[0].quantity, 10)
    //         const ecomPublishedQuantity = parseInt(quantityResult.rows[0].ecompublishedquantity, 10)
    //         const soldQuantity = parseInt(quantityResult.rows[0].soldquantity, 10)
    //         const availableQuantity = parseInt(quantityResult.rows[0].availablequantity, 10)
    //         const quantities = {
    //             quantity: totalCount,
    //             ecompublishedquantity: ecomPublishedQuantity,
    //             soldquantity: soldQuantity,
    //             availablequantity: availableQuantity,
    //             puc: puc
    //         }
    //         console.log(quantities, 'Quntity are ');
    //         const updateQuantityinProduct = await productrevoService.upsertQuantityFields(quantities);
    //         return updateQuantityinProduct;
    //     } catch (error) {
    //         console.error("Query Execution Error: IN updateQuantity", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //         console.log(ErrorMessage);
    //         return ErrorMessage
    //     }
    // };
    stockRevoService.updateQuantity = async (pucs, orderedquantity = 0, issold = false) => {
        try {
            const quantitiesList = [];
            for (const puc of pucs) {
                const quantityQuery = `
                    SELECT 
                        COUNT(*) FILTER (
                            WHERE puc = $1
                            AND (isdeleted = false OR isdeleted IS NULL)
                            AND (isarchive = false OR isarchive IS NULL) 
                            AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        ) AS quantity,
                        COUNT(*) FILTER (
                            WHERE puc = $1
                            AND (isdeleted = false OR isdeleted IS NULL)
                            AND (isarchive = false OR isarchive IS NULL)
                            AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                            AND ecompublish = true
                        ) AS ecompublishedquantity,
                        COUNT(*) FILTER (
                            WHERE puc = $1
                            AND (isdeleted = false OR isdeleted IS NULL)
                            AND (isarchive = false OR isarchive IS NULL)
                            AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                            AND ecompublish = true AND stockstatus = 'Sold'
                        ) AS soldquantity,
                        COUNT(*) FILTER (
                            WHERE puc = $1
                            AND (isdeleted = false OR isdeleted IS NULL)
                            AND (isarchive = false OR isarchive IS NULL)
                            AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                            AND ecompublish = true AND stockstatus = 'Available'
                        ) AS availablequantity
                         
                    FROM stock_revo`;
                const quantityResult = await query(quantityQuery, [puc]);
                const totalCount = parseInt(quantityResult.rows[0].quantity, 10);
                const ecomPublishedQuantity = parseInt(quantityResult.rows[0].ecompublishedquantity, 10);
                const soldQuantity = parseInt(quantityResult.rows[0].soldquantity, 10);
                const availableQuantity = parseInt(quantityResult.rows[0].availablequantity, 10);
                const quantities = {
                    quantity: totalCount,
                    ecompublishedquantity: ecomPublishedQuantity,
                    soldquantity: soldQuantity,
                    availablequantity: availableQuantity,
                    puc: puc
                };
                console.log(quantities, 'Quantities for PUC:', puc);
                quantitiesList.push(quantities);
            }
            const updateQuantityResults = await Promise.all(quantitiesList.map(quantities => productrevoService.upsertQuantityFields(quantities, orderedquantity, issold)));
            let result = stockRevoService.testinupdateQuantity(pucs, issold);
            return updateQuantityResults;
        }
        catch (error) {
            console.error("Query Execution Error: IN updateQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.testinupdateQuantity = async (pucs, issold) => {
        try {
            const locationsQuery = `
                SELECT DISTINCT location
                FROM stock_revo
                WHERE puc = ANY($1::text[])
            `;
            const locationsResult = await query(locationsQuery, [pucs]);
            const locations = locationsResult.rows.map(row => row.location);
            console.log(locations, 'LOCATIONS ARE ==>');
            const quantityQuery = `
                SELECT 
                    puc,
                    location,
                    COUNT(*) FILTER (
                        WHERE (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                    ) AS quantity,
                    COUNT(*) FILTER (
                        WHERE (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND ecompublish = true
                    ) AS ecompublishedquantity,
                    COUNT(*) FILTER (
                        WHERE (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND ecompublish = true AND stockstatus = 'Sold'
                    ) AS soldquantity,
                    COUNT(*) FILTER (
                        WHERE (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND ecompublish = true AND stockstatus = 'Available'
                    ) AS availablequantity
                FROM stock_revo
                WHERE puc = ANY($1::text[]) AND location = ANY($2::text[])
                GROUP BY puc, location
            `;
            const quantityResult = await query(quantityQuery, [pucs, locations]);
            const batchUpdateData = quantityResult.rows.map((row) => ({
                puc: row.puc,
                location: row.location,
                quantity: parseInt(row.quantity, 10),
                ecompublishedquantity: parseInt(row.ecompublishedquantity, 10),
                soldquantity: parseInt(row.soldquantity, 10),
                availablequantity: parseInt(row.availablequantity, 10)
            }));
            console.log(batchUpdateData, 'Batch update data');
            const updateResults = await productrevoService.testupsertQuantityFieldsBatch(batchUpdateData, issold);
            return updateResults;
        }
        catch (error) {
            console.error("Query Execution Error: IN updateQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.deleteStockrevo = async (id) => {
        try {
            const result = await query(`DELETE FROM stock_revo WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `Stock Deleted Successfully`;
            }
            else {
                return `Stock not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteStockrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.getArcheivedStocksrevo = async (request) => {
        try {
            const pageNumber = request.query.page || 1;
            const recordCount = request.query.count || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            let queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key != 'count') {
                    const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        if (whereClause.length > 0) {
                            whereClause += " AND ";
                        }
                    }
                    console.log(whereClause, 'Data set');
                    whereClause += `(${paramValues
                        .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                        .join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM stock_revo`;
            console.log(whereClause, 'whereClause');
            console.log(queryParams, 'queryParams');
            if (whereClause) {
                queryText += ` WHERE ${whereClause} AND isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                if (pageNumber && recordCount) {
                    queryParams.push(offset, recordCount);
                }
            }
            else if (pageNumber && recordCount) {
                queryText += ` WHERE isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            else {
                queryText += ` WHERE isarchive = true AND removefromrecyclebin = false`;
            }
            console.log(queryText, 'Query text is');
            console.log(queryParams, 'params');
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getArcheivedStocksrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    stockRevoService.updateRemoveFromRecyclebin = async () => {
        console.log("inside update recycle bin");
        const updateQuery = `
        UPDATE stock_revo
        SET removefromrecyclebin = true
        WHERE isdeleted = true AND removefromrecyclebin = false
        AND to_timestamp(modifieddate) <= (CURRENT_TIMESTAMP - INTERVAL '30 days')
    `;
        let data = await query(updateQuery, []);
        return data;
    };
    // export const upsertStockRevoDatarfid = async (rfid: any, productid: any, orderid: any) => {
    //     try {
    //         let querydata: string;
    //         let params: any[];
    //         //    'SELECT parents.id AS parent_id, parents.name AS parent_name, children.id AS child_id, children.name AS child_name
    //         //     FROM parents
    //         //     INNER JOIN children ON parents.id = children.parent_id'
    //         let stockData: any = `SELECT stock_revo.* FROM stock_revo left join product_revo ON stock_revo.puc = product_revo.puc WHERE product_revo.id = $${1} and stock_revo.rfid= $${2};`
    //         let value = [productid, rfid]
    //         console.log(stockData)
    //         console.log(value)
    //         let data = await query(stockData, value)
    //         let command: string;
    //         console.log(data.rows);
    //         if (data.rows.length === 1) {
    //             if (data.rows[0].rfid) {
    //                 querydata = `UPDATE stock_revo SET orderid = $${1} , rfid = $${2},stockstatus = $${3} where rfid =$${4} RETURNING *`;
    //                 params = [orderid, null, 'Sold', String(data.rows[0].rfid)];
    //                 command = "UPDATE";
    //             } else {
    //                 return { error: `Without RFid could't change status.Please Contact Admin` }
    //             }
    //             console.log(querydata, 'querydata');
    //             const result = await query(querydata, params);
    //             const puc = result.rows[0].puc;
    //             console.log('-- RESULT', puc, 'RESULT --');
    //             const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
    //             const countParams = [puc];
    //             const countResult = await query(countQuery, countParams);
    //             const totalCount = parseInt(countResult.rows[0].count, 10);
    //             console.log('-- TOTAL COUNT', totalCount, 'TOTAL COUNT --');
    //             return { command, result: result, totalCount };
    //         }
    //         else {
    //             return { error: 'For The Ordered Product The given RFID is Not Assigned SO Please Scan the Correct RFID' }
    //         }
    //     } catch (error) {
    //         console.error("Query Execution Error: IN upsertStockRevoData", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error)
    //         console.log(ErrorMessage);
    //         return ErrorMessage
    //     }
    // };
    stockRevoService.upsertStockRevoDatarfid = async (rfidDataArray) => {
        try {
            let rfidValues = rfidDataArray.map(item => item.rfid);
            let productid = rfidDataArray[0].productid;
            let arraylength = rfidDataArray.length;
            let caseStatementsOrderId = rfidDataArray.map((item) => {
                return `WHEN rfid = '${item.rfid}' THEN '${item.orderlinenumber}'`;
            }).join(' ');
            console.log(caseStatementsOrderId, 'caseStatementsOrderId');
            let updateQuery = `
            UPDATE stock_revo 
            SET orderlinenumber = CASE ${caseStatementsOrderId} END,
                stockstatus = 'Sold',
                rfid = NULL
            WHERE rfid IN (${rfidValues.map((rfid) => `'${rfid}'`).join(',')}) 
            AND puc IN (SELECT puc FROM product_revo WHERE id = $1)
            RETURNING *;
        `;
            console.log(updateQuery);
            console.log(productid);
            let result = await query(updateQuery, [productid]);
            const puc = result.rows.length > 0 ? result.rows[0].puc : null;
            if (puc) {
                const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
                const countParams = [puc];
                const countResult = await query(countQuery, countParams);
                const totalCount = parseInt(countResult.rows[0].count, 10);
                console.log('-- TOTAL COUNT', totalCount, 'TOTAL COUNT --');
                console.log('-- TOTAL COUNT', result, 'TOTAL COUNT --');
                return { command: "UPDATE", result: result, totalCount, arraylength };
            }
            else {
                return { error: 'No records were updated. Please check the provided RFIDs.' };
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(stockRevoService || (stockRevoService = {}));
//# sourceMappingURL=stockRevo.service.js.map