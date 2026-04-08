import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { productrevoService } from "./productrevo.service.js";
import { DateCustomize } from "../utils/Date/Date.js";
export module stockRevoService {
    const AVAILABLE_STOCK_STATUS = "Available";
    const SERVICE_HOLD_STOCK_STATUS = "Service Hold";
    const DAMAGED_STOCK_STATUS = "Damaged";
    const LOST_STOCK_STATUS = "Lost";
    const AVAILABLE_STOCK_ASSET_STATUS = "available";

    const normalizeComparableText = (value: any) =>
        String(value ?? "").trim().toLowerCase();

    const getManualStockStatusTransitionError = (
        currentStatus: any,
        requestedStatus: any
    ) => {
        const current = normalizeComparableText(currentStatus);
        const next = normalizeComparableText(requestedStatus);

        if (!current || !next || current === next) {
            return null;
        }

        if (current === normalizeComparableText(SERVICE_HOLD_STOCK_STATUS) && next === normalizeComparableText(AVAILABLE_STOCK_STATUS)) {
            return "Use the repair release action to move a Service Hold asset back to Available.";
        }

        if (next === normalizeComparableText(AVAILABLE_STOCK_STATUS) && (
            current === normalizeComparableText(DAMAGED_STOCK_STATUS)
            || current === normalizeComparableText(LOST_STOCK_STATUS)
        )) {
            return "Damaged or Lost stocks cannot be directly moved to Available.";
        }

        return null;
    };

    const getVisibilityCondition = (mode: "visible" | "hidden") => {
        if (mode === "hidden") {
            return `(p.ecomvisible = FALSE)`;
        }
        return `(p.ecomvisible = TRUE OR p.ecomvisible IS NULL)`;
    };

    export const getStockRevoData = async (request: any, visibilityMode?: "visible" | "hidden") => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses: string[] = [];
            let parameterIndex = 1;
            const queryParams: any[] = [];
            let orderByField = "s.modifieddate";
            let orderByDirection = "DESC";

            keys.forEach((key, index) => {
                const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
                // Default ALL stock columns to s. alias to avoid ambiguous references after the JOIN.
                // Only ecomvisible lives on the joined product_revo table (p.).
                let fieldKey = key === "ecomvisible" ? "p.ecomvisible" : `s.${key}`;

                if (key === "displaysize" || key === "price") {
                    const rangeClauses = paramValues.map(range => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        return `(s.${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                    parameterIndex += 2 * paramValues.length;
                } else if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName.startsWith("s.") ? fieldName : `s.${fieldName}`;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                } else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${fieldKey} != $${parameterIndex} OR ${fieldKey} IS NULL)`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                } else if (key !== "page" && key !== "count") {
                    const clauses = paramValues.map((_, idx) => `${fieldKey} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });

            const offset = (pageNumber - 1) * recordCount;
            // ecomvisible is query-param driven — only inject the hardcoded clause when visibilityMode is explicitly set
            const visibilityClause = visibilityMode ? ` AND ${getVisibilityCondition(visibilityMode)}` : '';
            const baseConditions = `(s.isarchive = FALSE OR s.isarchive IS NULL) 
                AND (s.isdeleted = FALSE OR s.isdeleted IS NULL) 
                AND (s.removefromrecyclebin = FALSE OR s.removefromrecyclebin IS NULL)${visibilityClause}`;

            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

            let queryText = `
                SELECT s.* 
                FROM stock_revo s
                INNER JOIN product_revo p ON s.puc = p.puc
                ${whereClause} 
                ${orderByClause}`;

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
                console.log(stockRevoData.manufacturedyear, "manufacturedyear")
            }
            if (stockRevoData.releaseyear) {
                let converttoutc = await DateCustomize.ConvertDDMMYYYtoutc(stockRevoData.releaseyear)
                stockRevoData.releaseyear = converttoutc
                console.log(stockRevoData.releaseyear, "releaseyear")
            }
            const { id, ...upsertFields } = stockRevoData;
            let command: string;
            let affectedPucs = new Set<string>();

            if (id) {
                // Fetch current stocktype to check for third_party_product restrictions
                const oldStockResult = await query(`SELECT puc, stocktype, stockstatus FROM stock_revo WHERE id = $1`, [id]);
                if (oldStockResult.rows.length > 0) {
                    const currentRow = oldStockResult.rows[0];
                    affectedPucs.add(currentRow.puc);

                    // If existing stock is third_party_product, restrict updates
                    if (currentRow.stocktype === 'third_party_product') {
                        // Allow updates only for E-commerce toggle (ecompublish) and Asset number (serialnumber)
                        const allowedFields = ['ecompublish', 'serialnumber'];
                        Object.keys(upsertFields).forEach(key => {
                            if (!allowedFields.includes(key)) {
                                delete upsertFields[key];
                            }
                        });
                    }

                    const statusTransitionError = getManualStockStatusTransitionError(
                        currentRow.stockstatus,
                        upsertFields.stockstatus
                    );

                    if (statusTransitionError) {
                        return { message: statusTransitionError, status: 400 };
                    }
                }

                const fieldNames = Object.keys(upsertFields);
                const fieldValues = Object.values(upsertFields);

                if (fieldNames.length === 0) {
                    // No valid fields to update for this stock type, return current record
                    const record = await query(`SELECT * FROM stock_revo WHERE id = $1`, [id]);
                    return { command: "UPDATE", result: record, totalCount: 0, affectedPucs: Array.from(affectedPucs) };
                }

                querydata = `UPDATE stock_revo SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
                command = "UPDATE";
            } else {
                const fieldNames = Object.keys(upsertFields);
                const fieldValues = Object.values(upsertFields);
                querydata = `INSERT INTO stock_revo (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
                command = "INSERT";
            }


            const result = await query(querydata, params);
            if (result.rows.length > 0) {
                affectedPucs.add(result.rows[0].puc);
            }

            // Recalculate quantities for all affected PUCs
            for (const puc of affectedPucs) {
                await productrevoService.updateCatalogueQuantities(puc);
                console.log(`Recalibrated quantities for affected PUC: ${puc}`);
            }

            // Consistent count query excluding hidden/deleted rows
            const countQuery = `
                SELECT COUNT(*) FROM stock_revo 
                WHERE puc = $1
                AND (isdeleted = false OR isdeleted IS NULL)
                AND (isarchive = false OR isarchive IS NULL)
                AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                AND (ewaste = false OR ewaste IS NULL)
            `;
            // For the sake of return value, we count based on the new/primary PUC
            const finalPuc = result.rows[0]?.puc;
            const countResult = await query(countQuery, [finalPuc]);
            const totalCount = parseInt(countResult.rows[0].count, 10);

            return { command, result: result, totalCount, affectedPucs: Array.from(affectedPucs) };

        } catch (error) {
            console.error("Query Execution Error: IN upsertStockRevoData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const releaseServiceHoldStockToAvailable = async (stockId: number, modifiedBy?: number | null) => {
        try {
            if (!stockId) {
                return { message: "Id is required to release the stock.", status: 400 };
            }

            const currentStockResult = await query(
                `SELECT * FROM stock_revo WHERE id = $1`,
                [stockId]
            );

            if (currentStockResult.rows.length === 0) {
                return { message: "No stock found with this id.", status: 404 };
            }

            const currentStock = currentStockResult.rows[0];
            if (normalizeComparableText(currentStock.stockstatus) !== normalizeComparableText(SERVICE_HOLD_STOCK_STATUS)) {
                return {
                    message: "Only Service Hold stocks can be marked repaired.",
                    status: 400,
                };
            }

            const result = await query(
                `
                    UPDATE stock_revo
                    SET
                        stockstatus = $1,
                        servicestatus = NULL,
                        holdreason = NULL,
                        holdticketid = NULL,
                        orderlinenumber = NULL,
                        agreementid = NULL,
                        rentalassetstatus = $2,
                        damageassessment = NULL,
                        damageddate = NULL,
                        nonreturnable = FALSE,
                        lastticketid = COALESCE(holdticketid, lastticketid),
                        modifiedby = COALESCE($4, modifiedby)
                    WHERE id = $3
                    RETURNING *
                `,
                [
                    AVAILABLE_STOCK_STATUS,
                    AVAILABLE_STOCK_ASSET_STATUS,
                    stockId,
                    modifiedBy ?? null,
                ]
            );

            const puc = result.rows[0]?.puc;
            if (puc) {
                await productrevoService.updateCatalogueQuantities(puc);
            }

            const countQuery = `
                SELECT COUNT(*) FROM stock_revo 
                WHERE puc = $1
                AND (isdeleted = false OR isdeleted IS NULL)
                AND (isarchive = false OR isarchive IS NULL)
                AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                AND (ewaste = false OR ewaste IS NULL)
            `;
            const countResult = await query(countQuery, [puc]);
            const totalCount = parseInt(countResult.rows[0].count, 10);

            return {
                command: "UPDATE",
                result,
                totalCount,
                affectedPucs: puc ? [puc] : [],
            };
        } catch (error) {
            console.error("Query Execution Error: IN releaseServiceHoldStockToAvailable", error);
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
            const result = await query(`UPDATE stock_revo SET ewaste = true WHERE id = $1 RETURNING puc`, [id]);
            if (result.command == 'UPDATE' && result.rows.length > 0) {
                const puc = result.rows[0].puc;
                // Trigger recalculations for the product
                await productrevoService.updateCatalogueQuantities(puc);
                await updateQuantity([puc]);
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
            await productrevoService.updateCatalogueQuantities(puc);
            await updateQuantity([puc]);
            const countQuery = `
                SELECT COUNT(*) FROM stock_revo 
                WHERE puc = $1
                AND (isdeleted = false OR isdeleted IS NULL)
                AND (isarchive = false OR isarchive IS NULL)
                AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                AND (ewaste = false OR ewaste IS NULL)
            `;
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
            await productrevoService.updateCatalogueQuantities(puc);
            await updateQuantity([puc]);
            const countQuery = `
                SELECT COUNT(*) FROM stock_revo 
                WHERE puc = $1
                AND (isdeleted = false OR isdeleted IS NULL)
                AND (isarchive = false OR isarchive IS NULL)
                AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                AND (ewaste = false OR ewaste IS NULL)
            `;
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
                // Enforce same rules as getDataLoaderDataStock preview route:
                // - rental_product must always be ecompublish=false
                // - null/empty rfid means not yet tagged => ecompublish=false
                if (jsonresult[i].stocktype === 'rental_product') {
                    jsonresult[i].ecompublish = false;
                }
                if (!jsonresult[i].rfid || jsonresult[i].rfid === '') {
                    jsonresult[i].ecompublish = false;
                }

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

    export const updateQuantity = async (pucs: string[], orderedquantity = 0, issold = false, isRental = false) => {
        try {
            const quantitiesList = [];

            for (const puc of pucs) {
                const activeFilters = `(isdeleted = false OR isdeleted IS NULL) AND (isarchive = false OR isarchive IS NULL) AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL) AND (ewaste = false OR ewaste IS NULL)`;
                const quantityQuery = `
                    SELECT 
                        (
                            COUNT(*) FILTER (WHERE ${activeFilters} AND stocktype <> 'third_party_product')
                            +
                            COALESCE(SUM(thirdpartyquantity) FILTER (WHERE ${activeFilters} AND stocktype = 'third_party_product'), 0)
                        ) AS quantity,

                    -- ecompublishedquantity = physical ecom=true Available count
                    --                       + ALL thirdpartyquantity from ecom=true 3rd-party rows (no stockstatus filter)
                    (
                        COUNT(*) FILTER (
                            WHERE ${activeFilters}
                            AND ecompublish = true
                            AND stockstatus = 'Available'
                            AND stocktype <> 'third_party_product'
                        )
                        +
                        COALESCE(
                            SUM(thirdpartyquantity) FILTER (
                                WHERE ${activeFilters}
                                AND ecompublish = true
                                AND stocktype = 'third_party_product'
                            ), 0
                        )
                    ) AS ecompublishedquantity,

                    COUNT(*) FILTER (
                        WHERE ${activeFilters}
                        AND ecompublish = true AND stockstatus = 'Sold'
                    ) AS soldquantity,

                    COUNT(*) FILTER (
                        WHERE ${activeFilters}
                        AND ecompublish = false AND stockstatus = 'Rental Sold'
                    ) AS rentalsoldquantity,

                    COUNT(*) FILTER (
                        WHERE ${activeFilters}
                        AND ecompublish = true 
                        AND stockstatus = 'Available' 
                        AND stocktype <> 'third_party_product'
                    ) AS availablequantity,

                    -- overallavailableqty = physical ecom=true Available count
                    --                     + ALL thirdpartyquantity from ecom=true 3rd-party rows
                    -- (no stockstatus filter on 3rd-party: their qty is virtual, tracked by thirdpartyquantity column)
                    -- thirdpartyorderquantity deduction is handled in testinupdateQuantity JSONB layer
                    (
                        COALESCE(
                            SUM(thirdpartyquantity) FILTER (
                                WHERE ${activeFilters}
                                AND ecompublish = true
                                AND stocktype = 'third_party_product'
                            ), 0
                        ) +
                        COUNT(*) FILTER (
                            WHERE ${activeFilters}
                            AND ecompublish = true 
                            AND stockstatus = 'Available' 
                            AND stocktype <> 'third_party_product'
                        )
                    ) AS overallavailableqty,

                    COUNT(*) FILTER (
                        WHERE ${activeFilters}
                        AND ecompublish = true 
                        AND stockstatus = 'Available' 
                        AND stocktype = 'on_catalogue_product'
                    ) AS oncatalogueqty,

                    COUNT(*) FILTER (
                        WHERE ${activeFilters}
                        AND ecompublish = true 
                        AND stockstatus = 'Available' 
                        AND stocktype = 'off_catalogue_product'
                    ) AS offcatalogueqty,

                    COUNT(*) FILTER (
                        WHERE ${activeFilters}
                        AND ecompublish = false
                        AND (stockstatus = 'Available' OR stockstatus = 'Rental Sold')
                        AND stocktype = 'rental_product'
                    ) AS rentaltotalquantity,

                    -- Track Flagged/Removed Quantities
                    COUNT(*) FILTER (WHERE isdeleted = true) AS bin_qty,
                    COUNT(*) FILTER (WHERE isarchive = true) AS archive_qty,
                    COUNT(*) FILTER (WHERE (ewaste = true OR removefromrecyclebin = true)) AS ewaste_qty

                    FROM stock_revo
                    WHERE puc = $1`;

                const quantityResult = await query(quantityQuery, [puc]);

                const totalCount = parseInt(quantityResult.rows[0].quantity, 10);
                const ecomPublishedQuantity = parseInt(quantityResult.rows[0].ecompublishedquantity, 10);
                const soldQuantity = parseInt(quantityResult.rows[0].soldquantity, 10);
                const availableQuantity = parseInt(quantityResult.rows[0].availablequantity, 10);
                const overallavailableqty = parseInt(quantityResult.rows[0].overallavailableqty, 10);
                const rentalsoldquantity = parseInt(quantityResult.rows[0].rentalsoldquantity, 10);
                const oncatalogueqty = parseInt(quantityResult.rows[0].oncatalogueqty, 10);
                const offcatalogueqty = parseInt(quantityResult.rows[0].offcatalogueqty, 10);
                const rentaltotalquantity = parseInt(quantityResult.rows[0].rentaltotalquantity, 10);
                const bin_qty = parseInt(quantityResult.rows[0].bin_qty, 10);
                const archive_qty = parseInt(quantityResult.rows[0].archive_qty, 10);
                const ewaste_qty = parseInt(quantityResult.rows[0].ewaste_qty, 10);
                const rentalavailablequantity = rentaltotalquantity - rentalsoldquantity;

                const quantities = {
                    quantity: totalCount,
                    ecompublishedquantity: ecomPublishedQuantity,
                    soldquantity: soldQuantity,
                    availablequantity: availableQuantity,
                    puc: puc,
                    overallavailableqty: overallavailableqty,
                    rentalsoldquantity: rentalsoldquantity,
                    oncatalogueqty: oncatalogueqty,
                    offcatalogueqty: offcatalogueqty,
                    rentaltotalquantity: rentaltotalquantity,
                    rentalavailablequantity: rentalavailablequantity,
                    bin_qty,
                    archive_qty,
                    ewaste_qty
                };

                console.log("--quantities", quantities);
                quantitiesList.push(quantities);
            }

            const updateQuantityResults = await Promise.all(
                quantitiesList.map(quantities =>
                    productrevoService.upsertQuantityFields(quantities, orderedquantity, issold, isRental)
                )
            );

            await testinupdateQuantity(pucs, issold);
            return updateQuantityResults;

        } catch (error) {
            console.error("Query Execution Error: IN updateQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };


    export const testinupdateQuantity = async (pucs: string[], issold: boolean) => {
        try {
            // Identify all locations that need refreshing: those in current stocks PLUS those already in JSONB
            const locationsQuery = `
                SELECT DISTINCT location FROM stock_revo WHERE puc = ANY($1::text[])
                UNION 
                SELECT DISTINCT jsonb_object_keys(quantityforlocation) FROM product_revo WHERE puc = ANY($1::text[])
            `;
            const locationsResult = await query(locationsQuery, [pucs]);
            const locations = locationsResult.rows.map(row => row.location).filter(Boolean);

            if (locations.length === 0) return;

            const quantityQuery = `
                WITH grid AS (
                    SELECT p.puc, l.location 
                    FROM (SELECT unnest($1::text[]) as puc) p
                    CROSS JOIN (SELECT unnest($2::text[]) as location) l
                ),
                -- Resolve per-location ordered quantities.
                -- Priority:
                -- 1) orderline.deliveryfrom (set during RFID dispatch)
                -- 2) orders.storelocation (if provided by frontend)
                -- 3) fallback to the best available stock location for the PUC
                order_metrics AS (
                    SELECT 
                        p.puc,
                        COALESCE(
                            NULLIF(ol.deliveryfrom, ''),
                            NULLIF(o.storelocation, ''),
                            s.location
                        ) AS location,
                        -- ordered_qty: active orders only (exclude terminal + fulfilled statuses)
                        COALESCE(SUM(CASE WHEN ol.ordertype = 'Orders'
                            AND ol.orderstatus NOT IN ('payment_failed', 'cancelled', 'returned', 'delivered', 'Sold', 'ready_to_dispatch', 'shipped')
                            THEN ol.quantity ELSE 0 END), 0) AS ordered_qty,
                        -- thirdpartyorder_qty: active 3rd-party orders only
                        COALESCE(SUM(CASE WHEN ol.ordertype = 'Third Party Orders'
                            AND ol.orderstatus NOT IN ('payment_failed', 'cancelled', 'returned', 'delivered', 'Sold', 'ready_to_dispatch', 'shipped')
                            THEN ol.quantity ELSE 0 END), 0) AS thirdpartyorder_qty,
                        -- thirdpartysold_qty: 3rd-party lines that have been physically fulfilled
                        COALESCE(SUM(CASE WHEN ol.ordertype = 'Third Party Orders' AND ol.orderstatus IN ('delivered', 'shipped', 'Sold') THEN ol.quantity ELSE 0 END), 0) AS thirdpartysold_qty
                    FROM orderline ol
                    JOIN orders o ON ol.uniqueorderid = o.orderid
                    JOIN product_revo p ON ol.productid = p.id
                    -- Fallback join: when both deliveryfrom and storelocation are blank/null,
                    -- choose the location with highest currently available physical stock.
                    LEFT JOIN LATERAL (
                        SELECT s2.location
                        FROM stock_revo s2
                        WHERE s2.puc = p.puc
                          AND (s2.isdeleted = false OR s2.isdeleted IS NULL)
                          AND (s2.isarchive = false OR s2.isarchive IS NULL)
                          AND (s2.removefromrecyclebin = false OR s2.removefromrecyclebin IS NULL)
                          AND (s2.ewaste = false OR s2.ewaste IS NULL)
                        GROUP BY s2.location
                        ORDER BY
                          COUNT(*) FILTER (
                            WHERE s2.ecompublish = true
                              AND s2.stockstatus = 'Available'
                              AND s2.stocktype <> 'third_party_product'
                          ) DESC,
                          COALESCE(SUM(s2.thirdpartyquantity) FILTER (
                            WHERE s2.ecompublish = true
                              AND s2.stocktype = 'third_party_product'
                          ), 0) DESC,
                          s2.location ASC
                        LIMIT 1
                    ) s ON (
                        (ol.deliveryfrom IS NULL OR ol.deliveryfrom = '')
                        AND (o.storelocation IS NULL OR o.storelocation = '')
                    )
                    WHERE p.puc = ANY($1::text[])
                    GROUP BY p.puc, COALESCE(NULLIF(ol.deliveryfrom, ''), NULLIF(o.storelocation, ''), s.location)
                )
                SELECT 
                    grid.puc,
                    grid.location,
                    -- quantity per location
                    (
                        COUNT(s.id) FILTER (
                            WHERE s.stocktype <> 'third_party_product'
                        )
                        +
                        COALESCE(SUM(s.thirdpartyquantity) FILTER (
                            WHERE s.stocktype = 'third_party_product'
                        ), 0)
                    ) AS quantity,

                    -- ecompublishedquantity = physical ecom=true Available count
                    --                       + ALL thirdpartyquantity from ecom=true 3rd-party rows (no stockstatus filter)
                    (
                        COUNT(s.id) FILTER (
                            WHERE s.ecompublish = true
                            AND s.stockstatus = 'Available'
                            AND s.stocktype <> 'third_party_product'
                        )
                        +
                        COALESCE(SUM(s.thirdpartyquantity) FILTER (
                            WHERE s.ecompublish = true
                            AND s.stocktype = 'third_party_product'
                        ), 0)
                    ) AS ecompublishedquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.ecompublish = true AND s.stockstatus = 'Sold'
                    ) AS soldquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.ecompublish = true AND s.stockstatus = 'Available'
                        AND s.stocktype <> 'third_party_product'
                    ) AS availablequantity,

                    -- overallavailableqty = physical ecom=true Available count
                    --                     + ALL thirdpartyquantity from ecom=true 3rd-party rows (no stockstatus filter)
                    (
                        COUNT(s.id) FILTER (
                            WHERE s.ecompublish = true AND s.stockstatus = 'Available'
                            AND s.stocktype <> 'third_party_product'
                        )
                        +
                        COALESCE(SUM(s.thirdpartyquantity) FILTER (
                            WHERE s.ecompublish = true
                            AND s.stocktype = 'third_party_product'
                        ), 0)
                    ) AS overallavailableqty,

                    COUNT(s.id) FILTER (
                        WHERE s.stocktype <> 'third_party_product'
                    ) AS overallquantity,

                    COALESCE(SUM(s.thirdpartyquantity) FILTER (
                        WHERE s.stocktype = 'third_party_product'
                    ), 0) AS thirdpartyqty,

                    -- thirdpartyavailableqty = ALL thirdpartyquantity from ecom=true 3rd-party rows (no stockstatus filter)
                    COALESCE(SUM(s.thirdpartyquantity) FILTER (
                        WHERE s.ecompublish = true
                        AND s.stocktype = 'third_party_product'
                    ), 0) AS thirdpartyavailableqty,

                    COUNT(s.id) FILTER (
                        WHERE s.ecompublish = false
                        AND (s.stockstatus = 'Available' OR s.stockstatus = 'Rental Sold')
                        AND s.stocktype = 'rental_product'
                    ) AS rentaltotalquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.ecompublish = false
                        AND s.stockstatus = 'Rental Sold'
                        AND s.stocktype = 'rental_product'
                    ) AS rentalsoldquantity,

                    COALESCE(om.ordered_qty, 0) AS ordered_qty,
                    COALESCE(om.thirdpartyorder_qty, 0) AS thirdpartyorder_qty,
                    COALESCE(om.thirdpartysold_qty, 0) AS thirdpartysold_qty

                FROM grid
                LEFT JOIN stock_revo s ON s.puc = grid.puc AND s.location = grid.location
                    AND (s.isdeleted = false OR s.isdeleted IS NULL)
                    AND (s.isarchive = false OR s.isarchive IS NULL)
                    AND (s.removefromrecyclebin = false OR s.removefromrecyclebin IS NULL)
                    AND (s.ewaste = false OR s.ewaste IS NULL)
                LEFT JOIN order_metrics om ON grid.puc = om.puc AND grid.location = om.location
                GROUP BY grid.puc, grid.location, om.ordered_qty, om.thirdpartyorder_qty, om.thirdpartysold_qty
            `;
            const quantityResult = await query(quantityQuery, [pucs, locations]);
            const batchUpdateData = quantityResult.rows.map((row: any) => ({
                puc: row.puc,
                location: row.location,
                quantity: parseInt(row.quantity, 10),
                overallquantity: parseInt(row.overallquantity, 10),
                ecompublishedquantity: Math.max(0, parseInt(row.ecompublishedquantity, 10) - (parseInt(row.ordered_qty, 10) + parseInt(row.thirdpartyorder_qty, 10))),
                soldquantity: parseInt(row.soldquantity, 10),
                // Subtract ordered_qty for normal orders (mirrors overallavailableqty logic)
                availablequantity: Math.max(0, parseInt(row.availablequantity, 10) - parseInt(row.ordered_qty, 10)),
                overallavailableqty: Math.max(0, parseInt(row.overallavailableqty, 10) - (parseInt(row.ordered_qty, 10) + parseInt(row.thirdpartyorder_qty, 10))),
                thirdpartyqty: parseInt(row.thirdpartyqty, 10),
                thirdpartyavailableqty: parseInt(row.thirdpartyavailableqty, 10),
                rentaltotalquantity: parseInt(row.rentaltotalquantity, 10),
                rentalsoldquantity: parseInt(row.rentalsoldquantity, 10),
                rentalavailablequantity: parseInt(row.rentaltotalquantity, 10) - parseInt(row.rentalsoldquantity, 10),
                ordered_qty: parseInt(row.ordered_qty, 10),
                thirdpartyorder_qty: parseInt(row.thirdpartyorder_qty, 10),
                thirdpartysold_qty: parseInt(row.thirdpartysold_qty, 10)
            }));
            console.log('ANTIGRAVITY_LOG: batchUpdateData before batchUpdateData', JSON.stringify(batchUpdateData, null, 2));
            const updateResults = await productrevoService.testupsertQuantityFieldsBatch(batchUpdateData, issold);
            console.log('ANTIGRAVITY_LOG: updateResults batchUpdateData', JSON.stringify(updateResults, null, 2));
            return updateResults;

        } catch (error) {
            console.error("Query Execution Error: IN testinupdateQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
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


            const isRental = ordername === 'rental';

            let stockStatusValue = isRental ? 'Rental Sold' : 'Sold';

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

    export const allocateRentalStock = async (orders: any[]) => {
        try {
            console.log('Allocating Rental Stock for orders:', orders);
            for (const order of orders) {
                // Determine if this is a rental product (ecompublish = false check is ideal, but for now we might rely on the caller or check here)
                // Assuming the caller only passes rental orders or we check 'ordername' if available on the order object
                // But safer to check db or rely on caller. Let's rely on logic for any product that has rental stock.

                // We will attempt to update 'Available' rental stock for this product.
                const productid = order.productid; // Or orderLine productid
                const quantity = order.quantity;
                const orderid = order.orderid; // The unique string order ID (e.g. TEQIT...)
                const orderlineid = order.id; // orderline PK if linking to orderline, but stock links to orderid usually

                if (!productid || !quantity || !orderid) {
                    console.warn('Missing details for rental allocation:', order);
                    continue;
                }

                // Update 'quantity' number of rows from 'Available' to 'Rental Sold'
                // Targeting stocktype='rental_product' and ecompublish=false
                const updateQuery = `
                    UPDATE stock_revo
                    SET 
                        stockstatus = 'Rental Sold',
                        orderid = $1,
                        modifieddate = COALESCE(modifieddate, CURRENT_TIMESTAMP)
                    WHERE id IN (
                        SELECT id
                        FROM stock_revo
                        WHERE 
                            puc IN (SELECT puc FROM product_revo WHERE id = $2)
                            AND stocktype = 'rental_product'
                            AND ecompublish = false
                            AND stockstatus = 'Available'
                            AND isdeleted = false
                            AND isarchive = false
                            AND removefromrecyclebin = false
                            AND ewaste = false
                        LIMIT $3
                        FOR UPDATE
                    )
                    RETURNING puc;
                `;

                const result = await query(updateQuery, [orderid, productid, quantity]);
                console.log(`Allocated ${result.rowCount} rental items for Product ID ${productid}`);

                if (result.rowCount > 0) {
                    const puc = result.rows[0].puc;
                    await productrevoService.updateCatalogueQuantities(puc);
                }
            }
        } catch (error) {
            console.error("Error in allocateRentalStock:", error);
            // Don't block the order flow if stock allocation fails, but log it critical
            // throw error; 
        }
    };
}
