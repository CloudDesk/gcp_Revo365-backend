-- Reconcile live legacy values with centralized picklists without promoting
-- invalid historical data into selectable options.

-- Stock and ticket locations are the same business concept. Point every
-- consumer at the complete shared location master.
UPDATE picklist_field_mappings mapping
SET definition_id = shared_definition.id,
    metadata_json = mapping.metadata_json ||
        '{"reconciliation":"Use the shared application location master."}'::jsonb,
    updated_at = NOW()
FROM picklist_definitions shared_definition
WHERE shared_definition.code = 'product_revo_location'
  AND mapping.object_name IN ('stock_revo', 'tickets')
  AND mapping.field_name = 'location';

WITH duplicate_stock_location_mappings AS (
    SELECT
        mapping.id,
        ROW_NUMBER() OVER (
            PARTITION BY mapping.object_name, COALESCE(mapping.form_name, ''), mapping.field_name
            ORDER BY
                CASE WHEN mapping.module_name = 'inventory' THEN 0 ELSE 1 END,
                mapping.id
        ) AS row_priority
    FROM picklist_field_mappings mapping
    JOIN picklist_definitions definition
      ON definition.id = mapping.definition_id
    WHERE mapping.object_name = 'stock_revo'
      AND mapping.field_name = 'location'
      AND mapping.is_active = TRUE
      AND definition.code = 'product_revo_location'
)
UPDATE picklist_field_mappings mapping
SET is_active = FALSE,
    metadata_json = mapping.metadata_json ||
        '{"deprecated":true,"reason":"Duplicate stock location mapping."}'::jsonb,
    updated_at = NOW()
FROM duplicate_stock_location_mappings duplicate
WHERE mapping.id = duplicate.id
  AND duplicate.row_priority > 1;

UPDATE picklist_definitions
SET is_active = FALSE,
    metadata_json = metadata_json ||
        '{"deprecated":true,"replacedBy":"product_revo_location"}'::jsonb,
    updated_at = NOW()
WHERE code IN ('stock_revo_location', 'tickets_location');

UPDATE picklist_values value
SET legacy_values = (
        SELECT ARRAY(
            SELECT DISTINCT item
            FROM UNNEST(value.legacy_values || ARRAY['annasalai']::text[]) AS item
            WHERE COALESCE(TRIM(item), '') <> ''
        )
    ),
    metadata_json = value.metadata_json ||
        '{"source":"live_value_reconciliation"}'::jsonb,
    updated_at = NOW()
FROM picklist_definitions definition
WHERE value.definition_id = definition.id
  AND definition.code = 'product_revo_location'
  AND value.code = 'anna_salai';

-- Merge the richer legacy laptop/mobile accessory lists into one reusable
-- Accessory Type master.
WITH source_values AS (
    SELECT DISTINCT ON (value.code)
        value.code,
        value.label,
        value.value,
        value.description,
        value.sort_order,
        value.legacy_values,
        source_definition.code AS source_definition_code
    FROM picklist_values value
    JOIN picklist_definitions source_definition
      ON source_definition.id = value.definition_id
    WHERE source_definition.code IN (
        'product_revo_laptopaccessories',
        'product_revo_mobileaccessories'
    )
    ORDER BY value.code, value.sort_order, value.label
)
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
SELECT
    target_definition.id,
    source.code,
    source.label,
    source.value,
    source.description,
    source.sort_order,
    TRUE,
    FALSE,
    source.legacy_values,
    jsonb_build_object(
        'source', 'legacy_accessory_master_reconciliation',
        'sourceDefinition', source.source_definition_code
    )
FROM source_values source
CROSS JOIN picklist_definitions target_definition
WHERE target_definition.code = 'product_revo_accessory_type'
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

UPDATE picklist_field_mappings mapping
SET definition_id = target_definition.id,
    metadata_json = mapping.metadata_json ||
        '{"reconciliation":"Merged into the reusable Accessory Type master."}'::jsonb,
    updated_at = NOW()
FROM picklist_definitions target_definition
WHERE target_definition.code = 'product_revo_accessory_type'
  AND mapping.object_name = 'product_revo'
  AND mapping.field_name IN (
      'accessoriestype',
      'laptopaccessories',
      'mobileaccessories'
  );

UPDATE picklist_definitions
SET is_active = FALSE,
    metadata_json = metadata_json ||
        '{"deprecated":true,"replacedBy":"product_revo_accessory_type"}'::jsonb,
    updated_at = NOW()
WHERE code IN (
    'product_revo_laptopaccessories',
    'product_revo_mobileaccessories'
);

WITH accessory_parent_seed (
    parent_code,
    source_definition_code
) AS (
    VALUES
        ('laptop', 'product_revo_laptopaccessories'),
        ('mobile_phone', 'product_revo_mobileaccessories')
)
INSERT INTO picklist_value_relations (
    parent_value_id,
    child_value_id,
    relation_type,
    is_active,
    metadata_json
)
SELECT
    parent_value.id,
    target_value.id,
    'depends_on',
    TRUE,
    '{"source":"legacy_accessory_master_reconciliation"}'::jsonb
FROM accessory_parent_seed seed
JOIN picklist_definitions parent_definition
  ON parent_definition.code = 'product_revo_accessories_for'
JOIN picklist_values parent_value
  ON parent_value.definition_id = parent_definition.id
 AND parent_value.code = seed.parent_code
JOIN picklist_definitions source_definition
  ON source_definition.code = seed.source_definition_code
JOIN picklist_values source_value
  ON source_value.definition_id = source_definition.id
JOIN picklist_definitions target_definition
  ON target_definition.code = 'product_revo_accessory_type'
JOIN picklist_values target_value
  ON target_value.definition_id = target_definition.id
 AND target_value.code = source_value.code
ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
    metadata_json = picklist_value_relations.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

-- Add legitimate product values that exist in current business records.
WITH product_value_seed (
    definition_code,
    code,
    label,
    value,
    sort_order,
    is_active,
    legacy_values,
    metadata_json
) AS (
    VALUES
        ('product_revo_brand', 'logitech', 'Logitech', 'Logitech', 1000, TRUE, ARRAY['Logitech']::text[], '{}'::jsonb),
        ('product_revo_brand', 'zebronics', 'ZEBRONICS', 'ZEBRONICS', 1010, TRUE, ARRAY['ZEBRONICS','Zebronics']::text[], '{}'::jsonb),

        ('product_revo_accessoriesincluded', 'charging_adapter', 'Charging Adapter', 'charging_adapter', 1000, TRUE, ARRAY['charging_adapter']::text[], '{}'::jsonb),
        ('product_revo_accessoriesincluded', 'cooling_pad', 'Cooling Pad', 'cooling_pad', 1010, TRUE, ARRAY['cooling_pad']::text[], '{}'::jsonb),
        ('product_revo_accessoriesincluded', 'docking_station', 'Docking Station', 'docking_station', 1020, TRUE, ARRAY['docking_station']::text[], '{}'::jsonb),
        ('product_revo_accessoriesincluded', 'flash_drive', 'Flash Drive', 'flash_drive', 1030, TRUE, ARRAY['flash_drive']::text[], '{}'::jsonb),
        ('product_revo_accessoriesincluded', 'headset', 'Headset', 'headset', 1040, TRUE, ARRAY['headset']::text[], '{}'::jsonb),
        ('product_revo_accessoriesincluded', 'keyboard', 'Keyboard', 'keyboard', 1050, TRUE, ARRAY['keyboard']::text[], '{}'::jsonb),
        ('product_revo_accessoriesincluded', 'mouse', 'Mouse', 'mouse', 1060, TRUE, ARRAY['mouse']::text[], '{}'::jsonb),

        (
            'product_revo_keylayout',
            'rgb_legacy',
            'RGB (Historical - Invalid Layout)',
            'rgb',
            9990,
            FALSE,
            ARRAY['rgb']::text[],
            '{"dataQuality":"RGB belongs to backlight, not keyboard layout."}'::jsonb
        )
)
INSERT INTO picklist_values (
    definition_id,
    code,
    label,
    value,
    sort_order,
    is_active,
    is_system_value,
    legacy_values,
    metadata_json
)
SELECT
    definition.id,
    seed.code,
    seed.label,
    seed.value,
    seed.sort_order,
    seed.is_active,
    FALSE,
    seed.legacy_values,
    '{"source":"live_value_reconciliation"}'::jsonb || seed.metadata_json
FROM product_value_seed seed
JOIN picklist_definitions definition
  ON definition.code = seed.definition_code
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

-- Correct one unambiguous typo and retain the legitimate rental issue reason.
UPDATE tickets
SET issuetype = 'hardware',
    modifieddate = EXTRACT(EPOCH FROM NOW())::bigint
WHERE LOWER(TRIM(COALESCE(issuetype, ''))) = 'hardward';

WITH ticket_issue_seed (
    code,
    label,
    value,
    sort_order,
    legacy_values
) AS (
    VALUES
        (
            'no_longer_needed',
            'No Longer Needed',
            'no_longer_needed',
            1000,
            ARRAY['no_longer_needed']::text[]
        )
)
INSERT INTO picklist_values (
    definition_id,
    code,
    label,
    value,
    sort_order,
    is_active,
    is_system_value,
    legacy_values,
    metadata_json
)
SELECT
    definition.id,
    seed.code,
    seed.label,
    seed.value,
    seed.sort_order,
    TRUE,
    FALSE,
    seed.legacy_values,
    '{"source":"live_value_reconciliation"}'::jsonb
FROM ticket_issue_seed seed
JOIN picklist_definitions definition
  ON definition.code = 'tickets_issuetype'
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

-- Add valid cities as selectable values. Invalid historical city strings are
-- retained as inactive values so they remain auditable but are never offered.
WITH city_seed (
    code,
    label,
    value,
    sort_order,
    is_active,
    legacy_values,
    metadata_json
) AS (
    VALUES
        ('bengaluru', 'Bengaluru', 'bengaluru', 1000, TRUE, ARRAY['Bengaluru','Banglore']::text[], '{}'::jsonb),
        ('dindigul', 'Dindigul', 'dindigul', 1010, TRUE, ARRAY['Dindigul']::text[], '{}'::jsonb),
        ('hyderabad', 'Hyderabad', 'hyderabad', 1020, TRUE, ARRAY['Hyderabad']::text[], '{}'::jsonb),
        ('kanchipuram', 'Kanchipuram', 'kanchipuram', 1030, TRUE, ARRAY['Kanchipuram']::text[], '{}'::jsonb),
        ('pudukkottai', 'Pudukkottai', 'pudukkottai', 1040, TRUE, ARRAY['pudukkottai','Pudukkottai']::text[], '{}'::jsonb),

        ('legacy_kodihalli', 'Kodihalli (Historical Locality)', 'Kodihalli', 9900, FALSE, ARRAY['Kodihalli','Kodihalli ']::text[], '{"dataQuality":"Locality stored in the city field."}'::jsonb),
        ('legacy_200_tek_park_chennai', '200 Tek Park Chennai (Invalid Historical City)', '200 Tek Park Chennai', 9910, FALSE, ARRAY['200 Tek Park Chennai']::text[], '{"dataQuality":"Address text stored in the city field."}'::jsonb),
        ('legacy_12_nehru_cross_street', '12 Nehru Cross Street (Invalid Historical City)', '12 Nehru cross street', 9920, FALSE, ARRAY['12 Nehru cross street']::text[], '{"dataQuality":"Street stored in the city field."}'::jsonb),
        ('legacy_test_address', 'Test Address (Invalid Historical City)', 'Test Address', 9930, FALSE, ARRAY['Test Address']::text[], '{"dataQuality":"Test data stored in the city field."}'::jsonb),
        ('legacy_test_address_123', 'Test Address 123 (Invalid Historical City)', 'Test Address 123', 9940, FALSE, ARRAY['Test Address 123']::text[], '{"dataQuality":"Test data stored in the city field."}'::jsonb)
)
INSERT INTO picklist_values (
    definition_id,
    code,
    label,
    value,
    sort_order,
    is_active,
    is_system_value,
    legacy_values,
    metadata_json
)
SELECT
    definition.id,
    seed.code,
    seed.label,
    seed.value,
    seed.sort_order,
    seed.is_active,
    FALSE,
    seed.legacy_values,
    '{"source":"live_value_reconciliation"}'::jsonb || seed.metadata_json
FROM city_seed seed
JOIN picklist_definitions definition
  ON definition.code = 'address_city'
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

UPDATE picklist_values value
SET legacy_values = (
        SELECT ARRAY(
            SELECT DISTINCT item
            FROM UNNEST(
                value.legacy_values ||
                ARRAY['TamilNadu','Tamilnadu','tamilnadu']::text[]
            ) AS item
            WHERE COALESCE(TRIM(item), '') <> ''
        )
    ),
    metadata_json = value.metadata_json ||
        '{"source":"live_value_reconciliation"}'::jsonb,
    updated_at = NOW()
FROM picklist_definitions definition
WHERE value.definition_id = definition.id
  AND definition.code = 'address_state'
  AND value.code = 'tamil_nadu';

WITH city_relation_seed (
    state_code,
    city_code
) AS (
    VALUES
        ('tamil_nadu', 'chennai'),
        ('tamil_nadu', 'madurai'),
        ('tamil_nadu', 'tiruchirappalli'),
        ('tamil_nadu', 'dindigul'),
        ('tamil_nadu', 'kanchipuram'),
        ('tamil_nadu', 'pudukkottai'),
        ('karnataka', 'bengaluru'),
        ('telangana', 'hyderabad')
)
INSERT INTO picklist_value_relations (
    parent_value_id,
    child_value_id,
    relation_type,
    is_active,
    metadata_json
)
SELECT
    state_value.id,
    city_value.id,
    'depends_on',
    TRUE,
    '{"source":"live_value_reconciliation"}'::jsonb
FROM city_relation_seed seed
JOIN picklist_definitions state_definition
  ON state_definition.code = 'address_state'
JOIN picklist_values state_value
  ON state_value.definition_id = state_definition.id
 AND state_value.code = seed.state_code
JOIN picklist_definitions city_definition
  ON city_definition.code = 'address_city'
JOIN picklist_values city_value
  ON city_value.definition_id = city_definition.id
 AND city_value.code = seed.city_code
ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
    metadata_json = picklist_value_relations.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();
