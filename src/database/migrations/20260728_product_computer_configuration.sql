ALTER TABLE product_revo
    ADD COLUMN IF NOT EXISTS producttype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS buildtype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS fulfillmenttype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sparetype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bomtemplateid BIGINT;

ALTER TABLE product_bundle_templates
    ADD COLUMN IF NOT EXISTS build_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS effective_to TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS product_boms (
    id BIGSERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES product_revo(id) ON DELETE CASCADE,
    bundle_template_id BIGINT NULL REFERENCES product_bundle_templates(id) ON DELETE SET NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    package_type VARCHAR(100) NOT NULL,
    build_type VARCHAR(100) NOT NULL,
    fulfillment_type VARCHAR(100) NOT NULL,
    is_configuration_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_boms_product_version_uniq UNIQUE (product_id, version_number),
    CONSTRAINT product_boms_status_check CHECK (status IN ('draft', 'active', 'retired'))
);

CREATE INDEX IF NOT EXISTS product_boms_product_idx
ON product_boms (product_id, status, version_number DESC);

CREATE TABLE IF NOT EXISTS product_bom_lines (
    id BIGSERIAL PRIMARY KEY,
    product_bom_id BIGINT NOT NULL REFERENCES product_boms(id) ON DELETE CASCADE,
    component_role_value_id BIGINT NULL REFERENCES picklist_values(id) ON DELETE SET NULL,
    component_product_id INTEGER NULL REFERENCES product_revo(id) ON DELETE RESTRICT,
    component_role_code VARCHAR(100) NOT NULL,
    component_label TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    is_customer_selected BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT product_bom_lines_quantity_check CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS product_bom_lines_bom_idx
ON product_bom_lines (product_bom_id, sort_order, id);

CREATE INDEX IF NOT EXISTS product_bom_lines_component_idx
ON product_bom_lines (component_product_id);

WITH definition_seed (
    code,
    name,
    description,
    metadata_json
) AS (
    VALUES
        (
            'product_revo_build_type',
            'Build Type',
            'Identifies whether a computer is supplied as an OEM/prebuilt product or assembled from selected components.',
            '{"fieldPurpose":"build_origin","immutableCodes":true}'::jsonb
        ),
        (
            'product_revo_fulfillment_type',
            'Inventory Behaviour',
            'Controls whether a computer is stocked as a parent item, assembled, or exploded into component lines.',
            '{"fieldPurpose":"inventory_behavior","immutableCodes":true}'::jsonb
        ),
        (
            'product_revo_component_role',
            'Computer Component Role',
            'Reusable component slots for computer BOMs and spare-product classification.',
            '{"fieldPurpose":"bom_component_role","immutableCodes":true}'::jsonb
        )
)
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
SELECT
    code,
    name,
    'inventory',
    'product_revo',
    description,
    FALSE,
    TRUE,
    TRUE,
    metadata_json
FROM definition_seed
ON CONFLICT (code) DO UPDATE SET
    metadata_json = picklist_definitions.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH value_seed (
    definition_code,
    code,
    label,
    sort_order,
    metadata_json
) AS (
    VALUES
        ('product_revo_build_type', 'oem_prebuilt', 'Branded / OEM Prebuilt', 10, '{"brandPolicy":"parent_and_components_independent"}'::jsonb),
        ('product_revo_build_type', 'custom_assembled', 'Custom Assembled', 20, '{"requiresConfiguration":true}'::jsonb),
        ('product_revo_fulfillment_type', 'prepacked', 'Stock as Complete Product', 10, '{"stockPolicy":"parent_stock"}'::jsonb),
        ('product_revo_fulfillment_type', 'assemble_to_stock', 'Assemble to Stock', 20, '{"stockPolicy":"consume_components_create_parent"}'::jsonb),
        ('product_revo_fulfillment_type', 'assemble_to_order', 'Assemble to Order', 30, '{"stockPolicy":"reserve_then_consume_components"}'::jsonb),
        ('product_revo_fulfillment_type', 'virtual_kit', 'Sell as Component Kit', 40, '{"stockPolicy":"explode_at_order"}'::jsonb),
        ('product_revo_component_role', 'system_unit', 'System Unit', 10, '{"group":"core","requiredFor":["computer_full_set"]}'::jsonb),
        ('product_revo_component_role', 'chassis', 'Chassis / Cabinet', 20, '{"group":"internal","requiredFor":["custom_assembled"]}'::jsonb),
        ('product_revo_component_role', 'motherboard', 'Motherboard', 30, '{"group":"internal","requiredFor":["custom_assembled"]}'::jsonb),
        ('product_revo_component_role', 'processor', 'Processor', 40, '{"group":"internal","requiredFor":["custom_assembled"]}'::jsonb),
        ('product_revo_component_role', 'cpu_cooler', 'Processor Cooling', 50, '{"group":"internal","requiredFor":["custom_assembled"]}'::jsonb),
        ('product_revo_component_role', 'ram', 'Memory (RAM)', 60, '{"group":"internal","requiredFor":["custom_assembled"],"allowMultiple":true}'::jsonb),
        ('product_revo_component_role', 'storage', 'Storage (SSD / HDD)', 70, '{"group":"internal","requiredFor":["custom_assembled"],"allowMultiple":true}'::jsonb),
        ('product_revo_component_role', 'power_supply', 'Power Supply', 80, '{"group":"internal","requiredFor":["custom_assembled"]}'::jsonb),
        ('product_revo_component_role', 'graphics_card', 'Graphics Card', 90, '{"group":"internal","optional":true,"allowMultiple":true}'::jsonb),
        ('product_revo_component_role', 'wifi_adapter', 'Wi-Fi / Bluetooth', 100, '{"group":"internal","optional":true}'::jsonb),
        ('product_revo_component_role', 'case_fan', 'Case Fan', 110, '{"group":"internal","optional":true,"allowMultiple":true}'::jsonb),
        ('product_revo_component_role', 'operating_system', 'Operating System', 120, '{"group":"software","optional":true}'::jsonb),
        ('product_revo_component_role', 'monitor', 'Monitor', 130, '{"group":"peripheral","requiredFor":["computer_full_set"],"allowMultiple":true}'::jsonb),
        ('product_revo_component_role', 'keyboard', 'Keyboard', 140, '{"group":"peripheral","requiredFor":["computer_full_set"]}'::jsonb),
        ('product_revo_component_role', 'mouse', 'Mouse', 150, '{"group":"peripheral","requiredFor":["computer_full_set"]}'::jsonb),
        ('product_revo_component_role', 'speakers', 'Speakers / Headset', 160, '{"group":"peripheral","optional":true}'::jsonb),
        ('product_revo_component_role', 'ups', 'UPS', 170, '{"group":"peripheral","optional":true}'::jsonb)
)
INSERT INTO picklist_values (
    definition_id,
    code,
    label,
    value,
    sort_order,
    is_system_value,
    metadata_json
)
SELECT
    definition.id,
    seed.code,
    seed.label,
    seed.code,
    seed.sort_order,
    FALSE,
    seed.metadata_json
FROM value_seed seed
JOIN picklist_definitions definition
  ON definition.code = seed.definition_code
ON CONFLICT (definition_id, code) DO UPDATE SET
    metadata_json = picklist_values.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

UPDATE picklist_values value
SET metadata_json =
      (value.metadata_json - 'requiredFor')
      || CASE
          WHEN value.code = 'system_unit'
            THEN '{"requiredWhen":[{"packageType":"computer_full_set","buildType":"oem_prebuilt"}]}'::jsonb
          WHEN value.code IN (
            'chassis',
            'motherboard',
            'processor',
            'cpu_cooler',
            'ram',
            'storage',
            'power_supply'
          )
            THEN '{"requiredWhen":[{"buildType":"custom_assembled"}]}'::jsonb
          WHEN value.code IN ('monitor', 'keyboard', 'mouse')
            THEN '{"requiredWhen":[{"packageType":"computer_full_set"}]}'::jsonb
          ELSE '{}'::jsonb
        END,
    updated_at = NOW()
FROM picklist_definitions definition
WHERE definition.id = value.definition_id
  AND definition.code = 'product_revo_component_role';

UPDATE picklist_values value
SET metadata_json = value.metadata_json || '{"dimension":"package_type"}'::jsonb,
    updated_at = NOW()
FROM picklist_definitions definition
WHERE definition.id = value.definition_id
  AND definition.code = 'product_revo_product_type'
  AND value.code IN ('computer_full_set', 'single_computer');

UPDATE picklist_values value
SET metadata_json = value.metadata_json || CASE value.code
        WHEN 'new' THEN '{"pucSuffix":"nw"}'::jsonb
        WHEN 'used' THEN '{"pucSuffix":"ud"}'::jsonb
        WHEN 'refurbished' THEN '{"pucSuffix":"re"}'::jsonb
        ELSE '{}'::jsonb
    END,
    updated_at = NOW()
FROM picklist_definitions definition
WHERE definition.id = value.definition_id
  AND definition.code = 'product_revo_category';

UPDATE picklist_values value
SET metadata_json = value.metadata_json || CASE value.code
        WHEN 'laptop' THEN '{"pucPrefix":"la"}'::jsonb
        WHEN 'mobile_phone' THEN '{"pucPrefix":"mp"}'::jsonb
        WHEN 'accessories' THEN '{"pucPrefix":"ac"}'::jsonb
        WHEN 'computer' THEN '{"pucPrefix":"co"}'::jsonb
        WHEN 'spares' THEN '{"pucPrefix":"sp"}'::jsonb
        ELSE '{}'::jsonb
    END,
    updated_at = NOW()
FROM picklist_definitions definition
WHERE definition.id = value.definition_id
  AND definition.code = 'product_revo_subcategory';

CREATE OR REPLACE FUNCTION public.set_puc()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    category_suffix TEXT;
    subcategory_prefix TEXT;
BEGIN
    IF NEW.puc IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(
        value.metadata_json ->> 'pucSuffix',
        LOWER(LEFT(REGEXP_REPLACE(value.value, '[^a-zA-Z0-9]', '', 'g'), 2))
    )
    INTO category_suffix
    FROM picklist_values value
    JOIN picklist_definitions definition ON definition.id = value.definition_id
    WHERE definition.code = 'product_revo_category'
      AND definition.is_active = TRUE
      AND value.is_active = TRUE
      AND LOWER(BTRIM(NEW.category)) IN (
          LOWER(BTRIM(value.code)),
          LOWER(BTRIM(value.value)),
          LOWER(BTRIM(value.label))
      )
    LIMIT 1;

    SELECT COALESCE(
        value.metadata_json ->> 'pucPrefix',
        LOWER(LEFT(REGEXP_REPLACE(value.value, '[^a-zA-Z0-9]', '', 'g'), 2))
    )
    INTO subcategory_prefix
    FROM picklist_values value
    JOIN picklist_definitions definition ON definition.id = value.definition_id
    WHERE definition.code = 'product_revo_subcategory'
      AND definition.is_active = TRUE
      AND value.is_active = TRUE
      AND LOWER(BTRIM(NEW.subcategory)) IN (
          LOWER(BTRIM(value.code)),
          LOWER(BTRIM(value.value)),
          LOWER(BTRIM(value.label))
      )
    LIMIT 1;

    IF category_suffix IS NULL OR BTRIM(category_suffix) = '' THEN
        RAISE EXCEPTION 'Invalid or inactive product category: %', NEW.category;
    END IF;
    IF subcategory_prefix IS NULL OR BTRIM(subcategory_prefix) = '' THEN
        RAISE EXCEPTION 'Invalid or inactive product subcategory: %', NEW.subcategory;
    END IF;

    NEW.puc := generate_puc(
        LOWER(LEFT(subcategory_prefix, 2)),
        LOWER(LEFT(category_suffix, 2))
    );
    RETURN NEW;
END;
$function$;

WITH mapping_seed (
    field_name,
    definition_code,
    is_required,
    metadata_json
) AS (
    VALUES
        ('producttype', 'product_revo_product_type', FALSE, '{"label":"Package Type","requiredWhen":{"subcategory":"computer"},"visibleWhen":{"subcategory":"computer"}}'::jsonb),
        ('buildtype', 'product_revo_build_type', FALSE, '{"requiredWhen":{"subcategory":"computer"},"visibleWhen":{"subcategory":"computer"}}'::jsonb),
        ('fulfillmenttype', 'product_revo_fulfillment_type', FALSE, '{"requiredWhen":{"subcategory":"computer"},"visibleWhen":{"subcategory":"computer"}}'::jsonb),
        ('sparetype', 'product_revo_component_role', FALSE, '{"requiredWhen":{"subcategory":"spares"},"visibleWhen":{"subcategory":"spares"}}'::jsonb)
)
INSERT INTO picklist_field_mappings (
    module_name,
    object_name,
    form_name,
    field_name,
    definition_id,
    is_required,
    metadata_json
)
SELECT
    'inventory',
    'product_revo',
    'product_create',
    seed.field_name,
    definition.id,
    seed.is_required,
    seed.metadata_json
FROM mapping_seed seed
JOIN picklist_definitions definition
  ON definition.code = seed.definition_code
ON CONFLICT (module_name, object_name, (COALESCE(form_name, '')), field_name) DO UPDATE SET
    definition_id = EXCLUDED.definition_id,
    metadata_json = picklist_field_mappings.metadata_json || EXCLUDED.metadata_json,
    is_active = TRUE,
    updated_at = NOW();

UPDATE picklist_field_mappings mapping
SET metadata_json =
      (mapping.metadata_json - 'plannedField' - 'requiresSchemaColumn')
      || '{"implemented":true}'::jsonb,
    updated_at = NOW()
WHERE mapping.object_name = 'product_revo'
  AND mapping.form_name = 'product_create'
  AND mapping.field_name = 'producttype';

WITH relation_seed (
    parent_definition_code,
    parent_code,
    child_definition_code,
    child_code
) AS (
    VALUES
        ('product_revo_subcategory', 'computer', 'product_revo_product_type', 'computer_full_set'),
        ('product_revo_subcategory', 'computer', 'product_revo_product_type', 'single_computer'),
        ('product_revo_product_type', 'computer_full_set', 'product_revo_build_type', 'oem_prebuilt'),
        ('product_revo_product_type', 'computer_full_set', 'product_revo_build_type', 'custom_assembled'),
        ('product_revo_product_type', 'single_computer', 'product_revo_build_type', 'oem_prebuilt'),
        ('product_revo_product_type', 'single_computer', 'product_revo_build_type', 'custom_assembled'),
        ('product_revo_build_type', 'oem_prebuilt', 'product_revo_fulfillment_type', 'prepacked'),
        ('product_revo_build_type', 'oem_prebuilt', 'product_revo_fulfillment_type', 'virtual_kit'),
        ('product_revo_build_type', 'custom_assembled', 'product_revo_fulfillment_type', 'assemble_to_stock'),
        ('product_revo_build_type', 'custom_assembled', 'product_revo_fulfillment_type', 'assemble_to_order')
)
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
    '{"source":"computer_configuration"}'::jsonb
FROM relation_seed seed
JOIN picklist_definitions parent_definition
  ON parent_definition.code = seed.parent_definition_code
JOIN picklist_values parent_value
  ON parent_value.definition_id = parent_definition.id
 AND parent_value.code = seed.parent_code
JOIN picklist_definitions child_definition
  ON child_definition.code = seed.child_definition_code
JOIN picklist_values child_value
  ON child_value.definition_id = child_definition.id
 AND child_value.code = seed.child_code
ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
    is_active = TRUE,
    metadata_json = picklist_value_relations.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

INSERT INTO picklist_value_relations (
    parent_value_id,
    child_value_id,
    relation_type,
    metadata_json
)
SELECT
    subcategory.id,
    component_role.id,
    'depends_on',
    '{"source":"computer_configuration","meaning":"Available as a spare classification"}'::jsonb
FROM picklist_definitions subcategory_definition
JOIN picklist_values subcategory
  ON subcategory.definition_id = subcategory_definition.id
 AND subcategory.code = 'spares'
CROSS JOIN picklist_definitions component_definition
JOIN picklist_values component_role
  ON component_role.definition_id = component_definition.id
WHERE subcategory_definition.code = 'product_revo_subcategory'
  AND component_definition.code = 'product_revo_component_role'
ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
    is_active = TRUE,
    metadata_json = picklist_value_relations.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();
