CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_product_revo_instore_search_trgm
  ON product_revo USING GIN ((
    COALESCE(productname, '') || ' ' ||
    COALESCE(puc, '') || ' ' ||
    COALESCE(brand, '') || ' ' ||
    COALESCE(model, '')
  ) gin_trgm_ops)
  WHERE (isarchive = FALSE OR isarchive IS NULL)
    AND (isdeleted = FALSE OR isdeleted IS NULL)
    AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL);
