-- Separate Chart of Accounts from Cash and Bank Account permissions.
-- Run against the application PostgreSQL database before deploying the new
-- access checks. Safe to rerun: existing Chart of Accounts settings are retained.
-- Preserve effective read/create access for Admin and Accountant on first run.
-- Edit/delete are unavailable in the current Chart of Accounts API.
UPDATE permissions p
SET permissionset = COALESCE(p.permissionset, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
        'object', 'Chart of Accounts',
        'objectAPI', 'chart_of_accounts',
        'permissions', jsonb_build_object(
            'read', LOWER(TRIM(p.role)) IN ('admin', 'accountant') AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
                WHERE item->>'objectAPI' = 'cash_bank_account'
                  AND item->'permissions'->'read' = 'true'::jsonb
            ),
            'create', LOWER(TRIM(p.role)) IN ('admin', 'accountant') AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
                WHERE item->>'objectAPI' = 'cash_bank_account'
                  AND item->'permissions'->'create' = 'true'::jsonb
            ),
            'edit', FALSE,
            'delete', FALSE
        )
    )
)
WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
    WHERE item->>'objectAPI' = 'chart_of_accounts'
);

-- Verify the separate permission after running this script:
-- SELECT role, item AS chart_of_accounts_permission
-- FROM permissions
-- CROSS JOIN LATERAL jsonb_array_elements(permissionset) item
-- WHERE item->>'objectAPI' = 'chart_of_accounts';
