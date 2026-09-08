import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
const normalizeCode = (value) => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const toBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === "")
        return fallback;
    if (typeof value === "boolean")
        return value;
    return String(value).toLowerCase() === "true";
};
const toNumberOrNull = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
};
const jsonValue = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const buildQueryStringFilters = (filters, allowedFields) => {
    const whereClauses = [];
    const params = [];
    Object.keys(allowedFields).forEach((key) => {
        const value = filters[key];
        if (value === undefined || value === null || value === "")
            return;
        params.push(value);
        whereClauses.push(`${allowedFields[key]} = $${params.length}`);
    });
    return {
        whereClause: whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "",
        params,
    };
};
export var picklistConfigService;
(function (picklistConfigService) {
    picklistConfigService.getDefinitions = async (request) => {
        try {
            const { whereClause, params } = buildQueryStringFilters(request.query || {}, {
                module_scope: "module_scope",
                object_scope: "object_scope",
                is_active: "is_active",
                is_system_controlled: "is_system_controlled",
            });
            const result = await query(`
          SELECT
            d.*,
            COUNT(v.id)::int AS value_count
          FROM picklist_definitions d
          LEFT JOIN picklist_values v ON v.definition_id = d.id
          ${whereClause}
          GROUP BY d.id
          ORDER BY d.module_scope ASC, d.name ASC
        `, params);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getDefinitions", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.upsertDefinition = async (payload) => {
        try {
            const id = toNumberOrNull(payload?.id);
            const code = normalizeCode(payload?.code || payload?.name);
            const name = String(payload?.name || payload?.label || "").trim();
            if (!code || !name) {
                return { message: "Definition code and name are required.", status: 400 };
            }
            const params = [
                code,
                name,
                String(payload?.module_scope || payload?.moduleScope || "global").trim(),
                payload?.object_scope || payload?.objectScope || null,
                payload?.description || null,
                toBoolean(payload?.is_system_controlled ?? payload?.isSystemControlled),
                toBoolean(payload?.is_active ?? payload?.isActive, true),
                toBoolean(payload?.allow_user_values ?? payload?.allowUserValues),
                jsonValue(payload?.metadata_json ?? payload?.metadataJson),
            ];
            if (id) {
                const existingDefinition = await query(`SELECT is_system_controlled FROM picklist_definitions WHERE id = $1`, [id]);
                if (existingDefinition.rows[0]?.is_system_controlled) {
                    const result = await query(`
              UPDATE picklist_definitions
              SET name = $1,
                  description = $2,
                  metadata_json = $3,
                  updated_at = NOW()
              WHERE id = $4
              RETURNING *
            `, [name, payload?.description || null, params[8], id]);
                    return result.rows[0];
                }
                const result = await query(`
            UPDATE picklist_definitions
            SET code = $1,
                name = $2,
                module_scope = $3,
                object_scope = $4,
                description = $5,
                is_system_controlled = $6,
                is_active = $7,
                allow_user_values = $8,
                metadata_json = $9,
                updated_at = NOW()
            WHERE id = $10
            RETURNING *
          `, [...params, id]);
                return result.rows[0];
            }
            const result = await query(`
          INSERT INTO picklist_definitions (
            code,
            name,
            module_scope,
            object_scope,
            description,
            is_system_controlled,
            is_active,
            allow_user_values,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            module_scope = EXCLUDED.module_scope,
            object_scope = EXCLUDED.object_scope,
            description = EXCLUDED.description,
            is_system_controlled = EXCLUDED.is_system_controlled,
            is_active = EXCLUDED.is_active,
            allow_user_values = EXCLUDED.allow_user_values,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = NOW()
          RETURNING *
        `, params);
            return result.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertDefinition", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.getValues = async (request) => {
        try {
            const definitionCode = request.params?.definitionCode || request.query?.definition_code;
            const params = [];
            const whereClauses = [];
            if (definitionCode) {
                params.push(normalizeCode(definitionCode));
                whereClauses.push(`d.code = $${params.length}`);
            }
            if (request.query?.definition_id) {
                params.push(Number(request.query.definition_id));
                whereClauses.push(`v.definition_id = $${params.length}`);
            }
            if (request.query?.is_active !== undefined) {
                params.push(toBoolean(request.query.is_active));
                whereClauses.push(`v.is_active = $${params.length}`);
            }
            const result = await query(`
          SELECT
            v.*,
            d.code AS definition_code,
            d.name AS definition_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', r.id,
                  'relation_type', r.relation_type,
                  'parent_value_id', pv.id,
                  'parent_code', pv.code,
                  'parent_label', pv.label,
                  'parent_definition_code', pd.code
                )
              ) FILTER (WHERE r.id IS NOT NULL),
              '[]'
            ) AS parents
          FROM picklist_values v
          JOIN picklist_definitions d ON d.id = v.definition_id
          LEFT JOIN picklist_value_relations r ON r.child_value_id = v.id AND r.is_active = TRUE
          LEFT JOIN picklist_values pv ON pv.id = r.parent_value_id
          LEFT JOIN picklist_definitions pd ON pd.id = pv.definition_id
          ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
          GROUP BY v.id, d.code, d.name
          ORDER BY d.name ASC, v.sort_order ASC, v.label ASC
        `, params);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getValues", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.upsertValue = async (payload) => {
        try {
            const id = toNumberOrNull(payload?.id);
            const definitionId = toNumberOrNull(payload?.definition_id ?? payload?.definitionId);
            const definitionCode = normalizeCode(payload?.definition_code ?? payload?.definitionCode);
            const label = String(payload?.label || payload?.value || "").trim();
            const value = String(payload?.value || payload?.label || "").trim();
            const code = normalizeCode(payload?.code || value || label);
            if (!label || !value || !code) {
                return { message: "Value code, label, and value are required.", status: 400 };
            }
            let resolvedDefinitionId = definitionId;
            if (!resolvedDefinitionId && definitionCode) {
                const definitionResult = await query(`SELECT id FROM picklist_definitions WHERE code = $1`, [definitionCode]);
                resolvedDefinitionId = definitionResult.rows[0]?.id;
            }
            if (!resolvedDefinitionId) {
                return { message: "A valid picklist definition is required.", status: 400 };
            }
            const targetDefinitionResult = await query(`SELECT is_system_controlled FROM picklist_definitions WHERE id = $1`, [resolvedDefinitionId]);
            const targetIsSystemControlled = Boolean(targetDefinitionResult.rows[0]?.is_system_controlled);
            const params = [
                resolvedDefinitionId,
                code,
                label,
                value,
                payload?.description || null,
                Number(payload?.sort_order ?? payload?.sortOrder ?? 0),
                toBoolean(payload?.is_active ?? payload?.isActive, true),
                toBoolean(payload?.is_system_value ?? payload?.isSystemValue),
                Array.isArray(payload?.legacy_values ?? payload?.legacyValues)
                    ? payload?.legacy_values ?? payload?.legacyValues
                    : [],
                jsonValue(payload?.metadata_json ?? payload?.metadataJson),
            ];
            if (id) {
                const existingValueResult = await query(`
            SELECT
              value.id,
              value.definition_id,
              definition.is_system_controlled
            FROM picklist_values value
            JOIN picklist_definitions definition
              ON definition.id = value.definition_id
            WHERE value.id = $1
          `, [id]);
                const existingValue = existingValueResult.rows[0];
                if (!existingValue) {
                    return { message: "Picklist value not found.", status: 404 };
                }
                if (existingValue.is_system_controlled) {
                    const result = await query(`
              UPDATE picklist_values
              SET label = $1,
                  description = $2,
                  sort_order = $3,
                  metadata_json = $4,
                  updated_at = NOW()
              WHERE id = $5
              RETURNING *
            `, [
                        label,
                        payload?.description || null,
                        Number(payload?.sort_order ?? payload?.sortOrder ?? 0),
                        jsonValue(payload?.metadata_json ?? payload?.metadataJson),
                        id,
                    ]);
                    return result.rows[0];
                }
                if (targetIsSystemControlled) {
                    return {
                        message: "Values cannot be moved into a system-controlled picklist.",
                        status: 400,
                    };
                }
                const result = await query(`
            UPDATE picklist_values
            SET definition_id = $1,
                code = $2,
                label = $3,
                value = $4,
                description = $5,
                sort_order = $6,
                is_active = $7,
                is_system_value = $8,
                legacy_values = $9,
                metadata_json = $10,
                updated_at = NOW()
            WHERE id = $11
            RETURNING *
          `, [...params, id]);
                return result.rows[0];
            }
            if (targetIsSystemControlled) {
                return {
                    message: "New values cannot be added to a system-controlled picklist. Add workflow support in code first.",
                    status: 400,
                };
            }
            const result = await query(`
          INSERT INTO picklist_values (
            definition_id,
            code,
            label,
            value,
            description,
            sort_order,
            is_active,
            is_system_value,
            legacy_values,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (definition_id, code) DO UPDATE SET
            label = EXCLUDED.label,
            value = EXCLUDED.value,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            is_active = EXCLUDED.is_active,
            is_system_value = EXCLUDED.is_system_value,
            legacy_values = EXCLUDED.legacy_values,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = NOW()
          RETURNING *
        `, params);
            return result.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertValue", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.upsertRelation = async (payload) => {
        try {
            const parentValueId = toNumberOrNull(payload?.parent_value_id ?? payload?.parentValueId);
            const childValueId = toNumberOrNull(payload?.child_value_id ?? payload?.childValueId);
            const relationType = normalizeCode(payload?.relation_type ?? payload?.relationType ?? "depends_on");
            if (!parentValueId || !childValueId) {
                return { message: "Parent value and child value are required.", status: 400 };
            }
            if (parentValueId === childValueId) {
                return { message: "A value cannot depend on itself.", status: 400 };
            }
            const isActive = toBoolean(payload?.is_active ?? payload?.isActive, true);
            if (isActive) {
                const circularResult = await query(`
            WITH RECURSIVE descendants(value_id) AS (
              SELECT child_value_id
              FROM picklist_value_relations
              WHERE parent_value_id = $1
                AND is_active = TRUE

              UNION

              SELECT relation.child_value_id
              FROM picklist_value_relations relation
              JOIN descendants
                ON relation.parent_value_id = descendants.value_id
              WHERE relation.is_active = TRUE
            )
            SELECT 1
            FROM descendants
            WHERE value_id = $2
            LIMIT 1
          `, [childValueId, parentValueId]);
                if (circularResult.rows.length > 0) {
                    return {
                        message: "This dependency would create a circular picklist relationship.",
                        status: 400,
                    };
                }
            }
            const result = await query(`
          INSERT INTO picklist_value_relations (
            parent_value_id,
            child_value_id,
            relation_type,
            is_active,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
            is_active = EXCLUDED.is_active,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = NOW()
          RETURNING *
        `, [
                parentValueId,
                childValueId,
                relationType,
                isActive,
                jsonValue(payload?.metadata_json ?? payload?.metadataJson),
            ]);
            return result.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRelation", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.deleteRelation = async (id) => {
        try {
            const result = await query(`
          UPDATE picklist_value_relations
          SET is_active = FALSE,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `, [id]);
            return result.rows[0] || { message: "Relation not found.", status: 404 };
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteRelation", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.getFieldMappings = async (request) => {
        try {
            const { whereClause, params } = buildQueryStringFilters(request.query || {}, {
                module_name: "m.module_name",
                object_name: "m.object_name",
                field_name: "m.field_name",
                is_active: "m.is_active",
            });
            const result = await query(`
          SELECT
            m.*,
            d.code AS definition_code,
            d.name AS definition_name
          FROM picklist_field_mappings m
          JOIN picklist_definitions d ON d.id = m.definition_id
          ${whereClause}
          ORDER BY m.module_name ASC, m.object_name ASC, m.field_name ASC
        `, params);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getFieldMappings", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.upsertFieldMapping = async (payload) => {
        try {
            const definitionId = toNumberOrNull(payload?.definition_id ?? payload?.definitionId);
            const definitionCode = normalizeCode(payload?.definition_code ?? payload?.definitionCode);
            let resolvedDefinitionId = definitionId;
            if (!resolvedDefinitionId && definitionCode) {
                const definitionResult = await query(`SELECT id FROM picklist_definitions WHERE code = $1`, [definitionCode]);
                resolvedDefinitionId = definitionResult.rows[0]?.id;
            }
            const moduleName = normalizeCode(payload?.module_name ?? payload?.moduleName);
            const objectName = normalizeCode(payload?.object_name ?? payload?.objectName);
            const fieldName = normalizeCode(payload?.field_name ?? payload?.fieldName);
            if (!moduleName || !objectName || !fieldName || !resolvedDefinitionId) {
                return {
                    message: "Module name, object name, field name, and definition are required.",
                    status: 400,
                };
            }
            const result = await query(`
          INSERT INTO picklist_field_mappings (
            module_name,
            object_name,
            form_name,
            field_name,
            definition_id,
            is_required,
            allow_inactive_for_existing_records,
            is_active,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (module_name, object_name, (COALESCE(form_name, '')), field_name) DO UPDATE SET
            definition_id = EXCLUDED.definition_id,
            is_required = EXCLUDED.is_required,
            allow_inactive_for_existing_records = EXCLUDED.allow_inactive_for_existing_records,
            is_active = EXCLUDED.is_active,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = NOW()
          RETURNING *
        `, [
                moduleName,
                objectName,
                payload?.form_name ?? payload?.formName ?? null,
                fieldName,
                resolvedDefinitionId,
                toBoolean(payload?.is_required ?? payload?.isRequired),
                toBoolean(payload?.allow_inactive_for_existing_records ??
                    payload?.allowInactiveForExistingRecords, true),
                toBoolean(payload?.is_active ?? payload?.isActive, true),
                jsonValue(payload?.metadata_json ?? payload?.metadataJson),
            ]);
            return result.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertFieldMapping", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.resolvePicklists = async (request) => {
        try {
            const objectName = String(request.query?.object_name || request.query?.objectName || "").trim();
            const formName = request.query?.form_name || request.query?.formName
                ? String(request.query?.form_name || request.query?.formName).trim()
                : null;
            const legacyShape = toBoolean(request.query?.legacy_shape ?? request.query?.legacyShape);
            const codesParam = request.query?.codes || request.query?.code || "";
            const codes = String(codesParam)
                .split(",")
                .map(normalizeCode)
                .filter(Boolean);
            if (!codes.length && !objectName) {
                return {};
            }
            if (legacyShape && objectName) {
                const params = [objectName];
                const formClause = formName
                    ? `AND (m.form_name = $2 OR m.form_name IS NULL)`
                    : "";
                if (formName)
                    params.push(formName);
                const result = await query(`
            WITH selected_mappings AS (
              SELECT DISTINCT ON (m.field_name, v.id)
                m.field_name,
                d.code AS definition_code,
                v.id,
                v.code,
                v.label,
                v.value,
                v.sort_order,
                v.metadata_json,
                parent_value.value AS controlledvalue,
                parent_value.label AS controlledlabel,
                parent_definition.metadata_json ->> 'legacyFieldName' AS controlledfieldname,
                parent_value.label AS parent
              FROM picklist_field_mappings m
              JOIN picklist_definitions d
                ON d.id = m.definition_id
              JOIN picklist_values v
                ON v.definition_id = d.id
               AND v.is_active = TRUE
              LEFT JOIN picklist_value_relations relation
                ON relation.child_value_id = v.id
               AND relation.is_active = TRUE
              LEFT JOIN picklist_values parent_value
                ON parent_value.id = relation.parent_value_id
              LEFT JOIN picklist_definitions parent_definition
                ON parent_definition.id = parent_value.definition_id
              WHERE m.object_name = $1
                AND m.is_active = TRUE
                AND d.is_active = TRUE
                ${formClause}
              ORDER BY
                m.field_name,
                v.id,
                CASE WHEN m.form_name IS NOT NULL THEN 0 ELSE 1 END
            )
            SELECT *
            FROM selected_mappings
            ORDER BY field_name ASC, sort_order ASC, label ASC
          `, params);
                return result.rows.reduce((acc, row) => {
                    if (!acc[row.field_name])
                        acc[row.field_name] = [];
                    acc[row.field_name].push({
                        id: row.id,
                        code: row.code,
                        label: row.label,
                        value: row.value,
                        fieldname: row.field_name,
                        definition_code: row.definition_code,
                        sort_order: row.sort_order,
                        metadata_json: row.metadata_json,
                        controlledvalue: row.controlledvalue,
                        controlledlabel: row.controlledlabel,
                        controlledfieldname: row.controlledfieldname,
                        parent: row.parent,
                    });
                    return acc;
                }, {});
            }
            const result = await query(`
          SELECT
            d.code AS definition_code,
            v.id,
            v.code,
            v.label,
            v.value,
            v.sort_order,
            v.metadata_json,
            COALESCE(
              json_agg(
                json_build_object(
                  'parentValueId', pv.id,
                  'parentCode', pv.code,
                  'parentValue', pv.value,
                  'parentDefinitionCode', pd.code,
                  'relationType', r.relation_type
                )
              ) FILTER (WHERE r.id IS NOT NULL),
              '[]'
            ) AS parents
          FROM picklist_definitions d
          JOIN picklist_values v ON v.definition_id = d.id
          LEFT JOIN picklist_value_relations r ON r.child_value_id = v.id AND r.is_active = TRUE
          LEFT JOIN picklist_values pv ON pv.id = r.parent_value_id
          LEFT JOIN picklist_definitions pd ON pd.id = pv.definition_id
          WHERE d.code = ANY($1::text[])
            AND d.is_active = TRUE
            AND v.is_active = TRUE
          GROUP BY d.code, v.id
          ORDER BY d.code ASC, v.sort_order ASC, v.label ASC
        `, [codes]);
            return result.rows.reduce((acc, row) => {
                if (!acc[row.definition_code])
                    acc[row.definition_code] = [];
                acc[row.definition_code].push({
                    id: row.id,
                    code: row.code,
                    label: row.label,
                    value: row.value,
                    sort_order: row.sort_order,
                    metadata_json: row.metadata_json,
                    parents: row.parents,
                });
                return acc;
            }, {});
        }
        catch (error) {
            console.error("Query Execution Error: IN resolvePicklists", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.getBundleTemplates = async (request) => {
        try {
            const params = [];
            const whereClauses = [];
            if (request.query?.product_type_value_id) {
                params.push(Number(request.query.product_type_value_id));
                whereClauses.push(`bt.product_type_value_id = $${params.length}`);
            }
            if (request.query?.is_active !== undefined) {
                params.push(toBoolean(request.query.is_active));
                whereClauses.push(`bt.is_active = $${params.length}`);
            }
            const result = await query(`
          SELECT
            bt.*,
            ptv.code AS product_type_code,
            ptv.label AS product_type_label,
            ptd.code AS product_type_definition_code,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', bti.id,
                  'component_definition_id', bti.component_definition_id,
                  'component_value_id', bti.component_value_id,
                  'component_label', bti.component_label,
                  'quantity', bti.quantity,
                  'is_required', bti.is_required,
                  'sort_order', bti.sort_order,
                  'component_value_label', cv.label,
                  'component_definition_code', cd.code
                )
                ORDER BY bti.sort_order ASC, bti.component_label ASC
              ) FILTER (WHERE bti.id IS NOT NULL),
              '[]'
            ) AS items
          FROM product_bundle_templates bt
          JOIN picklist_values ptv ON ptv.id = bt.product_type_value_id
          JOIN picklist_definitions ptd ON ptd.id = ptv.definition_id
          LEFT JOIN product_bundle_template_items bti ON bti.bundle_template_id = bt.id
          LEFT JOIN picklist_values cv ON cv.id = bti.component_value_id
          LEFT JOIN picklist_definitions cd ON cd.id = bti.component_definition_id
          ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
          GROUP BY bt.id, ptv.code, ptv.label, ptd.code
          ORDER BY bt.name ASC
        `, params);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getBundleTemplates", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.upsertBundleTemplate = async (payload) => {
        try {
            const id = toNumberOrNull(payload?.id);
            const productTypeValueId = toNumberOrNull(payload?.product_type_value_id ?? payload?.productTypeValueId);
            const name = String(payload?.name || "").trim();
            if (!productTypeValueId || !name) {
                return { message: "Product type value and bundle name are required.", status: 400 };
            }
            const params = [
                productTypeValueId,
                name,
                payload?.description || null,
                toBoolean(payload?.allow_custom_build ?? payload?.allowCustomBuild),
                toBoolean(payload?.is_active ?? payload?.isActive, true),
                jsonValue(payload?.metadata_json ?? payload?.metadataJson),
            ];
            if (id) {
                const result = await query(`
            UPDATE product_bundle_templates
            SET product_type_value_id = $1,
                name = $2,
                description = $3,
                allow_custom_build = $4,
                is_active = $5,
                metadata_json = $6,
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
          `, [...params, id]);
                return result.rows[0];
            }
            const result = await query(`
          INSERT INTO product_bundle_templates (
            product_type_value_id,
            name,
            description,
            allow_custom_build,
            is_active,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (product_type_value_id, name) DO UPDATE SET
            description = EXCLUDED.description,
            allow_custom_build = EXCLUDED.allow_custom_build,
            is_active = EXCLUDED.is_active,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = NOW()
          RETURNING *
        `, params);
            return result.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertBundleTemplate", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
    picklistConfigService.upsertBundleItem = async (payload) => {
        try {
            const id = toNumberOrNull(payload?.id);
            const bundleTemplateId = toNumberOrNull(payload?.bundle_template_id ?? payload?.bundleTemplateId);
            const componentDefinitionId = toNumberOrNull(payload?.component_definition_id ?? payload?.componentDefinitionId);
            const componentValueId = toNumberOrNull(payload?.component_value_id ?? payload?.componentValueId);
            const componentLabel = String(payload?.component_label ?? payload?.componentLabel ?? "").trim();
            if (!bundleTemplateId || !componentLabel) {
                return { message: "Bundle template and component label are required.", status: 400 };
            }
            const params = [
                bundleTemplateId,
                componentDefinitionId,
                componentValueId,
                componentLabel,
                Number(payload?.quantity || 1),
                toBoolean(payload?.is_required ?? payload?.isRequired, true),
                Number(payload?.sort_order ?? payload?.sortOrder ?? 0),
                jsonValue(payload?.metadata_json ?? payload?.metadataJson),
            ];
            if (id) {
                const result = await query(`
            UPDATE product_bundle_template_items
            SET bundle_template_id = $1,
                component_definition_id = $2,
                component_value_id = $3,
                component_label = $4,
                quantity = $5,
                is_required = $6,
                sort_order = $7,
                metadata_json = $8,
                updated_at = NOW()
            WHERE id = $9
            RETURNING *
          `, [...params, id]);
                return result.rows[0];
            }
            const result = await query(`
          INSERT INTO product_bundle_template_items (
            bundle_template_id,
            component_definition_id,
            component_value_id,
            component_label,
            quantity,
            is_required,
            sort_order,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, params);
            return result.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertBundleItem", error);
            return ErrorHandler.handleQueryError(error);
        }
    };
})(picklistConfigService || (picklistConfigService = {}));
//# sourceMappingURL=picklistConfig.service.js.map