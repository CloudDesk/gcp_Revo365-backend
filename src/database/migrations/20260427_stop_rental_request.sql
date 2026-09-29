-- Add customer-facing stop-rental request tracking fields.
-- Safe to run multiple times.

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS requestedstopdate BIGINT;

CREATE INDEX IF NOT EXISTS idx_tickets_requestedstopdate
    ON tickets(requestedstopdate);

WITH new_picklists (
    label,
    value,
    object,
    controlledvalue,
    fieldname,
    controlledlabel,
    controlledfieldname,
    parent
) AS (
    VALUES
        ('Stop Requested', 'stop_requested', 'tickets', NULL, 'rentalactionstatus', NULL, NULL, NULL)
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
    WHERE p.object = np.object
      AND p.fieldname = np.fieldname
      AND p.value = np.value
);
