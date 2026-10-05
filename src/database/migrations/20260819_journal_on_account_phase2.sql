-- Phase 2: Journal–On Account Data and Service Contract Alignment.
-- This migration adds additive, idempotent schema support missing for transfer identity,
-- source/destination references, paired movement IDs, Journal/line links, transfer status,
-- replacement reference, reversal links.

ALTER TABLE on_account_references
    ADD COLUMN IF NOT EXISTS transferredfromreferenceid BIGINT
        REFERENCES on_account_references(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS replacementreferenceid BIGINT
        REFERENCES on_account_references(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS reversaljournalentryid BIGINT
        REFERENCES journal_entries(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_on_account_reference_transferredfrom
    ON on_account_references (transferredfromreferenceid)
    WHERE transferredfromreferenceid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_on_account_reference_replacement
    ON on_account_references (replacementreferenceid)
    WHERE replacementreferenceid IS NOT NULL;
    
CREATE INDEX IF NOT EXISTS idx_on_account_reference_reversal
    ON on_account_references (reversaljournalentryid)
    WHERE reversaljournalentryid IS NOT NULL;

-- Ensure that a reference cannot be both a bank-origin reference and a transferred reference simultaneously
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'chk_on_account_reference_source_exclusive'
    ) THEN
        ALTER TABLE on_account_references
            ADD CONSTRAINT chk_on_account_reference_source_exclusive
            CHECK (
                NOT (sourcebanktransactionid IS NOT NULL AND transferredfromreferenceid IS NOT NULL)
            );
    END IF;
END $$;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260819_journal_on_account_phase2_v1',
    'Add transfer links, replacement links, and reversal journal links to on_account_references'
)
ON CONFLICT (version) DO NOTHING;
