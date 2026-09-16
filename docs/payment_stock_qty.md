# Payment & Stock Quantity Management Reference

This document outlines how the booking, payment, and inventory counters work together in the system.

---

## 1. Payment Initialization (`POST /payment/razorpay`)
This route prepares the order and "reserves" the stock before the user is sent to the payment gateway.

1. **Inventory Locking**: 
   - Calls `bulkupsertProducttosetZero` to increment `lock_qty` in `product_revo`.
   - This "ghost" reservation ensures other users can't buy these items while the payment is in progress.
2. **Double Check Availability**:
   - Verifies: `overallavailableqty - lock_qty >= 0` 
   - Verifies: `overallavailableqty - orderedquantity >= 0`
3. **Order Pre-Insertion ([bulkInsertOrder](cci:1://file:///Users/sureshkumar/Documents/GitHub/gcp_Revo365-backend/src/services/orders.service.ts:1447:4-1668:6))**:
   - The system splits the order rows based on your **Physical Stock** (`availablequantity` column).
   - **Logic**: All physical units (up to available) go to the `orders` table. Remaining units go to `thirdpartyorders` (Virtual Stock).
4. **Razorpay Order Creation**: Returns the `order_id` for frontend processing.

---

## 2. Payment Confirmation (`POST /payment/confirmation-razorpay`)
Called after the user completes payment on the Razorpay gateway.

1. **Verification**: Validates the Razorpay signature and payment status ('captured').
2. **Order Finalization ([updateOrder](cci:1://file:///Users/sureshkumar/Documents/GitHub/gcp_Revo365-backend/src/services/orders.service.ts:1697:4-1776:6))**:
   - `ispaymentsucceed` set to `true`.
   - `orderstatus` set to `'ordered'`.
3. **Counter Updates ([updateOrderedQuantityarray](cci:1://file:///Users/sureshkumar/Documents/GitHub/gcp_Revo365-backend/src/services/productrevo.service.ts:987:2-1029:3))**:
   - Increments global `orderedquantity` (Running total of items sold).
   - Decrements `lock_qty` (Releases the ghost reservation).
4. **Synchronization**: 
   - Triggers [updateCatalogueQuantities(puc)](cci:1://file:///Users/sureshkumar/Documents/GitHub/gcp_Revo365-backend/src/services/productrevo.service.ts:1031:2-1141:3) to recalculate pools.
   - Triggers [updateQuantity([pucs])](cci:1://file:///Users/sureshkumar/Documents/GitHub/gcp_Revo365-backend/src/services/stockRevo.service.ts:452:4-597:6) to sync the location JSONB.

---

## 3. Scenario Analysis: Stock Update Logic

### **Case A: Physical Stock Only (In-House)**
*   **Initial Setup**: 
    - Physical: 10, Virtual: 0. 
    - `product_revo.overallavailableqty`: 10. `orderedquantity`: 0.
*   **Action**: User buys **2 units**.
*   **Result**: 
    - 2 rows in `stock_revo` become 'Sold'.
    - `overallavailableqty` drops to **8** (Gross Pool).
    - `orderedquantity` increases to **2** (Sold Counter).
    - *Check for Next Order*: `Net Available = 8 (Pool) - 2 (Ordered) = 6`. **Correct.**

### **Case B: Physical + 3rd Party Mix (The Over-split Scenario)**
*   **Initial Setup**: 
    - Physical: 3, Virtual: 7. 
    - `overallavailableqty`: **10** (Gross Pool).
    - `orderedquantity`: **0**.
*   **Action**: Order **5 items**.
*   **Split Logic**:
    - **Orders table**: 3 (Normal physical units).
    - **Third Party Orders**: 2 (Remaining virtual units).
*   **Confirmation**:
    - `overallavailableqty` becomes **7** (3 physical items become 'Sold' and are removed from pool).
    - `orderedquantity` becomes **5** (Total units sold).
*   **Check for Next Order**:
    - `Net Available = 7 (New Pool) - 5 (New Ordered) = 2`. **Correct.** Only 2 units remain.

---

## 4. Lifecycle Tracking (Scrap/Bin/Archive)
Items flagged with these statuses are **automatically excluded** from the active pools.

| Status | Code Flag | Tracking Column |
| :--- | :--- | :--- |
| **Bin** | `isdeleted = true` | `bin_qty` |
| **Archive** | `isarchive = true` | `archive_qty` |
| **E-waste** | `ewaste = true` or `removefromrecyclebin = true` | `ewaste_qty` |

This keeps your E-commerce site strictly synced with sellable assets only.
