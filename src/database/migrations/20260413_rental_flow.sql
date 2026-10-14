-- ============================================================
-- Migration: Rental Flow — Full Schema (Phase 1 + Phase 2)
-- Safe to run multiple times (IF NOT EXISTS / idempotent).
--
-- Execution order within this file:
--   1. Phase 1 — Base replacement schema
--      (rental_replacement_history table + tickets / orderline /
--       stock_revo baseline columns)
--   2. Phase 2 — Lifecycle enhancement
--      (extends Phase 1 tables + rental_agreement,
--       rental_agreement_asset, rental_penalty_invoice_link)
--   3. Backfill / default safety UPDATEs
--   4. Picklist seed (all values, both phases, idempotent)
-- ============================================================


-- ============================================================
-- PHASE 1 — Base Replacement Schema
-- ============================================================

-- 1a. rental_replacement_history (new table)
CREATE TABLE IF NOT EXISTS rental_replacement_history (
    id SERIAL PRIMARY KEY,

    ticketid INTEGER,
    ticketnumber VARCHAR(255),

    sourceorderlineid INTEGER,
    uniqueorderid VARCHAR(255),

    replacementtype VARCHAR(100),
    replacementstatus VARCHAR(100),
    billingmode VARCHAR(100),

    effectivefrom BIGINT,

    oldassetnumber VARCHAR(255),
    oldproductid INTEGER,

    newassetnumber VARCHAR(255),
    newproductid INTEGER,

    monthsalreadybilled INTEGER DEFAULT 0,
    remainingmonths INTEGER DEFAULT 0,
    revisedremainingmonths INTEGER DEFAULT 0,

    rejectionaction VARCHAR(100),

    stoprental BOOLEAN DEFAULT FALSE,
    stoprentalfinancialmode VARCHAR(100),

    remarks TEXT,
    createdby INTEGER,

    createddate BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_rrh_ticketid
    ON rental_replacement_history(ticketid);

CREATE INDEX IF NOT EXISTS idx_rrh_ticketnumber
    ON rental_replacement_history(ticketnumber);

CREATE INDEX IF NOT EXISTS idx_rrh_sourceorderlineid
    ON rental_replacement_history(sourceorderlineid);

CREATE INDEX IF NOT EXISTS idx_rrh_uniqueorderid
    ON rental_replacement_history(uniqueorderid);

CREATE INDEX IF NOT EXISTS idx_rrh_replacementstatus
    ON rental_replacement_history(replacementstatus);


-- 1b. tickets — base replacement columns
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS linkedorderlineid INTEGER,
    ADD COLUMN IF NOT EXISTS replacementtype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS replacementstatus VARCHAR(100),
    ADD COLUMN IF NOT EXISTS activereplacementid INTEGER,
    ADD COLUMN IF NOT EXISTS rejectionaction VARCHAR(100),
    ADD COLUMN IF NOT EXISTS stoprental BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_tickets_linkedorderlineid
    ON tickets(linkedorderlineid);

CREATE INDEX IF NOT EXISTS idx_tickets_replacementstatus
    ON tickets(replacementstatus);

CREATE INDEX IF NOT EXISTS idx_tickets_activereplacementid
    ON tickets(activereplacementid);


-- 1c. orderline — base replacement / billing-line columns
ALTER TABLE orderline
    ADD COLUMN IF NOT EXISTS rentalcontractstatus VARCHAR(100),
    ADD COLUMN IF NOT EXISTS parentorderlineid INTEGER,
    ADD COLUMN IF NOT EXISTS contracteffectivefrom BIGINT,
    ADD COLUMN IF NOT EXISTS contractcloseddate BIGINT,
    ADD COLUMN IF NOT EXISTS contractclosereason VARCHAR(150),
    ADD COLUMN IF NOT EXISTS isactivebillingline BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS replacementsource VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_orderline_parentorderlineid
    ON orderline(parentorderlineid);

CREATE INDEX IF NOT EXISTS idx_orderline_rentalcontractstatus
    ON orderline(rentalcontractstatus);

CREATE INDEX IF NOT EXISTS idx_orderline_isactivebillingline
    ON orderline(isactivebillingline);

CREATE INDEX IF NOT EXISTS idx_orderline_uniqueorderid_activebilling
    ON orderline(uniqueorderid, isactivebillingline);


-- 1d. stock_revo — base service / hold / asset columns
ALTER TABLE stock_revo
    ADD COLUMN IF NOT EXISTS holdreason VARCHAR(150),
    ADD COLUMN IF NOT EXISTS holdticketid INTEGER,
    ADD COLUMN IF NOT EXISTS servicestatus VARCHAR(100),
    ADD COLUMN IF NOT EXISTS assetnumber VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_stockrevo_holdticketid
    ON stock_revo(holdticketid);

CREATE INDEX IF NOT EXISTS idx_stockrevo_servicestatus
    ON stock_revo(servicestatus);

CREATE INDEX IF NOT EXISTS idx_stockrevo_assetnumber
    ON stock_revo(assetnumber);


-- ============================================================
-- PHASE 2 — Lifecycle Enhancement
-- (runs after Phase 1 — all additive, all IF NOT EXISTS)
-- ============================================================

-- 2a. rental_replacement_history — lifecycle extension columns
ALTER TABLE rental_replacement_history
    ADD COLUMN IF NOT EXISTS agreementid INTEGER,
    ADD COLUMN IF NOT EXISTS customerid INTEGER,
    ADD COLUMN IF NOT EXISTS assetnumber VARCHAR(255),
    ADD COLUMN IF NOT EXISTS actiontype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS actionsubtype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS actionstatus VARCHAR(100),
    ADD COLUMN IF NOT EXISTS penaltyinvoiceid INTEGER,
    ADD COLUMN IF NOT EXISTS referenceinvoiceid INTEGER,
    ADD COLUMN IF NOT EXISTS metadatajson JSONB;

CREATE INDEX IF NOT EXISTS idx_rrh_agreementid
    ON rental_replacement_history(agreementid);

CREATE INDEX IF NOT EXISTS idx_rrh_customerid
    ON rental_replacement_history(customerid);

CREATE INDEX IF NOT EXISTS idx_rrh_assetnumber
    ON rental_replacement_history(assetnumber);

CREATE INDEX IF NOT EXISTS idx_rrh_actiontype
    ON rental_replacement_history(actiontype);

CREATE INDEX IF NOT EXISTS idx_rrh_actionstatus
    ON rental_replacement_history(actionstatus);

CREATE INDEX IF NOT EXISTS idx_rrh_penaltyinvoiceid
    ON rental_replacement_history(penaltyinvoiceid);

CREATE INDEX IF NOT EXISTS idx_rrh_referenceinvoiceid
    ON rental_replacement_history(referenceinvoiceid);


-- 2b. tickets — lifecycle extension columns
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS agreementid INTEGER,
    ADD COLUMN IF NOT EXISTS rentalactiontype VARCHAR(100),
    ADD COLUMN IF NOT EXISTS rentalactionstatus VARCHAR(100),
    ADD COLUMN IF NOT EXISTS rentalactionreason TEXT,
    ADD COLUMN IF NOT EXISTS damageassessment VARCHAR(100),
    ADD COLUMN IF NOT EXISTS penaltyinvoiceid INTEGER,
    ADD COLUMN IF NOT EXISTS requestedrenewaldate BIGINT,
    ADD COLUMN IF NOT EXISTS approvedrenewaldate BIGINT,
    ADD COLUMN IF NOT EXISTS receivedassetdate BIGINT,
    ADD COLUMN IF NOT EXISTS resolvedassetdate BIGINT;

CREATE INDEX IF NOT EXISTS idx_tickets_agreementid
    ON tickets(agreementid);

CREATE INDEX IF NOT EXISTS idx_tickets_rentalactiontype
    ON tickets(rentalactiontype);

CREATE INDEX IF NOT EXISTS idx_tickets_rentalactionstatus
    ON tickets(rentalactionstatus);

CREATE INDEX IF NOT EXISTS idx_tickets_damageassessment
    ON tickets(damageassessment);

CREATE INDEX IF NOT EXISTS idx_tickets_penaltyinvoiceid
    ON tickets(penaltyinvoiceid);


-- 2c. orderline — lifecycle extension columns
ALTER TABLE orderline
    ADD COLUMN IF NOT EXISTS agreementid INTEGER,
    ADD COLUMN IF NOT EXISTS rentalassetstatus VARCHAR(100),
    ADD COLUMN IF NOT EXISTS returneddate BIGINT,
    ADD COLUMN IF NOT EXISTS returnedticketid INTEGER,
    ADD COLUMN IF NOT EXISTS lostdate BIGINT,
    ADD COLUMN IF NOT EXISTS lostticketid INTEGER,
    ADD COLUMN IF NOT EXISTS damagecloseddate BIGINT,
    ADD COLUMN IF NOT EXISTS damageticketid INTEGER,
    ADD COLUMN IF NOT EXISTS renewedthroughdate BIGINT,
    ADD COLUMN IF NOT EXISTS lastlifecycleeventid INTEGER;

CREATE INDEX IF NOT EXISTS idx_orderline_agreementid
    ON orderline(agreementid);

CREATE INDEX IF NOT EXISTS idx_orderline_rentalassetstatus
    ON orderline(rentalassetstatus);

CREATE INDEX IF NOT EXISTS idx_orderline_returnedticketid
    ON orderline(returnedticketid);

CREATE INDEX IF NOT EXISTS idx_orderline_lostticketid
    ON orderline(lostticketid);

CREATE INDEX IF NOT EXISTS idx_orderline_damageticketid
    ON orderline(damageticketid);

CREATE INDEX IF NOT EXISTS idx_orderline_lastlifecycleeventid
    ON orderline(lastlifecycleeventid);


-- 2d. stock_revo — lifecycle extension columns
ALTER TABLE stock_revo
    ADD COLUMN IF NOT EXISTS rentalassetstatus VARCHAR(100),
    ADD COLUMN IF NOT EXISTS agreementid INTEGER,
    ADD COLUMN IF NOT EXISTS lastticketid INTEGER,
    ADD COLUMN IF NOT EXISTS lostdate BIGINT,
    ADD COLUMN IF NOT EXISTS lostreason TEXT,
    ADD COLUMN IF NOT EXISTS damageassessment VARCHAR(100),
    ADD COLUMN IF NOT EXISTS damageddate BIGINT,
    ADD COLUMN IF NOT EXISTS nonreturnable BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_stockrevo_rentalassetstatus
    ON stock_revo(rentalassetstatus);

CREATE INDEX IF NOT EXISTS idx_stockrevo_agreementid
    ON stock_revo(agreementid);

CREATE INDEX IF NOT EXISTS idx_stockrevo_lastticketid
    ON stock_revo(lastticketid);

CREATE INDEX IF NOT EXISTS idx_stockrevo_damageassessment
    ON stock_revo(damageassessment);


-- 2e. rental_agreement (new table)
CREATE TABLE IF NOT EXISTS rental_agreement (
    id SERIAL PRIMARY KEY,

    agreementnumber VARCHAR(100),
    customerid INTEGER,
    uniqueorderid VARCHAR(255),
    primaryorderlineid INTEGER,

    agreementstatus VARCHAR(100),
    agreementstartdate BIGINT,
    agreementenddate BIGINT,
    originalagreementenddate BIGINT,

    billingfrequency VARCHAR(100),
    pricingtermssnapshot JSONB,
    penaltytermssnapshot JSONB,

    renewalcount INTEGER DEFAULT 0,

    agreementpdfurl TEXT,
    agreementtemplateversion VARCHAR(100),

    stopreason TEXT,
    terminationreason TEXT,

    createdby INTEGER,
    createddate BIGINT,
    modifiedby INTEGER,
    modifieddate BIGINT,

    activateddate BIGINT,
    stoppeddate BIGINT,
    completeddate BIGINT,
    terminateddate BIGINT
);

-- Unique index wrapped defensively (non-fatal if it already exists)
DO $$
BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rental_agreement_agreementnumber
        ON rental_agreement(agreementnumber);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Skipping idx_rental_agreement_agreementnumber: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_rental_agreement_customerid
    ON rental_agreement(customerid);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_uniqueorderid
    ON rental_agreement(uniqueorderid);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_primaryorderlineid
    ON rental_agreement(primaryorderlineid);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_agreementstatus
    ON rental_agreement(agreementstatus);


-- 2f. rental_agreement_asset (new table)
CREATE TABLE IF NOT EXISTS rental_agreement_asset (
    id SERIAL PRIMARY KEY,

    agreementid INTEGER,
    orderlineid INTEGER,
    assetnumber VARCHAR(255),
    stockid INTEGER,

    assetstatus VARCHAR(100),
    iscurrentasset BOOLEAN DEFAULT TRUE,

    allocatedfrom BIGINT,
    allocatedto BIGINT,

    linkedticketid INTEGER,
    createdby INTEGER,
    createddate BIGINT,
    modifieddate BIGINT
);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_asset_agreementid
    ON rental_agreement_asset(agreementid);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_asset_orderlineid
    ON rental_agreement_asset(orderlineid);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_asset_assetnumber
    ON rental_agreement_asset(assetnumber);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_asset_stockid
    ON rental_agreement_asset(stockid);

CREATE INDEX IF NOT EXISTS idx_rental_agreement_asset_iscurrentasset
    ON rental_agreement_asset(iscurrentasset);


-- 2g. rental_penalty_invoice_link (new table)
CREATE TABLE IF NOT EXISTS rental_penalty_invoice_link (
    id SERIAL PRIMARY KEY,

    ticketid INTEGER,
    agreementid INTEGER,
    orderlineid INTEGER,
    assetnumber VARCHAR(255),

    penaltytype VARCHAR(100),

    sourceinvoiceid INTEGER,
    penaltyinvoiceid INTEGER,
    penaltyamount NUMERIC(12, 2) DEFAULT 0,
    penaltystatus VARCHAR(100),

    remarks TEXT,
    createdby INTEGER,
    createddate BIGINT,
    modifieddate BIGINT
);

CREATE INDEX IF NOT EXISTS idx_rpil_ticketid
    ON rental_penalty_invoice_link(ticketid);

CREATE INDEX IF NOT EXISTS idx_rpil_agreementid
    ON rental_penalty_invoice_link(agreementid);

CREATE INDEX IF NOT EXISTS idx_rpil_orderlineid
    ON rental_penalty_invoice_link(orderlineid);

CREATE INDEX IF NOT EXISTS idx_rpil_penaltyinvoiceid
    ON rental_penalty_invoice_link(penaltyinvoiceid);

CREATE INDEX IF NOT EXISTS idx_rpil_penaltytype
    ON rental_penalty_invoice_link(penaltytype);


-- ============================================================
-- BACKFILL / DEFAULT SAFETY
-- Safe UPDATEs — only touch rows where value is still NULL
-- ============================================================

-- Ensure all orderline rows have isactivebillingline set
UPDATE orderline
SET isactivebillingline = TRUE
WHERE isactivebillingline IS NULL;

-- Ensure all tickets rows have stoprental set
UPDATE tickets
SET stoprental = FALSE
WHERE stoprental IS NULL;

-- Ensure all rental_replacement_history rows have stoprental set
UPDATE rental_replacement_history
SET stoprental = FALSE
WHERE stoprental IS NULL;

-- Ensure nonreturnable has a default for all stock_revo rows
UPDATE stock_revo
SET nonreturnable = FALSE
WHERE nonreturnable IS NULL;

-- Backfill rentalactiontype for tickets that have replacement fields
UPDATE tickets
SET rentalactiontype = 'replacement'
WHERE rentalactiontype IS NULL
  AND (
      replacementtype IS NOT NULL
      OR replacementstatus IS NOT NULL
      OR activereplacementid IS NOT NULL
  );

-- Backfill rentalactionstatus from replacementstatus
UPDATE tickets
SET rentalactionstatus = replacementstatus
WHERE rentalactionstatus IS NULL
  AND rentalactiontype = 'replacement'
  AND replacementstatus IS NOT NULL;

-- Backfill actiontype / actionstatus / assetnumber for replacement history rows
UPDATE rental_replacement_history
SET
    actiontype   = COALESCE(actiontype, 'replacement'),
    actionstatus = COALESCE(actionstatus, replacementstatus),
    assetnumber  = COALESCE(assetnumber, newassetnumber, oldassetnumber)
WHERE actiontype IS NULL
   OR actionstatus IS NULL
   OR assetnumber IS NULL;

-- Backfill rentalassetstatus for active rental orderlines
UPDATE orderline
SET rentalassetstatus = 'allocated'
WHERE rentalassetstatus IS NULL
  AND ordername = 'rental'
  AND COALESCE(isactivebillingline, TRUE) = TRUE;


-- ============================================================
-- PICKLIST SEED — Phase 1 + Phase 2 combined, fully idempotent
-- (INSERT only where (object, fieldname, value) does not exist)
-- ============================================================

WITH new_picklists (label, value, object, controlledvalue, fieldname, controlledlabel, controlledfieldname, parent) AS (
    VALUES

        -- -------------------------------------------------------
        -- PHASE 1 picklists
        -- -------------------------------------------------------

        -- tickets.replacementtype
        ('Technical Replacement',  'technical_replacement',  'tickets', NULL, 'replacementtype', NULL, NULL, NULL),
        ('Commercial Replacement', 'commercial_replacement', 'tickets', NULL, 'replacementtype', NULL, NULL, NULL),

        -- tickets.replacementstatus
        ('Replacement Requested', 'replacement_requested', 'tickets', NULL, 'replacementstatus', NULL, NULL, NULL),
        ('Old Asset Received',    'old_asset_received',    'tickets', NULL, 'replacementstatus', NULL, NULL, NULL),
        ('Replacement Assigned',  'replacement_assigned',  'tickets', NULL, 'replacementstatus', NULL, NULL, NULL),
        ('Replacement Completed', 'replacement_completed', 'tickets', NULL, 'replacementstatus', NULL, NULL, NULL),
        ('Replacement Rejected',  'replacement_rejected',  'tickets', NULL, 'replacementstatus', NULL, NULL, NULL),

        -- tickets.billingmode
        ('Prorated',    'prorated',    'tickets', NULL, 'billingmode', NULL, NULL, NULL),
        ('Next Cycle',  'next_cycle',  'tickets', NULL, 'billingmode', NULL, NULL, NULL),

        -- tickets.rejectionaction
        ('Continue With Old Asset',    'continue_old_asset',       'tickets', NULL, 'rejectionaction', NULL, NULL, NULL),
        ('Close Ticket',               'close_ticket',             'tickets', NULL, 'rejectionaction', NULL, NULL, NULL),
        ('Collect And Stop Rental',    'collect_and_stop_rental',  'tickets', NULL, 'rejectionaction', NULL, NULL, NULL),

        -- tickets.stoprentalfinancialmode
        ('No Refund',               'no_refund',               'tickets', NULL, 'stoprentalfinancialmode', NULL, NULL, NULL),
        ('Prorated Refund/Credit',  'prorated_refund_credit',   'tickets', NULL, 'stoprentalfinancialmode', NULL, NULL, NULL),
        ('Manual Finance Decision', 'manual_finance_decision',  'tickets', NULL, 'stoprentalfinancialmode', NULL, NULL, NULL),

        -- orderline.rentalcontractstatus
        ('Active',   'active',   'orderline', NULL, 'rentalcontractstatus', NULL, NULL, NULL),
        ('Replaced', 'replaced', 'orderline', NULL, 'rentalcontractstatus', NULL, NULL, NULL),
        ('Stopped',  'stopped',  'orderline', NULL, 'rentalcontractstatus', NULL, NULL, NULL),
        ('Closed',   'closed',   'orderline', NULL, 'rentalcontractstatus', NULL, NULL, NULL),

        -- stock_revo.servicestatus
        ('Service Hold',    'service_hold',    'stock_revo', NULL, 'servicestatus', NULL, NULL, NULL),
        ('Under Repair',    'under_repair',    'stock_revo', NULL, 'servicestatus', NULL, NULL, NULL),
        ('Ready For Stock', 'ready_for_stock', 'stock_revo', NULL, 'servicestatus', NULL, NULL, NULL),

        -- stock_revo.stockstatus (Service Hold entry)
        ('Service Hold', 'Service Hold', 'stock_revo', NULL, 'stockstatus', NULL, NULL, NULL),

        -- -------------------------------------------------------
        -- PHASE 2 picklists
        -- -------------------------------------------------------

        -- tickets.rentalactiontype
        ('Replacement', 'replacement', 'tickets', NULL, 'rentalactiontype', NULL, NULL, NULL),
        ('Return',      'return',      'tickets', NULL, 'rentalactiontype', NULL, NULL, NULL),
        ('Lost',        'lost',        'tickets', NULL, 'rentalactiontype', NULL, NULL, NULL),
        ('Damaged',     'damaged',     'tickets', NULL, 'rentalactiontype', NULL, NULL, NULL),
        ('Renewal',     'renewal',     'tickets', NULL, 'rentalactiontype', NULL, NULL, NULL),
        ('Stop Rental', 'stop_rental', 'tickets', NULL, 'rentalactiontype', NULL, NULL, NULL),

        -- tickets.rentalactionstatus
        ('Replacement Requested', 'replacement_requested', 'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Old Asset Received',    'old_asset_received',    'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Replacement Assigned',  'replacement_assigned',  'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Replacement Completed', 'replacement_completed', 'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Replacement Rejected',  'replacement_rejected',  'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Return Requested',      'return_requested',      'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Returned',              'returned',              'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Lost Confirmed',        'lost_confirmed',        'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Damaged Confirmed',     'damaged_confirmed',     'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Penalty Generated',     'penalty_generated',     'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Renewal Requested',     'renewal_requested',     'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Renewed',               'renewed',               'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Stopped',               'stopped',               'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),
        ('Closed',                'closed',                'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL),

        -- tickets.damageassessment
        ('Pending Assessment', 'pending_assessment', 'tickets', NULL, 'damageassessment', NULL, NULL, NULL),
        ('Returnable',         'returnable',         'tickets', NULL, 'damageassessment', NULL, NULL, NULL),
        ('Non Returnable',     'non_returnable',     'tickets', NULL, 'damageassessment', NULL, NULL, NULL),

        -- orderline.rentalassetstatus
        ('Allocated',              'allocated',              'orderline', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Returned',               'returned',               'orderline', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Lost',                   'lost',                   'orderline', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Service Hold',           'service_hold',           'orderline', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Damaged Non Returnable', 'damaged_non_returnable', 'orderline', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Stopped Pending Return', 'stopped_pending_return', 'orderline', NULL, 'rentalassetstatus', NULL, NULL, NULL),

        -- stock_revo.rentalassetstatus
        ('Available',              'available',              'stock_revo', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Allocated',              'allocated',              'stock_revo', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Service Hold',           'service_hold',           'stock_revo', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Returned',               'returned',               'stock_revo', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Lost',                   'lost',                   'stock_revo', NULL, 'rentalassetstatus', NULL, NULL, NULL),
        ('Damaged Non Returnable', 'damaged_non_returnable', 'stock_revo', NULL, 'rentalassetstatus', NULL, NULL, NULL),

        -- stock_revo.damageassessment
        ('Pending Assessment', 'pending_assessment', 'stock_revo', NULL, 'damageassessment', NULL, NULL, NULL),
        ('Returnable',         'returnable',         'stock_revo', NULL, 'damageassessment', NULL, NULL, NULL),
        ('Non Returnable',     'non_returnable',     'stock_revo', NULL, 'damageassessment', NULL, NULL, NULL),

        -- rental_agreement.agreementstatus
        ('Draft',       'draft',       'rental_agreement', NULL, 'agreementstatus', NULL, NULL, NULL),
        ('Active',      'active',      'rental_agreement', NULL, 'agreementstatus', NULL, NULL, NULL),
        ('Renewed',     'renewed',     'rental_agreement', NULL, 'agreementstatus', NULL, NULL, NULL),
        ('Stopped',     'stopped',     'rental_agreement', NULL, 'agreementstatus', NULL, NULL, NULL),
        ('Completed',   'completed',   'rental_agreement', NULL, 'agreementstatus', NULL, NULL, NULL),
        ('Terminated',  'terminated',  'rental_agreement', NULL, 'agreementstatus', NULL, NULL, NULL),

        -- rental_agreement.billingfrequency
        ('Monthly', 'monthly', 'rental_agreement', NULL, 'billingfrequency', NULL, NULL, NULL),

        -- rental_agreement_asset.assetstatus
        ('Allocated',              'allocated',              'rental_agreement_asset', NULL, 'assetstatus', NULL, NULL, NULL),
        ('Replaced',               'replaced',               'rental_agreement_asset', NULL, 'assetstatus', NULL, NULL, NULL),
        ('Returned',               'returned',               'rental_agreement_asset', NULL, 'assetstatus', NULL, NULL, NULL),
        ('Lost',                   'lost',                   'rental_agreement_asset', NULL, 'assetstatus', NULL, NULL, NULL),
        ('Damaged Non Returnable', 'damaged_non_returnable', 'rental_agreement_asset', NULL, 'assetstatus', NULL, NULL, NULL),

        -- rental_replacement_history.actiontype
        ('Allocated',        'allocated',        'rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),
        ('Replacement',      'replacement',      'rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),
        ('Returned',         'returned',         'rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),
        ('Lost',             'lost',             'rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),
        ('Damaged',          'damaged',          'rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),
        ('Penalty Generated','penalty_generated','rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),
        ('Renewed',          'renewed',          'rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),
        ('Stop Rental',      'stop_rental',      'rental_replacement_history', NULL, 'actiontype', NULL, NULL, NULL),

        -- rental_replacement_history.actionstatus
        ('Replacement Requested', 'replacement_requested', 'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Old Asset Received',    'old_asset_received',    'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Replacement Assigned',  'replacement_assigned',  'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Replacement Completed', 'replacement_completed', 'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Replacement Rejected',  'replacement_rejected',  'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Return Requested',      'return_requested',      'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Returned',              'returned',              'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Lost Confirmed',        'lost_confirmed',        'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Damaged Confirmed',     'damaged_confirmed',     'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Penalty Generated',     'penalty_generated',     'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Renewal Requested',     'renewal_requested',     'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Renewed',               'renewed',               'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Stopped',               'stopped',               'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),
        ('Closed',                'closed',                'rental_replacement_history', NULL, 'actionstatus', NULL, NULL, NULL),

        -- rental_penalty_invoice_link.penaltytype
        ('Lost',                   'lost',                   'rental_penalty_invoice_link', NULL, 'penaltytype', NULL, NULL, NULL),
        ('Damaged Non Returnable', 'damaged_non_returnable', 'rental_penalty_invoice_link', NULL, 'penaltytype', NULL, NULL, NULL),

        -- rental_penalty_invoice_link.penaltystatus
        ('Generated', 'generated', 'rental_penalty_invoice_link', NULL, 'penaltystatus', NULL, NULL, NULL),
        ('Cancelled', 'cancelled', 'rental_penalty_invoice_link', NULL, 'penaltystatus', NULL, NULL, NULL),
        ('Paid',      'paid',      'rental_penalty_invoice_link', NULL, 'penaltystatus', NULL, NULL, NULL),

        -- revoinvoice.invoicefor
        ('Penalty', 'penalty', 'revoinvoice', NULL, 'invoicefor', NULL, NULL, NULL)
)
INSERT INTO picklist (
    label,
    value,
    object,
    controlledvalue,
    fieldname,
    controlledlabel,
    controlledfieldname,
    parent
)
SELECT
    np.label,
    np.value,
    np.object,
    np.controlledvalue,
    np.fieldname,
    np.controlledlabel,
    np.controlledfieldname,
    np.parent
FROM new_picklists np
WHERE NOT EXISTS (
    SELECT 1
    FROM picklist p
    WHERE p.object    = np.object
      AND p.fieldname = np.fieldname
      AND p.value     = np.value
);
