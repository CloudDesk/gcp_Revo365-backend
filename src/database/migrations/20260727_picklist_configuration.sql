CREATE TABLE IF NOT EXISTS picklist_definitions (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    module_scope TEXT NOT NULL DEFAULT 'global',
    object_scope TEXT NULL,
    description TEXT NULL,
    is_system_controlled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    allow_user_values BOOLEAN NOT NULL DEFAULT FALSE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS picklist_values (
    id BIGSERIAL PRIMARY KEY,
    definition_id BIGINT NOT NULL REFERENCES picklist_definitions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system_value BOOLEAN NOT NULL DEFAULT FALSE,
    legacy_values TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT picklist_values_definition_code_uniq UNIQUE (definition_id, code)
);

CREATE INDEX IF NOT EXISTS picklist_values_definition_idx
ON picklist_values (definition_id, is_active, sort_order, label);

CREATE TABLE IF NOT EXISTS picklist_value_relations (
    id BIGSERIAL PRIMARY KEY,
    parent_value_id BIGINT NOT NULL REFERENCES picklist_values(id) ON DELETE CASCADE,
    child_value_id BIGINT NOT NULL REFERENCES picklist_values(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'depends_on',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT picklist_value_relations_uniq UNIQUE (parent_value_id, child_value_id, relation_type)
);

CREATE INDEX IF NOT EXISTS picklist_value_relations_parent_idx
ON picklist_value_relations (parent_value_id, relation_type, is_active);

CREATE INDEX IF NOT EXISTS picklist_value_relations_child_idx
ON picklist_value_relations (child_value_id, relation_type, is_active);

CREATE TABLE IF NOT EXISTS picklist_field_mappings (
    id BIGSERIAL PRIMARY KEY,
    module_name TEXT NOT NULL,
    object_name TEXT NOT NULL,
    form_name TEXT NULL,
    field_name TEXT NOT NULL,
    definition_id BIGINT NOT NULL REFERENCES picklist_definitions(id) ON DELETE CASCADE,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    allow_inactive_for_existing_records BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS picklist_field_mappings_definition_idx
ON picklist_field_mappings (definition_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS picklist_field_mappings_uniq
ON picklist_field_mappings (module_name, object_name, (COALESCE(form_name, '')), field_name);

CREATE TABLE IF NOT EXISTS product_bundle_templates (
    id BIGSERIAL PRIMARY KEY,
    product_type_value_id BIGINT NOT NULL REFERENCES picklist_values(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NULL,
    allow_custom_build BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_bundle_templates_type_name_uniq UNIQUE (product_type_value_id, name)
);

CREATE TABLE IF NOT EXISTS product_bundle_template_items (
    id BIGSERIAL PRIMARY KEY,
    bundle_template_id BIGINT NOT NULL REFERENCES product_bundle_templates(id) ON DELETE CASCADE,
    component_definition_id BIGINT NULL REFERENCES picklist_definitions(id) ON DELETE SET NULL,
    component_value_id BIGINT NULL REFERENCES picklist_values(id) ON DELETE SET NULL,
    component_label TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO picklist_definitions (
    code,
    name,
    module_scope,
    object_scope,
    description,
    is_system_controlled,
    metadata_json
)
SELECT DISTINCT
    LOWER(REGEXP_REPLACE(TRIM(object || '_' || fieldname), '[^a-zA-Z0-9]+', '_', 'g')) AS code,
    INITCAP(REPLACE(TRIM(fieldname), '_', ' ')) AS name,
    CASE
        WHEN object = 'product_revo' THEN 'inventory'
        WHEN object IN ('orders', 'quotes', 'purchaseorder', 'poinvoice') THEN 'sales_procurement'
        WHEN object IN ('tickets', 'servicecostestimation') THEN 'service'
        WHEN object = 'inventoryusers' THEN 'users'
        ELSE 'global'
    END AS module_scope,
    object AS object_scope,
    'Backfilled from legacy picklist table.' AS description,
    CASE
        WHEN LOWER(fieldname) IN ('stockstatus', 'orderstatus', 'paymentstatus', 'ticketstatus') THEN TRUE
        ELSE FALSE
    END AS is_system_controlled,
    jsonb_build_object('legacyObject', object, 'legacyFieldName', fieldname)
FROM picklist
WHERE COALESCE(TRIM(object), '') <> ''
  AND COALESCE(TRIM(fieldname), '') <> ''
ON CONFLICT (code) DO UPDATE SET
    metadata_json = picklist_definitions.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

INSERT INTO picklist_values (
    definition_id,
    code,
    label,
    value,
    sort_order,
    is_system_value,
    legacy_values,
    metadata_json
)
SELECT
    source.definition_id,
    source.code,
    source.label,
    source.value,
    ROW_NUMBER() OVER (
        PARTITION BY source.definition_id
        ORDER BY source.label
    ) * 10 AS sort_order,
    source.is_system_controlled,
    source.legacy_values,
    source.metadata_json
FROM (
    SELECT
        d.id AS definition_id,
        LOWER(REGEXP_REPLACE(TRIM(COALESCE(NULLIF(p.value, ''), p.label)), '[^a-zA-Z0-9]+', '_', 'g')) AS code,
        MIN(COALESCE(NULLIF(TRIM(p.label), ''), TRIM(p.value))) AS label,
        MIN(COALESCE(NULLIF(TRIM(p.value), ''), TRIM(p.label))) AS value,
        BOOL_OR(d.is_system_controlled) AS is_system_controlled,
        ARRAY(
            SELECT DISTINCT legacy_item
            FROM UNNEST(ARRAY_AGG(p.label) || ARRAY_AGG(p.value)) AS legacy(legacy_item)
            WHERE COALESCE(TRIM(legacy_item), '') <> ''
        )::TEXT[] AS legacy_values,
        jsonb_build_object(
            'legacyIds', ARRAY_AGG(p.id),
            'controlledFieldNames', ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.controlledfieldname), NULL),
            'controlledValues', ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.controlledvalue), NULL),
            'controlledLabels', ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.controlledlabel), NULL),
            'parents', ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.parent), NULL)
        ) AS metadata_json
    FROM picklist p
    JOIN picklist_definitions d
      ON d.code = LOWER(REGEXP_REPLACE(TRIM(p.object || '_' || p.fieldname), '[^a-zA-Z0-9]+', '_', 'g'))
    WHERE COALESCE(TRIM(COALESCE(p.value, p.label)), '') <> ''
    GROUP BY
        d.id,
        LOWER(REGEXP_REPLACE(TRIM(COALESCE(NULLIF(p.value, ''), p.label)), '[^a-zA-Z0-9]+', '_', 'g'))
) source
ON CONFLICT (definition_id, code) DO UPDATE SET
    legacy_values = (
        SELECT ARRAY(
            SELECT DISTINCT item
            FROM UNNEST(picklist_values.legacy_values || EXCLUDED.legacy_values) AS item
            WHERE COALESCE(TRIM(item), '') <> ''
        )
    ),
    metadata_json = picklist_values.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

INSERT INTO picklist_field_mappings (
    module_name,
    object_name,
    form_name,
    field_name,
    definition_id,
    is_required,
    metadata_json
)
WITH mapping_source AS (
    SELECT
        d.module_scope,
        COALESCE(d.object_scope, 'global') AS object_name,
        NULL::TEXT AS form_name,
        (d.metadata_json ->> 'legacyFieldName') AS field_name,
        d.id AS definition_id,
        ROW_NUMBER() OVER (
            PARTITION BY
                d.module_scope,
                COALESCE(d.object_scope, 'global'),
                (d.metadata_json ->> 'legacyFieldName')
            ORDER BY
                CASE WHEN d.code = 'product_revo_accessories_for' THEN 0 ELSE 1 END,
                d.id
        ) AS row_priority
    FROM picklist_definitions d
    WHERE d.metadata_json ? 'legacyFieldName'
)
SELECT
    module_scope,
    object_name,
    form_name,
    field_name,
    definition_id,
    FALSE,
    jsonb_build_object('source', 'legacy_picklist_backfill')
FROM mapping_source
WHERE row_priority = 1
ON CONFLICT (module_name, object_name, (COALESCE(form_name, '')), field_name) DO UPDATE SET
    metadata_json = picklist_field_mappings.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

INSERT INTO picklist_value_relations (
    parent_value_id,
    child_value_id,
    relation_type,
    metadata_json
)
SELECT
    parent_value.id,
    child_value.id,
    'depends_on',
    jsonb_build_object(
        'source', 'legacy_picklist_backfill',
        'controlledFieldNames', ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.controlledfieldname), NULL),
        'legacyIds', ARRAY_AGG(DISTINCT p.id)
    )
FROM picklist p
JOIN picklist_definitions child_definition
  ON child_definition.code = LOWER(REGEXP_REPLACE(TRIM(p.object || '_' || p.fieldname), '[^a-zA-Z0-9]+', '_', 'g'))
JOIN picklist_values child_value
  ON child_value.definition_id = child_definition.id
 AND child_value.code = LOWER(REGEXP_REPLACE(TRIM(COALESCE(NULLIF(p.value, ''), p.label)), '[^a-zA-Z0-9]+', '_', 'g'))
JOIN picklist_definitions parent_definition
  ON parent_definition.code = LOWER(REGEXP_REPLACE(TRIM(p.object || '_' || p.controlledfieldname), '[^a-zA-Z0-9]+', '_', 'g'))
JOIN picklist_values parent_value
  ON parent_value.definition_id = parent_definition.id
 AND parent_value.code = LOWER(REGEXP_REPLACE(TRIM(COALESCE(NULLIF(p.controlledvalue, ''), NULLIF(p.controlledlabel, ''), p.parent)), '[^a-zA-Z0-9]+', '_', 'g'))
WHERE COALESCE(TRIM(p.controlledfieldname), '') <> ''
  AND COALESCE(TRIM(COALESCE(p.controlledvalue, p.controlledlabel, p.parent)), '') <> ''
GROUP BY
    parent_value.id,
    child_value.id
ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
    metadata_json = picklist_value_relations.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();
