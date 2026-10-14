ALTER TABLE orderline
    ALTER COLUMN hsncode TYPE VARCHAR(500)
    USING CASE
        WHEN hsncode IS NULL THEN NULL
        ELSE hsncode::VARCHAR(500)
    END;

UPDATE product_revo
SET
    rentaltotalquantity = COALESCE(rentaltotalquantity, 0),
    rentalavailablequantity = COALESCE(rentalavailablequantity, 0),
    rentalsoldquantity = COALESCE(rentalsoldquantity, 0)
WHERE
    rentaltotalquantity IS NULL
    OR rentalavailablequantity IS NULL
    OR rentalsoldquantity IS NULL;

ALTER TABLE product_revo
    ALTER COLUMN rentaltotalquantity SET DEFAULT 0,
    ALTER COLUMN rentalavailablequantity SET DEFAULT 0,
    ALTER COLUMN rentalsoldquantity SET DEFAULT 0;
