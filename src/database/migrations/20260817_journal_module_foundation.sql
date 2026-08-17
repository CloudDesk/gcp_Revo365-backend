-- Phase 4 Journal module foundation.
-- Keep this migration additive and idempotent because the migration runner
-- executes every SQL migration on every invocation.

ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS modifiedby VARCHAR(255),
    ADD COLUMN IF NOT EXISTS modifieddate BIGINT,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- A manual Journal has no separate source business record. Existing source
-- workflows continue to populate sourceid; manual_journal rows use NULL.
ALTER TABLE journal_entries
    ALTER COLUMN sourceid DROP NOT NULL;

ALTER TABLE journal_lines
    ADD COLUMN IF NOT EXISTS lineorder INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_source_status
    ON journal_entries (organizationid, sourcetype, status, entrydate DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_order
    ON journal_lines (journalentryid, lineorder, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_single_reversal
    ON journal_entries (reversalofid)
    WHERE reversalofid IS NOT NULL;

-- Journal is a dedicated permission resource. Admin and Accountant receive
-- the base read/create/edit actions; delete remains intentionally unavailable.
UPDATE permissions p
SET permissionset = COALESCE(p.permissionset, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
        'object', 'Journals',
        'objectAPI', 'journal',
        'permissions', jsonb_build_object(
            'read', LOWER(p.role) IN ('admin', 'accountant'),
            'create', LOWER(p.role) IN ('admin', 'accountant'),
            'edit', LOWER(p.role) IN ('admin', 'accountant'),
            'delete', FALSE
        )
    )
)
WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
    WHERE item->>'objectAPI' = 'journal'
);

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260817_journal_module_foundation_v1',
    'Manual Journal drafts, line ordering, reversal constraint, and Journal permissions'
)
ON CONFLICT (version) DO NOTHING;
