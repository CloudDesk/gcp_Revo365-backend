-- On Account Of Phase 1: base schema and legacy unapplied-amount migration.
--
-- This migration intentionally does not switch existing receipt/payment readers
-- or introduce end-user posting workflows. It creates an append-only foundation
-- alongside party_unapplied_amounts so later phases can be released safely.

CREATE TABLE IF NOT EXISTS on_account_reference_counters (
    organizationid BIGINT NOT NULL,
    partytype VARCHAR(20) NOT NULL,
    lastnumber BIGINT NOT NULL DEFAULT 0,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    PRIMARY KEY (organizationid, partytype),
    CONSTRAINT chk_on_account_counter_organization
        CHECK (organizationid > 0),
    CONSTRAINT chk_on_account_counter_party
        CHECK (partytype IN ('customer', 'supplier')),
    CONSTRAINT chk_on_account_counter_value
        CHECK (lastnumber >= 0)
);

CREATE TABLE IF NOT EXISTS on_account_references (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    referencenumber VARCHAR(30) NOT NULL,
    partytype VARCHAR(20) NOT NULL,
    partyid BIGINT NOT NULL,
    currencycode CHAR(3) NOT NULL DEFAULT 'INR',
    sourcetype VARCHAR(50) NOT NULL,
    sourceid VARCHAR(255),
    sourcebanktransactionid BIGINT
        REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    sourcejournalentryid BIGINT
        REFERENCES journal_entries(id) ON DELETE RESTRICT,
    legacyunappliedamountid BIGINT
        REFERENCES party_unapplied_amounts(id) ON DELETE RESTRICT,
    originalamount NUMERIC(18, 2) NOT NULL,
    usedamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    availableamount NUMERIC(18, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    version INTEGER NOT NULL DEFAULT 0,
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_on_account_reference_organization
        CHECK (organizationid > 0),
    CONSTRAINT chk_on_account_reference_party
        CHECK (partytype IN ('customer', 'supplier') AND partyid > 0),
    CONSTRAINT chk_on_account_reference_currency
        CHECK (currencycode = UPPER(currencycode)),
    CONSTRAINT chk_on_account_reference_source
        CHECK (LENGTH(TRIM(sourcetype)) > 0),
    CONSTRAINT chk_on_account_reference_amounts
        CHECK (
            originalamount > 0
            AND usedamount >= 0
            AND availableamount >= 0
            AND originalamount = usedamount + availableamount
        ),
    CONSTRAINT chk_on_account_reference_status
        CHECK (status IN ('open', 'partially_applied', 'fully_applied', 'reversed')),
    CONSTRAINT chk_on_account_reference_lifecycle
        CHECK (
            status = 'reversed'
            OR (status = 'open' AND usedamount = 0 AND availableamount = originalamount)
            OR (
                status = 'partially_applied'
                AND usedamount > 0
                AND availableamount > 0
            )
            OR (
                status = 'fully_applied'
                AND usedamount = originalamount
                AND availableamount = 0
            )
        ),
    CONSTRAINT chk_on_account_reference_version
        CHECK (version >= 0),
    CONSTRAINT uq_on_account_reference_number
        UNIQUE (organizationid, referencenumber),
    CONSTRAINT uq_on_account_reference_legacy
        UNIQUE (legacyunappliedamountid)
);

CREATE INDEX IF NOT EXISTS idx_on_account_reference_party
    ON on_account_references (
        organizationid,
        partytype,
        partyid,
        status,
        createddate DESC,
        id DESC
    );

CREATE INDEX IF NOT EXISTS idx_on_account_reference_source_bank
    ON on_account_references (sourcebanktransactionid)
    WHERE sourcebanktransactionid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_on_account_reference_source_journal
    ON on_account_references (sourcejournalentryid)
    WHERE sourcejournalentryid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_on_account_reference_search
    ON on_account_references (
        organizationid,
        LOWER(referencenumber),
        LOWER(sourcetype)
    );

CREATE TABLE IF NOT EXISTS on_account_movements (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL,
    onaccountreferenceid BIGINT NOT NULL
        REFERENCES on_account_references(id) ON DELETE RESTRICT,
    movementtype VARCHAR(40) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    banktransactionid BIGINT
        REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    journalentryid BIGINT
        REFERENCES journal_entries(id) ON DELETE RESTRICT,
    banktransactionallocationid BIGINT
        REFERENCES bank_transaction_allocations(id) ON DELETE RESTRICT,
    relatedmovementid BIGINT
        REFERENCES on_account_movements(id) ON DELETE RESTRICT,
    idempotencykey VARCHAR(150),
    idempotencysequence INTEGER NOT NULL DEFAULT 1,
    description VARCHAR(1000),
    createdby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_on_account_movement_organization
        CHECK (organizationid > 0),
    CONSTRAINT chk_on_account_movement_type
        CHECK (
            movementtype IN (
                'legacy_opening',
                'cash_bank_origin',
                'document_allocation',
                'reversal',
                'correction'
            )
        ),
    CONSTRAINT chk_on_account_movement_direction
        CHECK (direction IN ('increase', 'decrease')),
    CONSTRAINT chk_on_account_movement_amount
        CHECK (amount > 0),
    CONSTRAINT chk_on_account_movement_idempotency_sequence
        CHECK (idempotencysequence > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_on_account_movement_idempotency
    ON on_account_movements (
        organizationid,
        idempotencykey,
        idempotencysequence
    )
    WHERE idempotencykey IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_on_account_movement_reference
    ON on_account_movements (onaccountreferenceid, createddate, id);

CREATE INDEX IF NOT EXISTS idx_on_account_movement_bank_transaction
    ON on_account_movements (banktransactionid)
    WHERE banktransactionid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_on_account_movement_journal
    ON on_account_movements (journalentryid)
    WHERE journalentryid IS NOT NULL;

CREATE TABLE IF NOT EXISTS on_account_document_allocations (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL,
    onaccountreferenceid BIGINT NOT NULL
        REFERENCES on_account_references(id) ON DELETE RESTRICT,
    onaccountmovementid BIGINT NOT NULL
        REFERENCES on_account_movements(id) ON DELETE RESTRICT,
    banktransactionallocationid BIGINT
        REFERENCES bank_transaction_allocations(id) ON DELETE RESTRICT,
    documenttype VARCHAR(30) NOT NULL,
    documentid BIGINT NOT NULL,
    documentnumber VARCHAR(255),
    bankportion NUMERIC(18, 2) NOT NULL,
    tdsamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    totalsettlement NUMERIC(18, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'applied',
    idempotencykey VARCHAR(150),
    idempotencysequence INTEGER NOT NULL DEFAULT 1,
    createdby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_on_account_document_allocation_organization
        CHECK (organizationid > 0),
    CONSTRAINT chk_on_account_document_allocation_document
        CHECK (
            documenttype IN ('sales_invoice', 'purchase_bill')
            AND documentid > 0
        ),
    CONSTRAINT chk_on_account_document_allocation_amounts
        CHECK (
            bankportion > 0
            AND tdsamount >= 0
            AND totalsettlement = bankportion + tdsamount
        ),
    CONSTRAINT chk_on_account_document_allocation_status
        CHECK (status IN ('applied', 'reversed')),
    CONSTRAINT chk_on_account_document_allocation_idempotency_sequence
        CHECK (idempotencysequence > 0),
    CONSTRAINT uq_on_account_document_allocation_movement
        UNIQUE (onaccountmovementid)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_on_account_document_allocation_idempotency
    ON on_account_document_allocations (
        organizationid,
        idempotencykey,
        idempotencysequence
    )
    WHERE idempotencykey IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_on_account_document_allocation_reference
    ON on_account_document_allocations (
        onaccountreferenceid,
        status,
        createddate,
        id
    );

CREATE INDEX IF NOT EXISTS idx_on_account_document_allocation_document
    ON on_account_document_allocations (
        organizationid,
        documenttype,
        documentid,
        status
    );

-- Once inserted, a movement is an accounting fact. Corrections and reversals
-- must be represented by new movements rather than mutating posted history.
CREATE OR REPLACE FUNCTION prevent_on_account_movement_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Posted On Account movements cannot be updated or deleted.'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_on_account_movement_mutation
    ON on_account_movements;

CREATE TRIGGER trg_prevent_on_account_movement_mutation
BEFORE UPDATE OR DELETE ON on_account_movements
FOR EACH ROW EXECUTE FUNCTION prevent_on_account_movement_mutation();

-- A posted reference keeps its identity, owner, currency, and source. Only its
-- balance snapshots, lifecycle status, version, and modification audit can move.
CREATE OR REPLACE FUNCTION protect_on_account_reference_identity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.organizationid IS DISTINCT FROM OLD.organizationid
        OR NEW.referencenumber IS DISTINCT FROM OLD.referencenumber
        OR NEW.partytype IS DISTINCT FROM OLD.partytype
        OR NEW.partyid IS DISTINCT FROM OLD.partyid
        OR NEW.currencycode IS DISTINCT FROM OLD.currencycode
        OR NEW.sourcetype IS DISTINCT FROM OLD.sourcetype
        OR NEW.sourceid IS DISTINCT FROM OLD.sourceid
        OR NEW.sourcebanktransactionid IS DISTINCT FROM OLD.sourcebanktransactionid
        OR NEW.sourcejournalentryid IS DISTINCT FROM OLD.sourcejournalentryid
        OR NEW.legacyunappliedamountid IS DISTINCT FROM OLD.legacyunappliedamountid
        OR NEW.originalamount IS DISTINCT FROM OLD.originalamount
        OR NEW.createdby IS DISTINCT FROM OLD.createdby
        OR NEW.createddate IS DISTINCT FROM OLD.createddate
    THEN
        RAISE EXCEPTION 'Posted On Account reference identity cannot be changed.'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_on_account_reference_identity
    ON on_account_references;

CREATE TRIGGER trg_protect_on_account_reference_identity
BEFORE UPDATE ON on_account_references
FOR EACH ROW EXECUTE FUNCTION protect_on_account_reference_identity();

-- Seed counters from any references that already exist. This makes the
-- migration safe to rerun and lets future deployments retain monotonic numbers.
INSERT INTO on_account_reference_counters (
    organizationid,
    partytype,
    lastnumber,
    modifieddate
)
SELECT
    organizationid,
    partytype,
    MAX(
        CASE
            WHEN referencenumber ~ '^OA-[CS]-[0-9]+$'
            THEN SPLIT_PART(referencenumber, '-', 3)::BIGINT
            ELSE 0
        END
    ),
    EXTRACT(EPOCH FROM NOW())::BIGINT
FROM on_account_references
GROUP BY organizationid, partytype
ON CONFLICT (organizationid, partytype)
DO UPDATE SET
    lastnumber = GREATEST(
        on_account_reference_counters.lastnumber,
        EXCLUDED.lastnumber
    ),
    modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT;

-- Backfill legacy rows one at a time so each receives a stable organization-
-- scoped reference. Existing mutable rows stay in place for compatibility.
DO $$
DECLARE
    legacy_row RECORD;
    next_number BIGINT;
    new_reference_id BIGINT;
    reference_status VARCHAR(30);
BEGIN
    FOR legacy_row IN
        SELECT
            u.*,
            t.organizationid,
            t.sourcetype AS bank_sourcetype,
            t.sourceid AS bank_sourceid,
            t.journalentryid,
            COALESCE(a.currencycode, 'INR') AS currencycode
        FROM party_unapplied_amounts u
        JOIN bank_transactions t
          ON t.id = u.banktransactionid
        JOIN bank_cash_accounts a
          ON a.id = t.bankcashaccountid
         AND a.organizationid = t.organizationid
        WHERE NOT EXISTS (
            SELECT 1
            FROM on_account_references r
            WHERE r.legacyunappliedamountid = u.id
        )
        ORDER BY t.organizationid, u.partytype, u.createddate, u.id
    LOOP
        INSERT INTO on_account_reference_counters (
            organizationid,
            partytype,
            lastnumber,
            modifieddate
        )
        VALUES (
            legacy_row.organizationid,
            legacy_row.partytype,
            1,
            EXTRACT(EPOCH FROM NOW())::BIGINT
        )
        ON CONFLICT (organizationid, partytype)
        DO UPDATE SET
            lastnumber = on_account_reference_counters.lastnumber + 1,
            modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
        RETURNING lastnumber INTO next_number;

        reference_status := CASE
            WHEN legacy_row.status = 'reversed' THEN 'reversed'
            WHEN legacy_row.remainingamount = 0 THEN 'fully_applied'
            WHEN legacy_row.appliedamount > 0 THEN 'partially_applied'
            ELSE 'open'
        END;

        INSERT INTO on_account_references (
            organizationid,
            referencenumber,
            partytype,
            partyid,
            currencycode,
            sourcetype,
            sourceid,
            sourcebanktransactionid,
            sourcejournalentryid,
            legacyunappliedamountid,
            originalamount,
            usedamount,
            availableamount,
            status,
            version,
            createdby,
            modifiedby,
            createddate,
            modifieddate
        )
        VALUES (
            legacy_row.organizationid,
            CASE legacy_row.partytype
                WHEN 'customer' THEN 'OA-C-'
                ELSE 'OA-S-'
            END || LPAD(next_number::TEXT, 8, '0'),
            legacy_row.partytype,
            legacy_row.partyid,
            UPPER(legacy_row.currencycode),
            COALESCE(NULLIF(TRIM(legacy_row.bank_sourcetype), ''), 'legacy_unapplied'),
            legacy_row.bank_sourceid,
            legacy_row.banktransactionid,
            legacy_row.journalentryid,
            legacy_row.id,
            legacy_row.originalamount,
            legacy_row.appliedamount,
            legacy_row.remainingamount,
            reference_status,
            0,
            COALESCE(legacy_row.createdby, 'migration'),
            COALESCE(legacy_row.modifiedby, legacy_row.createdby, 'migration'),
            legacy_row.createddate,
            legacy_row.modifieddate
        )
        RETURNING id INTO new_reference_id;

        IF legacy_row.remainingamount > 0 THEN
            INSERT INTO on_account_movements (
                organizationid,
                onaccountreferenceid,
                movementtype,
                direction,
                amount,
                banktransactionid,
                journalentryid,
                idempotencykey,
                idempotencysequence,
                description,
                createdby,
                createddate
            )
            VALUES (
                legacy_row.organizationid,
                new_reference_id,
                'legacy_opening',
                'increase',
                legacy_row.remainingamount,
                legacy_row.banktransactionid,
                legacy_row.journalentryid,
                'legacy-unapplied-' || legacy_row.id::TEXT,
                1,
                'Opening available balance migrated from party_unapplied_amounts.',
                'migration',
                legacy_row.modifieddate
            );
        END IF;
    END LOOP;
END;
$$;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260818_on_account_phase1_foundation_v1',
    'On Account base references, immutable movements, document bridge, and legacy migration'
)
ON CONFLICT (version) DO NOTHING;
