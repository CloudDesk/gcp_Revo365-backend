# Order Fulfillment Master Plan
> Last updated: 2026-03-29
> Source of truth for the full stock lifecycle: Stock Add → Order → Fulfill → Sold → Cancel
> Status legend: ✅ DEV DONE | 🔄 IN PROGRESS | ⏳ PENDING | 🔍 AWAITING VERIFICATION

---

## STATUS OVERVIEW

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Stock Addition & Update | ✅ DEV DONE — awaiting JSON verification |
| Phase 1 | Order Placement (normal + split + 3rd-party) | ✅ DEV DONE — awaiting JSON verification |
| Phase 2A | Fulfillment — Physical (RFID Scan) | ✅ DEV DONE |
| Phase 2B | Fulfillment — 3rd-Party (Admin Manual) | ✅ DEV DONE |
| Phase 3 | Delivered / Final Sold | ✅ DEV DONE |
| Phase 4A | Cancel (before RFID) | ✅ DEV DONE |
| Phase 4B | Cancel / Return (after RFID) | ✅ DEV DONE (admin manual) |
| Phase 4C | 3rd-Party Cancel | ✅ DEV DONE |
| Rental | Rental-specific flow | ✅ Isolated (separate fields) |

> **Next step:** User will share JSON payloads for Phase 0 (stock add) and Phase 1 (order place).
> We verify expected vs actual field values before moving to Phase 2 testing.

---

## 1. Column / Field Reference

### product_revo — top-level quantity fields

| Field | What it counts | Changes on |
|---|---|---|
| `quantity` | ALL active stock rows (physical count + thirdpartyquantity). Excludes deleted/archived/ewaste. | Stock add/remove |
| `availablequantity` | Physical ecom=true rows with stockstatus='Available' (on + off catalogue only, NO 3rd-party). | Stock add/remove, stockstatus change |
| `overallavailableqty` | availablequantity + ALL ecom=true 3rd-party thirdpartyquantity. Order-adjusted: subtract orderedquantity. | Stock add/remove, order in/out |
| `ecompublishedquantity` | Same as overallavailableqty (physical + 3rd-party). Order-adjusted. | Stock add/remove, order in/out |
| `orderedquantity` | Active normal orderline qty (type='Orders', excludes: payment_failed, cancelled, returned, delivered, Sold, ready_to_dispatch, shipped). | Order placed UP; cancel/deliver DOWN |
| `soldquantity` | Physical rows with stockstatus='Sold' and ecompublish=true. | RFID scan UP |
| `oncatalogueqty` | ecom=true, stockstatus='Available', stocktype='on_catalogue_product'. | Stock add/remove |
| `offcatalogueqty` | ecom=true, stockstatus='Available', stocktype='off_catalogue_product'. | Stock add/remove |
| `lock_qty` | Items locked during active cart/checkout session. | Cart lock UP; checkout/abandon DOWN |
| `bin_qty` | isdeleted=true rows. | Delete/Restore |
| `archive_qty` | isarchive=true rows. | Archive/Restore |
| `ewaste_qty` | ewaste=true or removefromrecyclebin=true rows. | Ewaste/Purge |
| `rentaltotalquantity` | Rental stock rows (ecom=false, stockstatus='Available' OR 'Rental Sold'). | Stock add/remove |
| `rentalsoldquantity` | stockstatus='Rental Sold' rows. | Rental RFID scan UP |
| `rentalavailablequantity` | rentaltotalquantity - rentalsoldquantity. | Computed |
| `rentalorderedquantity` | Active rental orderlines. | Rental order placed UP |

### quantityforlocation[branch] — per-branch JSONB

| Field | Meaning |
|---|---|
| `quantity` | Total stock at branch (physical rows + thirdpartyquantity) |
| `overallquantity` | Physical rows only (excludes thirdpartyquantity) |
| `availablequantity` | ecom=true, stockstatus='Available', physical only. **Order-adjusted** (subtract branch orderedquantity). |
| `overallavailableqty` | physical Available + all ecom=true 3rd-party thirdpartyquantity. **Order-adjusted**. |
| `ecompublishedquantity` | Same as overallavailableqty. **Order-adjusted**. |
| `soldquantity` | stockstatus='Sold' rows at this branch. |
| `thirdpartyqty` | SUM of thirdpartyquantity for ALL 3rd-party rows at this branch. |
| `thirdpartyavailableqty` | SUM of thirdpartyquantity for ecom=true 3rd-party rows at this branch (no stockstatus filter). |
| `orderedquantity` | Active normal orderline qty for this branch. |
| `thirdpartyorderquantity` | Active 3rd-party orderline qty for this branch. |
| `thirdpartysoldquantity` | Delivered/shipped 3rd-party orderline qty for this branch. |
| `rentaltotalquantity` | Rental rows (Available + Rental Sold) at this branch. |
| `rentalsoldquantity` | Rental rows with stockstatus='Rental Sold' at this branch. |
| `rentalavailablequantity` | rentaltotalquantity - rentalsoldquantity at this branch. |

---

## 2. Stock Types & Ecom Rules

| Stock Type | ecompublish | Sold via Ecom | Priority |
|---|---|---|---|
| `on_catalogue_product` | true | YES | 1st — sold first |
| `off_catalogue_product` | true | YES | 1st — same priority as on_catalogue |
| `third_party_product` | true | YES (overflow only) | 2nd — absorbs overflow when physical < order qty |
| `rental_product` | false | NO (rental only) | Separate rental flow entirely |

---

### 3rd-Party Stock — Business Model

**What is 3rd-party stock?**
- External vendors / nearby shops who have a **contractual agreement** with Teqit
- They do **NOT** send any physical stock to Teqit's warehouse
- It is purely a **fulfilment contract**: if an order comes in, the vendor is obligated to deliver
- Teqit sets the product price. The vendor earns their margin (agreed profit per sale)
- One `stock_revo` row is created per vendor per product to represent this contract

**`thirdpartyquantity` field:**
- Stores the **contracted capacity** — i.e., how many units the vendor has agreed they can fulfil
- Example: A nearby shop agrees to sell up to 20 units of iPhone 15 → `thirdpartyquantity = 20`
- This number is set/updated manually by the Teqit admin based on vendor agreement

**How ecom display works:**
- Ecom site shows: **available = `thirdpartyquantity` - orders already placed against this vendor**
- In DB terms: `thirdpartyavailableqty` = raw `thirdpartyquantity` (contract capacity)
- Active 3rd-party orders reduce what's visible via `thirdpartyorderquantity` at the JSONB layer:
  ```
  overallavailableqty (per branch) =
      physical_available
    + thirdpartyquantity (contracted)
    - orderedquantity (active normal orders)
    - thirdpartyorderquantity (active 3rd-party orders)
  ```
- So the customer always sees the true remaining available units across all stock sources

**What happens on a 3rd-party order:**
1. Order placed → `thirdpartyorders` row created + `orderline` (ordertype='Third Party Orders')
2. `thirdpartyorderquantity` increases in JSONB → ecom shows reduced available qty
3. Vendor is notified (via admin portal) to arrange delivery to customer
4. Vendor delivers → admin marks orderline 'delivered' or 'shipped'
5. CTE excludes 'delivered' from `thirdpartyorder_qty` → JSONB reservation auto-clears
6. `thirdpartyquantity` on the stock_revo row does NOT automatically change — it stays as the contracted capacity
7. If vendor reduces agreement (e.g., only 15 left): admin manually edits `thirdpartyquantity` on that stock row

**Why no `stockstatus` filter on 3rd-party quantity:**
- 3rd-party stock never physically enters or leaves Teqit's warehouse
- There is no RFID scan for 3rd-party items
- The row's `stockstatus` is always 'Available' (it's a standing contract)
- The "consumed" tracking happens through `thirdpartyorderquantity` at JSONB level, NOT through row status

---

**ecompublish enforcement rules:**
- `rental_product` → always `ecompublish = false`
- null/empty `rfid` → `ecompublish = false` (physical stock not tagged = not ready for ecom)
- `third_party_product` → `ecompublish = true` by default (it's contract stock, always ecom-ready)
- These rules are enforced in both single-stock (`upsertStockRevoData`) and bulk insert (`upsertBulkStockRevoData`)

---

## 3. Split-Order Logic

```
User orders qty Q
|
|-- Q <= availablequantity (physical on + off catalogue)
|     --> 100% Normal order: orders table + orderline (ordertype='Orders')
|
|-- Q > availablequantity
      |-- up to availablequantity  --> Normal order: orders + orderline (ordertype='Orders')
      |-- remaining qty            --> 3rd-party order: thirdpartyorders + orderline (ordertype='Third Party Orders')
```

**Example** — availablequantity=2, overallavailableqty=8 (6 from 3rd-party), user orders 4:
- Normal orderline: qty 2 → orders table
- 3rd-party orderline: qty 2 → thirdpartyorders table

---

## 4. Reference State (Test Product)

Product PUC: `P139`, two branches (omr + head_office):
- omr: 1 on_catalogue_product, ecom=true, stockstatus='Available'
- head_office: 3 physical ecom=true (on+off catalogue, Available) + 6 thirdpartyquantity ecom=true

```
product_revo (clean state — no orders):
  quantity              = 4     (3 physical + 1 omr)
  availablequantity     = 4     (1 omr + 3 head_office physical)
  overallavailableqty   = 10    (4 physical + 6 thirdparty)
  ecompublishedquantity = 10
  orderedquantity       = 0
  soldquantity          = 0
  lock_qty              = 0
  oncatalogueqty        = 2
  offcatalogueqty       = 2
  thirdpartyqty         = 6

quantityforlocation.omr:
  availablequantity     = 1
  overallavailableqty   = 1
  ecompublishedquantity = 1
  thirdpartyavailableqty = 0
  orderedquantity       = 0

quantityforlocation.head_office:
  availablequantity     = 3
  overallavailableqty   = 9     (3 physical + 6 thirdparty)
  ecompublishedquantity = 9
  thirdpartyavailableqty = 6
  orderedquantity       = 0
```

---

# ✅ PHASE 0 — Stock Addition & Update [DEV DONE]

## How stock addition works

**Routes:**
- Manual single stock: `POST /v2/stock` → `stockRevoController.upsertStockRevoData`
- Bulk CSV dataloader preview: `POST /get-dataloader/stock` → validates + returns JSON
- Bulk stock insert: `POST /dataloader/stock` → `dataLoaderController.insertBulkDataStock`

**Quantity update chain (all 3 routes follow the same sequence):**
```
stock_revo INSERT/UPDATE
  → updateQuantity(pucs)           — recalculates all stock counts per PUC
      → upsertQuantityFields()     — writes product_revo top-level fields
      → testinupdateQuantity()     — refreshes quantityforlocation JSONB per branch
  → updateCatalogueQuantities(puc) — syncs overallavailableqty, ecompublishedquantity,
                                     oncatalogueqty, offcatalogueqty (deduplicated pass)
```

**Fields updated on stock add (ecom=true physical stock):**

| Field | Delta |
|---|---|
| `quantity` | +1 per physical row |
| `availablequantity` | +1 (ecom=true, Available, non-3rd-party) |
| `overallavailableqty` | +1 |
| `ecompublishedquantity` | +1 |
| `oncatalogueqty` or `offcatalogueqty` | +1 (depending on stocktype) |
| `quantityforlocation[branch].*` | All per-branch values recalculated |

**Fields updated on stock add (3rd-party, ecom=true, thirdpartyquantity=N):**

| Field | Delta |
|---|---|
| `quantity` | +N (thirdpartyquantity value) |
| `overallavailableqty` | +N |
| `ecompublishedquantity` | +N |
| `availablequantity` | 0 (3rd-party never counted in physical available) |
| `quantityforlocation[branch].thirdpartyqty` | +N |
| `quantityforlocation[branch].thirdpartyavailableqty` | +N |
| `quantityforlocation[branch].overallavailableqty` | +N |

## Bugs fixed in stock addition (2026-03-29)

| # | Bug | File | Fix |
|---|---|---|---|
| 1 | `overallavailableqty` in `updateQuantity` filtered 3rd-party by `stockstatus='Available'` — wrong, 3rd-party qty is virtual | `stockRevo.service.ts` | Removed stockstatus filter from thirdpartyquantity SUM |
| 2 | Same wrong filter in `testinupdateQuantity` `overallavailableqty` | `stockRevo.service.ts` | Removed |
| 3 | Same wrong filter in `testinupdateQuantity` `ecompublishedquantity` | `stockRevo.service.ts` | Removed |
| 4 | Same wrong filter in `testinupdateQuantity` `thirdpartyavailableqty` | `stockRevo.service.ts` | Removed |
| 5 | Same wrong filter in `updateCatalogueQuantities` `overallavailableqty` | `productrevo.service.ts` | Removed |
| 6 | Same wrong filter in `updateCatalogueQuantities` `ecompublishedquantity` | `productrevo.service.ts` | Removed |
| 7 | `upsertBulkStockRevoData` did not enforce `ecompublish=false` for rental or null rfid | `stockRevo.service.ts` | Added enforcement rules (matching preview route) |
| 8 | `insertBulkDataStock` controller only called `updateQuantity`, not `updateCatalogueQuantities` | `dataloader.controller.ts` | Added `updateCatalogueQuantities` call per PUC |

## 🔍 AWAITING VERIFICATION — Phase 0

> **User will share stock create JSON payload.**
> Verify these fields in `product_revo` and `quantityforlocation` response after stock add.

**Checklist for stock addition verification:**
- [ ] `quantity` increments correctly (physical row count + thirdpartyquantity)
- [ ] `availablequantity` increments for ecom=true physical only (NOT 3rd-party)
- [ ] `overallavailableqty` = availablequantity + all ecom=true thirdpartyquantity (no status filter)
- [ ] `ecompublishedquantity` = same as overallavailableqty
- [ ] 3rd-party row: `thirdpartyavailableqty` = thirdpartyquantity value (no status filter)
- [ ] `oncatalogueqty` / `offcatalogueqty` correct per stocktype
- [ ] rental stock: only `rentaltotalquantity` / `rentalavailablequantity` change, never `availablequantity`
- [ ] `quantityforlocation[branch]` reflects per-branch breakdown correctly
- [ ] null rfid → ecompublish=false enforced
- [ ] rental_product → ecompublish=false enforced

---

# ✅ PHASE 1 — Order Placement [DEV DONE]

## 1A. Normal-Only Order (Q <= availablequantity)

**Trigger:** Payment verified → `finalizeTransaction` → `updateOrderedQuantityarray` → `testinupdateQuantity`

**Steps:**
1. `bulkInsertOrder`: qty ≤ availablequantity → all goes to `orders` table
2. `bulkInsertOrderlines`: inserts with `ordertype='Orders'`, `orderstatus='processing'`
3. `lock_qty` decremented (was set at cart init)
4. `updateOrderedQuantityarray` (post-payment):
   - `orderedquantity += qty`
   - `overallavailableqty -= qty`
   - `ecompublishedquantity -= qty`
   - `lock_qty -= qty`
   - includes `ordername` field to correctly route rental vs normal (fixed in PhonePe path)
5. `testinupdateQuantity`: refreshes JSONB per branch

**product_revo changes** (qty=2, omr contributes 1, head_office contributes 1):

| Field | Before | After | Δ |
|---|---|---|---|
| orderedquantity | 0 | 2 | +2 |
| overallavailableqty | 10 | 8 | -2 |
| ecompublishedquantity | 10 | 8 | -2 |
| availablequantity | 4 | 4 | 0 (physical not dispatched yet) |
| lock_qty | 2 | 0 | -2 |

**quantityforlocation JSONB changes:**

| Field | omr before | omr after | head_office before | head_office after |
|---|---|---|---|---|
| orderedquantity | 0 | 1 | 0 | 1 |
| availablequantity | 1 | 0 | 3 | 2 |
| overallavailableqty | 1 | 0 | 9 | 8 |
| ecompublishedquantity | 1 | 0 | 9 | 8 |

---

## 1B. Split Order (Q > availablequantity)

**Trigger:** Same as 1A, but order qty exceeds physical stock.

**Steps:**
1. `bulkInsertOrder`:
   - Normal orderline qty = availablequantity → `orders` + `orderline` (ordertype='Orders')
   - Overflow qty = Q - availablequantity → `thirdpartyorders` + `orderline` (ordertype='Third Party Orders')
2. `updateOrderedQuantityarray`: only normal qty increments `orderedquantity`
3. `testinupdateQuantity`: CTE sums `ordered_qty` (normal) + `thirdpartyorder_qty` (3rd-party) → both deducted from `overallavailableqty`

**Example:** availablequantity=2, Q=4 → Normal: 2, 3rd-party: 2

**product_revo changes:**

| Field | Before | After | Δ |
|---|---|---|---|
| orderedquantity | 0 | 2 | +2 (normal only) |
| overallavailableqty | 10 | 6 | -4 (2 normal + 2 thirdparty) |
| ecompublishedquantity | 10 | 6 | -4 |
| availablequantity | 4 | 4 | 0 |

**quantityforlocation JSONB changes:**

| Field | omr before | omr after | head_office before | head_office after |
|---|---|---|---|---|
| orderedquantity | 0 | 1 | 0 | 1 |
| thirdpartyorderquantity | 0 | 0 | 0 | 2 |
| availablequantity | 1 | 0 | 3 | 2 |
| overallavailableqty | 1 | 0 | 9 | 5 |
| ecompublishedquantity | 1 | 0 | 9 | 5 |

## Bugs fixed in order placement (2026-03-29)

| # | Bug | File | Fix |
|---|---|---|---|
| 1 | `order_metrics` CTE: `o.storelocation` is null → `ordered_qty=0` for all branches → `quantityforlocation` not updated | `stockRevo.service.ts` | Added `LEFT JOIN LATERAL` fallback to stock_revo location |
| 2 | `availablequantity` in JSONB not subtracting `ordered_qty` | `stockRevo.service.ts` | Added `Math.max(0, availablequantity - ordered_qty)` |
| 3 | `'delivered'`, `'Sold'`, `'shipped'`, `'ready_to_dispatch'` not excluded from `ordered_qty` CTE → fulfilled orders kept orderedquantity inflated | `stockRevo.service.ts` | Extended `NOT IN` exclusion list |
| 4 | `upsertOrder` cancel: `[productid]` double-wrapped the already-array `orders.productid` | `orders.service.ts` | Fixed array wrapping |
| 5 | No `delivered`/`Sold` handler in `upsertOrder` → `orderedquantity` never decremented on delivery | `orders.service.ts` | Added delivered/Sold branch |
| 6 | `updateorderlineitem` cancel didn't gate on `ordertype` → 3rd-party cancellations wrongly decremented `orderedquantity` | `orders.service.ts` | Gated to `ordertype='Orders'` only; added delivered/Sold handler |
| 7 | PhonePe payment path missing `ordername` in `updateproductorderquantiydata` → rental orders used wrong field | `transaction.service.ts` | Added `ordername: e.ordername` |

## 🔍 AWAITING VERIFICATION — Phase 1

> **User will share order placement JSON payload (normal order + split order).**
> Verify these fields after a successful payment confirmation.

**Checklist for normal order verification (qty=2 test):**
- [ ] `orderedquantity` increases by qty on `product_revo`
- [ ] `overallavailableqty` decreases by qty on `product_revo`
- [ ] `ecompublishedquantity` decreases by qty on `product_revo`
- [ ] `availablequantity` unchanged (physical not dispatched)
- [ ] `lock_qty` decremented by qty
- [ ] `quantityforlocation[branch].orderedquantity` incremented correctly per branch
- [ ] `quantityforlocation[branch].availablequantity` = physical available - ordered_qty
- [ ] `quantityforlocation[branch].overallavailableqty` updated correctly

**Checklist for split order verification (e.g. qty=4, physical=2):**
- [ ] Normal orderline (qty=2) created in `orders` table with `ordertype='Orders'`
- [ ] 3rd-party orderline (qty=2) created in `thirdpartyorders` table with `ordertype='Third Party Orders'`
- [ ] `orderedquantity` incremented by 2 (normal only, NOT 4)
- [ ] `overallavailableqty` decremented by 4 total
- [ ] `quantityforlocation[head_office].thirdpartyorderquantity` = 2

---

# ✅ PHASE 2A — Physical Fulfillment (RFID Scan) [DEV DONE]

**Route:** Admin scans RFID in inventory → `upsertOrderlinerfid` → `upsertStockRevoDatarfid` → `updateQuantity` → `testinupdateQuantity`

**Steps:**
1. `stock_revo` row: `stockstatus` → `'Sold'`
2. `updateQuantity` → `upsertQuantityFields`:
   - `availablequantity` decreases (one fewer Available row)
   - `soldquantity` increases
   - `orderedquantity` unchanged (cleared when status → 'delivered')
3. `orderline.orderstatus` → `'ready_to_dispatch'`

**product_revo changes (1 unit scanned, continuing from order state):**

| Field | Before | After | Δ |
|---|---|---|---|
| availablequantity | 4 | 3 | -1 |
| soldquantity | 0 | 1 | +1 |
| overallavailableqty | 8 | 7 | -1 |
| ecompublishedquantity | 8 | 7 | -1 |
| orderedquantity | 2 | 2 | 0 |

---

# ✅ PHASE 2B — 3rd-Party Fulfillment (Admin Manual) [DEV DONE]

**No RFID. No physical stock row change.**

Admin arranges from nearby/3rd-party stores. Marks orderline as dispatched/delivered.
- `orderline.orderstatus` → `'delivered'`/`'shipped'`
- CTE excludes `'delivered'` → `thirdpartyorder_qty` drops → JSONB auto-clears the reservation
- `thirdpartyquantity` on `stock_revo` does NOT change (it's a vendor capacity field, admin edits manually if supplier reduces supply)

**quantityforlocation[head_office] changes:**

| Field | Before (active) | After (delivered) |
|---|---|---|
| thirdpartyorderquantity | 2 | 0 |
| thirdpartysoldquantity | 0 | 2 |
| overallavailableqty | 5 | 7 (reservation cleared) |
| ecompublishedquantity | 5 | 7 |

---

# ✅ PHASE 3 — Delivered / Final Sold [DEV DONE]

When `orders.orderstatus` → `'delivered'` (physical), `orderedquantity` is released.

**Steps:**
1. `upsertOrder` / `updateorderlineitem`: status set to `'delivered'`
2. Triggers `updateCancelledOrderedQuantity([productIds], qty)`:
   - `orderedquantity -= qty`
   - `overallavailableqty += qty` (GREATEST(0, ...))
   - `ecompublishedquantity += qty`
   - `testinupdateQuantity` re-runs: branch `orderedquantity` clears to 0

**product_revo changes (post-RFID, 1 unit delivered):**

| Field | Before | After | Δ |
|---|---|---|---|
| orderedquantity | 2 | 1 | -1 |
| soldquantity | 1 | 1 | 0 |
| availablequantity | 3 | 3 | 0 |
| overallavailableqty | 7 | 8 | +1 (reservation released) |

---

# ✅ PHASE 4 — Cancellation [DEV DONE]

## 4A. Normal Cancel (before RFID)

`orderline.orderstatus` → `'cancelled'`, `orders.orderstatus` → `'cancelled'`

CTE auto-excludes `'cancelled'` from `ordered_qty` → `testinupdateQuantity` re-runs automatically.
`updateCancelledOrderedQuantity` also called explicitly to patch `product_revo` top-level fields.

| Field | Before | After | Δ |
|---|---|---|---|
| orderedquantity | 2 | 0 | -2 |
| overallavailableqty | 8 | 10 | +2 |
| ecompublishedquantity | 8 | 10 | +2 |
| availablequantity | 4 | 4 | 0 |

## 4B. Returned (after RFID — admin manual)

**Admin flow in inventory system:**
1. Admin updates `stock_revo` row: `ecompublish = false`, `rfid = null`
2. `updateCatalogueQuantities` runs on stock update → syncs product_revo
3. `orderline.orderstatus` already `'returned'` → CTE excludes it → `orderedquantity` clears

**Key rule:** Returned item goes `ecompublish=false` → NOT re-added to ecom stock.
Admin manually re-enables when the unit is ready for sale again.

## 4C. 3rd-Party Cancel

`orderline.orderstatus` → `'cancelled'`, `thirdpartyorders.orderstatus` → `'cancelled'`

CTE auto-excludes `'cancelled'` from `thirdpartyorder_qty` → JSONB `thirdpartyorderquantity` drops → `overallavailableqty` recovers.

| Field | Before | After |
|---|---|---|
| quantityforlocation.thirdpartyorderquantity | 2 | 0 |
| quantityforlocation.overallavailableqty | 5 | 7 |

> **Pending (if supplier pull-back):** Admin must manually decrement `thirdpartyquantity` on the `stock_revo` row.

---

# 9. Rental Stock Flow

rental_product is always `ecompublish=false`. Completely separate from ecom.

| Event | Field changes |
|---|---|
| Stock added | `rentaltotalquantity` UP, `rentalavailablequantity` UP |
| Order placed | `rentalorderedquantity` UP |
| RFID scan | `stockstatus='Rental Sold'`, `rentalsoldquantity` UP, `rentalavailablequantity` DOWN |
| Return | `stockstatus='Available'`, `rentalsoldquantity` DOWN, `rentalavailablequantity` UP |
| Cancel | `rentalorderedquantity` DOWN |

---

# 10. Master Event → Field Change Matrix

| Event | orderedqty | availableqty | overallavailableqty | ecompublishedqty | soldqty | lock_qty |
|---|---|---|---|---|---|---|
| Stock Added — ecom=true physical | — | ↑ | ↑ | ↑ | — | — |
| Stock Added — 3rd-party ecom=true | — | — | ↑ (by thirdpartyquantity) | ↑ | — | — |
| Stock Added — ecom=false (rental) | — | — | — | — | — | — |
| Cart Lock | — | — | — | — | — | ↑ |
| Cart Unlock / Abandon | — | — | — | — | — | ↓ |
| Order Placed (normal) | ↑ | — | ↓ | ↓ | — | ↓ |
| Order Placed (3rd-party overflow) | — | — | ↓ | ↓ | — | — |
| RFID Scan / Dispatch | — | ↓ | ↓ | ↓ | ↑ | — |
| Delivered / Final Sold | ↓ | — | ↑ (released) | ↑ (released) | — | — |
| Cancelled (before RFID) | ↓ | — | ↑ | ↑ | — | — |
| Returned (after RFID, ecom=false) | ↓ | — | — | — | ↓ | — |
| 3rd-Party Delivered | — | — | ↑ (reservation cleared) | ↑ | — | — |
| 3rd-Party Cancelled | — | — | ↑ | ↑ | — | — |
| Stock Deleted/Archived/Ewaste | — | ↓ | ↓ | ↓ | — | — |
| Stock Restored | — | ↑ | ↑ | ↑ | — | — |

---

# 11. Key Business Rules

1. Physical stock always sold first (on_catalogue + off_catalogue).
2. 3rd-party only absorbs overflow when physical available < ordered qty.
3. `availablequantity` = physical rows only. Never includes 3rd-party.
4. `overallavailableqty` = physical available + ALL ecom=true 3rd-party thirdpartyquantity (no stockstatus filter on 3rd-party).
5. RFID scan = moment of physical dispatch → `availablequantity` drops here, NOT at order placement.
6. Order placement only drops `overallavailableqty`/`ecompublishedquantity` via `orderedquantity` offset.
7. 3rd-party reservation tracking is via `thirdpartyorderquantity` in JSONB only.
8. 3rd-party fulfillment is admin-manual. No RFID. No stock row status change.
9. Returned stock goes `ecompublish=false` — admin decides when to re-enable.
10. `quantityforlocation` is always fully recomputed (never patched incrementally) to prevent drift.
11. Rental stock is completely isolated — separate fields, separate order flow.
12. `ordername='rental'` must be passed in `updateOrderedQuantityarray` to correctly route rental orders.
