-- Phase 3 customer Delivery Challans. These records capture physical
-- fulfilment only and intentionally have no accounting/journal relationship.
CREATE TABLE IF NOT EXISTS delivery_challans (
    id BIGSERIAL PRIMARY KEY,
    organizationid INTEGER NOT NULL,
    challannumber VARCHAR(64) NOT NULL,
    customerid INTEGER NOT NULL,
    -- Legacy revoinvoice.id is not backed by a deployable unique constraint;
    -- the service validates and locks the customer Invoice transactionally.
    invoiceid INTEGER NOT NULL,
    invoicenumber VARCHAR(255) NOT NULL,
    challandate DATE NOT NULL,
    notes VARCHAR(1000),
    createdby VARCHAR(255) NOT NULL,
    createddate BIGINT NOT NULL,
    modifiedby VARCHAR(255),
    modifieddate BIGINT,
    CONSTRAINT uq_delivery_challans_org_number
      UNIQUE (organizationid, challannumber)
);

CREATE TABLE IF NOT EXISTS delivery_challan_lines (
    id BIGSERIAL PRIMARY KEY,
    deliverychallanid BIGINT NOT NULL
      REFERENCES delivery_challans(id) ON DELETE CASCADE,
    invoicelinekey VARCHAR(255) NOT NULL,
    productid INTEGER,
    productname VARCHAR(500) NOT NULL,
    invoicequantity NUMERIC(18, 4) NOT NULL CHECK (invoicequantity > 0),
    deliveryquantity NUMERIC(18, 4) NOT NULL CHECK (deliveryquantity > 0),
    createdby VARCHAR(255) NOT NULL,
    createddate BIGINT NOT NULL,
    CONSTRAINT uq_delivery_challan_line UNIQUE (deliverychallanid, invoicelinekey)
);

CREATE INDEX IF NOT EXISTS idx_delivery_challans_org_customer_page
    ON delivery_challans (organizationid, customerid, challandate DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_challans_org_invoice
    ON delivery_challans (organizationid, invoiceid, id DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_challan_lines_invoice_line
    ON delivery_challan_lines (invoicelinekey, deliverychallanid);

ALTER TABLE delivery_challans
    ALTER COLUMN challannumber SET NOT NULL;
