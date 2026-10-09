-- Run before deploying the separate finance screen permission checks.
-- Copy effective legacy access once; reruns preserve explicit grants and denials.
UPDATE permissions p
SET permissionset = COALESCE(p.permissionset, '[]'::jsonb) || (
    SELECT jsonb_agg(jsonb_build_object(
        'object', resource.label,
        'objectAPI', resource.api,
        'permissions', jsonb_build_object(
            'read', LOWER(TRIM(p.role)) IN ('admin', 'accountant') AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) old
                WHERE old->>'objectAPI' = 'cash_bank_account'
                  AND old->'permissions'->'read' = 'true'::jsonb
            ),
            'create', resource.can_create AND LOWER(TRIM(p.role)) IN ('admin', 'accountant') AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) old
                WHERE old->>'objectAPI' = 'cash_bank_account'
                  AND old->'permissions'->'create' = 'true'::jsonb
            ),
            'edit', false,
            'delete', false
        )
    ) ORDER BY resource.api)
    FROM (VALUES
        ('finance_transactions', 'Transactions', true),
        ('on_account', 'On Account', true),
        ('customer_statement', 'Customer Statement', false)
    ) AS resource(api, label, can_create)
    WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) existing
        WHERE existing->>'objectAPI' = resource.api
    )
)
WHERE EXISTS (
    SELECT 1 FROM (VALUES ('finance_transactions'), ('on_account'), ('customer_statement')) resource(api)
    WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) existing
        WHERE existing->>'objectAPI' = resource.api
    )
);
