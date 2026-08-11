ALTER TABLE servicecostestimation
    ADD COLUMN IF NOT EXISTS customerstate VARCHAR(100),
    ADD COLUMN IF NOT EXISTS taxtype VARCHAR(20),
    ADD COLUMN IF NOT EXISTS productigst NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS serviceigst NUMERIC(10, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'servicecostestimation_taxtype_check'
    ) THEN
        ALTER TABLE servicecostestimation
            ADD CONSTRAINT servicecostestimation_taxtype_check
            CHECK (
                taxtype IS NULL
                OR taxtype IN ('intra_state', 'inter_state')
            );
    END IF;
END
$$;
