-- Optional structured source relation for manual Journal reclassification and correction.
-- This is Journal-only and does not introduce or mutate On Account Of data.

ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS journalpurpose VARCHAR(30) NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS relatedjournalentryid BIGINT
        REFERENCES journal_entries(id) ON DELETE RESTRICT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_journal_entry_purpose'
    ) THEN
        ALTER TABLE journal_entries
            ADD CONSTRAINT chk_journal_entry_purpose
            CHECK (journalpurpose IN (
                'general', 'accrual', 'reclassification', 'correction'
            ));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_related_entry
    ON journal_entries (organizationid, relatedjournalentryid)
    WHERE relatedjournalentryid IS NOT NULL;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260818_journal_related_accounting_entry_v1',
    'Optional posted accounting-entry relation for Journal reclassification and correction'
)
ON CONFLICT (version) DO NOTHING;
