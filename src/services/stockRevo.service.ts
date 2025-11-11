import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { productrevoService } from "./productrevo.service.js";
import { DateCustomize } from "../utils/Date/Date.js";
export module stockRevoService {
    export const getStockRevoData = async (request: any) => {
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
                if (key === "displaysize" || key === "price") {
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
                    whereClauses.push(`(${key} != $${parameterIndex} OR ${key} IS NULL)`);
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
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM stock_revo ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result)
            return datatypecheckResult
        } catch (error) {
            console.error("Query Execution Error: IN getStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const getEachStockRevoData = async (request: any) => {
        try {
            const { id } = request.params
            const result: any = await query(
                `SELECT * FROM stock_revo where id=${id}`,
                []
            );
            let getvalues = { objectName: "null" };
            getvalues.objectName = "products";
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getEachStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const upsertStockRevoData = async (stockRevoData: any) => {
        try {
            let querydata: string;
            let params: any[];
            if (stockRevoData.manufacturedyear) {
                let converttoutc = await DateCustomize.ConvertDDMMYYYtoutc(stockRevoData.manufacturedyear)
                stockRevoData.manufacturedyear = converttoutc
            }
            if (stockRevoData.releaseyear) {
                let converttoutc = await DateCustomize.ConvertDDMMYYYtoutc(stockRevoData.releaseyear)
                stockRevoData.releaseyear = converttoutc
            }
            const { id, ...upsertFields } = stockRevoData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let command: string;

            if (id) {
                querydata = `UPDATE stock_revo SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                command = "UPDATE";
            } else {
                querydata = `INSERT INTO stock_revo (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
                command = "INSERT";
            }

            const result = await query(querydata, params);
            const puc = result.rows[0].puc;
            const updateCatalogueQuantities = await productrevoService.updateCatalogueQuantities(puc);
            console.log("updateCatalogueQuantities", updateCatalogueQuantities);
            const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
            const countParams = [puc];
            const countResult = await query(countQuery, countParams);
            const totalCount = parseInt(countResult.rows[0].count, 10);
            console.log("Total Count:", countResult);
            return { command, result: result, totalCount };
        } catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const getDeletedStocksrevo = async (request: any) => {
        try {
            const pageNumber = request.query.page || 1
            const recordCount = request.query.count || 5000
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            let queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key != 'count') {
                    const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        if (whereClause.length > 0) {
                            whereClause += " AND ";
                        }
                    }
                    whereClause += `(${paramValues
                        .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                        .join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM stock_revo`;
            if (whereClause) {
                queryText += ` WHERE ${whereClause} AND isdeleted = true AND removefromrecyclebin = false AND ewaste = false OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
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
            const result: any = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getDeletedStocksrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    }

    export const updateEwaste = async (id: number) => { 
        try {
            const result = await query(`UPDATE stock_revo SET ewaste = true WHERE id = $1`, [id]);
            if (result.command == 'UPDATE') {
                return { message: 'E-waste updated successfully', rowCount: result.rowCount };
            } else {
                return { message: 'No stock found with the provided ID', rowCount: 0 };
            }
        } catch (error) {
            console.error("Query Execution Error: updateEwaste", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage; 
        }
    };

    export const getEwasteStocksrevo = async (request: any) => {
        try {
            const pageNumber = request.query.page || 1
            const recordCount = request.query.count || 5000
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            let queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key != 'count') {
                    const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        if (whereClause.length > 0) {
                            whereClause += " AND ";
                        }
                    }
                    whereClause += `(${paramValues
                        .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                        .join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM stock_revo`;
            if (whereClause) {
                queryText += ` WHERE ${whereClause} AND ewaste = true OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
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
            const result: any = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getEwasteStocksrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    }

    export const upsertStockRevoDatadelete = async (stockRevoData: any) => {
        try {
            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = stockRevoData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let command: string;
            if (id) {
                querydata = `UPDATE stock_revo SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                command = "UPDATE";
            } else {
                return { message: "Id is required to delete the stock", status: 400 };
            }
            const result = await query(querydata, params);
            if (result.rows.length === 0) {
                return { message: "No stock found with this id", status: 400 };
            }
            const puc = result.rows[0].puc;
            const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
            const countParams = [puc];
            const countResult = await query(countQuery, countParams);
            const totalCount = parseInt(countResult.rows[0].count, 10);
            return { command, result: result, totalCount };
        } catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoDatadelete", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const upsertStockRevoDataarchive = async (stockRevoData: any) => {
        try {
            let querydata: string;
            let params: any[];
            const { id, ...upsertFields } = stockRevoData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let command: string;
            if (id) {
                querydata = `UPDATE stock_revo SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                command = "UPDATE";
            } else {
                return { message: "Id is required to Archive the stock", status: 400 };
            }

            const result = await query(querydata, params);
            if (result.rows.length === 0) {
                return { message: "No stock found with this id", status: 400 };
            }
            const puc = result.rows[0].puc;
            const updateCatalogueQuantities = await productrevoService.updateCatalogueQuantities(puc)
            console.log("updateCatalogueQuantities", updateCatalogueQuantities);
            const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
            const countParams = [puc];
            const countResult = await query(countQuery, countParams);
            const totalCount = parseInt(countResult.rows[0].count, 10);
            return { command, result: result, totalCount };
        } catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoDataarchive", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };
    export const upsertBulkStockRevoData = async (jsonresult: any) => {
        try {
            let totalRecords = jsonresult.length;
            for (let i = 0; i < jsonresult.length; i++) {
                if (jsonresult[i].manufacturedyear) {
                    let convertDateToUTC = await DateCustomize.ConvertDDMMYYYtoutc(jsonresult[i].manufacturedyear)
                    jsonresult[i].manufacturedyear = convertDateToUTC
                }
                if (jsonresult[i].releaseyear) {
                    let convertDateToUTC = await DateCustomize.ConvertDDMMYYYtoutc(jsonresult[i].releaseyear)
                    jsonresult[i].releaseyear = convertDateToUTC
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
                let successCount = result?.rowCount
                const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
                const countParams = [result.rows[0]?.puc];
                const countResult = await query(countQuery, countParams);
                const totalCount = parseInt(countResult.rows[0].count, 10);
                return { result, totalCount, totalRecords, successCount };
            } catch (error) {
                console.error("Query Execution Error: upsertBulkStockRevoData", error);
                let ErrorMessage = await ErrorHandler.handleQueryError(error)
                return ErrorMessage
            }

        } catch (error) {
            console.error("Query Execution Error: IN upsertBulkStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    // export const updateQuantity = async (pucs: string[], orderedquantity = 0, issold = false) => {
    //     try {
    //         const quantitiesList = [];
    //         console.log("Inside update quantity:", pucs, orderedquantity, issold);
    //         console.log('Stop here for debugging');
    //         for (const puc of pucs) {
    //             // const quantityQuery = `
    //             //     SELECT 
    //             //         COUNT(*) FILTER (
    //             //             WHERE puc = $1
    //             //             AND (isdeleted = false OR isdeleted IS NULL)
    //             //             AND (isarchive = false OR isarchive IS NULL) 
    //             //             AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //             //         ) AS quantity,
    //             //         COUNT(*) FILTER (
    //             //             WHERE puc = $1
    //             //             AND (isdeleted = false OR isdeleted IS NULL)
    //             //             AND (isarchive = false OR isarchive IS NULL)
    //             //             AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //             //             AND ecompublish = true
    //             //         ) AS ecompublishedquantity,
    //             //         COUNT(*) FILTER (
    //             //             WHERE puc = $1
    //             //             AND (isdeleted = false OR isdeleted IS NULL)
    //             //             AND (isarchive = false OR isarchive IS NULL)
    //             //             AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //             //             AND ecompublish = true AND stockstatus = 'Sold'
    //             //         ) AS soldquantity,
    //             //         COUNT(*) FILTER (
    //             //             WHERE puc = $1
    //             //             AND (isdeleted = false OR isdeleted IS NULL)
    //             //             AND (isarchive = false OR isarchive IS NULL)
    //             //             AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //             //             AND ecompublish = true AND stockstatus = 'Available' AND stocktype <> 'third_party_product'
    //             //         ) AS availablequantity
                        
    //             //     FROM stock_revo`;
    //             const quantityQuery = `
    //                 SELECT 
    //                     COUNT(*) FILTER (
    //                         WHERE puc = $1
    //                         AND (isdeleted = false OR isdeleted IS NULL)
    //                         AND (isarchive = false OR isarchive IS NULL) 
    //                         AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //                     ) AS quantity,
    //                     COUNT(*) FILTER (
    //                         WHERE puc = $1
    //                         AND (isdeleted = false OR isdeleted IS NULL)
    //                         AND (isarchive = false OR isarchive IS NULL)
    //                         AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //                         AND ecompublish = true
    //                     ) AS ecompublishedquantity,
    //                     COUNT(*) FILTER (
    //                         WHERE puc = $1
    //                         AND (isdeleted = false OR isdeleted IS NULL)
    //                         AND (isarchive = false OR isarchive IS NULL)
    //                         AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //                         AND ecompublish = true AND stockstatus = 'Sold'
    //                     ) AS soldquantity,
    //                     COUNT(*) FILTER (
    //                         WHERE puc = $1
    //                         AND (isdeleted = false OR isdeleted IS NULL)
    //                         AND (isarchive = false OR isarchive IS NULL)
    //                         AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //                         AND ecompublish = true AND stockstatus = 'Rental Sold'
    //                     ) AS rentalsoldquantity,
    //                     COUNT(*) FILTER (
    //                         WHERE puc = $1
    //                         AND (isdeleted = false OR isdeleted IS NULL)
    //                         AND (isarchive = false OR isarchive IS NULL)
    //                         AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //                         AND ecompublish = true AND stockstatus = 'Available' AND stocktype <> 'third_party_product'
    //                     ) AS availablequantity,
    //                      (
    //     COALESCE(
    //         SUM(thirdpartyquantity) FILTER (
    //             WHERE puc = $1
    //         ), 0
    //     ) +
    //     COUNT(*) FILTER (
    //         WHERE puc = $1
    //             AND (isdeleted = false OR isdeleted IS NULL)
    //             AND (isarchive = false OR isarchive IS NULL)
    //             AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
    //             AND ecompublish = true 
    //             AND stockstatus = 'Available' 
    //             AND stocktype <> 'third_party_product'
    //     )
    // ) AS overallavailableqty
                        
    //                 FROM stock_revo`;
    //             const quantityResult = await query(quantityQuery, [puc]);
    //             const totalCount = parseInt(quantityResult.rows[0].quantity, 10);
    //             const ecomPublishedQuantity = parseInt(quantityResult.rows[0].ecompublishedquantity, 10);
    //             const soldQuantity = parseInt(quantityResult.rows[0].soldquantity, 10);
    //             const availableQuantity = parseInt(quantityResult.rows[0].availablequantity, 10);
    //             const overallavailableqty = parseInt(quantityResult.rows[0].overallavailableqty, 10);
    //             const rentalsoldquantity = parseInt(quantityResult.rows[0].rentalsoldquantity, 10);

    //             const quantities = {
    //                 quantity: totalCount,
    //                 ecompublishedquantity: ecomPublishedQuantity,
    //                 soldquantity: soldQuantity,
    //                 availablequantity: availableQuantity,
    //                 puc: puc,
    //                 overallavailableqty: overallavailableqty,
    //                 rentalsoldquantity: rentalsoldquantity
    //             };
    //             console.log("--quantities", quantities);

    //             quantitiesList.push(quantities);
    //         }

    //         const updateQuantityResults = await Promise.all(
    //             quantitiesList.map(quantities => productrevoService.upsertQuantityFields(quantities, orderedquantity, issold))
    //         );


    //         let result = testinupdateQuantity(pucs, issold);

    //         return updateQuantityResults;

    //     } catch (error) {
    //         console.error("Query Execution Error: IN updateQuantity", error);
    //         let ErrorMessage = await ErrorHandler.handleQueryError(error);
    //         return ErrorMessage;
    //     }
    // };

    export const updateQuantity = async (pucs: string[], orderedquantity = 0, issold = false) => {
    try {
        const quantitiesList = [];
        console.log("Inside update quantity:", pucs, orderedquantity, issold);
        console.log('Stop here for debugging');

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
                        AND ecompublish = true AND stockstatus = 'Rental Sold'
                    ) AS rentalsoldquantity,

                    COUNT(*) FILTER (
                        WHERE puc = $1
                        AND (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND ecompublish = true 
                        AND stockstatus = 'Available' 
                        AND stocktype <> 'third_party_product'
                    ) AS availablequantity,

                    (
                        COALESCE(
                            SUM(thirdpartyquantity) FILTER (
                                WHERE puc = $1
                            ), 0
                        ) +
                        COUNT(*) FILTER (
                            WHERE puc = $1
                            AND (isdeleted = false OR isdeleted IS NULL)
                            AND (isarchive = false OR isarchive IS NULL)
                            AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                            AND ecompublish = true 
                            AND stockstatus = 'Available' 
                            AND stocktype <> 'third_party_product'
                        )
                    ) AS overallavailableqty,

                    COUNT(*) FILTER (
                        WHERE puc = $1
                        AND (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND ecompublish = true 
                        AND stockstatus = 'Available' 
                        AND stocktype = 'on_catalogue_product'
                    ) AS oncatalogueqty,

                    COUNT(*) FILTER (
                        WHERE puc = $1
                        AND (isdeleted = false OR isdeleted IS NULL)
                        AND (isarchive = false OR isarchive IS NULL)
                        AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND ecompublish = true 
                        AND stockstatus = 'Available' 
                        AND stocktype = 'off_catalogue_product'
                    ) AS offcatalogueqty

                FROM stock_revo`;

            const quantityResult = await query(quantityQuery, [puc]);

            const totalCount = parseInt(quantityResult.rows[0].quantity, 10);
            const ecomPublishedQuantity = parseInt(quantityResult.rows[0].ecompublishedquantity, 10);
            const soldQuantity = parseInt(quantityResult.rows[0].soldquantity, 10);
            const availableQuantity = parseInt(quantityResult.rows[0].availablequantity, 10);
            const overallavailableqty = parseInt(quantityResult.rows[0].overallavailableqty, 10);
            const rentalsoldquantity = parseInt(quantityResult.rows[0].rentalsoldquantity, 10);
            const oncatalogueqty = parseInt(quantityResult.rows[0].oncatalogueqty, 10);
            const offcatalogueqty = parseInt(quantityResult.rows[0].offcatalogueqty, 10);

            const quantities = {
                quantity: totalCount,
                ecompublishedquantity: ecomPublishedQuantity,
                soldquantity: soldQuantity,
                availablequantity: availableQuantity,
                puc: puc,
                overallavailableqty: overallavailableqty,
                rentalsoldquantity: rentalsoldquantity,
                oncatalogueqty: oncatalogueqty,
                offcatalogueqty: offcatalogueqty
            };

            console.log("--quantities", quantities);
            quantitiesList.push(quantities);
        }

        const updateQuantityResults = await Promise.all(
            quantitiesList.map(quantities =>
                productrevoService.upsertQuantityFields(quantities, orderedquantity, issold)
            )
        );

        let result = testinupdateQuantity(pucs, issold);
        return updateQuantityResults;

    } catch (error) {
        console.error("Query Execution Error: IN updateQuantity", error);
        let ErrorMessage = await ErrorHandler.handleQueryError(error);
        return ErrorMessage;
    }
};


    export const testinupdateQuantity = async (pucs: string[], issold: boolean) => {
        try {
            const locationsQuery = `
                SELECT DISTINCT location
                FROM stock_revo
                WHERE puc = ANY($1::text[])
            `;
            const locationsResult = await query(locationsQuery, [pucs]);
            const locations = locationsResult.rows.map(row => row.location);
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
            const updateResults = await productrevoService.testupsertQuantityFieldsBatch(batchUpdateData, issold);
            return updateResults;

        } catch (error) {
            console.error("Query Execution Error: IN testinupdateQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };




    export const deleteStockrevo = async (id: number) => {
        try {
            const result: any = await query(`DELETE FROM stock_revo WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `Stock Deleted Successfully`;
            } else {
                return `Stock not found with id ${id}`;
            }
        } catch (error) {
            console.error("Query Execution Error: IN deleteStockrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const getArcheivedStocksrevo = async (request: any) => {
        try {
            const pageNumber = request.query.page || 1
            const recordCount = request.query.count || 5000
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            let queryParams = [];
            keys.forEach((key, index) => {
                if (key !== 'page' && key != 'count') {
                    const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                    if (index !== 0) {
                        if (whereClause.length > 0) {
                            whereClause += " AND ";
                        }
                    }
                    whereClause += `(${paramValues
                        .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                        .join(" OR ")})`;
                    parameterIndex += paramValues.length;
                    queryParams.push(...paramValues);
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM stock_revo`;
            if (whereClause) {
                queryText += ` WHERE ${whereClause} AND isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
                    }`;
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
            const result: any = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        } catch (error) {
            console.error("Query Execution Error: IN getArcheivedStocksrevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    }


    export const updateRemoveFromRecyclebin = async () => {
        const updateQuery = `
        UPDATE stock_revo
        SET removefromrecyclebin = true
        WHERE isdeleted = true AND removefromrecyclebin = false
        AND to_timestamp(modifieddate) <= (CURRENT_TIMESTAMP - INTERVAL '30 days')
    `;
        let data = await query(updateQuery, []);
        return data
    };


    export const upsertStockRevoDatarfid = async (rfidDataArray: any) => {
        try {
            console.log("RFID Data Array:", rfidDataArray);
            let rfidValues = rfidDataArray.map(item => item.rfid);
            let productid = rfidDataArray[0].productid;
            let arraylength = rfidDataArray.length;
            let ordername = rfidDataArray[0].ordername;

            let stockStatusValue = ordername === 'rental' ? 'Rental Sold' : 'Sold';
            
            let caseStatementsOrderId = rfidDataArray.map((item) => {
                return `WHEN rfid = '${item.rfid}' THEN '${item.orderlinenumber}'`;
            }).join(' ');
                        
            let updateQuery = `
                UPDATE stock_revo 
                SET 
                    orderlinenumber = CASE ${caseStatementsOrderId} END,
                    stockstatus = '${stockStatusValue}',
                    stocktype = CASE WHEN stocktype = 'off_catalogue_product' THEN 'on_catalogue_product' ELSE stocktype END,
                    rfid = NULL
                WHERE 
                    rfid IN (${rfidValues.map((rfid) => `'${rfid}'`).join(',')}) 
                    AND puc IN (SELECT puc FROM product_revo WHERE id = $1)
                    AND stockstatus = 'Available'
                RETURNING *;
            `;
    
            let result = await query(updateQuery, [productid]);
            
            if (result.rows.length !== rfidValues.length) {
                return { 
                    error: 'Error in RFID scan. Ensure all RFIDs are valid.',
                    updatedCount: result.rows.length,
                    expectedCount: rfidValues.length
                };
            }
    
            const puc = result.rows.length > 0 ? result.rows[0].puc : null;

            console.log("PUC Result:", puc);
            let updateOnCatalogueqty = await productrevoService.updateCatalogueQuantities(puc)

            console.log("Update On Catalogue Quantity Result:", updateOnCatalogueqty);
    
            if (puc) {
                const countQuery = 'SELECT COUNT(*) FROM stock_revo WHERE puc = $1';
                const countParams = [puc];
                const countResult = await query(countQuery, countParams);
    
                const totalCount = parseInt(countResult.rows[0].count, 10);
    
                return { 
                    command: "UPDATE", 
                    result: result, 
                    totalCount, 
                    arraylength 
                };
            } else {
                return { error: 'No records were updated. Please check the provided RFIDs.' };
            }
    
        } catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoDatarfid", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
}