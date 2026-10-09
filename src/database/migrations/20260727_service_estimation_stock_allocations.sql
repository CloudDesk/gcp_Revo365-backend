CREATE TABLE IF NOT EXISTS service_estimation_stock_allocations (
    id BIGSERIAL PRIMARY KEY,
    servicecostestimationid INTEGER NOT NULL
        REFERENCES servicecostestimation(id) ON DELETE CASCADE,
    ticketid INTEGER NOT NULL,
    ticketnumber VARCHAR(500) NOT NULL
        REFERENCES tickets(ticketnumber),
    productid INTEGER NOT NULL
        REFERENCES product_revo(id),
    stockid INTEGER NOT NULL
        REFERENCES stock_revo(id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity = 1),
    allocationstatus VARCHAR(20) NOT NULL DEFAULT 'held'
        CHECK (allocationstatus IN ('held', 'sold', 'restored')),
    heldat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    soldat TIMESTAMPTZ,
    restoredat TIMESTAMPTZ,
    restorationreason TEXT,
    createdby INTEGER,
    modifiedby INTEGER,
    createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modifiedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_estimation_stock
        UNIQUE (servicecostestimationid, stockid)
);

CREATE INDEX IF NOT EXISTS idx_service_estimation_stock_allocation_estimation
    ON service_estimation_stock_allocations (
        servicecostestimationid,
        allocationstatus
    );

CREATE INDEX IF NOT EXISTS idx_service_estimation_stock_allocation_ticket
    ON service_estimation_stock_allocations (
        ticketnumber,
        allocationstatus
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_estimation_active_stock
    ON service_estimation_stock_allocations (stockid)
    WHERE allocationstatus IN ('held', 'sold');
