-- Backfill the GST-exclusive purchase price for legacy stock rows from the
-- current product selling price. Existing stock-level purchase prices are
-- preserved because they may contain the actual supplier acquisition cost.
WITH product_prices AS (
    SELECT DISTINCT ON (BTRIM(puc))
        BTRIM(puc) AS puc,
        price::NUMERIC AS sellingprice,
        REGEXP_REPLACE(
            LOWER(BTRIM(COALESCE(subcategory, ''))),
            '[^a-z0-9]+',
            '_',
            'g'
        ) AS normalizedsubcategory,
        REGEXP_REPLACE(
            LOWER(BTRIM(COALESCE(category, ''))),
            '[^a-z0-9]+',
            '_',
            'g'
        ) AS normalizedcategory
    FROM product_revo
    WHERE NULLIF(BTRIM(COALESCE(puc, '')), '') IS NOT NULL
      AND price IS NOT NULL
      AND price > 0
    ORDER BY BTRIM(puc), id DESC
), calculated_prices AS (
    SELECT
        stock.id AS stockid,
        ROUND(
            CASE
                WHEN product.normalizedsubcategory = 'laptop'
                 AND product.normalizedcategory = 'new'
                    THEN CASE
                        WHEN product.sellingprice < 10000 THEN product.sellingprice
                        ELSE product.sellingprice - 5000
                    END
                WHEN product.normalizedsubcategory = 'laptop'
                 AND product.normalizedcategory = 'refurbished'
                    THEN CASE
                        WHEN product.sellingprice < 5000 THEN product.sellingprice
                        ELSE product.sellingprice - 2500
                    END
                WHEN product.normalizedsubcategory IN ('mobile', 'mobile_phone')
                 AND product.normalizedcategory = 'new'
                    THEN CASE
                        WHEN product.sellingprice < 4000 THEN product.sellingprice
                        ELSE product.sellingprice - 3000
                    END
                WHEN product.normalizedsubcategory IN ('mobile', 'mobile_phone')
                 AND product.normalizedcategory = 'refurbished'
                    THEN CASE
                        WHEN product.sellingprice < 1500 THEN product.sellingprice
                        ELSE product.sellingprice - 1000
                    END
                ELSE CASE
                    WHEN product.sellingprice < 300 THEN product.sellingprice
                    ELSE product.sellingprice - 250
                END
            END,
            2
        ) AS purchaseprice
    FROM stock_revo stock
    JOIN product_prices product
      ON product.puc = BTRIM(stock.puc)
    WHERE stock.purchaseprice IS NULL
)
UPDATE stock_revo stock
SET purchaseprice = calculated.purchaseprice
FROM calculated_prices calculated
WHERE stock.id = calculated.stockid
  AND calculated.purchaseprice > 0;
