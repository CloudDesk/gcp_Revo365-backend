-- Remaining user-selectable lists identified by the final frontend consumer audit.
-- Existing stored values are preserved exactly; workflow-sensitive definitions are locked.

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
        ('enquiry_status', 'Enquiry Status', 'service', 'enquiry', 'Shared lifecycle status for service and buyback enquiries.', FALSE, FALSE, '{"source":"final_consumer_audit","sharedBy":["buyback_enquiries","service_enquiries"]}'::jsonb),
        ('demandrequest_priority', 'Demand Request Priority', 'sales_procurement', 'demandrequest', 'Business priority assigned to demand requests.', FALSE, FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('store_quotations_quotationtype', 'Store Quotation Type', 'sales_procurement', 'store_quotations', 'System quotation type that controls sale and rental behavior.', TRUE, FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('store_quotations_status', 'Store Quotation Status', 'sales_procurement', 'store_quotations', 'System workflow status for store quotation versions and conversion.', TRUE, FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('tickets_tickettype', 'Ticket Type', 'service', 'tickets', 'System ticket type used to choose service-request workflows.', TRUE, FALSE, '{"source":"final_consumer_audit","codeSensitive":true}'::jsonb),
        ('tickets_productcategory', 'Ticket Product Category', 'service', 'tickets', 'Product category captured for manually created service tickets.', FALSE, FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('tickets_paymentmethod', 'Ticket Payment Method', 'service', 'tickets', 'Payment method captured for payment-related service tickets.', FALSE, FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('poinvoice_paymenttype', 'PO Invoice Payment Type', 'sales_procurement', 'poinvoice', 'Payment stage recorded within purchase-order invoice payment rows.', FALSE, FALSE, '{"source":"final_consumer_audit","nestedField":"paymentdata"}'::jsonb),
        ('poinvoice_paymentmethod', 'PO Invoice Payment Method', 'sales_procurement', 'poinvoice', 'Payment method recorded within purchase-order invoice payment rows.', FALSE, FALSE, '{"source":"final_consumer_audit","nestedField":"paymentdata"}'::jsonb),
        ('revoinvoice_paymentmethod', 'Invoice Payment Method', 'sales_procurement', 'revoinvoice', 'System payment method recorded by the invoice payment workflow.', TRUE, FALSE, '{"source":"final_consumer_audit","nestedField":"paymentdata","codeSensitive":true}'::jsonb),
        ('revoinvoice_productinvoicetype', 'Product Invoice Type', 'sales_procurement', 'revoinvoice', 'System classification used by product invoice filters.', TRUE, FALSE, '{"source":"final_consumer_audit","filterField":true}'::jsonb),
        ('revoinvoice_rentalinvoicetype', 'Rental Invoice Type', 'sales_procurement', 'revoinvoice', 'System classification used by rental invoice filters.', TRUE, FALSE, '{"source":"final_consumer_audit","filterField":true}'::jsonb),
        ('revoinvoice_serviceinvoicetype', 'Service Invoice Type', 'sales_procurement', 'revoinvoice', 'System classification used by service invoice filters.', TRUE, FALSE, '{"source":"final_consumer_audit","filterField":true}'::jsonb),
        ('instorepurchase_paymentmethod', 'Instore Payment Method', 'sales_procurement', 'instorepurchase', 'System payment method supported by the instore sale workflow.', TRUE, FALSE, '{"source":"final_consumer_audit","codeSensitive":true}'::jsonb),
        ('rating_status', 'Product Review Status', 'inventory', 'rating', 'System moderation status used by product review workflows.', TRUE, FALSE, '{"source":"final_consumer_audit","codeSensitive":true}'::jsonb),
        ('orderline_paymentmethod', 'Order Payment Method', 'sales_procurement', 'orderline', 'System payment method used by order and transaction workflows.', TRUE, FALSE, '{"source":"final_consumer_audit","codeSensitive":true}'::jsonb),
        ('orderline_refundreason', 'Refund Reason', 'sales_procurement', 'orderline', 'Reason selected when recording an order-line refund.', FALSE, FALSE, '{"source":"final_consumer_audit","workflow":"refund"}'::jsonb)
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
    legacy_values
) AS (
    VALUES
        ('enquiry_status', 'open', 'Open', 'Open', 10, FALSE, ARRAY['Open']::text[]),
        ('enquiry_status', 'contacted', 'Contacted', 'Contacted', 20, FALSE, ARRAY['Contacted']::text[]),
        ('enquiry_status', 'quoted', 'Quoted', 'Quoted', 30, FALSE, ARRAY['Quoted']::text[]),
        ('enquiry_status', 'converted', 'Converted', 'Converted', 40, FALSE, ARRAY['Converted']::text[]),
        ('enquiry_status', 'closed', 'Closed', 'Closed', 50, FALSE, ARRAY['Closed']::text[]),

        ('demandrequest_priority', 'low', 'Low', 'Low', 10, FALSE, ARRAY['Low']::text[]),
        ('demandrequest_priority', 'high', 'High', 'High', 20, FALSE, ARRAY['High']::text[]),
        ('demandrequest_priority', 'urgent', 'Urgent', 'Urgent', 30, FALSE, ARRAY['Urgent']::text[]),

        ('store_quotations_quotationtype', 'sale', 'Sale', 'sale', 10, TRUE, ARRAY['sale']::text[]),
        ('store_quotations_quotationtype', 'rental', 'Rental', 'rental', 20, TRUE, ARRAY['rental']::text[]),

        ('store_quotations_status', 'draft', 'Draft', 'draft', 10, TRUE, ARRAY['draft']::text[]),
        ('store_quotations_status', 'sent', 'Sent', 'sent', 20, TRUE, ARRAY['sent']::text[]),
        ('store_quotations_status', 'revised', 'Revised', 'revised', 30, TRUE, ARRAY['revised']::text[]),
        ('store_quotations_status', 'accepted', 'Accepted', 'accepted', 40, TRUE, ARRAY['accepted']::text[]),
        ('store_quotations_status', 'rejected', 'Rejected', 'rejected', 50, TRUE, ARRAY['rejected']::text[]),
        ('store_quotations_status', 'expired', 'Expired', 'expired', 60, TRUE, ARRAY['expired']::text[]),
        ('store_quotations_status', 'converted', 'Converted', 'converted', 70, TRUE, ARRAY['converted']::text[]),

        ('tickets_tickettype', 'payment_issue', 'Payment Issue', 'Payment Issue', 10, TRUE, ARRAY['Payment Issue']::text[]),
        ('tickets_tickettype', 'tracking_issue', 'Tracking Issue', 'Tracking Issue', 20, TRUE, ARRAY['Tracking Issue']::text[]),
        ('tickets_tickettype', 'product_issue', 'Product Issue', 'Product Issue', 30, TRUE, ARRAY['Product Issue']::text[]),
        ('tickets_tickettype', 'repair_purchased', 'Repair Purchased', 'Repair Purchased', 40, TRUE, ARRAY['Repair Purchased']::text[]),
        ('tickets_tickettype', 'repair_non_purchased', 'Repair Non Purchased', 'Repair Non Purchased', 50, TRUE, ARRAY['Repair Non Purchased']::text[]),
        ('tickets_tickettype', 'repair_rental', 'Repair Rental', 'Repair Rental', 60, TRUE, ARRAY['Repair Rental']::text[]),

        ('tickets_productcategory', 'laptop', 'Laptop', 'Laptop', 10, FALSE, ARRAY['Laptop']::text[]),
        ('tickets_productcategory', 'mobile', 'Mobile', 'Mobile', 20, FALSE, ARRAY['Mobile']::text[]),
        ('tickets_productcategory', 'accessory', 'Accessory', 'Accessory', 30, FALSE, ARRAY['Accessory']::text[]),

        ('tickets_paymentmethod', 'credit_debit_card', 'Credit / Debit Card', 'Credit / Debit Card', 10, FALSE, ARRAY['Credit / Debit Card']::text[]),
        ('tickets_paymentmethod', 'net_banking', 'Net Banking', 'Net Banking', 20, FALSE, ARRAY['Net Banking']::text[]),
        ('tickets_paymentmethod', 'bank_transfer', 'Bank Transfer (NEFT, IMPS)', 'Bank Transfer (NEFT, IMPS)', 30, FALSE, ARRAY['Bank Transfer (NEFT, IMPS)']::text[]),
        ('tickets_paymentmethod', 'upi', 'UPI', 'UPI', 40, FALSE, ARRAY['UPI']::text[]),

        ('poinvoice_paymenttype', 'part_advance', 'Part Advance', 'Part Advance', 10, FALSE, ARRAY['Part Advance']::text[]),
        ('poinvoice_paymenttype', 'full_advance', 'Full Advance', 'Full Advance', 20, FALSE, ARRAY['Full Advance']::text[]),
        ('poinvoice_paymenttype', 'part_payment', 'Part Payment', 'Part Payment', 30, FALSE, ARRAY['Part Payment']::text[]),
        ('poinvoice_paymenttype', 'full_payment', 'Full Payment', 'Full Payment', 40, FALSE, ARRAY['Full Payment']::text[]),

        ('poinvoice_paymentmethod', 'cash', 'Cash', 'cash', 10, FALSE, ARRAY['cash']::text[]),
        ('poinvoice_paymentmethod', 'cheque', 'Cheque', 'cheque', 20, FALSE, ARRAY['cheque']::text[]),
        ('poinvoice_paymentmethod', 'banktransfer', 'Bank Transfer', 'banktransfer', 30, FALSE, ARRAY['banktransfer']::text[]),

        ('revoinvoice_paymentmethod', 'cash', 'Cash', 'cash', 10, TRUE, ARRAY['cash']::text[]),
        ('revoinvoice_paymentmethod', 'upi', 'UPI', 'upi', 20, TRUE, ARRAY['upi']::text[]),
        ('revoinvoice_paymentmethod', 'card', 'Card', 'card', 30, TRUE, ARRAY['card']::text[]),
        ('revoinvoice_paymentmethod', 'bank_transfer', 'Bank Transfer', 'bank_transfer', 40, TRUE, ARRAY['bank_transfer']::text[]),
        ('revoinvoice_paymentmethod', 'cheque', 'Cheque', 'cheque', 50, TRUE, ARRAY['cheque']::text[]),

        ('revoinvoice_productinvoicetype', 'online', 'Online Invoice', 'online', 10, TRUE, ARRAY['online']::text[]),
        ('revoinvoice_productinvoicetype', 'storepurchase', 'Store Purchase Invoice', 'storepurchase', 20, TRUE, ARRAY['storepurchase']::text[]),

        ('revoinvoice_rentalinvoicetype', 'manual', 'Manual Rental', 'manual', 10, TRUE, ARRAY['manual']::text[]),
        ('revoinvoice_rentalinvoicetype', 'instore', 'Instore Rental', 'instore', 20, TRUE, ARRAY['instore']::text[]),

        ('revoinvoice_serviceinvoicetype', 'rentalservice', 'Rental Service Ticket', 'rentalservice', 10, TRUE, ARRAY['rentalservice']::text[]),
        ('revoinvoice_serviceinvoicetype', 'productservice', 'Product Service Ticket', 'productservice', 20, TRUE, ARRAY['productservice']::text[]),

        ('instorepurchase_paymentmethod', 'cash', 'Cash', 'Cash', 10, TRUE, ARRAY['Cash']::text[]),
        ('instorepurchase_paymentmethod', 'upi', 'UPI', 'UPI', 20, TRUE, ARRAY['UPI']::text[]),

        ('rating_status', 'visible', 'Visible', 'visible', 10, TRUE, ARRAY['visible']::text[]),
        ('rating_status', 'hidden', 'Hidden', 'hidden', 20, TRUE, ARRAY['hidden']::text[]),
        ('rating_status', 'flagged', 'Flagged', 'flagged', 30, TRUE, ARRAY['flagged']::text[]),

        ('orderline_paymentmethod', 'cash', 'Cash', 'Cash', 10, TRUE, ARRAY['Cash','cash']::text[]),
        ('orderline_paymentmethod', 'upi', 'UPI', 'UPI', 20, TRUE, ARRAY['UPI','upi']::text[]),
        ('orderline_paymentmethod', 'card', 'Card', 'card', 30, TRUE, ARRAY['card']::text[]),
        ('orderline_paymentmethod', 'bank_transfer', 'Bank Transfer', 'bank_transfer', 40, TRUE, ARRAY['bank_transfer']::text[]),
        ('orderline_paymentmethod', 'cheque', 'Cheque', 'cheque', 50, TRUE, ARRAY['cheque']::text[]),

        ('orderline_refundreason', 'cancelled_order', 'Cancelled Order', 'cancelled_order', 10, FALSE, ARRAY['cancelled_order']::text[]),
        ('orderline_refundreason', 'verified_return', 'Verified Return', 'verified_return', 20, FALSE, ARRAY['verified_return']::text[]),
        ('orderline_refundreason', 'damaged_return', 'Damaged Return', 'damaged_return', 30, FALSE, ARRAY['damaged_return']::text[]),
        ('orderline_refundreason', 'defective_return', 'Defective Return', 'defective_return', 40, FALSE, ARRAY['defective_return']::text[]),
        ('orderline_refundreason', 'price_adjustment', 'Price Adjustment', 'price_adjustment', 50, FALSE, ARRAY['price_adjustment']::text[]),
        ('orderline_refundreason', 'other', 'Other', 'other', 60, FALSE, ARRAY['other']::text[])
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
    value_seed.code,
    value_seed.label,
    value_seed.value,
    value_seed.sort_order,
    TRUE,
    value_seed.is_system_value,
    value_seed.legacy_values,
    '{"source":"final_consumer_audit"}'::jsonb
FROM value_seed
JOIN picklist_definitions definition
  ON definition.code = value_seed.definition_code
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
        ('service', 'buyback_enquiries', NULL, 'status', 'enquiry_status', FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('service', 'service_enquiries', NULL, 'status', 'enquiry_status', FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('sales_procurement', 'demandrequest', NULL, 'priority', 'demandrequest_priority', TRUE, '{"source":"final_consumer_audit"}'::jsonb),
        ('sales_procurement', 'store_quotations', NULL, 'quotationtype', 'store_quotations_quotationtype', TRUE, '{"source":"final_consumer_audit"}'::jsonb),
        ('sales_procurement', 'store_quotations', NULL, 'status', 'store_quotations_status', TRUE, '{"source":"final_consumer_audit"}'::jsonb),
        ('service', 'tickets', NULL, 'tickettype', 'tickets_tickettype', TRUE, '{"source":"final_consumer_audit"}'::jsonb),
        ('service', 'tickets', NULL, 'productcategory', 'tickets_productcategory', FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('service', 'tickets', NULL, 'paymentmethod', 'tickets_paymentmethod', FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('sales_procurement', 'poinvoice', NULL, 'paymenttype', 'poinvoice_paymenttype', FALSE, '{"source":"final_consumer_audit","nestedField":"paymentdata"}'::jsonb),
        ('sales_procurement', 'poinvoice', NULL, 'paymentmethod', 'poinvoice_paymentmethod', FALSE, '{"source":"final_consumer_audit","nestedField":"paymentdata"}'::jsonb),
        ('sales_procurement', 'revoinvoice', NULL, 'paymentmethod', 'revoinvoice_paymentmethod', FALSE, '{"source":"final_consumer_audit","nestedField":"paymentdata"}'::jsonb),
        ('sales_procurement', 'revoinvoice', 'filters', 'productinvoicetype', 'revoinvoice_productinvoicetype', FALSE, '{"source":"final_consumer_audit","filterField":true}'::jsonb),
        ('sales_procurement', 'revoinvoice', 'filters', 'rentalinvoicetype', 'revoinvoice_rentalinvoicetype', FALSE, '{"source":"final_consumer_audit","filterField":true}'::jsonb),
        ('sales_procurement', 'revoinvoice', 'filters', 'serviceinvoicetype', 'revoinvoice_serviceinvoicetype', FALSE, '{"source":"final_consumer_audit","filterField":true}'::jsonb),
        ('sales_procurement', 'instorepurchase', NULL, 'paymentmethod', 'instorepurchase_paymentmethod', TRUE, '{"source":"final_consumer_audit"}'::jsonb),
        ('inventory', 'rating', NULL, 'status', 'rating_status', TRUE, '{"source":"final_consumer_audit"}'::jsonb),
        ('sales_procurement', 'orderline', NULL, 'paymentmethod', 'orderline_paymentmethod', FALSE, '{"source":"final_consumer_audit"}'::jsonb),
        ('sales_procurement', 'orderline', NULL, 'refundreason', 'orderline_refundreason', FALSE, '{"source":"final_consumer_audit"}'::jsonb)
)
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
    mapping_seed.module_name,
    mapping_seed.object_name,
    mapping_seed.form_name,
    mapping_seed.field_name,
    definition.id,
    mapping_seed.is_required,
    TRUE,
    mapping_seed.metadata_json
FROM mapping_seed
JOIN picklist_definitions definition
  ON definition.code = mapping_seed.definition_code
ON CONFLICT (module_name, object_name, (COALESCE(form_name, '')), field_name) DO UPDATE SET
    metadata_json = picklist_field_mappings.metadata_json || EXCLUDED.metadata_json,
    updated_at = NOW();
