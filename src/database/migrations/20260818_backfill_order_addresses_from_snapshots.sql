-- Backfill address relationships for historical orders that stored address
-- snapshots but did not create/link a row in the address table.
--
-- This is intentionally idempotent:
--   1. Reuse an exact address already owned by the order user.
--   2. Insert only snapshot addresses that do not already exist.
--   3. Update only NULL address references on orders and order lines.

WITH snapshot_addresses AS (
    SELECT DISTINCT
        orders.userid,
        COALESCE(
            NULLIF(orders.shippingaddresssnapshot, 'null'::jsonb),
            NULLIF(orders.billingaddresssnapshot, 'null'::jsonb)
        ) AS snapshot,
        COALESCE(orders.createddate, EXTRACT(EPOCH FROM NOW())::bigint) AS createddate
    FROM orders
    JOIN users ON users.id = orders.userid
    WHERE orders.addressid IS NULL
      AND COALESCE(
            NULLIF(orders.shippingaddresssnapshot, 'null'::jsonb),
            NULLIF(orders.billingaddresssnapshot, 'null'::jsonb)
          ) IS NOT NULL
), normalized_addresses AS (
    SELECT
        userid,
        NULLIF(TRIM(snapshot ->> 'name'), '') AS name,
        CASE
            WHEN REGEXP_REPLACE(COALESCE(snapshot ->> 'mobilenumber', ''), '[^0-9]', '', 'g') <> ''
            THEN REGEXP_REPLACE(snapshot ->> 'mobilenumber', '[^0-9]', '', 'g')::numeric
            ELSE NULL
        END AS mobilenumber,
        CASE
            WHEN REGEXP_REPLACE(COALESCE(snapshot ->> 'pincode', ''), '[^0-9]', '', 'g') <> ''
            THEN REGEXP_REPLACE(snapshot ->> 'pincode', '[^0-9]', '', 'g')::numeric
            ELSE NULL
        END AS pincode,
        NULLIF(TRIM(snapshot ->> 'doornumber'), '') AS doornumber,
        NULLIF(TRIM(snapshot ->> 'address'), '') AS address,
        NULLIF(TRIM(snapshot ->> 'landmark'), '') AS landmark,
        NULLIF(TRIM(snapshot ->> 'state'), '') AS state,
        NULLIF(TRIM(snapshot ->> 'city'), '') AS city,
        NULLIF(TRIM(snapshot ->> 'email'), '') AS email,
        createddate
    FROM snapshot_addresses
    WHERE jsonb_typeof(snapshot) = 'object'
      AND COALESCE(
            NULLIF(TRIM(snapshot ->> 'address'), ''),
            NULLIF(TRIM(snapshot ->> 'name'), ''),
            NULLIF(TRIM(snapshot ->> 'pincode'), '')
          ) IS NOT NULL
)
INSERT INTO address (
    userid,
    name,
    mobilenumber,
    pincode,
    doornumber,
    address,
    landmark,
    state,
    city,
    email,
    createddate,
    modifieddate
)
SELECT
    source.userid,
    source.name,
    source.mobilenumber,
    source.pincode,
    source.doornumber,
    source.address,
    source.landmark,
    source.state,
    source.city,
    source.email,
    MIN(source.createddate),
    MIN(source.createddate)
FROM normalized_addresses source
WHERE NOT EXISTS (
    SELECT 1
    FROM address existing
    WHERE existing.userid = source.userid
      AND existing.name IS NOT DISTINCT FROM source.name
      AND existing.mobilenumber IS NOT DISTINCT FROM source.mobilenumber
      AND existing.pincode IS NOT DISTINCT FROM source.pincode
      AND existing.doornumber IS NOT DISTINCT FROM source.doornumber
      AND existing.address IS NOT DISTINCT FROM source.address
      AND existing.landmark IS NOT DISTINCT FROM source.landmark
      AND existing.state IS NOT DISTINCT FROM source.state
      AND existing.city IS NOT DISTINCT FROM source.city
      AND existing.email IS NOT DISTINCT FROM source.email
)
GROUP BY
    source.userid,
    source.name,
    source.mobilenumber,
    source.pincode,
    source.doornumber,
    source.address,
    source.landmark,
    source.state,
    source.city,
    source.email;

WITH order_snapshots AS (
    SELECT
        orders.id AS order_id,
        orders.userid,
        COALESCE(
            NULLIF(orders.shippingaddresssnapshot, 'null'::jsonb),
            NULLIF(orders.billingaddresssnapshot, 'null'::jsonb)
        ) AS snapshot
    FROM orders
    WHERE orders.addressid IS NULL
), normalized_order_snapshots AS (
    SELECT
        order_id,
        userid,
        NULLIF(TRIM(snapshot ->> 'name'), '') AS name,
        CASE
            WHEN REGEXP_REPLACE(COALESCE(snapshot ->> 'mobilenumber', ''), '[^0-9]', '', 'g') <> ''
            THEN REGEXP_REPLACE(snapshot ->> 'mobilenumber', '[^0-9]', '', 'g')::numeric
            ELSE NULL
        END AS mobilenumber,
        CASE
            WHEN REGEXP_REPLACE(COALESCE(snapshot ->> 'pincode', ''), '[^0-9]', '', 'g') <> ''
            THEN REGEXP_REPLACE(snapshot ->> 'pincode', '[^0-9]', '', 'g')::numeric
            ELSE NULL
        END AS pincode,
        NULLIF(TRIM(snapshot ->> 'doornumber'), '') AS doornumber,
        NULLIF(TRIM(snapshot ->> 'address'), '') AS address,
        NULLIF(TRIM(snapshot ->> 'landmark'), '') AS landmark,
        NULLIF(TRIM(snapshot ->> 'state'), '') AS state,
        NULLIF(TRIM(snapshot ->> 'city'), '') AS city,
        NULLIF(TRIM(snapshot ->> 'email'), '') AS email
    FROM order_snapshots
    WHERE jsonb_typeof(snapshot) = 'object'
)
UPDATE orders target
SET addressid = matched.address_id
FROM (
    SELECT
        source.order_id,
        MIN(existing.id) AS address_id
    FROM normalized_order_snapshots source
    JOIN address existing
      ON existing.userid = source.userid
     AND existing.name IS NOT DISTINCT FROM source.name
     AND existing.mobilenumber IS NOT DISTINCT FROM source.mobilenumber
     AND existing.pincode IS NOT DISTINCT FROM source.pincode
     AND existing.doornumber IS NOT DISTINCT FROM source.doornumber
     AND existing.address IS NOT DISTINCT FROM source.address
     AND existing.landmark IS NOT DISTINCT FROM source.landmark
     AND existing.state IS NOT DISTINCT FROM source.state
     AND existing.city IS NOT DISTINCT FROM source.city
     AND existing.email IS NOT DISTINCT FROM source.email
    GROUP BY source.order_id
) matched
WHERE target.id = matched.order_id
  AND target.addressid IS NULL;

UPDATE orderline line
SET addressid = header.addressid
FROM orders header
WHERE line.uniqueorderid = header.orderid
  AND line.addressid IS NULL
  AND header.addressid IS NOT NULL;
