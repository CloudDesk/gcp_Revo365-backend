-- Corrections identified during the picklist consumer audit.
-- Keep this file idempotent: backend runs all SQL migrations on startup.

WITH corrected_definitions (
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
        ('stock_revo_stockstatus', 'Stock Status', 'inventory', 'stock_revo', 'System workflow status for physical stock availability and lifecycle.', TRUE, FALSE, '{"correction":"Include live stock workflow statuses."}'::jsonb),
        ('orderline_rentalcontractstatus', 'Rental Contract Status', 'sales_procurement', 'orderline', 'System workflow status for rental line contract lifecycle.', TRUE, FALSE, '{"correction":"Align with rental return, issue, replacement, and agreement lifecycle services."}'::jsonb),
        ('orderline_rentalassetstatus', 'Rental Asset Status', 'sales_procurement', 'orderline', 'System workflow status for rental asset lifecycle on order lines.', TRUE, FALSE, '{"correction":"Workflow controlled by rental services."}'::jsonb),
        ('rental_agreement_agreementstatus', 'Agreement Status', 'global', 'rental_agreement', 'System workflow status for rental agreements.', TRUE, FALSE, '{"correction":"Workflow controlled by rental agreement lifecycle."}'::jsonb),
        ('rental_agreement_asset_assetstatus', 'Asset Status', 'global', 'rental_agreement_asset', 'System workflow status for rental agreement assets.', TRUE, FALSE, '{"correction":"Workflow controlled by rental agreement lifecycle."}'::jsonb),
        ('rental_replacement_history_actionstatus', 'Action Status', 'global', 'rental_replacement_history', 'System workflow status for rental replacement history events.', TRUE, FALSE, '{"correction":"Workflow controlled by rental replacement services."}'::jsonb),
        ('rental_replacement_history_actiontype', 'Action Type', 'global', 'rental_replacement_history', 'System workflow action type for rental history events.', TRUE, FALSE, '{"correction":"Workflow controlled by rental replacement services."}'::jsonb),
        ('rental_penalty_invoice_link_penaltystatus', 'Penalty Status', 'global', 'rental_penalty_invoice_link', 'System workflow status for rental penalty invoice links.', TRUE, FALSE, '{"correction":"Workflow controlled by penalty invoice generation and payment."}'::jsonb),
        ('rental_penalty_invoice_link_penaltytype', 'Penalty Type', 'global', 'rental_penalty_invoice_link', 'System workflow type for rental penalty invoice links.', TRUE, FALSE, '{"correction":"Derived from rental asset lifecycle state."}'::jsonb),
        ('purchaseorder_po_status', 'PO Status', 'sales_procurement', 'purchaseorder', 'System workflow status for purchase orders.', TRUE, FALSE, '{"correction":"Workflow controlled by PO invoice/payment fulfillment."}'::jsonb),
        ('poinvoice_invoicestatus', 'Invoice Status', 'sales_procurement', 'poinvoice', 'System workflow status for purchase order bills.', TRUE, FALSE, '{"correction":"Workflow controlled by PO invoice payment logic."}'::jsonb),
        ('revoinvoice_invoicefor', 'Invoice For', 'sales_procurement', 'revoinvoice', 'System invoice type used by product, rental, service, and penalty invoice flows.', TRUE, FALSE, '{"correction":"Legacy picklist only had penalty; live invoices use product, rental, service, and penalty."}'::jsonb),
        ('revoinvoice_paymentstatus', 'Payment Status', 'sales_procurement', 'revoinvoice', 'System payment status calculated from invoice payment totals.', TRUE, FALSE, '{"fieldPurpose":"invoice_payment_filter","source":"revoinvoice.paymentstatus"}'::jsonb),
        ('inventoryusers_role', 'Role', 'users', 'inventoryusers', 'System/RBAC role for inventory users.', TRUE, FALSE, '{"correction":"Roles affect permissions and should not be ordinary picklist values."}'::jsonb),
        ('locationhistory_locationhistory', 'Location History', 'global', 'locationhistory', 'Legacy picklist retained for compatibility; current locationhistory table does not contain this field.', TRUE, FALSE, '{"correction":"Mark as legacy; prefer shared inventory_location for real location selection."}'::jsonb)
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
FROM corrected_definitions
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    module_scope = EXCLUDED.module_scope,
    object_scope = EXCLUDED.object_scope,
    description = EXCLUDED.description,
    is_system_controlled = EXCLUDED.is_system_controlled,
    allow_user_values = EXCLUDED.allow_user_values,
    metadata_json = picklist_definitions.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

WITH value_seed (
    definition_code,
    code,
    label,
    value,
    sort_order,
    is_system_value,
    legacy_values,
    metadata_json
) AS (
    VALUES
        ('stock_revo_stockstatus', 'available', 'Available', 'Available', 10, TRUE, ARRAY['available','Available']::text[], '{}'::jsonb),
        ('stock_revo_stockstatus', 'reserved_for_rental', 'Reserved for Rental', 'Reserved for Rental', 20, TRUE, ARRAY['Reserved for Rental']::text[], '{}'::jsonb),
        ('stock_revo_stockstatus', 'rental_sold', 'Rental Sold', 'Rental Sold', 30, TRUE, ARRAY['Rental Sold']::text[], '{}'::jsonb),
        ('stock_revo_stockstatus', 'service_hold', 'Service Hold', 'Service Hold', 40, TRUE, ARRAY['Service Hold']::text[], '{}'::jsonb),
        ('stock_revo_stockstatus', 'sold', 'Sold', 'Sold', 50, TRUE, ARRAY['sold','Sold']::text[], '{}'::jsonb),
        ('stock_revo_stockstatus', 'lost', 'Lost', 'Lost', 60, TRUE, ARRAY['Lost']::text[], '{}'::jsonb),
        ('stock_revo_stockstatus', 'damaged', 'Damaged', 'Damaged', 70, TRUE, ARRAY['Damaged']::text[], '{}'::jsonb),

        ('orderline_rentalcontractstatus', 'active', 'Active', 'active', 10, TRUE, ARRAY['active']::text[], '{}'::jsonb),
        ('orderline_rentalcontractstatus', 'completed', 'Completed', 'completed', 20, TRUE, ARRAY['completed']::text[], '{"source":"live_data_and_rental_return_service"}'::jsonb),
        ('orderline_rentalcontractstatus', 'terminated', 'Terminated', 'terminated', 30, TRUE, ARRAY['terminated']::text[], '{"source":"live_data_and_rental_issue_service"}'::jsonb),
        ('orderline_rentalcontractstatus', 'replaced', 'Replaced', 'replaced', 40, TRUE, ARRAY['replaced']::text[], '{}'::jsonb),
        ('orderline_rentalcontractstatus', 'stopped', 'Stopped', 'stopped', 50, TRUE, ARRAY['stopped']::text[], '{}'::jsonb),

        ('revoinvoice_invoicefor', 'product', 'Product', 'product', 10, TRUE, ARRAY['product']::text[], '{}'::jsonb),
        ('revoinvoice_invoicefor', 'rental', 'Rental', 'rental', 20, TRUE, ARRAY['rental']::text[], '{}'::jsonb),
        ('revoinvoice_invoicefor', 'service', 'Service', 'service', 30, TRUE, ARRAY['service']::text[], '{}'::jsonb),
        ('revoinvoice_invoicefor', 'penalty', 'Penalty', 'penalty', 40, TRUE, ARRAY['penalty']::text[], '{}'::jsonb),

        ('revoinvoice_paymentstatus', 'pending', 'Pending', 'pending', 10, TRUE, ARRAY['pending']::text[], '{}'::jsonb),
        ('revoinvoice_paymentstatus', 'partially_paid', 'Partially Paid', 'partially_paid', 20, TRUE, ARRAY['partially_paid']::text[], '{}'::jsonb),
        ('revoinvoice_paymentstatus', 'paid', 'Paid', 'paid', 30, TRUE, ARRAY['paid']::text[], '{}'::jsonb)
)
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
    d.id,
    vs.code,
    vs.label,
    vs.value,
    vs.sort_order,
    vs.is_system_value,
    vs.legacy_values,
    vs.metadata_json
FROM value_seed vs
JOIN picklist_definitions d ON d.code = vs.definition_code
ON CONFLICT (definition_id, code) DO UPDATE SET
    label = EXCLUDED.label,
    value = EXCLUDED.value,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    is_system_value = EXCLUDED.is_system_value,
    legacy_values = (
        SELECT ARRAY(
            SELECT DISTINCT item
            FROM UNNEST(picklist_values.legacy_values || EXCLUDED.legacy_values) AS item
            WHERE COALESCE(TRIM(item), '') <> ''
        )
    ),
    metadata_json = picklist_values.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();

UPDATE picklist_values pv
SET is_active = FALSE,
    metadata_json = pv.metadata_json || '{"deprecated":true,"replacedBy":["completed","terminated"],"reason":"Current rental workflows use completed/terminated instead of closed."}'::jsonb,
    updated_at = NOW()
FROM picklist_definitions pd
WHERE pv.definition_id = pd.id
  AND pd.code = 'orderline_rentalcontractstatus'
  AND pv.code = 'closed';

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
        ('inventory', 'product_revo', NULL, 'accessoriesfor', 'product_revo_accessories_for', FALSE, '{"correction":"Legacy field mapped to canonical Accessories For definition."}'::jsonb),
        ('inventory', 'stock_revo', NULL, 'location', 'product_revo_location', FALSE, '{"correction":"Stock UI historically consumes the full product_revo.location list, not the one-row stock_revo.location legacy list."}'::jsonb),
        ('inventory', 'stock_revo', NULL, 'stocktype', 'product_revo_stocktype', FALSE, '{"correction":"Stock UI historically consumes stock type from product_revo picklists."}'::jsonb),
        ('inventory', 'stock_revo', NULL, 'stockstatus', 'stock_revo_stockstatus', FALSE, '{"correction":"Expose full live stock workflow statuses."}'::jsonb),
        ('sales_procurement', 'orderline', NULL, 'rentalcontractstatus', 'orderline_rentalcontractstatus', FALSE, '{"correction":"Expose completed and terminated rental contract states."}'::jsonb),
        ('sales_procurement', 'revoinvoice', NULL, 'invoicefor', 'revoinvoice_invoicefor', FALSE, '{"correction":"Expose all live invoice types."}'::jsonb),
        ('sales_procurement', 'revoinvoice', NULL, 'paymentstatus', 'revoinvoice_paymentstatus', FALSE, '{"correction":"Expose calculated payment statuses for filtering/display."}'::jsonb),
        ('users', 'inventoryusers', NULL, 'role', 'inventoryusers_role', TRUE, '{"correction":"Role selection must follow RBAC-controlled values."}'::jsonb)
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
    definition_id = EXCLUDED.definition_id,
    is_required = EXCLUDED.is_required,
    is_active = TRUE,
    metadata_json = picklist_field_mappings.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();
