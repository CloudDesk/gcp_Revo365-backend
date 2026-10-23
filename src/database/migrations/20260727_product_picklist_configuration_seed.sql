WITH legacy_picklists (
    label,
    value,
    object,
    controlledvalue,
    fieldname,
    controlledlabel,
    controlledfieldname,
    parent
) AS (
    VALUES
        ('New', 'new', 'product_revo', NULL, 'category', NULL, NULL, NULL),
        ('Used', 'used', 'product_revo', NULL, 'category', NULL, NULL, NULL),
        ('Refurbished', 'refurbished', 'product_revo', NULL, 'category', NULL, NULL, NULL),
        ('Laptop', 'laptop', 'product_revo', NULL, 'subcategory', NULL, NULL, NULL),
        ('Mobile Phone', 'mobile_phone', 'product_revo', NULL, 'subcategory', NULL, NULL, NULL),
        ('Accessories', 'accessories', 'product_revo', NULL, 'subcategory', NULL, NULL, NULL),
        ('Computer', 'computer', 'product_revo', NULL, 'subcategory', NULL, NULL, NULL),
        ('Spares', 'spares', 'product_revo', NULL, 'subcategory', NULL, NULL, NULL),
        ('Laptop', 'laptop', 'product_revo', NULL, 'accessoriesfor', NULL, NULL, NULL),
        ('Mobile Phone', 'mobile_phone', 'product_revo', NULL, 'accessoriesfor', NULL, NULL, NULL),
        ('Computer', 'computer', 'product_revo', NULL, 'accessoriesfor', NULL, NULL, NULL),
        ('Mouse', 'mouse', 'product_revo', 'laptop', 'laptopaccessories', 'Laptop', 'accessoriesfor', 'Laptop'),
        ('Keyboard', 'keyboard', 'product_revo', 'laptop', 'laptopaccessories', 'Laptop', 'accessoriesfor', 'Laptop'),
        ('External Monitor', 'external_monitor', 'product_revo', 'laptop', 'laptopaccessories', 'Laptop', 'accessoriesfor', 'Laptop'),
        ('Headset', 'headset', 'product_revo', 'laptop', 'laptopaccessories', 'Laptop', 'accessoriesfor', 'Laptop'),
        ('Laptop Charger Cable', 'laptop_charger_cable', 'product_revo', 'laptop', 'laptopaccessories', 'Laptop', 'accessoriesfor', 'Laptop'),
        ('Headphones', 'headphones', 'product_revo', 'mobile_phone', 'mobileaccessories', 'Mobile Phone', 'accessoriesfor', 'Mobile Phone'),
        ('Charger Adapter', 'charger_adapter', 'product_revo', 'mobile_phone', 'mobileaccessories', 'Mobile Phone', 'accessoriesfor', 'Mobile Phone'),
        ('Charger Cable', 'charger_cable', 'product_revo', 'mobile_phone', 'mobileaccessories', 'Mobile Phone', 'accessoriesfor', 'Mobile Phone'),
        ('Screen Protector', 'screen_protector', 'product_revo', 'mobile_phone', 'mobileaccessories', 'Mobile Phone', 'accessoriesfor', 'Mobile Phone')
)
INSERT INTO picklist (
    label,
    value,
    object,
    controlledvalue,
    fieldname,
    controlledlabel,
    controlledfieldname,
    parent
)
SELECT
    lp.label,
    lp.value,
    lp.object,
    lp.controlledvalue,
    lp.fieldname,
    lp.controlledlabel,
    lp.controlledfieldname,
    lp.parent
FROM legacy_picklists lp
WHERE NOT EXISTS (
    SELECT 1
    FROM picklist p
    WHERE p.object = lp.object
      AND p.fieldname = lp.fieldname
      AND p.value = lp.value
);

WITH definition_seed (
    code,
    name,
    module_scope,
    object_scope,
    description,
    is_system_controlled,
    allow_user_values,
    metadata_json
) AS (
    VALUES
        ('product_revo_category', 'Product Category', 'inventory', 'product_revo', 'Commercial product classification such as New, Used, or Refurbished.', FALSE, FALSE, '{"fieldPurpose":"classification","legacyFieldName":"category"}'::jsonb),
        ('product_revo_subcategory', 'Product Sub-Category', 'inventory', 'product_revo', 'Primary product family used by product creation, stock, sales, rentals, procurement, and reports.', FALSE, FALSE, '{"fieldPurpose":"product_family","legacyFieldName":"subcategory"}'::jsonb),
        ('product_revo_product_type', 'Product Type', 'inventory', 'product_revo', 'Configurable type/build below product family, for example Computer Full Set or Single Computer.', FALSE, TRUE, '{"fieldPurpose":"build_or_type","plannedFieldName":"producttype"}'::jsonb),
        ('product_revo_accessories_for', 'Accessories For', 'inventory', 'product_revo', 'Parent product family that an accessory belongs to.', FALSE, FALSE, '{"fieldPurpose":"accessory_parent","legacyFieldName":"accessoriesfor"}'::jsonb),
        ('product_revo_accessory_type', 'Accessory Type', 'inventory', 'product_revo', 'Reusable accessory/spare type list for laptop, mobile, and computer accessories.', FALSE, TRUE, '{"fieldPurpose":"accessory_type","legacyFields":["laptopaccessories","mobileaccessories","accessoriestype"]}'::jsonb)
)
INSERT INTO picklist_definitions (
    code,
    name,
    module_scope,
    object_scope,
    description,
    is_system_controlled,
    allow_user_values,
    metadata_json
)
SELECT
    code,
    name,
    module_scope,
    object_scope,
    description,
    is_system_controlled,
    allow_user_values,
    metadata_json
FROM definition_seed
ON CONFLICT (code) DO UPDATE SET
    metadata_json = picklist_definitions.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH value_seed (
    definition_code,
    code,
    label,
    value,
    sort_order,
    is_system_value,
    metadata_json
) AS (
    VALUES
        ('product_revo_category', 'new', 'New', 'new', 10, FALSE, '{}'::jsonb),
        ('product_revo_category', 'used', 'Used', 'used', 20, FALSE, '{}'::jsonb),
        ('product_revo_category', 'refurbished', 'Refurbished', 'refurbished', 30, FALSE, '{}'::jsonb),
        ('product_revo_subcategory', 'laptop', 'Laptop', 'laptop', 10, FALSE, '{}'::jsonb),
        ('product_revo_subcategory', 'mobile_phone', 'Mobile Phone', 'mobile_phone', 20, FALSE, '{}'::jsonb),
        ('product_revo_subcategory', 'accessories', 'Accessories', 'accessories', 30, FALSE, '{}'::jsonb),
        ('product_revo_subcategory', 'computer', 'Computer', 'computer', 40, FALSE, '{"requiresFormSchema":true}'::jsonb),
        ('product_revo_subcategory', 'spares', 'Spares', 'spares', 50, FALSE, '{"requiresFormSchema":true}'::jsonb),
        ('product_revo_accessories_for', 'laptop', 'Laptop', 'laptop', 10, FALSE, '{}'::jsonb),
        ('product_revo_accessories_for', 'mobile_phone', 'Mobile Phone', 'mobile_phone', 20, FALSE, '{}'::jsonb),
        ('product_revo_accessories_for', 'computer', 'Computer', 'computer', 30, FALSE, '{"requiresFormSchema":true}'::jsonb),
        ('product_revo_accessory_type', 'mouse', 'Mouse', 'mouse', 10, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'keyboard', 'Keyboard', 'keyboard', 20, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'external_monitor', 'External Monitor', 'external_monitor', 30, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'headset', 'Headset', 'headset', 40, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'laptop_charger_cable', 'Laptop Charger Cable', 'laptop_charger_cable', 50, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'headphones', 'Headphones', 'headphones', 60, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'charger_adapter', 'Charger Adapter', 'charger_adapter', 70, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'charger_cable', 'Charger Cable', 'charger_cable', 80, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'screen_protector', 'Screen Protector', 'screen_protector', 90, FALSE, '{}'::jsonb),
        ('product_revo_accessory_type', 'mini_pc', 'Mini PC', 'mini_pc', 100, FALSE, '{"componentRole":"compute_unit"}'::jsonb),
        ('product_revo_product_type', 'computer_full_set', 'Computer (Full Set)', 'computer_full_set', 10, FALSE, '{"allowCustomBuild":true,"composition":"bundle"}'::jsonb),
        ('product_revo_product_type', 'single_computer', 'Single Computer', 'single_computer', 20, FALSE, '{"allowCustomBuild":true,"composition":"single"}'::jsonb)
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
    d.id,
    vs.code,
    vs.label,
    vs.value,
    vs.sort_order,
    vs.is_system_value,
    vs.metadata_json
FROM value_seed vs
JOIN picklist_definitions d ON d.code = vs.definition_code
ON CONFLICT (definition_id, code) DO UPDATE SET
    metadata_json = picklist_values.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH mapping_seed (
    module_name,
    object_name,
    form_name,
    field_name,
    definition_code,
    is_required,
    metadata_json
) AS (
    VALUES
        ('inventory', 'product_revo', 'product_create', 'category', 'product_revo_category', TRUE, '{"consumedBy":["Product chooser","Product form","Product filters","Stock filters","Imports","Reports"]}'::jsonb),
        ('inventory', 'product_revo', 'product_create', 'subcategory', 'product_revo_subcategory', TRUE, '{"consumedBy":["Product chooser","Product form","Product filters","Stock filters","Global search","Reports"]}'::jsonb),
        ('inventory', 'product_revo', 'product_create', 'accessoriesfor', 'product_revo_accessories_for', FALSE, '{"visibleWhen":{"subcategory":"accessories"}}'::jsonb),
        ('inventory', 'product_revo', 'product_create', 'accessoriestype', 'product_revo_accessory_type', FALSE, '{"visibleWhen":{"subcategory":"accessories"}}'::jsonb),
        ('inventory', 'product_revo', 'product_create', 'laptopaccessories', 'product_revo_accessory_type', FALSE, '{"legacyField":true,"visibleWhen":{"accessoriesfor":"laptop"}}'::jsonb),
        ('inventory', 'product_revo', 'product_create', 'mobileaccessories', 'product_revo_accessory_type', FALSE, '{"legacyField":true,"visibleWhen":{"accessoriesfor":"mobile_phone"}}'::jsonb),
        ('inventory', 'product_revo', 'product_create', 'producttype', 'product_revo_product_type', FALSE, '{"plannedField":true,"visibleWhen":{"subcategory":"computer"},"requiresSchemaColumn":true}'::jsonb)
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
    ms.module_name,
    ms.object_name,
    ms.form_name,
    ms.field_name,
    d.id,
    ms.is_required,
    ms.metadata_json
FROM mapping_seed ms
JOIN picklist_definitions d ON d.code = ms.definition_code
ON CONFLICT (module_name, object_name, (COALESCE(form_name, '')), field_name) DO UPDATE SET
    definition_id = CASE
        WHEN picklist_field_mappings.metadata_json ->> 'source' = 'legacy_picklist_backfill'
        THEN EXCLUDED.definition_id
        ELSE picklist_field_mappings.definition_id
    END,
    metadata_json = picklist_field_mappings.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH relation_seed (
    parent_definition_code,
    parent_code,
    child_definition_code,
    child_code,
    relation_type,
    metadata_json
) AS (
    VALUES
        ('product_revo_subcategory', 'computer', 'product_revo_product_type', 'computer_full_set', 'depends_on', '{"meaning":"Computer product type is available under Computer"}'::jsonb),
        ('product_revo_subcategory', 'computer', 'product_revo_product_type', 'single_computer', 'depends_on', '{"meaning":"Computer product type is available under Computer"}'::jsonb),
        ('product_revo_subcategory', 'spares', 'product_revo_accessory_type', 'external_monitor', 'depends_on', '{"meaning":"Spares can include monitor stock"}'::jsonb),
        ('product_revo_subcategory', 'spares', 'product_revo_accessory_type', 'mini_pc', 'depends_on', '{"meaning":"Spares can include mini PC stock"}'::jsonb),
        ('product_revo_subcategory', 'spares', 'product_revo_accessory_type', 'keyboard', 'depends_on', '{"meaning":"Spares can include keyboard stock"}'::jsonb),
        ('product_revo_subcategory', 'spares', 'product_revo_accessory_type', 'mouse', 'depends_on', '{"meaning":"Spares can include mouse stock"}'::jsonb),
        ('product_revo_accessories_for', 'laptop', 'product_revo_accessory_type', 'mouse', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'laptop', 'product_revo_accessory_type', 'keyboard', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'laptop', 'product_revo_accessory_type', 'external_monitor', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'laptop', 'product_revo_accessory_type', 'headset', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'laptop', 'product_revo_accessory_type', 'laptop_charger_cable', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'mobile_phone', 'product_revo_accessory_type', 'headphones', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'mobile_phone', 'product_revo_accessory_type', 'charger_adapter', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'mobile_phone', 'product_revo_accessory_type', 'charger_cable', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'mobile_phone', 'product_revo_accessory_type', 'screen_protector', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'computer', 'product_revo_accessory_type', 'external_monitor', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'computer', 'product_revo_accessory_type', 'mini_pc', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'computer', 'product_revo_accessory_type', 'keyboard', 'depends_on', '{}'::jsonb),
        ('product_revo_accessories_for', 'computer', 'product_revo_accessory_type', 'mouse', 'depends_on', '{}'::jsonb)
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
    rs.relation_type,
    rs.metadata_json
FROM relation_seed rs
JOIN picklist_definitions parent_definition
  ON parent_definition.code = rs.parent_definition_code
JOIN picklist_values parent_value
  ON parent_value.definition_id = parent_definition.id
 AND parent_value.code = rs.parent_code
JOIN picklist_definitions child_definition
  ON child_definition.code = rs.child_definition_code
JOIN picklist_values child_value
  ON child_value.definition_id = child_definition.id
 AND child_value.code = rs.child_code
ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
    metadata_json = picklist_value_relations.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH full_set AS (
    INSERT INTO product_bundle_templates (
        product_type_value_id,
        name,
        description,
        allow_custom_build,
        metadata_json
    )
    SELECT
        pv.id,
        'Computer Full Set',
        'Predefined computer set with two monitors, one mini PC, one keyboard, and one mouse.',
        TRUE,
        '{"source":"product_picklist_seed"}'::jsonb
    FROM picklist_definitions d
    JOIN picklist_values pv ON pv.definition_id = d.id
    WHERE d.code = 'product_revo_product_type'
      AND pv.code = 'computer_full_set'
    ON CONFLICT (product_type_value_id, name) DO UPDATE SET
        metadata_json = product_bundle_templates.metadata_json || EXCLUDED.metadata_json,
        updated_at = NOW()
    RETURNING id
),
bundle_items (
    component_code,
    component_label,
    quantity,
    sort_order
) AS (
    VALUES
        ('external_monitor', 'Monitor', 2, 10),
        ('mini_pc', 'Mini PC', 1, 20),
        ('keyboard', 'Keyboard', 1, 30),
        ('mouse', 'Mouse', 1, 40)
)
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
SELECT
    fs.id,
    component_definition.id,
    component_value.id,
    bi.component_label,
    bi.quantity,
    TRUE,
    bi.sort_order,
    '{"source":"product_picklist_seed"}'::jsonb
FROM full_set fs
CROSS JOIN bundle_items bi
JOIN picklist_definitions component_definition
  ON component_definition.code = 'product_revo_accessory_type'
JOIN picklist_values component_value
  ON component_value.definition_id = component_definition.id
 AND component_value.code = bi.component_code
WHERE NOT EXISTS (
    SELECT 1
    FROM product_bundle_template_items existing
    WHERE existing.bundle_template_id = fs.id
      AND existing.component_label = bi.component_label
);
