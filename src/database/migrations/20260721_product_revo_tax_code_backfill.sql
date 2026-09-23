ALTER TABLE product_revo
    ADD COLUMN IF NOT EXISTS hsncode VARCHAR(50),
    ADD COLUMN IF NOT EXISTS saccode VARCHAR(50);

UPDATE product_revo
SET hsncode = '84713010'
WHERE
    (hsncode IS NULL OR BTRIM(hsncode) = '')
    AND LOWER(COALESCE(subcategory, '')) = 'laptop';

UPDATE product_revo p
SET saccode = '997315'
WHERE
    (p.saccode IS NULL OR BTRIM(p.saccode) = '')
    AND EXISTS (
        SELECT 1
        FROM stock_revo s
        WHERE
            s.puc = p.puc
            AND s.stocktype = 'rental_product'
            AND (s.isdeleted = FALSE OR s.isdeleted IS NULL)
            AND (s.isarchive = FALSE OR s.isarchive IS NULL)
            AND (s.removefromrecyclebin = FALSE OR s.removefromrecyclebin IS NULL)
            AND (s.ewaste = FALSE OR s.ewaste IS NULL)
    );
