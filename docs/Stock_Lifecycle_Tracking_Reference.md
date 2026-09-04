# Stock Lifecycle & Tracking Reference

This document explains how the product-level quantity tracking handles stock status changes (Bin, Archive, E-waste).

### **1. Action Logic Mapping**

| Action | `stock_revo` Flag | Impact on `product_revo` | Purpose |
| :--- | :--- | :--- | :--- |
| **New Stock** | All flags = `false` | `quantity` ↑ | Increases your live inventory for sale. |
| **Delete** | `isdeleted = true` | `quantity` ↓, `bin_qty` ↑ | Moves item to the "Recycle Bin". |
| **Archive** | `isarchive = true` | `quantity` ↓, `archive_qty` ↑ | Sets item aside (Internal storage). |
| **E-waste** | `ewaste = true` | `quantity` ↓, `ewaste_qty` ↑ | Marks item as scrap / Non-functional. |
| **Purge** | `removefromrecyclebin = true` | `quantity` ↓, `ewaste_qty` ↑ | Permanent removal (also tracked in E-waste). |
| **Restore** | All flags = `false` | `quantity` ↑, others ↓ | Returns item to the active sales floor. Tracking columns decrease. |

---

### **2. Scenario: Full Lifecycle of an Item**

#### **Step 1: Initialization**
*   **Action**: Create 1 new stock item with `PUC-100`.
*   **Flags**: `isdeleted: false`, `isarchive: false`, `ewaste: false`.
*   **Result**: `quantity: 1`, `availablequantity: 1`. 
*   *Status*: Item is **Live** on E-commerce.

#### **Step 2: Mark as Scrap (E-waste)**
*   **Action**: Item #1 flag changed to `ewaste: true`.
*   **Result**: `quantity: 0` (Live stock decreases ↓), `ewaste_qty: 1` (Tracking increases ↑).
*   *Status*: Item is **Scrap** and hidden from E-commerce.

#### **Step 3: Move to Bin (Delete)**
*   **Action**: Item #1 flag changed to `isdeleted: true`.
*   **Result**: `quantity: 0`, `ewaste_qty: 1`, `bin_qty: 1`.
*   *Status*: Item is now both **Scrap** and **Deleted**.

#### **Step 4: Full Restore**
*   **Action**: All flags set back to `false`.
*   **Result**: `quantity: 1` (Live stock increases ↑), `ewaste_qty: 0` (Down ↓), `bin_qty: 0` (Down ↓).
*   *Status*: Item is **Live** again.

---

### **3. Synchronization Flow**

The system triggers a full recount on the product table every time a status changes:
1.  **UPDATE `stock_revo`**: Status changed in the database.
2.  **`updateCatalogueQuantities(puc)`**: Triggers the `FILTER` query to count all current flags.
3.  **`updateQuantity([puc])`**: Refreshes the location-wise JSONB breakdown in `product_revo`.
4.  **Persistent Dashboard**: These numbers now remain fully synced without manual refreshes.


--

Order Placement: orderedquantity ↑, overallavailableqty ↓, quantityforlocation.branch.orderedquantity ↑.
Order Sold: One stock_revo row changes status to 'Sold'. physical availablequantity ↓, orderedquantity ↓, overallavailableqty remains net correct.
Cancellation: orderedquantity ↓, overallavailableqty ↑, quantityforlocation.branch.orderedquantity ↓.

---

before order placement 

{
	"id": 164,
	"price": 25000,
	"bin_qty": 0,
	"lock_qty": 0,
	"quantity": 2,
	"ewaste_qty": 0,
	"archive_qty": 0,
	"productname": "test mobile - 4",
	"soldquantity": 0,
	"oncatalogueqty": 2,
	"offcatalogueqty": 0,
	"orderedquantity": 0,
	"availablequantity": 2,
	"rentalsoldquantity": 0,
	"overallavailableqty": 2,
	"quantityforlocation": {
		"head_office": {
			"quantity": 2,
			"soldquantity": 0,
			"thirdpartyqty": 0,
			"orderedquantity": 0,
			"overallquantity": 2,
			"availablequantity": 2,
			"rentalsoldquantity": 0,
			"overallavailableqty": 2,
			"rentaltotalquantity": 0,
			"ecompublishedquantity": 2,
			"thirdpartyavailableqty": 0,
			"thirdpartysoldquantity": 0,
			"rentalavailablequantity": 0,
			"thirdpartyorderquantity": 0
		}
	},
	"rentaltotalquantity": 0,
	"ecompublishedquantity": 2,
	"rentalorderedquantity": 0,
	"rentalavailablequantity": 0
}

After Order placement - 1 quantity
{
	"id": 164,
	"price": 25000,
	"bin_qty": 0,
	"lock_qty": 0,
	"quantity": 2,
	"ewaste_qty": 0,
	"archive_qty": 0,
	"productname": "test mobile - 4",
	"soldquantity": 0,
	"oncatalogueqty": 2,
	"offcatalogueqty": 0,
	"orderedquantity": 1,
	"availablequantity": 2,
	"rentalsoldquantity": 0,
	"overallavailableqty": 1,
	"quantityforlocation": {
		"head_office": {
			"quantity": 2,
			"soldquantity": 0,
			"thirdpartyqty": 0,
			"orderedquantity": 1,           ← now correctly ↑
			"overallquantity": 2,
			"availablequantity": 1,         ← now correctly ↓
			"rentalsoldquantity": 0,
			"overallavailableqty": 1,       ← now correctly ↓
			"rentaltotalquantity": 0,
			"ecompublishedquantity": 1,     ← now correctly ↓
			"thirdpartyavailableqty": 0,
			"thirdpartysoldquantity": 0,
			"rentalavailablequantity": 0,
			"thirdpartyorderquantity": 0
		}
	},
	"rentaltotalquantity": 0,
	"ecompublishedquantity": 1,
	"rentalorderedquantity": 0,
	"rentalavailablequantity": 0
}

---

### Bug Fix Notes (2026-03-29)

**Problem**: After order placement, `quantityforlocation.branch.*` fields were NOT updating:
- `orderedquantity` stayed 0 (should be ↑)  
- `availablequantity` stayed unchanged (should be ↓)  
- `overallavailableqty` stayed unchanged (should be ↓)

**Root Cause 1 — `order_metrics` CTE used `o.storelocation`**:  
`orders.storelocation` is often `null` when the frontend doesn't send it. The `LEFT JOIN order_metrics om ON grid.location = om.location` then never matched (null ≠ 'head_office'), so `ordered_qty` was always 0 for every branch.

**Fix**: Added a `LEFT JOIN LATERAL` fallback in the `order_metrics` CTE:
```sql
COALESCE(NULLIF(o.storelocation, ''), s.location) AS location
```
This reads the location directly from `stock_revo` for that PUC when `storelocation` is missing.

**Root Cause 2 — `availablequantity` not subtracting `ordered_qty`**:  
In `batchUpdateData`, `overallavailableqty` and `ecompublishedquantity` correctly subtracted `ordered_qty`, but `availablequantity` was written as-is (raw stock count). Fixed to:
```ts
availablequantity: Math.max(0, parseInt(row.availablequantity, 10) - parseInt(row.ordered_qty, 10))
```