import pool, { query } from "../database/postgres.js"
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import imageResize from "../imageResize/imageRessize.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { cartservice } from "./cart.service.js";
import { performance } from 'perf_hooks';
import { productrevoInsertSchema } from "../schemas/productrevo.schema.js";

export module productrevoService {

  const TIMEOUT_THRESHOLD = 5000;
  const BULK_PICKLIST_OBJECT = "product_revo";
  const MAX_EXPECTED_VALUES = 12;

  type BulkValidationError = {
    rowNumber: number;
    index: number;
    field: string;
    receivedValue: any;
    reason: string;
    expected?: string[] | string;
    suggestion?: string | null;
    source: "payload" | "picklist" | "supplier";
  };

  type BulkValidationResult = {
    isValid: boolean;
    totalRows: number;
    validRowCount: number;
    invalidRowCount: number;
    errors: BulkValidationError[];
  };

  type PicklistRow = {
    fieldname?: string | null;
    label?: string | null;
    value?: string | null;
    controlledfieldname?: string | null;
    controlledvalue?: string | null;
    controlledlabel?: string | null;
    parent?: string | null;
  };

  type SupplierRow = {
    id: number;
    suppliername: string | null;
  };

  const normalizeValue = (value: any): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim().toLowerCase();
    if (typeof value === "number" || typeof value === "boolean") return String(value).trim().toLowerCase();
    if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry)).filter(Boolean).join(",");
    return String(value).trim().toLowerCase();
  };

  const extractComparableValues = (value: any): string[] => {
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry)).filter(Boolean);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map((entry) => normalizeValue(entry)).filter(Boolean);
          }
        } catch (_error) {
          // Fall back to normal string handling.
        }
      }
      return [normalizeValue(trimmed)];
    }
    return [normalizeValue(value)];
  };

  const levenshteinDistance = (left: string, right: string): number => {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    const matrix: number[][] = Array.from({ length: left.length + 1 }, () =>
      new Array(right.length + 1).fill(0)
    );

    for (let i = 0; i <= left.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= right.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= left.length; i++) {
      for (let j = 1; j <= right.length; j++) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[left.length][right.length];
  };

  const getClosestSuggestion = (input: string, candidates: string[]): string | null => {
    if (!input || !candidates.length) return null;
    let bestCandidate = "";
    let bestScore = Number.MAX_SAFE_INTEGER;

    for (const candidate of candidates) {
      const score = levenshteinDistance(input, candidate);
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) return null;
    return bestScore <= Math.max(2, Math.floor(bestCandidate.length * 0.3)) ? bestCandidate : null;
  };

  const buildExpectedList = (values: Set<string>): string[] => {
    return Array.from(values).filter(Boolean).sort().slice(0, MAX_EXPECTED_VALUES);
  };

  const getSchemaPropertySet = (): Set<string> => {
    const schema = productrevoInsertSchema as { properties?: Record<string, unknown> };
    return new Set<string>(Object.keys(schema.properties ?? {}));
  };

  const getNonNullFieldNames = (row: Record<string, any>): string[] =>
    Object.keys(row).filter((key) => row[key] !== null && row[key] !== undefined && row[key] !== "");

  const fetchBulkValidationLookups = async () => {
    const [picklistResult, supplierResult] = await Promise.all([
      query(
        `SELECT fieldname, label, value, controlledfieldname, controlledvalue, controlledlabel, parent
         FROM picklist
         WHERE object = $1`,
        [BULK_PICKLIST_OBJECT]
      ),
      query(`SELECT id, suppliername FROM supplier`, []),
    ]);

    const picklistRows = (picklistResult.rows || []) as PicklistRow[];
    const supplierRows = (supplierResult.rows || []) as SupplierRow[];

    const allowedByField = new Map<string, Set<string>>();
    const dependentRowsByField = new Map<string, PicklistRow[]>();

    for (const row of picklistRows) {
      const fieldName = normalizeValue(row.fieldname);
      if (!fieldName) continue;

      if (!allowedByField.has(fieldName)) {
        allowedByField.set(fieldName, new Set<string>());
      }

      const allowedSet = allowedByField.get(fieldName) as Set<string>;
      const labelNormalized = normalizeValue(row.label);
      const valueNormalized = normalizeValue(row.value);

      if (labelNormalized) allowedSet.add(labelNormalized);
      if (valueNormalized) allowedSet.add(valueNormalized);

      const hasDependentConstraint = normalizeValue(row.controlledfieldname) && (
        normalizeValue(row.controlledvalue) || normalizeValue(row.controlledlabel) || normalizeValue(row.parent)
      );

      if (hasDependentConstraint) {
        if (!dependentRowsByField.has(fieldName)) {
          dependentRowsByField.set(fieldName, []);
        }
        (dependentRowsByField.get(fieldName) as PicklistRow[]).push(row);
      }
    }

    const supplierById = new Map<number, string>();
    const supplierNameToIds = new Map<string, Set<number>>();

    for (const supplier of supplierRows) {
      supplierById.set(Number(supplier.id), supplier.suppliername || "");
      const normalizedSupplierName = normalizeValue(supplier.suppliername);
      if (!normalizedSupplierName) continue;
      if (!supplierNameToIds.has(normalizedSupplierName)) {
        supplierNameToIds.set(normalizedSupplierName, new Set<number>());
      }
      (supplierNameToIds.get(normalizedSupplierName) as Set<number>).add(Number(supplier.id));
    }

    return {
      allowedByField,
      dependentRowsByField,
      supplierById,
      supplierNameToIds,
    };
  };

  export const validateBulkProductPayload = async (productrevoDataArray: any[]): Promise<BulkValidationResult> => {
    try {
      if (!Array.isArray(productrevoDataArray) || productrevoDataArray.length === 0) {
        return {
          isValid: false,
          totalRows: Array.isArray(productrevoDataArray) ? productrevoDataArray.length : 0,
          validRowCount: 0,
          invalidRowCount: 1,
          errors: [
            {
              rowNumber: 2,
              index: 0,
              field: "payload",
              receivedValue: productrevoDataArray,
              reason: "Expected a non-empty array of product rows.",
              source: "payload",
            },
          ],
        };
      }

      const schemaFieldSet = getSchemaPropertySet();
      const {
        allowedByField,
        dependentRowsByField,
        supplierById,
        supplierNameToIds,
      } = await fetchBulkValidationLookups();

      const errors: BulkValidationError[] = [];
      const invalidRows = new Set<number>();

      for (let index = 0; index < productrevoDataArray.length; index++) {
        const row = productrevoDataArray[index];
        const rowNumber = index + 2;

        if (!row || Array.isArray(row) || typeof row !== "object") {
          errors.push({
            rowNumber,
            index,
            field: "row",
            receivedValue: row,
            reason: "Each entry must be a valid object.",
            source: "payload",
          });
          invalidRows.add(index);
          continue;
        }

        const nonNullFields = getNonNullFieldNames(row);
        if (!nonNullFields.length) {
          errors.push({
            rowNumber,
            index,
            field: "row",
            receivedValue: row,
            reason: "Row has no non-null fields.",
            source: "payload",
          });
          invalidRows.add(index);
          continue;
        }

        for (const fieldName of Object.keys(row)) {
          if (!schemaFieldSet.has(fieldName)) {
            errors.push({
              rowNumber,
              index,
              field: fieldName,
              receivedValue: row[fieldName],
              reason: "Unknown field in payload.",
              expected: Array.from(schemaFieldSet).sort().slice(0, MAX_EXPECTED_VALUES),
              source: "payload",
            });
            invalidRows.add(index);
          }
        }

        for (const [picklistField, allowedValues] of allowedByField.entries()) {
          if (!(picklistField in row)) continue;
          const receivedComparableValues = extractComparableValues(row[picklistField]);
          if (!receivedComparableValues.length) continue;

          const dependentRows = dependentRowsByField.get(picklistField) || [];
          let dependentAllowedValues: Set<string> | null = null;

          if (dependentRows.length) {
            const matchedDependentRows = dependentRows.filter((dependentRow) => {
              const controllerField = normalizeValue(dependentRow.controlledfieldname);
              if (!controllerField || !(controllerField in row)) return false;

              const incomingControllerValues = extractComparableValues(row[controllerField]);
              if (!incomingControllerValues.length) return false;

              const ruleControllerValues = [
                normalizeValue(dependentRow.controlledvalue),
                normalizeValue(dependentRow.controlledlabel),
                normalizeValue(dependentRow.parent),
              ].filter(Boolean);

              return incomingControllerValues.some((incomingValue) =>
                ruleControllerValues.includes(incomingValue)
              );
            });

            if (matchedDependentRows.length) {
              dependentAllowedValues = new Set<string>();
              for (const matched of matchedDependentRows) {
                const labelNormalized = normalizeValue(matched.label);
                const valueNormalized = normalizeValue(matched.value);
                if (labelNormalized) dependentAllowedValues.add(labelNormalized);
                if (valueNormalized) dependentAllowedValues.add(valueNormalized);
              }
            }
          }

          const activeAllowedSet = dependentAllowedValues && dependentAllowedValues.size
            ? dependentAllowedValues
            : allowedValues;

          const expectedValues = buildExpectedList(activeAllowedSet);
          for (const receivedValue of receivedComparableValues) {
            if (!activeAllowedSet.has(receivedValue)) {
              const suggestion = getClosestSuggestion(receivedValue, expectedValues);
              errors.push({
                rowNumber,
                index,
                field: picklistField,
                receivedValue: row[picklistField],
                reason: dependentAllowedValues
                  ? "Value is not valid for the selected dependent picklist context."
                  : "Value is not part of the allowed picklist values.",
                expected: expectedValues,
                suggestion,
                source: "picklist",
              });
              invalidRows.add(index);
              break;
            }
          }
        }

        const supplierIdRaw = row.supplierid;
        const supplierNameRaw = row.suppliername;

        const hasSupplierId = supplierIdRaw !== null && supplierIdRaw !== undefined && supplierIdRaw !== "";
        const hasSupplierName = supplierNameRaw !== null && supplierNameRaw !== undefined && supplierNameRaw !== "";

        let normalizedSupplierName = "";
        let supplierIdNumeric: number | null = null;

        if (hasSupplierId) {
          supplierIdNumeric = Number(supplierIdRaw);
          if (!Number.isFinite(supplierIdNumeric)) {
            errors.push({
              rowNumber,
              index,
              field: "supplierid",
              receivedValue: supplierIdRaw,
              reason: "Supplier ID must be a valid number.",
              source: "supplier",
            });
            invalidRows.add(index);
          } else if (!supplierById.has(supplierIdNumeric)) {
            errors.push({
              rowNumber,
              index,
              field: "supplierid",
              receivedValue: supplierIdRaw,
              reason: "Supplier ID not found in supplier lookup.",
              source: "supplier",
            });
            invalidRows.add(index);
          }
        }

        if (hasSupplierName) {
          normalizedSupplierName = normalizeValue(supplierNameRaw);
          if (!normalizedSupplierName || !supplierNameToIds.has(normalizedSupplierName)) {
            errors.push({
              rowNumber,
              index,
              field: "suppliername",
              receivedValue: supplierNameRaw,
              reason: "Supplier name not found in supplier lookup.",
              expected: Array.from(supplierNameToIds.keys()).slice(0, MAX_EXPECTED_VALUES),
              suggestion: getClosestSuggestion(
                normalizedSupplierName,
                Array.from(supplierNameToIds.keys()).slice(0, MAX_EXPECTED_VALUES)
              ),
              source: "supplier",
            });
            invalidRows.add(index);
          }
        }

        if (hasSupplierId && hasSupplierName && supplierIdNumeric !== null && normalizedSupplierName) {
          const idsForName = supplierNameToIds.get(normalizedSupplierName);
          if (idsForName && !idsForName.has(supplierIdNumeric)) {
            errors.push({
              rowNumber,
              index,
              field: "supplierid/suppliername",
              receivedValue: { supplierid: supplierIdRaw, suppliername: supplierNameRaw },
              reason: "Supplier ID and Supplier Name do not match the same supplier record.",
              source: "supplier",
            });
            invalidRows.add(index);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        totalRows: productrevoDataArray.length,
        validRowCount: productrevoDataArray.length - invalidRows.size,
        invalidRowCount: invalidRows.size,
        errors,
      };
    } catch (error) {
      console.error("Query Execution Error: IN validateBulkProductPayload", error);
      return {
        isValid: false,
        totalRows: Array.isArray(productrevoDataArray) ? productrevoDataArray.length : 0,
        validRowCount: 0,
        invalidRowCount: Array.isArray(productrevoDataArray) ? productrevoDataArray.length : 1,
        errors: [
          {
            rowNumber: 2,
            index: 0,
            field: "validation",
            receivedValue: null,
            reason: `Validation failed unexpectedly: ${(error as Error).message}`,
            source: "payload",
          },
        ],
      };
    }
  };

  /**
   * Builds a new statushistory entry.
   *
   * `resolvedActor` must already be fully populated (id, name, email, role)
   * by the caller via a DB lookup on inventoryusers.
   *
   * Shape (each element):
   *   {
   *     active: boolean,        ← only the latest entry is true
   *     ecomvisible: boolean,   ← the value being set
   *     changed_at: string,     ← ISO timestamp
   *     changed_by: { id, name, email, role },
   *     source: string
   *   }
   */
  const buildStatusHistoryPayload = (
    previousHistory: any,
    resolvedActor: { id: number | null; name: string; email: string | null; role: string | null },
    ecomVisible: boolean
  ): any[] => {
    const newEntry = {
      active:      true,
      ecomvisible: ecomVisible,
      changed_at:  new Date().toISOString(),
      changed_by:  resolvedActor,
      source:      "product.ecom_visibility.toggle",
    };

    // Mark all previous entries as inactive, then append the new one
    const existing: any[] = Array.isArray(previousHistory)
      ? previousHistory.map((e: any) => ({ ...e, active: false }))
      : [];

    return [...existing, newEntry];
  };

  const getVisibilityCondition = (mode: "visible" | "hidden") => {
    if (mode === "hidden") {
      return `(ecomvisible = FALSE)`;
    }
    return `(ecomvisible = TRUE OR ecomvisible IS NULL)`;
  };

  export const getproductsData = async (request: any, visibilityMode?: "visible" | "hidden") => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      console.log(keys, "keys")
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
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
            parameterIndex += 2;
            return clause;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
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
          const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });
      const offset = (pageNumber - 1) * recordCount;
      const visibilityClause = visibilityMode ? ` AND ${getVisibilityCondition(visibilityMode)}` : '';
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)${visibilityClause}`;
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

      let queryText = `SELECT * FROM product_revo ${whereClause} ${orderByClause}`;


      if (pageNumber && recordCount) {
        queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
      }

      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result)
      return datatypeCheckResult
    }

    catch (error) {
      console.error("Query Execution Error: IN getproductsData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };


  export const getEcomProducts = async (request: any, visibilityMode: "visible" | "hidden" = "visible") => {
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
      let additionalSortCriteria = "";
      keys.forEach((key, index) => {
        let paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
        if (key === "displaysize" || key === "price") {
          const rangeClauses = paramValues.map(range => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
            parameterIndex += 2;
            return clause;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
        }
        else if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (key !== "page" && key !== "count") {
          const normalClauses = [];
          const notClauses = [];
          const nullClauses = [];
          paramValues.forEach((value: string) => {
            if (value.startsWith("NOT ") || value.startsWith("not ")) {
              const cleanValue = value.slice(4);
              notClauses.push(`${key} != $${parameterIndex}`);
              queryParams.push(cleanValue);
              parameterIndex++;
            } else if (value.toUpperCase() === 'NULL') {
              nullClauses.push(`${key} IS NULL`);
            } else {
              normalClauses.push(`${key} = $${parameterIndex}`);
              queryParams.push(value);
              parameterIndex++;
            }
          });

          const combinedClauses = [
            ...normalClauses,
            ...notClauses,
            ...nullClauses
          ];
          if (combinedClauses.length > 0) {
            whereClauses.push(`(${combinedClauses.join(" OR ")})`);
          }
        }
      });

      const offset = (pageNumber - 1) * recordCount;
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      // ecomvisible = TRUE  → show on ecom (default for all products)
      // ecomvisible = FALSE → hidden from ecom by admin (cart/wishlist cleared when toggled)
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL)
        AND (isdeleted = FALSE OR isdeleted IS NULL)
        AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)
        AND ${getVisibilityCondition(visibilityMode)}`;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
      let queryText = `SELECT * FROM product_revo`;
      if (whereClause) {
        queryText += ` ${whereClause} AND ${baseConditions} ${orderByClause}`;
      } else {
        queryText += ` WHERE ${baseConditions} ${orderByClause}`;
      }

      queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
      queryParams.push(offset, recordCount);

      const result: QueryResult = await query(queryText, queryParams);
      const datatypeCheckResult = await dataTypeCheck(result);
      return datatypeCheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getEcomProducts", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };

  export const getSimilarProducts = async (request: any, visibilityMode: "visible" | "hidden" = "visible") => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);

      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];

      keys.forEach((key, index) => {
        if (key !== "page" && key !== "count") {
          let paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
          const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });

      const offset = (pageNumber - 1) * recordCount;
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL) AND ${getVisibilityCondition(visibilityMode)}`;
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
      const orderByClause = `ORDER BY modifieddate DESC`;

      let queryText = `SELECT * FROM product_revo ${whereClause} ${orderByClause} OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
      queryParams.push(offset, recordCount);

      const result: QueryResult = await query(queryText, queryParams);

      if (result.rows.length <= 1) {
        let queryTextLatest = '';
        const queryParamsLatest: any[] = [];

        keys.forEach((key, index) => {
          if (key === "subcategory") {
            const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
            const clauses = paramValues.map((_, idx) => `${key} = $1`);
            const whereClauseLatest = `(${clauses.join(" OR ")}) AND ${baseConditions}`;
            queryTextLatest = `SELECT * FROM products WHERE ${whereClauseLatest} ${orderByClause} OFFSET $2 LIMIT $3`;
            queryParamsLatest.push(...paramValues, offset, recordCount);
          }
        });

        const resultLatest: QueryResult = await query(queryTextLatest, queryParamsLatest);
        return await dataTypeCheck(resultLatest);
      } else {
        return await dataTypeCheck(result);
      }
    } catch (error) {
      console.error("Query Execution Error: IN getSimilarProducts", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };

  // ─── LEGACY hard delete (kept for backward compatibility) ──────────────────
  export const deleteProductrevo = async (id: number) => {
    try {
      const result: any = await query(`DELETE FROM product_revo WHERE id = $1`, [id]);
      if (result.rowCount != 0) {
        return `Data Deleted Successfully`;
      } else {
        return `Product not found with id ${id}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN deleteProductrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };

  // ─── ECOM VISIBILITY TOGGLE ──────────────────────────────────────────────────
  /**
   * PATCH /v2/product/:id/ecom-visibility
   * Body: { ecomvisible: true | false }
   *
   * DB columns used:
   *   ecomvisible   (BOOLEAN)  ← renamed from ecom_visible
   *   statushistory (JSONB)    ← renamed from status_audit; now a flat array of objects
   */
  export const toggleEcomVisible = async (id: number, ecomVisible: boolean, actor?: any) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch & lock the product row
      const productResult = await client.query(
        `SELECT id, puc, ecomvisible, statushistory FROM product_revo WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (!productResult.rows.length) {
        await client.query('ROLLBACK');
        return { status: 404, message: `Product not found with id ${id}` };
      }

      const { puc, statushistory } = productResult.rows[0];
      const currentVisible = productResult.rows[0].ecomvisible !== false;

      // 2. No-op guard — already in the target state
      if (currentVisible === ecomVisible) {
        await client.query('ROLLBACK');
        return {
          status: 200,
          message: `Product is already ${ecomVisible ? 'visible' : 'hidden'}. No changes made.`,
        ecomvisible: ecomVisible,
          changed: false,
          puc,
        };
      }

      // 3. Resolve the actor from inventoryusers using session email
      //    Session stores only useremail; we need id, name, and role from DB.
      let resolvedActor: { id: number | null; name: string; email: string | null; role: string | null } = {
        id:    null,
        name:  actor?.useremail ?? "unknown",
        email: actor?.useremail ?? null,
        role:  null,
      };

      if (actor?.useremail) {
        const userLookup = await client.query(
          `SELECT id, firstname, lastname, role
           FROM inventoryusers
           WHERE useremail = $1
           LIMIT 1`,
          [actor.useremail]
        );
        if (userLookup.rows.length) {
          const u = userLookup.rows[0];
          resolvedActor = {
            id:    u.id   ?? null,
            name:  [u.firstname, u.lastname].filter(Boolean).join(" ") || actor.useremail,
            email: actor.useremail,
            role:  u.role ?? null,
          };
        }
      }

      // 4. Build new statushistory (append new entry, mark previous as inactive)
      const newStatusHistory = buildStatusHistoryPayload(statushistory, resolvedActor, ecomVisible);

      // 4. Update Product Visibility + Audit Trail
      await client.query(
        `UPDATE product_revo
         SET ecomvisible    = $1,
             statushistory  = $2
         WHERE id = $3`,
        [ecomVisible, JSON.stringify(newStatusHistory), id]
      );

      // 5. If Toggle OFF: clear cart/wishlist
      let cartClearedCount = 0;
      if (!ecomVisible) {
        const deleteResult = await client.query(
          `DELETE FROM cart WHERE productid = $1 RETURNING id`,
          [id]
        );
        cartClearedCount = deleteResult.rowCount ?? 0;
      }

      await client.query('COMMIT');

      // The active entry is always the last one
      const activeEntry = newStatusHistory[newStatusHistory.length - 1];

      return {
        status: 200,
        message: ecomVisible
          ? `Product id ${id} is now live on ecom.`
          : `Product id ${id} hidden from ecom. Cart/wishlist cleared.`,
        ecomvisible: ecomVisible,
        changed: true,
        puc,
        cart_cleared: cartClearedCount,
        status_history: {
          active: activeEntry,
          total_entries: newStatusHistory.length,
        },
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Critical error in toggleEcomVisible — rolled back:', error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    } finally {
      client.release();
    }
  };

  export const upsertProductrevo = async (productrevoData: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...upsertFields } = productrevoData;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      if (id) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, id];
      } else {
        querydata = `INSERT INTO product_revo (${fieldNames.join(
          ", "
        )}) VALUES (${fieldNames
          .map((_, index) => `$${index + 1}`)
          .join(", ")}) RETURNING *`;
        params = fieldValues;
      }

      const result = await query(querydata, params)
      return result;
    } catch (error) {
      console.error("Query Execution Error: IN upsertProductrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }

  }

  export const insertBulkProduct = async (productrevoDataArray: any[]) => {
    try {
      console.log('In insertBulkProduct', productrevoDataArray);
      if (!productrevoDataArray.length) {
        return { success: false, error: 'No products to insert', errors: [] };
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < productrevoDataArray.length; i++) {
        const productData = productrevoDataArray[i];
        const fieldNames = Object.keys(productData).filter(
          (key) => productData[key] !== null && productData[key] !== undefined
        );
        const fieldValues = fieldNames.map((name) => productData[name]);

        let queryStr = `INSERT INTO product_revo (${fieldNames.join(', ')}) VALUES (${fieldNames
          .map((_, index) => `$${index + 1}`)
          .join(', ')}) RETURNING *`;

        try {
          const result = await query(queryStr, fieldValues);
          if (result.command === 'INSERT') {
            results.push(result);
          } else {
            errors.push({ index: i, error: 'Failed to insert product' });
          }
        } catch (err) {
          console.error(`Error inserting product at index ${i}:`, err);
          errors.push({ index: i, error: (err as Error).message || 'Database error' });
        }
      }

      const insertedCount = results.length;
      return {
        success: insertedCount > 0,
        insertedCount,
        errors: errors.length > 0 ? errors : [],
      };
    } catch (error) {
      console.error('Query Execution Error: IN insertBulkProduct', error);
      let errorMessage = await ErrorHandler.handleQueryError(error);
      return { success: false, error: errorMessage, errors: [{ index: -1, error: errorMessage }] };
    }
  };

  export const getArcheivedProductsrevo = async (request: any) => {
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
          const paramValues: any = Array.isArray(values[index])
            ? values[index]
            : [values[index]];
          if (index !== 0) {
            whereClause += " AND ";
          }
          whereClause += `(${paramValues
            .map((_, idx) => `${key} = $${parameterIndex + idx}`)
            .join(" OR ")})`;
          parameterIndex += paramValues.length;

          queryParams.push(...paramValues);
        }

      });
      const offset = (pageNumber - 1) * recordCount;
      let queryText = `SELECT * FROM product_revo`;
      if (whereClause) {
        queryText += ` WHERE ${whereClause} AND isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
          }`;
      }
      else if (pageNumber && recordCount) {
        queryText += ` WHERE isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
          }`;

        queryParams.push(offset, recordCount);

      }
      else {
        queryText += ` WHERE isarchive = true AND removefromrecyclebin = false`;
      }
      const result: QueryResult = await query(queryText, queryParams);
      let datatypecheckResult = await dataTypeCheck(result);
      return datatypecheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getArcheivedProductsrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }

  }

  //get
  export const getEachProductsRevo = async function (request: any, id: Number, visibilityMode?: "visible" | "hidden") {
    try {
      const visibilityClause = visibilityMode ? ` AND ${getVisibilityCondition(visibilityMode)}` : '';
      const queryText = `SELECT * FROM product_revo
           WHERE id = $1
             AND (isarchive = FALSE OR isarchive IS NULL)
             AND (isdeleted = FALSE OR isdeleted IS NULL)
             AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)${visibilityClause}`;
      const result: QueryResult = await query(
        queryText,
        [id]
      );
      console.log(result, "result")
      let getvalues = { objectName: "null" };
      console.log(getvalues, "getvalues")
      getvalues.objectName = "products";
      let datatypecheckResult = await dataTypeCheck(result);
      return datatypecheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getEachProductsRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };

  export const upsertProductwithFileRevo = async (request: any) => {
    try {
      const { productid } = request.params;
      let existingProductData: any = {};
      const upsertProductData: any = [];
      if (productid) {
        existingProductData = await query(
          `SELECT * FROM product_revo where id=${productid}`,
          {}
        );
      }
      let data: any = {};
      if (existingProductData.rows && existingProductData.rows.length > 0) {
        data = existingProductData?.rows[0];
      }
      let imageData: any;
      if (request.files) {
        imageData = await imageResize(request);
        upsertProductData.large = data?.large
          ? [...data.large, ...imageData.url.Large]
          : imageData.url.Large;
        upsertProductData.medium = data?.medium
          ? [...data.medium, ...imageData.url.Medium]
          : imageData.url.Medium;
        upsertProductData.small = data?.small
          ? [...data.small, ...imageData.url.Small]
          : imageData.url.Small;
      }
      const pathurldatas = imageData?.path || null;
      const { ...upsertFields } = upsertProductData;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      let querydata;
      let params: any[] = [];
      if (productid) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, Number(productid)];
      }
      const result = await query(querydata, params);
      return { result, productid, pathurldatas };
    } catch (error) {
      console.error("Query Execution Error: IN upsertProductwithFileRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };
  export const upsertProductwithfileRevogcp = async (request: any) => {
    try {
      const { productid } = request.body;
      let existingProductData: any = {};
      const upsertProductData: any = [];
      let data: any = {};
      if (productid) {
        existingProductData = await query(
          `SELECT * FROM product_revo where id=${productid}`,
          {}
        );
      }
      if (existingProductData.rows && existingProductData.rows.length > 0) {
        data = existingProductData?.rows[0];
      }
      let imageData: any;
      if (request.body.url) {
        imageData = request.body;
        upsertProductData.large = data?.large
          ? [...data.large, ...imageData.url.Large]
          : imageData.url.Large;
        upsertProductData.medium = data?.medium
          ? [...data.medium, ...imageData.url.Medium]
          : imageData.url.Medium;
        upsertProductData.small = data?.small
          ? [...data.small, ...imageData.url.Small]
          : imageData.url.Small;
      }
      const pathurldatas = imageData?.url || null;
      const { ...upsertFields } = upsertProductData;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      let querydata;
      let params: any[] = [];
      if (productid) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, Number(productid)];
      }
      const result = await query(querydata, params);
      return { result, productid, pathurldatas };
    } catch (error) {
      console.error("Query Execution Error: IN upsertProductwithFileRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };

  export const rearrangeImageRevo = async (request) => {
    try {
      const { productid } = request.params;
      const { ...upsertFields } = request.body;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      let querydata;
      let params: any[] = [];

      let getData = await query(
        `select large,medium,small from product_revo where id =${productid}`,
        {}
      );
      let value = getData.rows[0];
      if (getData.rows.length > 0) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, Number(productid)];
      }
      let result = await query(querydata, params);

      return result;
    } catch (error) {
      console.error("Query Execution Error: IN rearrangeImageRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  };

  export const updateRemoveFromRecyclebinRevo = async () => {
    const updateQuery = `
            UPDATE product_revo
            SET removefromrecyclebin = true
            WHERE isdeleted = true AND removefromrecyclebin = false
            AND to_timestamp(modifieddate) <= (CURRENT_TIMESTAMP - INTERVAL '30 days')
        `;
    let data = await query(updateQuery, []);
    return data
  };

  export const updateAvgRatingProductrevo = async (avgRating: number, productid: number) => {
    try {
      const result: any = await query(`UPDATE product_revo SET averagerating = $1 WHERE id = $2`, [avgRating, productid]);

      if (result.rowCount != 0) {
        return `Average rating updated successfully for productid ${productid}`;
      } else {
        return `Product not found with productid ${productid}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN updateAvgRatingProductrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  }

  export const updateoverallAvailableQuantity = async (puc: any) => {
    try {
      const quertTogetThirdpartyproduct = await query(`SELECT id, thirdpartyquantity from stock_revo where puc = $1 and stocktype = 'third_party_product'`, [puc]);
      console.log('quertTogetThirdpartyproduct', quertTogetThirdpartyproduct.rows);
      if (quertTogetThirdpartyproduct.rows.length > 0) {
        const stockid = quertTogetThirdpartyproduct.rows[0].id;
        const thirdpartyquantity = quertTogetThirdpartyproduct.rows[0].thirdpartyquantity;
        const queryToUpdateOverallAvailableQuantity = `UPDATE product_revo SET overallavailableqty = (${thirdpartyquantity} + availablequantity) WHERE puc = $1  RETURNING *`;
        const result = await query(queryToUpdateOverallAvailableQuantity, [puc]);
        console.log("result of update overall available quantity", result.rows);
        return result.rows[0];
      } else {
        const queryToUpdateOverallAvailableQuantity = `UPDATE product_revo SET overallavailableqty = availablequantity WHERE puc = $1  RETURNING *`;
        const result = await query(queryToUpdateOverallAvailableQuantity, [puc]);
        return result.rows[0];
      }
    } catch (error) {
      console.error("Query Execution Error: IN updateoverallAvailableQuantity", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  }

  export const upsertQuantityFields = async (upsertData: any, orderedquantitydata, issold: boolean, isRental = false) => {
    console.log('--upsertQuantityFields', upsertData);
    const {
      quantity,
      ecompublishedquantity,
      soldquantity,
      availablequantity,
      puc,
      overallavailableqty,
      rentalsoldquantity,
      oncatalogueqty,
      offcatalogueqty,
      rentaltotalquantity,
      rentalavailablequantity,
      bin_qty,
      archive_qty,
      ewaste_qty
    } = upsertData;

    try {
      let productquery = await query(`SELECT orderedquantity FROM product_revo WHERE puc = $1`, [puc]);
      let orderedquantityvalue = productquery.rows[0]?.orderedquantity;
      let productStatusValue: string;

      if (availablequantity > 5) {
        productStatusValue = 'in_stock';
      } else if (availablequantity > 0 && availablequantity <= 5) {
        productStatusValue = 'low_stock';
      } else {
        productStatusValue = 'out_of_stock';
      }

      let orderedquantityNumber = Number(orderedquantitydata);

      let updateQueryBase = `
      UPDATE product_revo 
      SET quantity = $1, 
          ecompublishedquantity = $2, 
          soldquantity = $3, 
          availablequantity = $4, 
          productstatus = $5, 
          overallavailableqty = $6, 
          rentalsoldquantity = $7,
          oncatalogueqty = $8,
          offcatalogueqty = $9,
          rentaltotalquantity = $10,
          rentalavailablequantity = $11,
          bin_qty = $12,
          archive_qty = $13,
          ewaste_qty = $14
    `;

      let updateQuery = '';
      console.log("DEBUG upsertQuantityFields - issold:", issold, "isRental:", isRental, "orderedquantityNumber:", orderedquantityNumber);
      if (issold && !isNaN(orderedquantityNumber)) {
        // Decrement rentalorderedquantity for rental orders, orderedquantity for regular orders
        if (isRental) {
          console.log("DEBUG: Decrementing rentalorderedquantity");
          updateQueryBase += `, rentalorderedquantity = rentalorderedquantity - $15`;
        } else {
          console.log("DEBUG: Decrementing orderedquantity");
          updateQueryBase += `, orderedquantity = orderedquantity - $15`;
        }
        updateQuery = `${updateQueryBase} WHERE puc = $16 RETURNING *`;
      } else {
        updateQuery = `${updateQueryBase} WHERE puc = $15 RETURNING *`;
      }

      let updateParams = [];
      if (issold && !isNaN(orderedquantityNumber)) {
        updateParams = [
          quantity,
          ecompublishedquantity,
          soldquantity,
          availablequantity,
          productStatusValue,
          overallavailableqty,
          rentalsoldquantity,
          oncatalogueqty,
          offcatalogueqty,
          rentaltotalquantity,
          rentalavailablequantity,
          bin_qty,
          archive_qty,
          ewaste_qty,
          orderedquantityNumber,
          puc
        ];
      } else {
        updateParams = [
          quantity,
          ecompublishedquantity,
          soldquantity,
          availablequantity,
          productStatusValue,
          overallavailableqty,
          rentalsoldquantity,
          oncatalogueqty,
          offcatalogueqty,
          rentaltotalquantity,
          rentalavailablequantity,
          bin_qty,
          archive_qty,
          ewaste_qty,
          puc
        ];
      }

      const updateResult = await query(updateQuery, updateParams);

      // update cart quantities
      let cartData = {
        productid: updateResult.rows[0].id,
        availablequantity
      };

      const updateCartQuantity = await cartservice.upsertCartQuantity(cartData);

      if (updateCartQuantity?.command === 'UPDATE' || updateCartQuantity === null) {
        return updateResult.rows[0];
      } else {
        let message = {
          product: updateResult.rows[0],
          cart: 'Problem In Cart Quantity Updation. Please contact support team'
        };
        return message;
      }

    } catch (error) {
      console.error("Query Execution Error: IN upsertQuantityFields", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const testupsertQuantityFieldsBatch = async (batchData: any[], issold: boolean) => {
    try {
      // Single query template — both issold and non-issold write the same fields.
      const updateQueryBase = `
            UPDATE product_revo
            SET quantityforlocation = 
                jsonb_set(
                    COALESCE(quantityforlocation, '{}'::jsonb),
                    array[$1]::text[],
                    jsonb_build_object(
                        'quantity',                $2::integer,
                        'overallquantity',         $3::integer,
                        'ecompublishedquantity',   $4::integer,
                        'soldquantity',            $5::integer,
                        'availablequantity',       $6::integer,
                        'overallavailableqty',     $7::integer,
                        'thirdpartyqty',           $8::integer,
                        'thirdpartyavailableqty',  $9::integer,
                        'rentaltotalquantity',     $10::integer,
                        'rentalsoldquantity',      $11::integer,
                        'rentalavailablequantity', $12::integer
                    )
                )
            WHERE puc = $13
            RETURNING *
        `;
      const updateQueries = batchData.map(data => {
        return {
          query: updateQueryBase,
          params: [
            data.location,
            data.quantity,
            data.overallquantity,
            data.ecompublishedquantity,
            data.soldquantity,
            data.availablequantity,
            data.overallavailableqty,
            data.thirdpartyqty,
            data.thirdpartyavailableqty,
            data.rentaltotalquantity,
            data.rentalsoldquantity,
            data.rentalavailablequantity,
            data.puc
          ]
        };
      });
      const updatePromises = updateQueries.map(update => query(update.query, update.params));
      const updateResults = await Promise.all(updatePromises);
      return updateResults;

    } catch (error) {
      console.error("Error in testupsertQuantityFieldsBatch", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };



  export const bulkupsertProducttosetZero = (async (data, setzero) => {
    try {

      console.log(data + 'data for bulk upsert product to set zero');
      if (data.length === 0) {
        return { message: 'No data to update' };
      }

      let querytext = 'UPDATE product_revo SET lock_qty = CASE id ';
      const values = [];

      data.forEach((item, index) => {
        if (setzero) {
          const idPlaceholder = index + 1;
          querytext += `WHEN $${idPlaceholder} THEN 0 `;
          values.push(item.productid);
        } else {
          const idPlaceholder = index * 2 + 1;
          const quantityPlaceholder = index * 2 + 2;
          querytext += `WHEN $${idPlaceholder} THEN lock_qty + $${quantityPlaceholder} `;
          values.push(item.productid, item.quantity);
        }
      });

      querytext += 'ELSE lock_qty END WHERE id IN (';

      if (setzero) {
        querytext += data.map((_, index) => `$${index + 1}`).join(', ');
      } else {
        querytext += data.map((_, index) => `$${index * 2 + 1}`).join(', ');
      }

      querytext += ');';

      await query(querytext, values);
      console.log('success bulk upsert product to set zero');
      return { message: 'Bulk update successful' };
    } catch (error) {
      console.error("Query Execution Error: bulkupsertProducttosetZero result", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  });

  export async function updateOrderedQuantity(productIds: Array<number>, orderedquantity: number) {

    try {
      return 'resultdata'
    } catch (error) {
      console.error('Error in updateOrderedQuantity:', error);
    }
  }


  export async function updateOrderedQuantityarray(updatedData) {
    try {
      console.log('Inside updateorderqty');
      console.log('Inside updateorderqty', updatedData);

      let data = [];
      for (const e of updatedData) {
        const { id, orderedquantity } = e;
        console.log(id, orderedquantity, 'kkkk');
        console.log("Debug: Processing item", JSON.stringify(e, null, 2));

        const orderName = e.ordername ? e.ordername.toLowerCase().trim() : '';
        console.log("Debug: Normalized ordername:", orderName);

        if (orderName === 'rental') {
          console.log('Updating rentalorderedquantity for rental product');
          const queryText = `
        UPDATE product_revo
        SET rentalorderedquantity = rentalorderedquantity + $1,
            lock_qty = lock_qty - $1 
        WHERE id = $2
        RETURNING *`;
          let result = await query(queryText, [orderedquantity, id]);
          data.push(result);
        } else {
          console.log('Updating orderedquantity for normal product');
          const queryText = `
        UPDATE product_revo
        SET orderedquantity = orderedquantity + $1,
            lock_qty = lock_qty - $1 
        WHERE id = $2
        RETURNING *`;
          let result = await query(queryText, [orderedquantity, id]);
          data.push(result);
        }

      }
      return data;
    } catch (error) {
      console.error('Error in updateOrderedQuantityarray:', error);
      throw error;
    }
  }

  export async function updateCatalogueQuantities(puc) {
    console.log('puc:', puc);
    // Standard filter for active/live stock
    const activeFilters = `(isdeleted = false OR isdeleted IS NULL) AND (isarchive = false OR isarchive IS NULL) AND (removefromrecyclebin = false OR removefromrecyclebin IS NULL) AND (ewaste = false OR ewaste IS NULL)`;

    const queryText = `
        WITH counts AS (
            SELECT 
                -- Track Live Quantities (Used for sales/display)
                (
                    COUNT(*) FILTER (WHERE ${activeFilters} AND stocktype <> 'third_party_product')
                    +
                    COALESCE(SUM(thirdpartyquantity) FILTER (WHERE ${activeFilters} AND stocktype = 'third_party_product'), 0)
                ) AS total_quantity_count,

                COUNT(*) FILTER (
                    WHERE ${activeFilters}
                    AND ecompublish = true 
                    AND stockstatus = 'Available' 
                    AND stocktype <> 'third_party_product'
                ) AS available_quantity_count,

                COALESCE(SUM(CASE WHEN ${activeFilters} AND stocktype = 'on_catalogue_product' AND stockstatus = 'Available' THEN 1 ELSE 0 END), 0) AS on_catalogue_count,
                COALESCE(SUM(CASE WHEN ${activeFilters} AND stocktype = 'off_catalogue_product' AND stockstatus = 'Available' THEN 1 ELSE 0 END), 0) AS off_catalogue_count,
                COALESCE(SUM(CASE WHEN ${activeFilters} AND stocktype = 'rental_product' AND ecompublish = false AND (stockstatus = 'Available' OR stockstatus = 'Rental Sold') THEN 1 ELSE 0 END), 0) AS rental_total_count,
                COALESCE(SUM(CASE WHEN ${activeFilters} AND stocktype = 'rental_product' AND ecompublish = false AND stockstatus = 'Rental Sold' THEN 1 ELSE 0 END), 0) AS rental_sold_count,

                -- overallavailableqty logic (Live stock only)
                (
                    COALESCE(SUM(CASE
                        WHEN ${activeFilters}
                          AND stocktype = 'third_party_product'
                          AND ecompublish = true
                          AND stockstatus = 'Available'
                        THEN thirdpartyquantity
                        ELSE 0
                    END), 0)
                    +
                    COALESCE(SUM(CASE
                        WHEN ${activeFilters}
                          AND stocktype <> 'third_party_product'
                          AND ecompublish = true
                          AND stockstatus = 'Available'
                        THEN 1
                        ELSE 0
                    END), 0)
                ) AS overall_available_qty,

                -- ecompublishedquantity logic (Live stock only)
                (
                    COALESCE(SUM(CASE
                        WHEN ${activeFilters}
                          AND stocktype = 'third_party_product'
                          AND ecompublish = true
                          AND stockstatus = 'Available'
                        THEN thirdpartyquantity
                        ELSE 0
                    END), 0)
                    +
                    COALESCE(SUM(CASE
                        WHEN ${activeFilters}
                          AND stocktype <> 'third_party_product'
                          AND ecompublish = true
                          AND stockstatus = 'Available'
                        THEN 1
                        ELSE 0
                    END), 0)
                ) AS ecom_published_qty,

                -- Track Flagged/Removed Quantities
                COUNT(*) FILTER (WHERE isdeleted = true) AS bin_count,
                COUNT(*) FILTER (WHERE isarchive = true) AS archive_count,
                COUNT(*) FILTER (WHERE (ewaste = true OR removefromrecyclebin = true)) AS ewaste_count

            FROM stock_revo 
            WHERE puc = $1
        )
        UPDATE product_revo
        SET 
            quantity = counts.total_quantity_count,
            availablequantity = counts.available_quantity_count,
            oncatalogueqty = counts.on_catalogue_count,
            offcatalogueqty = counts.off_catalogue_count,
            rentaltotalquantity = counts.rental_total_count,
            rentalsoldquantity = counts.rental_sold_count,
            rentalavailablequantity = counts.rental_total_count - counts.rental_sold_count,
            overallavailableqty = counts.overall_available_qty,
            ecompublishedquantity = counts.ecom_published_qty,
            bin_qty = counts.bin_count,
            archive_qty = counts.archive_count,
            ewaste_qty = counts.ewaste_count
        FROM counts
        WHERE product_revo.puc = $1
        RETURNING counts.on_catalogue_count, counts.off_catalogue_count, counts.rental_total_count,
                  (counts.rental_total_count - counts.rental_sold_count) as rental_available_count,
                  counts.overall_available_qty, counts.ecom_published_qty, counts.total_quantity_count, counts.available_quantity_count;
    `;
    console.log('queryText:', queryText);
    let result = await query(queryText, [puc]);
    console.log('result:', result.rows);


    if (result.rows.length > 0) {
      return {
        onCatalogueCount: result.rows[0].on_catalogue_count,
        offCatalogueCount: result.rows[0].off_catalogue_count,
        rentalTotalQuantity: result.rows[0].rental_total_count,
        rentalAvailableQuantity: result.rows[0].rental_available_count,
        overallavailableqty: result.rows[0].overall_available_qty,
        ecompublishedquantity: result.rows[0].ecom_published_qty
      };
    } else {
      return { message: 'No data Found' };
    }
  }


  export async function updateCancelledOrderedQuantity(productIds: Array<number>, quantitydata: number) {

    try {
      const queryvalue = `UPDATE product_revo SET orderedquantity = orderedquantity - ${quantitydata} 
      WHERE id = ANY($1::int[])    AND orderedquantity > 0
      returning *`;
      let resultdata = await query(queryvalue, [productIds]);
      return resultdata
    } catch (error) {
      console.error('Error in updateCancelledOrderedQuantity:', error);
    }
  }
}
