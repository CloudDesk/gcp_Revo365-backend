-- Journal / On Account transfer contract hardening.
-- Additive and idempotent because the migration runner may execute this file
-- more than once across local, SIT, and production deployments.

DO $$
DECLARE
    movement_constraint TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid)
      INTO movement_constraint
      FROM pg_constraint
     WHERE conrelid = 'on_account_movements'::regclass
       AND conname = 'chk_on_account_movement_type';

    IF movement_constraint IS NULL
       OR movement_constraint NOT LIKE '%journal_transfer_out%'
       OR movement_constraint NOT LIKE '%journal_transfer_in%'
       OR movement_constraint NOT LIKE '%journal_transfer_reversal%' THEN
        ALTER TABLE on_account_movements
            DROP CONSTRAINT IF EXISTS chk_on_account_movement_type;

        ALTER TABLE on_account_movements
            ADD CONSTRAINT chk_on_account_movement_type
            CHECK (
                movementtype IN (
                    'legacy_opening',
                    'cash_bank_origin',
                    'document_allocation',
                    'reversal',
                    'correction',
                    'journal_transfer_out',
                    'journal_transfer_in',
                    'journal_transfer_reversal'
                )
            );
    END IF;
END $$;

ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS requestidempotencykey VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_transfer_request_idempotency
    ON journal_entries (organizationid, sourcetype, requestidempotencykey)
    WHERE requestidempotencykey IS NOT NULL
      AND sourcetype IN ('on_account_transfer', 'on_account_transfer_reversal');

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260825_journal_on_account_transfer_contract_v1',
    'Allow controlled transfer movements and persist Journal transfer request identity'
)
ON CONFLICT (version) DO NOTHING;
