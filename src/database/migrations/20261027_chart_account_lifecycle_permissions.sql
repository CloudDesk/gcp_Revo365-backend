-- Enable Chart of Accounts maintenance actions for finance-management roles.
-- The API continues to reject lifecycle changes to protected system accounts.

UPDATE permissions p
SET permissionset = (
    SELECT jsonb_agg(
        CASE
            WHEN item->>'objectAPI' = 'chart_of_accounts' THEN
                jsonb_set(
                    jsonb_set(
                        item,
                        '{permissions,edit}',
                        'true'::jsonb,
                        TRUE
                    ),
                    '{permissions,delete}',
                    'true'::jsonb,
                    TRUE
                )
            ELSE item
        END
    )
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
)
WHERE LOWER(TRIM(p.role)) IN ('admin', 'accountant')
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
      WHERE item->>'objectAPI' = 'chart_of_accounts'
  );

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20261027_chart_account_lifecycle_permissions',
    'Enable Chart of Accounts edit, activate, deactivate, and delete actions for finance roles'
)
ON CONFLICT (version) DO NOTHING;
