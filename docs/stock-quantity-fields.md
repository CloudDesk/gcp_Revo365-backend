# Stock Quantity Fields — Single Source of Truth

> **Last updated:** 2026-03-20  
> **Scope:** `product_revo` parent fields + `quantityforlocation` JSONB keys  
> **Files:** `src/services/stockRevo.service.ts`, `src/services/productrevo.service.ts`

---

## 1. Stock Types & ecompublish Rules

| `stocktype` | `ecompublish` | Notes |
|---|---|---|
| `off_catalogue_product` | `true` or `false` | Admin can choose |
| `on_catalogue_product` | `true` or `false` | Admin can choose |
| `third_party_product` | `true` or `false` | Admin can choose; uses `thirdpartyquantity` field |
| `rental_product` | `false` always | Admin cannot change |

> **Key rule for `third_party_product`:** one DB row represents **N units** of stock,
> where N = `thirdpartyquantity`. All quantity fields must use `SUM(thirdpartyquantity)`,
> never `COUNT(*)`, for these rows.

---

## 2. Parent-Level Fields (`product_revo`)

These fields are recomputed from scratch on every stock insert/update via:
- `productrevoService.updateCatalogueQuantities(puc)` — called from `upsertStockRevoData`
- `stockRevoService.updateQuantity(pucs, ...)` — called from the order flow

### Field Definitions

| Field | Formula | Includes 3P `thirdpartyquantity`? |
|---|---|---|
| `quantity` | `COUNT(*)` all active rows | ❌ (rows only) |
| `availablequantity` | `COUNT(non-3P, ecompublish=true, stockstatus='Available')` | ❌ |
| `overallavailableqty` | `availablequantity` + `SUM(thirdpartyquantity WHERE 3P AND ecompublish=true)` | ✅ ecom=true only |
| `ecompublishedquantity` | Same formula as `overallavailableqty` | ✅ ecom=true only |
| `soldquantity` | `COUNT(ecompublish=true AND stockstatus='Sold')` | ❌ |
| `oncatalogueqty` | `COUNT(on_catalogue_product AND stockstatus='Available')` | ❌ |
| `offcatalogueqty` | `COUNT(off_catalogue_product AND stockstatus='Available')` | ❌ |
| `rentaltotalquantity` | `COUNT(rental_product AND ecompublish=false AND status IN ('Available','Rental Sold'))` | ❌ |
| `rentalsoldquantity` | `COUNT(rental_product AND ecompublish=false AND stockstatus='Rental Sold')` | ❌ |
| `rentalavailablequantity` | `rentaltotalquantity - rentalsoldquantity` | ❌ |

### Critical Rules

- `overallavailableqty` and `ecompublishedquantity` are **always equal**
- `ecompublish=false` third-party rows contribute **zero** to both
- Both are recomputed from DB (not incremental) — no drift possible

---

## 3. `quantityforlocation` JSONB Keys (Per-Location)

Updated by `testinupdateQuantity` → `testupsertQuantityFieldsBatch`.  
Stored as: `product_revo.quantityforlocation->>'<location_name>'`

### Key Definitions

| Key | Formula | Includes 3P? | Respects `ecompublish`? |
|---|---|---|---|
| `quantity` | `COUNT(non-3P rows)` + `SUM(thirdpartyquantity ALL 3P)` | ✅ all | ❌ (counts regardless) |
| `overallquantity` | `COUNT(non-3P rows only)` — 3P excluded entirely | ❌ | ❌ |
| `availablequantity` | `COUNT(non-3P, ecompublish=true, Available)` | ❌ | ✅ |
| `overallavailableqty` | `availablequantity` + `thirdpartyavailableqty` | ✅ ecom=true | ✅ |
| `thirdpartyqty` | `SUM(thirdpartyquantity)` ALL 3P rows | ✅ all | ❌ |
| `thirdpartyavailableqty` | `SUM(thirdpartyquantity)` 3P WHERE `ecompublish=true` | ✅ ecom=true | ✅ |
| `ecompublishedquantity` | `COUNT(non-3P, ecompublish=true)` + `thirdpartyavailableqty` | ✅ ecom=true | ✅ |
| `soldquantity` | `COUNT(ecompublish=true AND stockstatus='Sold')` | ❌ | ✅ |
| `rentaltotalquantity` | `COUNT(rental, ecompublish=false, Available OR Rental Sold)` | ❌ | — |
| `rentalsoldquantity` | `COUNT(rental, ecompublish=false, Rental Sold)` | ❌ | — |
| `rentalavailablequantity` | `rentaltotalquantity - rentalsoldquantity` | ❌ | — |

### Example JSONB Shape

```json
{
  "head_office": {
    "quantity": 9,
    "overallquantity": 3,
    "availablequantity": 1,
    "overallavailableqty": 7,
    "thirdpartyqty": 6,
    "thirdpartyavailableqty": 6,
    "ecompublishedquantity": 7,
    "soldquantity": 0,
    "rentaltotalquantity": 1,
    "rentalsoldquantity": 0,
    "rentalavailablequantity": 1
  },
  "omr": {
    "quantity": 8,
    "overallquantity": 2,
    "availablequantity": 1,
    "overallavailableqty": 1,
    "thirdpartyqty": 6,
    "thirdpartyavailableqty": 0,
    "ecompublishedquantity": 1,
    "soldquantity": 0,
    "rentaltotalquantity": 0,
    "rentalsoldquantity": 0,
    "rentalavailablequantity": 0
  }
}
```

---

## 4. Verified Test Scenario (9-Insert Full Trace)

Inserts in order, cumulative state after each:

| # | Stock Insert | Location | Parent `overallavailableqty` | Parent `ecompublishedquantity` | Parent `rentaltotalquantity` |
|---|---|---|---|---|---|
| 1 | off_catalogue, ecom=**true**, qty=1 | head_office | **1** | **1** | 0 |
| 2 | off_catalogue, ecom=**false**, qty=1 | head_office | **1** | **1** | 0 |
| 3 | on_catalogue, ecom=**true**, qty=1 | omr | **2** | **2** | 0 |
| 4 | on_catalogue, ecom=**false**, qty=1 | omr | **2** | **2** | 0 |
| 5 | third_party, ecom=**true**, thirdpartyqty=**1** | head_office | **3** | **3** | 0 |
| 6 | third_party, ecom=**true**, thirdpartyqty=**5** | head_office | **8** | **8** | 0 |
| 7 | third_party, ecom=**false**, thirdpartyqty=1 | omr | **8** ← unchanged | **8** ← unchanged | 0 |
| 8 | third_party, ecom=**false**, thirdpartyqty=5 | omr | **8** ← unchanged | **8** ← unchanged | 0 |
| 9 | rental_product, ecom=**false**, qty=1 | head_office | **8** ← unchanged | **8** ← unchanged | **1** |

### Per-Location `quantityforlocation` Final State (After All 9 Inserts)

**head_office** (off_cat ecom=true, off_cat ecom=false, 3P ecom=true qty=1, 3P ecom=true qty=5, rental):

| Key | Value | Calculation |
|---|---|---|
| `quantity` | **9** | COUNT(non-3P=3) + SUM(3P=1+5=6) |
| `overallquantity` | **3** | COUNT(non-3P rows only) |
| `availablequantity` | **1** | COUNT(non-3P, ecom=true, Available) — off_cat ecom=true |
| `overallavailableqty` | **7** | 1 + SUM(3P ecom=true: 1+5=6) |
| `thirdpartyqty` | **6** | SUM(all 3P in head_office: 1+5) |
| `thirdpartyavailableqty` | **6** | SUM(3P ecom=true: 1+5) |
| `ecompublishedquantity` | **7** | 1 + 6 |
| `rentaltotalquantity` | **1** | 1 rental available |
| `rentalavailablequantity` | **1** | 1 - 0 |

**omr** (on_cat ecom=true, on_cat ecom=false, 3P ecom=false qty=1, 3P ecom=false qty=5):

| Key | Value | Calculation |
|---|---|---|
| `quantity` | **8** | COUNT(non-3P=2) + SUM(3P=1+5=6) |
| `overallquantity` | **2** | COUNT(non-3P rows only) |
| `availablequantity` | **1** | COUNT(non-3P, ecom=true, Available) — on_cat ecom=true |
| `overallavailableqty` | **1** | 1 + SUM(3P ecom=true=**0**, all omr 3P are ecom=false) |
| `thirdpartyqty` | **6** | SUM(all 3P in omr: 1+5) |
| `thirdpartyavailableqty` | **0** | SUM(3P ecom=true in omr) — none |
| `ecompublishedquantity` | **1** | 1 + 0 |
| `rentaltotalquantity` | **0** | none |
| `rentalavailablequantity` | **0** | — |

> **Cross-check:** `head_office.overallavailableqty (7)` + `omr.overallavailableqty (1)` = **8** = Parent `overallavailableqty` ✅

---

## 5. Where The Code Lives

| Concern | File | Function |
|---|---|---|
| Parent `overallavailableqty` + `ecompublishedquantity` | `productrevo.service.ts` | `updateCatalogueQuantities(puc)` |
| Parent `availablequantity`, `soldquantity`, etc. | `stockRevo.service.ts` | `updateQuantity(pucs, ...)` → `upsertQuantityFields(...)` |
| `quantityforlocation` SQL aggregation | `stockRevo.service.ts` | `testinupdateQuantity(pucs, issold)` |
| `quantityforlocation` JSONB write | `productrevo.service.ts` | `testupsertQuantityFieldsBatch(batchData, issold)` |
| Trigger point on stock insert | `stockRevo.service.ts` | `upsertStockRevoData(stockRevoData)` |

---

## 6. The Bug That Was Fixed (March 2026)

### Problem

`third_party_product` with `ecompublish=false` was incorrectly inflating `overallavailableqty` and `ecompublishedquantity`.

**Old code (broken):**
```sql
-- SUM had no ecompublish filter — counted ALL 3P rows regardless
SUM(thirdpartyquantity) FILTER (WHERE puc = $1)  -- ← NO ecompublish guard!
```

**Result (wrong):**
```
ecom=false 3P qty=5 insert → overallavailableqty went from 8 to 14 ❌
ecompublishedquantity was stale at 4, never reflected thirdpartyquantity ❌
```

### Fix Applied

```sql
-- Correct: only sum thirdpartyquantity when ecompublish=true
SUM(thirdpartyquantity) FILTER (
    WHERE ... AND ecompublish = true AND stocktype = 'third_party_product'
)
```

**Result (correct):**
```
ecom=false 3P qty=5 insert → overallavailableqty stays at 8 ✅
ecompublishedquantity = overallavailableqty always ✅
```

### Additional Fixes

| Issue | Fix |
|---|---|
| `quantityforlocation.quantity` counted 3P row as 1 | Changed to `COUNT(non-3P)` + `SUM(thirdpartyquantity for 3P)` |
| No `overallquantity` key in per-location JSONB | Added — `COUNT(non-3P only)` |
| No `thirdpartyqty` key | Added — `SUM(thirdpartyquantity)` all 3P |
| No `thirdpartyavailableqty` key | Added — `SUM(thirdpartyquantity WHERE ecompublish=true)` |
| `updateCatalogueQuantities` didn't update `overallavailableqty` | Now updates it + `ecompublishedquantity` in same CTE |

---

## 7. Do NOT Touch

The following stock type aggregation logic is **intentionally unchanged** and must not be modified:

- `off_catalogue_product` count logic
- `on_catalogue_product` count logic
- `rental_product` count logic (`rentaltotalquantity`, `rentalsoldquantity`)
- `availablequantity` (non-3P physical stock only — excludes all `third_party_product`)

---

## 8. Actual API Response Reference (Verified Test Run — Product: Lenovo Yoga Slim 7, id: 137)

> All inserts are in sequence. Each response shown is the full `product_revo` state **after** that insert.

---

### Insert 1 — `off_catalogue_product`, ecompublish=**true**, qty=1, location: head_office

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 1,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 0,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 1,
  "rentalsoldquantity": 0,
  "overallavailableqty": 1,
  "quantityforlocation": {
    "head_office": {
      "quantity": 1,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 1,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 1,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 2 — `off_catalogue_product`, ecompublish=**false**, qty=1, location: head_office

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 2,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 0,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 1,
  "rentalsoldquantity": 0,
  "overallavailableqty": 1,
  "quantityforlocation": {
    "head_office": {
      "quantity": 2,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 1,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 3 — `on_catalogue_product`, ecompublish=**true**, qty=1, location: omr

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 3,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 1,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 2,
  "rentalsoldquantity": 0,
  "overallavailableqty": 2,
  "quantityforlocation": {
    "omr": {
      "quantity": 1,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 1,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    },
    "head_office": {
      "quantity": 2,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 2,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 4 — `on_catalogue_product`, ecompublish=**false**, qty=1, location: omr

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 4,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 1,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 2,
  "rentalsoldquantity": 0,
  "overallavailableqty": 2,
  "quantityforlocation": {
    "omr": {
      "quantity": 2,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    },
    "head_office": {
      "quantity": 2,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 2,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 5 — `third_party_product`, ecompublish=**true**, thirdpartyquantity=**1**, location: head_office

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 5,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 1,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 2,
  "rentalsoldquantity": 0,
  "overallavailableqty": 3,
  "quantityforlocation": {
    "omr": {
      "quantity": 2,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    },
    "head_office": {
      "quantity": 3,
      "soldquantity": 0,
      "thirdpartyqty": 1,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 2,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 2,
      "thirdpartyavailableqty": 1,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 3,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 6 — `third_party_product`, ecompublish=**true**, thirdpartyquantity=**5**, location: head_office

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 6,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 1,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 2,
  "rentalsoldquantity": 0,
  "overallavailableqty": 8,
  "quantityforlocation": {
    "omr": {
      "quantity": 2,
      "soldquantity": 0,
      "thirdpartyqty": 0,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    },
    "head_office": {
      "quantity": 8,
      "soldquantity": 0,
      "thirdpartyqty": 6,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 7,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 7,
      "thirdpartyavailableqty": 6,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 8,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 7 — `third_party_product`, ecompublish=**false**, thirdpartyquantity=**1**, location: omr

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 7,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 1,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 2,
  "rentalsoldquantity": 0,
  "overallavailableqty": 8,
  "quantityforlocation": {
    "omr": {
      "quantity": 3,
      "soldquantity": 0,
      "thirdpartyqty": 1,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    },
    "head_office": {
      "quantity": 8,
      "soldquantity": 0,
      "thirdpartyqty": 6,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 7,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 7,
      "thirdpartyavailableqty": 6,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 8,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 8 — `third_party_product`, ecompublish=**false**, thirdpartyquantity=**5**, location: omr

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 8,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 1,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 2,
  "rentalsoldquantity": 0,
  "overallavailableqty": 8,
  "quantityforlocation": {
    "omr": {
      "quantity": 8,
      "soldquantity": 0,
      "thirdpartyqty": 6,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    },
    "head_office": {
      "quantity": 8,
      "soldquantity": 0,
      "thirdpartyqty": 6,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 7,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 7,
      "thirdpartyavailableqty": 6,
      "rentalavailablequantity": 0
    }
  },
  "rentaltotalquantity": 0,
  "ecompublishedquantity": 8,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 0
}
```

---

### Insert 9 — `rental_product`, ecompublish=**false**, qty=1, location: head_office

```json
{
  "id": 137,
  "price": 93000,
  "lock_qty": 0,
  "quantity": 9,
  "productname": "Lenovo Yoga Slim 7",
  "soldquantity": 0,
  "oncatalogueqty": 1,
  "offcatalogueqty": 1,
  "orderedquantity": 0,
  "availablequantity": 2,
  "rentalsoldquantity": 0,
  "overallavailableqty": 8,
  "quantityforlocation": {
    "omr": {
      "quantity": 8,
      "soldquantity": 0,
      "thirdpartyqty": 6,
      "overallquantity": 2,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 1,
      "rentaltotalquantity": 0,
      "ecompublishedquantity": 1,
      "thirdpartyavailableqty": 0,
      "rentalavailablequantity": 0
    },
    "head_office": {
      "quantity": 9,
      "soldquantity": 0,
      "thirdpartyqty": 6,
      "overallquantity": 3,
      "availablequantity": 1,
      "rentalsoldquantity": 0,
      "overallavailableqty": 7,
      "rentaltotalquantity": 1,
      "ecompublishedquantity": 7,
      "thirdpartyavailableqty": 6,
      "rentalavailablequantity": 1
    }
  },
  "rentaltotalquantity": 1,
  "ecompublishedquantity": 8,
  "rentalorderedquantity": 0,
  "rentalavailablequantity": 1
}
```

---

> All 9 responses verified correct ✅ — 2026-03-20

