-- Issue 1: SAC configuration for service cost estimation.
-- Product family determines the SAC code; service users must not enter it manually.
-- Safe to run multiple times.

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
VALUES (
    'sac',
    'SAC',
    'inventory',
    'product_revo',
    'Service Accounting Codes (SAC) used for service classification under GST.',
    TRUE,
    FALSE,
    '{"purpose":"service_invoice_auto_fill","source":"issue_1"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    module_scope = EXCLUDED.module_scope,
    object_scope = EXCLUDED.object_scope,
    description = EXCLUDED.description,
    is_system_controlled = EXCLUDED.is_system_controlled,
    allow_user_values = EXCLUDED.allow_user_values,
    metadata_json = picklist_definitions.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH sac_values (code, label, value, description, sort_order) AS (
    VALUES
        ('998713', '998713', '998713', 'Maintenance and repair services of computers and peripherals', 10),
        ('998716', '998716', '998716', 'Maintenance and repair services of telecommunication equipment and apparatus', 20),
        ('998729', '998729', '998729', 'Maintenance and repair services of other goods n.e.c.', 30)
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
    metadata_json
)
SELECT
    definition.id,
    value_seed.code,
    value_seed.label,
    value_seed.value,
    value_seed.description,
    value_seed.sort_order,
    TRUE,
    TRUE,
    '{"purpose":"service_invoice_auto_fill","source":"issue_1"}'::jsonb
FROM sac_values value_seed
JOIN picklist_definitions definition ON definition.code = 'sac'
ON CONFLICT (definition_id, code) DO UPDATE SET
    label = EXCLUDED.label,
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    is_system_value = TRUE,
    metadata_json = picklist_values.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

INSERT INTO picklist_field_mappings (
    module_name,
    object_name,
    form_name,
    field_name,
    definition_id,
    is_required,
    is_active,
    metadata_json
)
SELECT
    'service',
    'servicecostestimation',
    'service_cost_estimation',
    'saccode',
    definition.id,
    TRUE,
    TRUE,
    '{"readOnly":true,"resolvedFrom":"service_request.productid -> product_revo.subcategory","source":"issue_1"}'::jsonb
FROM picklist_definitions definition
WHERE definition.code = 'sac'
ON CONFLICT (module_name, object_name, (COALESCE(form_name, '')), field_name) DO UPDATE SET
    definition_id = EXCLUDED.definition_id,
    is_required = EXCLUDED.is_required,
    is_active = EXCLUDED.is_active,
    metadata_json = picklist_field_mappings.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH family_to_sac (product_family_code, sac_code) AS (
    VALUES
        ('laptop', '998713'),
        ('computer', '998713'),
        ('mobile_phone', '998716'),
        ('accessories', '998729'),
        ('spares', '998729')
)
INSERT INTO picklist_value_relations (
    parent_value_id,
    child_value_id,
    relation_type,
    is_active,
    metadata_json
)
SELECT
    product_family.id,
    sac.id,
    'auto_sac_for_service',
    TRUE,
    '{"source":"issue_1","usedBy":"service_cost_estimation"}'::jsonb
FROM family_to_sac mapping
JOIN picklist_definitions product_family_definition
    ON product_family_definition.code = 'product_revo_subcategory'
JOIN picklist_values product_family
    ON product_family.definition_id = product_family_definition.id
   AND product_family.code = mapping.product_family_code
JOIN picklist_definitions sac_definition ON sac_definition.code = 'sac'
JOIN picklist_values sac
    ON sac.definition_id = sac_definition.id
   AND sac.code = mapping.sac_code
ON CONFLICT (parent_value_id, child_value_id, relation_type) DO UPDATE SET
    is_active = TRUE,
    metadata_json = picklist_value_relations.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

-- Issue 8: retain the selected customer shipping address for service invoices.
-- The snapshot protects issued invoices from later customer-address edits.
ALTER TABLE servicecostestimation
    ADD COLUMN IF NOT EXISTS shippingaddressid BIGINT,
    ADD COLUMN IF NOT EXISTS shippingaddresssnapshot JSONB,
    ADD COLUMN IF NOT EXISTS billingaddresssnapshot JSONB;

-- Issue 9: retain the statutory tax split on purchase-order bills.
ALTER TABLE poinvoice
    ADD COLUMN IF NOT EXISTS igst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taxmode VARCHAR(20) NOT NULL DEFAULT 'cgst_sgst';

-- Purchase Order tax mode is retained so the Bill screen can consistently
-- apply IGST for interstate suppliers.
ALTER TABLE purchaseorder
    ADD COLUMN IF NOT EXISTS igst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taxmode VARCHAR(20) NOT NULL DEFAULT 'cgst_sgst';

-- Issue 10: service estimate/invoice final-total rounding.
ALTER TABLE servicecostestimation
    ADD COLUMN IF NOT EXISTS roundoffamount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Issue 1 correction: Service Cost Estimation uses one fixed SAC code.
-- This is scoped to the SAC values introduced for service estimation; product
-- HSN codes and rental SAC values are not changed.
UPDATE picklist_values
SET
    is_active = TRUE,
    is_system_value = TRUE,
    updated_at = NOW()
WHERE definition_id = (SELECT id FROM picklist_definitions WHERE code = 'sac')
  AND code = '998713';

UPDATE picklist_values
SET
    is_active = FALSE,
    updated_at = NOW()
WHERE definition_id = (SELECT id FROM picklist_definitions WHERE code = 'sac')
  AND code IN ('998716', '998729');

UPDATE picklist_value_relations
SET
    is_active = FALSE,
    updated_at = NOW()
WHERE relation_type = 'auto_sac_for_service';

UPDATE picklist_field_mappings mapping
SET
    metadata_json = COALESCE(mapping.metadata_json, '{}'::jsonb)
        || '{"readOnly":true,"fixedValue":"998713","source":"issue_1_single_service_sac"}'::jsonb,
    updated_at = NOW()
FROM picklist_definitions definition
WHERE mapping.definition_id = definition.id
  AND definition.code = 'sac'
  AND mapping.module_name = 'service'
  AND mapping.object_name = 'servicecostestimation'
  AND mapping.field_name = 'saccode';

-- Issue 14: a Supporting Document belongs only to the final consolidated
-- invoice. Intermediate rental billing records do not receive document URLs.
ALTER TABLE consolidated_invoices
    ADD COLUMN IF NOT EXISTS supportingdocumentnumber VARCHAR(500),
    ADD COLUMN IF NOT EXISTS supportingdocumenturl TEXT;

CREATE INDEX IF NOT EXISTS idx_consolidated_invoices_supporting_document
    ON consolidated_invoices (supportingdocumentnumber)
    WHERE supportingdocumentnumber IS NOT NULL;
