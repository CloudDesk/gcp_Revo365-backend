-- Enable Chart of Accounts rename for finance roles that manage accounts.

UPDATE permissions p
SET permissionset = (
    SELECT jsonb_agg(
        CASE
            WHEN item->>'objectAPI' = 'chart_of_accounts' THEN
                jsonb_set(
                    item,
                    '{permissions,edit}',
                    to_jsonb(LOWER(TRIM(p.role)) IN ('admin', 'accountant')),
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
    '20261013_chart_account_edit_permission',
    'Enable Chart of Accounts rename permission for finance roles'
)
ON CONFLICT (version) DO NOTHING;
