-- Phase 4 Journal Post and Reverse lifecycle.
-- Additive and idempotent because the migration runner may execute this file
-- more than once.

UPDATE permissions p
SET permissionset = COALESCE(
    (
        SELECT jsonb_agg(
            CASE
                WHEN item.value->>'objectAPI' = 'journal' THEN
                    jsonb_set(
                        item.value,
                        '{permissions}',
                        COALESCE(item.value->'permissions', '{}'::jsonb)
                        || jsonb_build_object(
                            'read', LOWER(p.role) IN ('admin', 'accountant'),
                            'create', LOWER(p.role) IN ('admin', 'accountant'),
                            'edit', LOWER(p.role) IN ('admin', 'accountant'),
                            'post', LOWER(p.role) IN ('admin', 'accountant'),
                            'reverse', LOWER(p.role) IN ('admin', 'accountant'),
                            'transfer', LOWER(p.role) IN ('admin', 'accountant'),
                            'replace', LOWER(p.role) IN ('admin', 'accountant'),
                            'delete', FALSE
                        ),
                        TRUE
                    )
                ELSE item.value
            END
            ORDER BY item.ordinality
        )
        FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb))
             WITH ORDINALITY AS item(value, ordinality)
    ),
    '[]'::jsonb
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
    WHERE item->>'objectAPI' = 'journal'
);

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260818_journal_post_reverse_v1',
    'Manual Journal posting, linked reversal, and complete Admin/Accountant permissions'
)
ON CONFLICT (version) DO NOTHING;
