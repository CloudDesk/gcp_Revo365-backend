import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { productrevoService } from "./productrevo.service.js";
import { inventoryReservationService } from "./inventoryReservation.service.js";
import { DateCustomize } from "../utils/Date/Date.js";
export module stockRevoService {
    const AVAILABLE_STOCK_STATUS = "Available";
    const RESERVED_RENTAL_STOCK_STATUS = "Reserved for Rental";
    const RENTAL_SOLD_STOCK_STATUS = "Rental Sold";
    const SERVICE_HOLD_STOCK_STATUS = "Service Hold";
    const DAMAGED_STOCK_STATUS = "Damaged";
    const LOST_STOCK_STATUS = "Lost";
    const AVAILABLE_STOCK_ASSET_STATUS = "available";
    const RENTAL_STOCK_TYPE = "rental_product";
    const BARCODE_LENGTH = 12;
    const LEGACY_BARCODE_LENGTH = 10;
    const FIRST_BARCODE_NUMBER = 1;
    const PRODUCT_TAX_CODE_FIELDS = ["hsncode", "saccode"] as const;
    const normalizeStockImportHeader = (key: string) =>
        String(key ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

    const normalizeComparableText = (value: any) =>
        String(value ?? "").trim().toLowerCase();

    const normalizeProductTaxCode = (value: any) => {
        if (value === undefined || value === null) {
            return null;
        }

        const normalizedValue = String(value).trim();
        return normalizedValue || null;
    };

    const extractProductTaxCodeValues = (stockData: any) => {
        const productTaxCodeValues: Record<string, any> = {};

        PRODUCT_TAX_CODE_FIELDS.forEach((fieldName) => {
            if (Object.prototype.hasOwnProperty.call(stockData, fieldName)) {
                productTaxCodeValues[fieldName] = stockData[fieldName];
                delete stockData[fieldName];
            }
        });

        return productTaxCodeValues;
    };

    const getRequiredProductTaxCodeField = (stocktype: any) =>
        normalizeComparableText(stocktype) === RENTAL_STOCK_TYPE ? "saccode" : "hsncode";

    const getProductTaxCodeLabel = (fieldName: string) =>
        fieldName === "saccode" ? "SAC Code" : "HSN Code";

    const syncAndValidateProductTaxCode = async (
        puc: any,
        stocktype: any,
        productTaxCodeValues: Record<string, any>
    ) => {
        const normalizedPuc = String(puc ?? "").trim();

        if (!normalizedPuc) {
            return { message: "PUC is required to validate product tax code.", status: 400 };
        }

        const requiredField = getRequiredProductTaxCodeField(stocktype);
        const requiredLabel = getProductTaxCodeLabel(requiredField);

        if (Object.prototype.hasOwnProperty.call(productTaxCodeValues, requiredField)) {
            const normalizedTaxCode = normalizeProductTaxCode(productTaxCodeValues[requiredField]);
            await query(
                `UPDATE product_revo SET ${requiredField} = $1 WHERE puc = $2`,
                [normalizedTaxCode, normalizedPuc]
            );
        }

        const productResult = await query(
            `SELECT puc, hsncode, saccode FROM product_revo WHERE puc = $1 LIMIT 1`,
            [normalizedPuc]
        );

        if (productResult.rows.length === 0) {
            return { message: `No product found for PUC ${normalizedPuc}.`, status: 400 };
        }

        if (!normalizeProductTaxCode(productResult.rows[0]?.[requiredField])) {
            return {
                message: `${requiredLabel} is required for ${normalizeComparableText(stocktype) === RENTAL_STOCK_TYPE ? "rental" : "non-rental"} stock.`,
                status: 400,
                errorDetails: [
                    {
                        key: requiredField,
                        message: `${requiredLabel} is required for ${normalizeComparableText(stocktype) === RENTAL_STOCK_TYPE ? "rental" : "non-rental"} stock.`,
                    },
                ],
            };
        }

        return null;
    };

    const normalizeBarcodeValue = (value: any) =>
        String(value ?? "").trim();

    const isUploadedBarcodeField = (key: string) =>
        ["rfid", "barcode", "barcodenumber"].includes(normalizeStockImportHeader(key));

    const removeUploadedBarcodeFields = (row: any) => {
        Object.keys(row || {}).forEach((key) => {
            if (isUploadedBarcodeField(key)) {
                delete row[key];
            }
        });
    };

    const isNewBarcodeNumber = (value: any) =>
        new RegExp(`^\\d{${BARCODE_LENGTH}}$`).test(normalizeBarcodeValue(value));

    const isLegacyBarcodeValue = (value: any) =>
        normalizeBarcodeValue(value).length === LEGACY_BARCODE_LENGTH;

    const getBarcodeValidationError = (incomingValue: any, currentValue?: any) => {
        const incomingBarcode = normalizeBarcodeValue(incomingValue);

        if (!incomingBarcode) {
            return null;
        }

        if (isNewBarcodeNumber(incomingBarcode)) {
            return null;
        }

        const currentBarcode = normalizeBarcodeValue(currentValue);
        if (currentBarcode && incomingBarcode === currentBarcode && isLegacyBarcodeValue(incomingBarcode)) {
            return null;
        }

        return `Barcode Number should be exactly ${BARCODE_LENGTH} digits.`;
    };

    const getDuplicateBarcodeError = async (barcode: any, currentId?: any) => {
        const normalizedBarcode = normalizeBarcodeValue(barcode);

        if (!normalizedBarcode) {
            return null;
        }

        const result = await query(
            `
                SELECT id
                FROM stock_revo
                WHERE rfid = $1
                  AND ($2::int IS NULL OR id <> $2::int)
                LIMIT 1
            `,
            [normalizedBarcode, currentId ? Number(currentId) : null]
        );

        return result.rows.length > 0
            ? "Barcode Number already exists. Please use a unique barcode number."
            : null;
    };

    export const generateUniqueBarcodeNumber = async () => {
        const result = await query(
            `
                WITH used AS (
                    SELECT DISTINCT CAST(rfid AS BIGINT) AS barcode
                    FROM stock_revo
                    WHERE rfid ~ '^[0-9]{12}$'
                      AND CAST(rfid AS BIGINT) >= $1::bigint
                ),
                candidates AS (
                    SELECT generate_series($1::bigint, (SELECT COUNT(*) FROM used) + $1::bigint) AS barcode
                )
                SELECT candidates.barcode
                FROM candidates
                LEFT JOIN used ON used.barcode = candidates.barcode
                WHERE used.barcode IS NULL
                ORDER BY candidates.barcode
                LIMIT 1
            `,
            [FIRST_BARCODE_NUMBER]
        );
        const barcodeNumber = Number(result.rows[0]?.barcode ?? FIRST_BARCODE_NUMBER);

        if (!Number.isFinite(barcodeNumber) || barcodeNumber > 999999999999) {
            return { message: "Unable to generate a unique Barcode Number.", status: 400 };
        }

        return String(barcodeNumber).padStart(BARCODE_LENGTH, "0");
    };

    export const generateUniqueBarcodeNumbers = async (count: number) => {
        const requiredCount = Number(count);

        if (!Number.isInteger(requiredCount) || requiredCount < 1) {
            return [];
        }

        const result = await query(
            `
                WITH used AS (
                    SELECT DISTINCT CAST(rfid AS BIGINT) AS barcode
                    FROM stock_revo
                    WHERE rfid ~ '^[0-9]{12}$'
                      AND CAST(rfid AS BIGINT) >= $1::bigint
                ),
                candidates AS (
                    SELECT generate_series(
                        $1::bigint,
                        (SELECT COUNT(*) FROM used) + $1::bigint + $2::bigint
                    ) AS barcode
                )
                SELECT candidates.barcode
                FROM candidates
                LEFT JOIN used ON used.barcode = candidates.barcode
                WHERE used.barcode IS NULL
                ORDER BY candidates.barcode
                LIMIT $2::int
            `,
            [FIRST_BARCODE_NUMBER, requiredCount]
        );

        if (result.rows.length !== requiredCount) {
            return { message: "Unable to generate enough unique Barcode Numbers.", status: 400 };
        }

        const barcodeNumbers = result.rows.map((row: any) => {
            const barcodeNumber = Number(row?.barcode);

            if (!Number.isFinite(barcodeNumber) || barcodeNumber > 999999999999) {
                return null;
            }

            return String(barcodeNumber).padStart(BARCODE_LENGTH, "0");
        });

        if (barcodeNumbers.some((barcode: string | null) => !barcode)) {
            return { message: "Unable to generate a unique Barcode Number.", status: 400 };
        }

        return barcodeNumbers as string[];
    };

    const getManualStockStatusTransitionError = (
        currentStatus: any,
        requestedStatus: any
    ) => {
        const current = normalizeComparableText(currentStatus);
        const next = normalizeComparableText(requestedStatus);

        if (!current || !next || current === next) {
            return null;
        }

        if (current === normalizeComparableText(RESERVED_RENTAL_STOCK_STATUS) && next !== current) {
            return "Use the rental order workflow to manage Reserved for Rental assets.";
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
                SELECT s.*, p.id AS productid, p.hsncode, p.saccode
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
                `SELECT s.*, p.id AS productid, p.hsncode, p.saccode
                 FROM stock_revo s
                 LEFT JOIN product_revo p ON s.puc = p.puc
                 WHERE s.id = $1`,
                [id]
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
            if (Object.prototype.hasOwnProperty.call(stockRevoData, "rfid")) {
                const normalizedBarcode = normalizeBarcodeValue(stockRevoData.rfid);
                stockRevoData.rfid = normalizedBarcode || null;
            }
            const productTaxCodeValues = extractProductTaxCodeValues(stockRevoData);
            const { id, ...upsertFields } = stockRevoData;
            let command: string;
            let affectedPucs = new Set<string>();
            let effectivePuc = upsertFields.puc;
            let effectiveStockType = upsertFields.stocktype;

            if (id) {
                // Fetch current stocktype to check for third_party_product restrictions
                const oldStockResult = await query(`SELECT puc, stocktype, stockstatus, rfid FROM stock_revo WHERE id = $1`, [id]);
                if (oldStockResult.rows.length > 0) {
                    const currentRow = oldStockResult.rows[0];
                    affectedPucs.add(currentRow.puc);
                    effectivePuc = upsertFields.puc ?? currentRow.puc;
                    effectiveStockType = upsertFields.stocktype ?? currentRow.stocktype;

                    const barcodeValidationError = getBarcodeValidationError(upsertFields.rfid, currentRow.rfid);
                    if (barcodeValidationError) {
                        return { message: barcodeValidationError, status: 400 };
                    }

                    const duplicateBarcodeError = await getDuplicateBarcodeError(upsertFields.rfid, id);
                    if (duplicateBarcodeError) {
                        return { message: duplicateBarcodeError, status: 400 };
                    }

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

                const taxCodeValidationError = await syncAndValidateProductTaxCode(
                    effectivePuc,
                    effectiveStockType,
                    productTaxCodeValues
                );
                if (taxCodeValidationError) {
                    return taxCodeValidationError;
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
                if (!upsertFields.rfid) {
                    const generatedBarcode = await generateUniqueBarcodeNumber();
                    if (typeof generatedBarcode !== "string") {
                        return generatedBarcode;
                    }
                    upsertFields.rfid = generatedBarcode;
                }

                const barcodeValidationError = getBarcodeValidationError(upsertFields.rfid);
                if (barcodeValidationError) {
                    return { message: barcodeValidationError, status: 400 };
                }

                const duplicateBarcodeError = await getDuplicateBarcodeError(upsertFields.rfid);
                if (duplicateBarcodeError) {
                    return { message: duplicateBarcodeError, status: 400 };
                }

                const taxCodeValidationError = await syncAndValidateProductTaxCode(
                    effectivePuc,
                    effectiveStockType,
                    productTaxCodeValues
                );
                if (taxCodeValidationError) {
                    return taxCodeValidationError;
                }

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
            if (
                normalizeComparableText(currentStock.holdreason) ===
                "cost_estimation"
            ) {
                return {
                    message:
                        "Use the service estimation workflow to release this stock.",
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

    export const markLostStockAsFound = async (stockId: number, modifiedBy?: number | null) => {
        try {
            if (!stockId) {
                return { message: "Id is required to restore the stock.", status: 400 };
            }

            const currentStockResult = await query(
                `SELECT * FROM stock_revo WHERE id = $1`,
                [stockId]
            );

            if (currentStockResult.rows.length === 0) {
                return { message: "No stock found with this id.", status: 404 };
            }

            const currentStock = currentStockResult.rows[0];
            if (normalizeComparableText(currentStock.stockstatus) !== normalizeComparableText(LOST_STOCK_STATUS)) {
                return {
                    message: "Only Lost stocks can be marked as found.",
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
                        rentalassetstatus = CASE
                            WHEN stocktype = 'rental_product' THEN $2
                            ELSE rentalassetstatus
                        END,
                        lostdate = NULL,
                        lostreason = NULL,
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
            console.error("Query Execution Error: IN markLostStockAsFound", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    };

    export const markDamagedStockAsRepaired = async (stockId: number, modifiedBy?: number | null) => {
        try {
            if (!stockId) {
                return { message: "Id is required to restore the stock.", status: 400 };
            }

            const currentStockResult = await query(
                `SELECT * FROM stock_revo WHERE id = $1`,
                [stockId]
            );

            if (currentStockResult.rows.length === 0) {
                return { message: "No stock found with this id.", status: 404 };
            }

            const currentStock = currentStockResult.rows[0];
            if (normalizeComparableText(currentStock.stockstatus) !== normalizeComparableText(DAMAGED_STOCK_STATUS)) {
                return {
                    message: "Only Damaged stocks can be marked as repaired/available.",
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
                        rentalassetstatus = CASE
                            WHEN stocktype = 'rental_product' THEN $2
                            ELSE rentalassetstatus
                        END,
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
            console.error("Query Execution Error: IN markDamagedStockAsRepaired", error);
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
            if (!Array.isArray(jsonresult) || jsonresult.length === 0) {
                return { message: "No stock rows found for import.", status: 400 };
            }

            let totalRecords = jsonresult.length;
            const generatedBarcodes = await generateUniqueBarcodeNumbers(totalRecords);

            if (!Array.isArray(generatedBarcodes)) {
                return generatedBarcodes;
            }

            for (let i = 0; i < jsonresult.length; i++) {
                // User-supplied barcode columns are ignored for imports.
                // The persisted DB field is still rfid, but values are generated server-side.
                removeUploadedBarcodeFields(jsonresult[i]);
                jsonresult[i].rfid = generatedBarcodes[i];
                const productTaxCodeValues = extractProductTaxCodeValues(jsonresult[i]);

                // Enforce same rules as getDataLoaderDataStock preview route:
                // - rental_product must always be ecompublish=false
                // - Barcode Number is auto-generated during import
                if (jsonresult[i].stocktype === 'rental_product') {
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

                const taxCodeValidationError = await syncAndValidateProductTaxCode(
                    jsonresult[i].puc,
                    jsonresult[i].stocktype,
                    productTaxCodeValues
                );
                if (taxCodeValidationError) {
                    return {
                        ...taxCodeValidationError,
                        message: `Row ${i + 2}: ${taxCodeValidationError.message}`,
                    };
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
                        AND stocktype = 'rental_product'
                        AND stockstatus = 'Reserved for Rental'
                    ) AS reservedforrentalquantity,

                    COUNT(*) FILTER (
                        WHERE (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND stocktype = 'rental_product'
                        AND stockstatus = 'Service Hold'
                    ) AS serviceholdquantity,

                    COUNT(*) FILTER (
                        WHERE (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND stocktype = 'rental_product'
                        AND stockstatus = 'Damaged'
                    ) AS damagedquantity,

                    COUNT(*) FILTER (
                        WHERE (removefromrecyclebin = false OR removefromrecyclebin IS NULL)
                        AND stocktype = 'rental_product'
                        AND stockstatus = 'Lost'
                    ) AS lostquantity,

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
                        AND (
                            stockstatus = 'Available'
                            OR stockstatus = 'Rental Sold'
                            OR stockstatus = 'Reserved for Rental'
                        )
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
                const reservedforrentalquantity = parseInt(quantityResult.rows[0].reservedforrentalquantity, 10);
                const serviceholdquantity = parseInt(quantityResult.rows[0].serviceholdquantity, 10);
                const damagedquantity = parseInt(quantityResult.rows[0].damagedquantity, 10);
                const lostquantity = parseInt(quantityResult.rows[0].lostquantity, 10);
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
                    reservedforrentalquantity,
                    serviceholdquantity,
                    damagedquantity,
                    lostquantity,
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
                -- 3) orders.location (legacy/fallback order location)
                -- 4) fallback to the best available stock location for the PUC
                order_metrics AS (
                    SELECT 
                        p.puc,
                        COALESCE(
                            NULLIF(ol.deliveryfrom, ''),
                            NULLIF(o.storelocation, ''),
                            NULLIF(o.location, ''),
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
                    -- Fallback join: when deliveryfrom/storelocation/location are blank/null,
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
                        AND (o.location IS NULL OR o.location = '')
                    )
                    WHERE p.puc = ANY($1::text[])
                    GROUP BY p.puc, COALESCE(NULLIF(ol.deliveryfrom, ''), NULLIF(o.storelocation, ''), NULLIF(o.location, ''), s.location)
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
                        AND (
                            s.stockstatus = 'Available'
                            OR s.stockstatus = 'Rental Sold'
                            OR s.stockstatus = 'Reserved for Rental'
                        )
                        AND s.stocktype = 'rental_product'
                    ) AS rentaltotalquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.ecompublish = false
                        AND s.stockstatus = 'Rental Sold'
                        AND s.stocktype = 'rental_product'
                    ) AS rentalsoldquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.stocktype = 'rental_product'
                        AND s.stockstatus = 'Reserved for Rental'
                    ) AS reservedforrentalquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.stocktype = 'rental_product'
                        AND s.stockstatus = 'Service Hold'
                    ) AS serviceholdquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.stocktype = 'rental_product'
                        AND s.stockstatus = 'Damaged'
                    ) AS damagedquantity,

                    COUNT(s.id) FILTER (
                        WHERE s.stocktype = 'rental_product'
                        AND s.stockstatus = 'Lost'
                    ) AS lostquantity,

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
                rentalavailablequantity:
                    parseInt(row.rentaltotalquantity, 10)
                    - parseInt(row.rentalsoldquantity, 10)
                    - parseInt(row.reservedforrentalquantity, 10),
                reservedforrentalquantity: parseInt(row.reservedforrentalquantity, 10),
                serviceholdquantity: parseInt(row.serviceholdquantity, 10),
                damagedquantity: parseInt(row.damagedquantity, 10),
                lostquantity: parseInt(row.lostquantity, 10),
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

    export const restoreReturnedStockForOrderLines = async (orderLines: any[] = []) => {
        try {
            const normalOrderLineNumbers = Array.from(
                new Set(
                    (orderLines || [])
                        .filter((line) => String(line?.ordername || '').trim().toLowerCase() !== 'rental')
                        .map((line) => String(line?.orderlinenumber || '').trim())
                        .filter(Boolean)
                )
            );

            const rentalGroups = new Map<string, { orderId: string; productId: number; quantity: number }>();
            for (const line of orderLines || []) {
                const orderName = String(line?.ordername || '').trim().toLowerCase();
                if (orderName !== 'rental') continue;

                const orderId = String(line?.uniqueorderid || '').trim();
                const productId = Number(line?.productid);
                const quantity = Number(line?.quantity);
                if (!orderId || !Number.isFinite(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
                    continue;
                }

                const key = `${orderId}::${productId}`;
                const existing = rentalGroups.get(key);
                if (existing) {
                    existing.quantity += quantity;
                    continue;
                }

                rentalGroups.set(key, { orderId, productId, quantity });
            }

            const updatedPucs = new Set<string>();

            if (normalOrderLineNumbers.length > 0) {
                const normalRestoreResult = await query(
                    `
                    UPDATE stock_revo
                    SET stockstatus = 'Available',
                        orderlinenumber = NULL,
                        modifieddate = EXTRACT(EPOCH FROM NOW())::bigint
                    WHERE orderlinenumber = ANY($1::text[])
                      AND stockstatus = 'Sold'
                    RETURNING puc
                    `,
                    [normalOrderLineNumbers]
                );

                for (const row of normalRestoreResult.rows || []) {
                    if (row?.puc) updatedPucs.add(String(row.puc));
                }
            }

            for (const rentalGroup of rentalGroups.values()) {
                const rentalRestoreResult = await query(
                    `
                    UPDATE stock_revo
                    SET stockstatus = 'Available',
                        orderid = NULL,
                        modifieddate = EXTRACT(EPOCH FROM NOW())::bigint
                    WHERE id IN (
                        SELECT id
                        FROM stock_revo
                        WHERE orderid = $1
                          AND puc IN (SELECT puc FROM product_revo WHERE id = $2)
                          AND stocktype = 'rental_product'
                          AND stockstatus = 'Rental Sold'
                        LIMIT $3
                        FOR UPDATE
                    )
                    RETURNING puc
                    `,
                    [rentalGroup.orderId, rentalGroup.productId, rentalGroup.quantity]
                );

                for (const row of rentalRestoreResult.rows || []) {
                    if (row?.puc) updatedPucs.add(String(row.puc));
                }
            }

            const updatedPucList = Array.from(updatedPucs);
            if (updatedPucList.length > 0) {
                for (const puc of updatedPucList) {
                    await productrevoService.updateCatalogueQuantities(puc);
                }
                await testinupdateQuantity(updatedPucList, false);
            }

            return { success: true, updatedPucs: updatedPucList };
        } catch (error) {
            console.error("Error in restoreReturnedStockForOrderLines:", error);
            throw error;
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
            let productid = rfidDataArray[0].productid;
            const arraylength = rfidDataArray.length;
            let ordername = rfidDataArray[0]?.ordername;

            if (!ordername && rfidDataArray[0]?.orderlinenumber) {
                const orderlineQuery = await query(
                    `SELECT ordername FROM orderline WHERE orderlinenumber = $1 LIMIT 1`,
                    [rfidDataArray[0].orderlinenumber]
                );
                ordername = orderlineQuery.rows[0]?.ordername ?? "";
            }

            const isRental = normalizeComparableText(ordername) === "rental";
            const stockStatusValue = isRental ? RENTAL_SOLD_STOCK_STATUS : "Sold";

            const queryParams: any[] = [productid];
            const mappedConditions = rfidDataArray.map((item) => {
                queryParams.push(item.rfid);
                const rfidParamIndex = queryParams.length;
                queryParams.push(item.orderlinenumber ?? null);
                const orderlineParamIndex = queryParams.length;

                return {
                    caseClause: `WHEN rfid = $${rfidParamIndex} THEN $${orderlineParamIndex}`,
                    whereClause: isRental
                        ? `(rfid = $${rfidParamIndex} AND (stockstatus = '${AVAILABLE_STOCK_STATUS}' OR (stockstatus = '${RESERVED_RENTAL_STOCK_STATUS}' AND orderlinenumber = $${orderlineParamIndex})))`
                        : `(rfid = $${rfidParamIndex} AND stockstatus = '${AVAILABLE_STOCK_STATUS}')`,
                };
            });

            let updateQuery = `
                UPDATE stock_revo 
                SET 
                    orderlinenumber = CASE ${mappedConditions
                        .map((item) => item.caseClause)
                        .join(" ")} ELSE orderlinenumber END,
                    stockstatus = '${stockStatusValue}',
                    stocktype = CASE WHEN stocktype = 'off_catalogue_product' THEN 'on_catalogue_product' ELSE stocktype END
                WHERE 
                    (${mappedConditions.map((item) => item.whereClause).join(" OR ")})
                    AND puc IN (SELECT puc FROM product_revo WHERE id = $1)
                RETURNING *;
            `;

            let result = await query(updateQuery, queryParams);

            if (result.rows.length !== arraylength) {
                return {
                    error: 'Error in barcode scan. Ensure all barcode numbers are valid.',
                    updatedCount: result.rows.length,
                    expectedCount: arraylength
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
                return { error: 'No records were updated. Please check the provided barcode numbers.' };
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
            const uniqueOrderId = String(order?.orderid ?? "").trim();

            if (!uniqueOrderId) {
                console.warn('Missing unique order id:', order);
                continue;
            }

            // ✅ Get rental orderlines
            const orderlinesResult = await query(
                `
                SELECT orderlinenumber, productid, assetnumber, quantity
                FROM orderline
                WHERE uniqueorderid = $1
                  AND LOWER(COALESCE(ordername, '')) = 'rental'
                `,
                [uniqueOrderId]
            );

            for (const line of orderlinesResult.rows) {
                const assetIdentifier = String(line.assetnumber ?? "").trim();
                let result;

                // ============================
                // ✅ ASSET-BASED ALLOCATION
                // ============================
                if (assetIdentifier) {
                    result = await query(
                        `
                        UPDATE stock_revo
                        SET
                            stockstatus = 'Reserved for Rental',
                            orderid = $1,
                            orderlinenumber = $2,
                            modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
                        WHERE id = (
                            SELECT id
                            FROM stock_revo
                            WHERE
                                (CAST(assetnumber AS TEXT) = $3 OR CAST(rfid AS TEXT) = $3)
                                AND puc IN (SELECT puc FROM product_revo WHERE id = $4)
                                AND stocktype = 'rental_product'
                                AND stockstatus = 'Available'
                                AND isdeleted = false
                                AND isarchive = false
                                AND removefromrecyclebin = false
                                AND ewaste = false
                            ORDER BY
                                CASE WHEN CAST(assetnumber AS TEXT) = $3 THEN 0 ELSE 1 END,
                                modifieddate DESC NULLS LAST,
                                id DESC
                            LIMIT 1
                            FOR UPDATE
                        )
                        RETURNING puc
                        `,
                        [
                            uniqueOrderId,
                            line.orderlinenumber,
                            assetIdentifier,
                            line.productid
                        ]
                    );

                } else {
                    // ============================
                    // ✅ QUANTITY-BASED ALLOCATION
                    // ============================
                    const quantity = Math.max(Number(line.quantity) || 1, 1);

                    result = await query(
                        `
                        UPDATE stock_revo
                        SET
                            stockstatus = 'Reserved for Rental',
                            orderid = $1,
                            orderlinenumber = $2,
                            modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
                        WHERE id IN (
                            SELECT id
                            FROM stock_revo
                            WHERE
                                puc IN (SELECT puc FROM product_revo WHERE id = $3)
                                AND stocktype = 'rental_product'
                                AND stockstatus = 'Available'
                                AND isdeleted = false
                                AND isarchive = false
                                AND removefromrecyclebin = false
                                AND ewaste = false
                            LIMIT $4
                            FOR UPDATE
                        )
                        RETURNING puc
                        `,
                        [
                            uniqueOrderId,
                            line.orderlinenumber,
                            line.productid,
                            quantity
                        ]
                    );
                }

                console.log(`Reserved ${result.rowCount} items for orderline ${line.orderlinenumber}`);

                if (!result.rowCount) {
                    console.warn(`No stock reserved for orderline ${line.orderlinenumber}`);
                    continue;
                }

                // ✅ Update product-level quantities
                const pucs = Array.from(
                    new Set(result.rows.map((row: any) => row.puc).filter(Boolean))
                );

                for (const puc of pucs) {
                    await productrevoService.updateCatalogueQuantities(puc);
                }
            }

            // ✅ Reservation tracking (VERY IMPORTANT)
            const orderLines = await query(
                `
                SELECT merchanttransactionid, productid, quantity, ordername, ordertype, deliveryfrom
                FROM orderline
                WHERE uniqueorderid = $1
                `,
                [uniqueOrderId]
            );

            if (orderLines.rows.length > 0) {
                await inventoryReservationService.transitionCommittedReservationsForOrderLines(
                    orderLines.rows,
                    "consumed",   // commit reservation on rental allocation
                    "rental_allocation"
                );
            }
        }

    } catch (error) {
        console.error("Error in allocateRentalStock:", error);
    }
};

    export const releaseReservedRentalStockForOrder = async (orderId: string) => {
        try {
            if (!orderId) return;
            const result = await query(
                `
                UPDATE stock_revo
                SET stockstatus = 'Available',
                    orderid = NULL,
                    orderlinenumber = NULL,
                    modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
                WHERE orderid = $1
                  AND stockstatus = 'Reserved for Rental'
                  AND stocktype = 'rental_product'
                RETURNING puc
                `,
                [orderId]
            );
            const updatedPucs = Array.from(new Set((result.rows || []).map((r: any) => r.puc).filter(Boolean)));
            for (const puc of updatedPucs) {
                await productrevoService.updateCatalogueQuantities(puc);
            }
            if (updatedPucs.length > 0) {
                await testinupdateQuantity(updatedPucs as string[], false);
            }
        } catch (error) {
            console.error("Error in releaseReservedRentalStockForOrder:", error);
            throw error;
        }
    };

    export const releaseReservedRentalStockForOrderline = async (orderlinenumber: string) => {
        try {
            if (!orderlinenumber) return;
            const result = await query(
                `
                UPDATE stock_revo
                SET stockstatus = 'Available',
                    orderid = NULL,
                    orderlinenumber = NULL,
                    modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
                WHERE orderlinenumber = $1
                  AND stockstatus = 'Reserved for Rental'
                  AND stocktype = 'rental_product'
                RETURNING puc
                `,
                [orderlinenumber]
            );
            const updatedPucs = Array.from(new Set((result.rows || []).map((r: any) => r.puc).filter(Boolean)));
            for (const puc of updatedPucs) {
                await productrevoService.updateCatalogueQuantities(puc);
            }
            if (updatedPucs.length > 0) {
                await testinupdateQuantity(updatedPucs as string[], false);
            }
        } catch (error) {
            console.error("Error in releaseReservedRentalStockForOrderline:", error);
            throw error;
        }
    };
}
