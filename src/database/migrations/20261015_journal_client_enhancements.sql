-- Journal client enhancements: optional attachment metadata and draft deletion.
-- Additive and idempotent because every migration can be re-run safely.

ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS attachmenturl TEXT,
    ADD COLUMN IF NOT EXISTS attachmentname VARCHAR(500);

UPDATE permissions p
SET permissionset = (
    SELECT jsonb_agg(
        CASE
            WHEN item->>'objectAPI' = 'journal' THEN
                jsonb_set(
                    item,
                    '{permissions,delete}',
                    to_jsonb(LOWER(TRIM(p.role)) IN ('admin', 'accountant')),
                    TRUE
                )
            ELSE item
        END
    )
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
    WHERE item->>'objectAPI' = 'journal'
);

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20261015_journal_client_enhancements_v1',
    'Optional Journal attachments and controlled manual Draft deletion'
)
ON CONFLICT (version) DO NOTHING;
