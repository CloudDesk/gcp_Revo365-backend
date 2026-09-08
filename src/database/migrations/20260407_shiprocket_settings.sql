CREATE TABLE IF NOT EXISTS shiprocket_settings (
    id BIGINT PRIMARY KEY CHECK (id = 1),
    pickup_location VARCHAR(255),
    default_weight NUMERIC(10, 3),
    default_length NUMERIC(10, 2),
    default_breadth NUMERIC(10, 2),
    default_height NUMERIC(10, 2),
    auto_create_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_cancel_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shiprocket_settings (
    id,
    pickup_location,
    default_weight,
    default_length,
    default_breadth,
    default_height,
    auto_create_enabled,
    auto_cancel_enabled
)
VALUES (
    1,
    NULL,
    0.5,
    10,
    10,
    10,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO NOTHING;
