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

ALTER_TABLE.sql

ALTER TABLE product_revo ADD COLUMN IF NOT EXISTS bin_qty INTEGER DEFAULT 0;
ALTER TABLE product_revo ADD COLUMN IF NOT EXISTS archive_qty INTEGER DEFAULT 0;
ALTER TABLE product_revo ADD COLUMN IF NOT EXISTS ewaste_qty INTEGER DEFAULT 0;