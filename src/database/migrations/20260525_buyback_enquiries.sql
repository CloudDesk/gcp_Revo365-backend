CREATE TABLE IF NOT EXISTS buyback_enquiries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    device_type TEXT NOT NULL,
    device_model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    followup_notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS buyback_enquiries_created_at_idx
ON buyback_enquiries (created_at DESC);

CREATE INDEX IF NOT EXISTS buyback_enquiries_search_idx
ON buyback_enquiries USING gin (
    (
        to_tsvector(
            'simple',
            COALESCE(name, '') || ' ' ||
            COALESCE(email, '') || ' ' ||
            COALESCE(phone, '') || ' ' ||
            COALESCE(device_type, '') || ' ' ||
            COALESCE(device_model, '') || ' ' ||
            COALESCE(status, '')
        )
    )
);
