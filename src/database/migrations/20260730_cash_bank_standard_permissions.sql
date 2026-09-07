-- Standardize Cash and Bank Account permissions for the existing permission UI.
--
-- Admin and Accountant receive read/create/edit access.
-- All other roles remain denied. Delete is intentionally unavailable.

UPDATE permissions p
SET permissionset = (
    SELECT jsonb_agg(
        CASE
            WHEN permission_item->>'objectAPI' = 'cash_bank_account'
            THEN jsonb_set(
                permission_item,
                '{permissions}',
                jsonb_build_object(
                    'read', LOWER(p.role) IN ('accountant', 'admin'),
                    'create', LOWER(p.role) IN ('accountant', 'admin'),
                    'edit', LOWER(p.role) IN ('accountant', 'admin'),
                    'delete', FALSE
                ),
                TRUE
            )
            ELSE permission_item
        END
        ORDER BY item_order
    )
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb))
        WITH ORDINALITY AS permission_items(permission_item, item_order)
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb))
        AS permission_item
    WHERE permission_item->>'objectAPI' = 'cash_bank_account'
);

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260730_cash_bank_standard_permissions_v1',
    'Standard read/create/edit Cash and Bank permissions for Admin and Accountant'
)
ON CONFLICT (version) DO NOTHING;
