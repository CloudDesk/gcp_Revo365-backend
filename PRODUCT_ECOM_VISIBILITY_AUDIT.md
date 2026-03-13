# Product Ecom Visibility And Audit

## 1. Ecom visibility

`PATCH /v2/product/:id/ecom-visibility`

Request body:

```json
{
  "ecom_visible": true
}
```

Behavior:

- `true -> false`
  - `product_revo.ecom_visible = false`
  - available `stock_revo` rows for the same `puc` are archived
  - cart and wishlist rows for the product are cleared
  - product quantity fields are recalculated

- `false -> true`
  - `product_revo.ecom_visible = true`
  - available `stock_revo` rows for the same `puc` are unarchived
  - product quantity fields are recalculated
  - cart and wishlist rows are not restored automatically

Notes:

- sold and rental-sold stock rows are not changed
- order and orderline history are not touched
- hidden products are not returned from public ecom product list/detail routes
- `/v2/product/:id/safe` is removed and no longer required

## 2. Customer-facing routes covered

The following routes return only `ecom_visible = true` products:

- `GET /v2/product-ecommerce`
- `GET /v2/product-ecom`
- `GET /v2/product-ecom/:id`
- `GET /v2/product-ecom-similar`

Related protected product routes also follow the same visible-only behavior:

- `GET /v2/product`
- `GET /v2/product/:id`
- `GET /v2/product-similar`
- `GET /productrevo`

Hidden-only protected route:

- `GET /v2/product-hidden`

## 3. Audit column

New column on `product_revo`:

- `status_audit jsonb`

Stored shape:

```json
{
  "current": {
    "ecom_visible": true,
    "changed_at": "2026-03-13T10:00:00.000Z",
    "changed_by": {
      "id": 1,
      "name": "Admin User",
      "email": "admin@example.com",
      "role": "admin"
    },
    "source": "product.ecom_visibility.toggle"
  },
  "history": []
}
```

Each toggle appends one new history entry with:

- current `ecom_visible`
- change timestamp
- actor basic info from session
- source value

## 4. Migration

Run:

- [`src/database/migrations/add_product_revo_status_audit.sql`](/Users/jeyakumarn/Documents/GitHub/Suresh-on-cloud/gcp_Revo365-backend/src/database/migrations/add_product_revo_status_audit.sql)



Business Requirement

Client can hide a product from the ecom site by toggling ecom_visible=false.
Product should disappear from ecom products/accessories/detail/cart/wishlist behavior.
Existing stock must be preserved, not deleted.
When toggled back to true, the same stock should become sellable again and quantities should recalculate.
In Scope

product ecom list/detail visibility
stock archive/unarchive for available stock only
cart/wishlist clearing
quantity recalculation
audit trail
Out of Scope

orderline/order history changes
sold/rental-sold stock mutation
admin/internal product listing behavior
hard delete behavior
Exact Flow

true -> false
false -> true
list exact tables/fields touched
Routes Affected

mention exact list and purpose
Implementation Summary

src/routes/routes.ts
src/controller/productrevo.controller.ts
src/services/productrevo.service.ts
src/database/migrations/add_product_revo_status_audit.sql
Audit Format

current structure
example history entry
actor source from session
Operational Notes

/v2/product/:id/safe removed
legacy hard delete still exists and should not be used for ecom hide/live
hidden products are blocked only on ecom-facing reads
