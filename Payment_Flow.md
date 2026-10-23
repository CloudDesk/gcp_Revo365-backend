# Payment Flow (Backend)

This document describes the backend payment flow implemented in the codebase, with a focus on payment initiation, confirmation, order creation, inventory locking, and post-payment processing.

Source files:
- `src/services/transaction.service.ts`
- `src/services/orders.service.ts`
- `src/services/thirdpartyorders.service.ts`
- `src/services/productrevo.service.ts`
- `src/googletask/createtask.ts`
- `src/controller/transaction.controller.ts`
- `src/controller/orders.controller.ts`

## End-to-End Overview

1. Frontend creates a transaction + order payload and calls a payment initiation endpoint.
2. Backend locks inventory (updates `product_revo.lock_qty`) and checks stock availability.
3. Backend creates orders and orderlines in the database.
4. Payment is initiated with PhonePe or Razorpay (or Cash flow).
5. Confirmation endpoint verifies payment status/signature.
6. Backend inserts a transaction row.
7. Backend updates order and orderline status.
8. Backend updates product quantities (`orderedquantity` or `rentalorderedquantity`) and clears cart.
9. For Razorpay, backend attempts Shiprocket order creation and courier assignment.
10. On failure, inventory is released, and order status is set to `payment_failed` when applicable.

## Primary Entry Points

PhonePe (legacy flow):
- `POST /payment` -> `transactionService.paymentInitialization`
- `GET /payment/status` -> `transactionService.paymentConfirmation`

Razorpay (current FE flow):
- `POST /payment/razorpay` -> `transactionService.paymentInitializationRazorpay`
- `POST /payment/confirmation-razorpay` -> `transactionService.paymentConfirmationRazorpay`

Tickets:
- `POST /payment/razorpay-ticket` -> `transactionService.paymentInitializationRazorpayTicket`
- `POST /payment/confirmation-razorpay-ticket` -> `transactionService.paymentConfirmationRazorpayTicket`

Cleanup:
- `POST /delete/merchantid` -> `ordersService.deleteFailedOrder`
- `POST /delete/merchantid` can be triggered by a GCP Cloud Task (`createHttpTask`).

## Core Objects and Tables

Request payloads:
- `transaction`: payment and user metadata used for gateways and DB writes.
- `order`: array of orderline data used to create `orders`, `orderline`, and `thirdpartyorders`.

Database tables written or read:
- `product_revo` (stock, lock quantities, order quantities)
- `orders` (primary order header)
- `orderline` (order line items)
- `thirdpartyorders` (split orders beyond available inventory)
- `transaction` (payment record)
- `users`, `address` (for Shiprocket payload and user metadata)
- `stock_revo` (rental stock allocation in some flows)
- `cart` (cart cleanup)

External dependencies:
- Razorpay API (order creation, payment fetch)
- PhonePe API (pay initiation and status)
- Shiprocket API (order create, ready-to-ship, courier assignment)
- GCP Cloud Tasks (delayed cleanup)

## Detailed Flow: PhonePe (paymentInitialization + paymentConfirmation)

### Payment initiation (PhonePe)
Function: `transactionService.paymentInitialization`

Actions:
1. Reads `transaction` and `order` from request body.
2. Clones `order` into `dummyorderdata` and `productupdateorderqty`.
3. Locks inventory with `productrevoService.bulkupsertProducttosetZero(orderdata, false)`:
   - Adds each item’s quantity to `product_revo.lock_qty`.
4. Validates availability:
   - Queries `product_revo` for `overallavailableqty`, `orderedquantity`, `lock_qty`.
   - Requires `overallavailableqty - lock_qty >= 0` and `overallavailableqty - orderedquantity >= 0`.
5. Builds PhonePe payload and calls `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay`.
6. Adds `merchanttransactionid` from PhonePe response to each order item.
7. Collects `cartId` values for later deletion.
8. Creates a Cloud Task (`createHttpTask`) using `merchanttransactionId`.
9. Inserts orders and orderlines via `ordersService.bulkInsertOrder`.
10. Returns PhonePe redirect URL.

Failure handling:
- If stock check fails: returns status 400 and stops.
- If Cloud Task creation or order insertion fails: resets inventory lock (sets `lock_qty` to 0) via `bulkupsertProducttosetZero(dummyorderdata, true)`.
- If the PhonePe API call fails: returns `REDIRECT_URL_SUCCESS` without inserting orders.

### Payment confirmation (PhonePe)
Function: `transactionService.paymentConfirmation`

Actions:
1. Reads `merchantTransactionId` from query.
2. Confirms the merchant id exists in `orders`.
3. Calls PhonePe status API `pg/v1/status`.
4. If `PAYMENT_SUCCESS`:
   - Writes `transactionDataset.transaction.transactiondata = response.data`.
   - Inserts `transaction` row and updates orders via `insertTransactionData`.
   - Updates product quantities (`orderedquantity`) and decrements `lock_qty` via `updateOrderedQuantityarray`.
   - Deletes cart entries via `cartservice.deleteCart`.
   - Sends push message via `messageinitialization`.
5. If not successful:
   - Resets inventory lock to 0.
   - Inserts transaction with `paymentfailed = true` and sets order status `payment_failed`.
6. Redirects to `REDIRECT_URL_SUCCESS`.

Data created/updated:
- `transaction` inserted.
- `orders` updated: `orderstatus`, `transactionid`, `ispaymentsucceed`.
- `orderline` updated: `orderstatus`.
- `product_revo` updated: `orderedquantity` or `rentalorderedquantity`, `lock_qty`.
- `cart` deleted for purchased cart items.

## Detailed Flow: Razorpay (paymentInitializationRazorpay + paymentConfirmationRazorpay)

### Payment initiation (Razorpay)
Function: `transactionService.paymentInitializationRazorpay`

Branch A: Cash payment (`order[0].paymentmethod === "Cash"`)
1. Locks inventory (`bulkupsertProducttosetZero`).
2. Checks stock:
   - For rentals: uses `rentalavailablequantity`, `rentalorderedquantity`.
   - For normal orders: uses `overallavailableqty`, `orderedquantity`.
3. Inserts orders and orderlines via `bulkInsertOrder`.
4. Inserts a `transaction` record with `transactiondata` = `{ Amount, status: "Cash Paid" }`.
5. Updates `orders` to `orderstatus = 'ordered'`, `ispaymentsucceed = true`, sets `transactionid`.
6. Updates `orderline` to `orderstatus = 'ordered'`.
7. Updates product quantities using `updateOrderedQuantityarray`:
   - Updates `orderedquantity` or `rentalorderedquantity` based on `ordername`.

Branch B: Online payment
1. Locks inventory.
2. Checks stock (same rules as above).
3. Creates a Razorpay order (INR, amount * 100).
4. Adds `merchanttransactionid` to order items and captures `cartId` list.
5. Creates Cloud Task with `merchanttransactionId`.
6. Inserts orders and orderlines via `bulkInsertOrder`.
7. Returns Razorpay order details to frontend:
   - `orderId`, `amount`, `currency`, `key`, `redirectUrl`.

Failure handling:
- If stock check fails: reset lock qty to 0 and return status 400.
- If Cloud Task or insert order fails: reset lock qty to 0 and return status 500.

### Payment confirmation (Razorpay)
Function: `transactionService.paymentConfirmationRazorpay`

Actions:
1. Validates required fields: `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`.
2. Verifies signature with `HMAC_SHA256`.
3. Fetches payment details using `razorpay.payments.fetch`.
4. Requires payment status to be `"captured"`.
5. Ensures `merchanttransactionId` exists in `orders` or `thirdpartyorders`.
6. Attempts Shiprocket order creation and courier assignment:
   - Builds payload using `users` and `address`.
   - Updates `orders` and `thirdpartyorders` with Shiprocket IDs, status, and AWB data.
7. Inserts `transaction` and updates `orders` / `thirdpartyorders` using `insertTransactionData`.
8. Updates `orderline` statuses and sends email via `ordersService.updateOrderStatus`.
9. Updates `product_revo` quantities using `updateOrderedQuantityarray`:
   - Uses `orderline` rows for `productid`, `quantity`, `ordername` if available.
10. Deletes cart entries if present.
11. Returns `{ status: 200, redirectUrl: REDIRECT_URL_SUCCESS }`.

Failure handling:
- Invalid signature or payment not captured: resets lock qty to 0.
- Merchant transaction id missing: returns failure.
- On any error: resets lock qty to 0.

## Detailed Flow: Razorpay Tickets

### Payment initiation (Tickets)
Function: `transactionService.paymentInitializationRazorpayTicket`

Actions:
1. Uses `request.body.servicetype` as amount.
2. Creates Razorpay order with a unique `receiptId`.
3. Returns Razorpay order details to frontend.

### Payment confirmation (Tickets)
Function: `transactionService.paymentConfirmationRazorpayTicket`

Actions:
1. Validates required fields.
2. Verifies signature.
3. Fetches payment and checks `"captured"`.
4. Inserts a `transaction` record with the payment details.

No `orders` or `orderline` updates occur in the ticket flow.

## Inventory Locking and Quantity Updates

Locking:
- `productrevoService.bulkupsertProducttosetZero(orderdata, false)`:
  - Adds `quantity` to `product_revo.lock_qty` for each product id.
- For release:
  - `bulkupsertProducttosetZero(dummyorderdata, true)` sets `lock_qty = 0` for those product ids.
  - `ordersService.deleteFailedOrder` decrements `lock_qty` by quantity on a per-item basis.

Quantity updates on success:
- `productrevoService.updateOrderedQuantityarray`:
  - For `ordername === "rental"`, increments `rentalorderedquantity` and decrements `lock_qty`.
  - Otherwise increments `orderedquantity` and decrements `lock_qty`.

## Orders and Orderlines

Insertion:
- `ordersService.bulkInsertOrder(transactionData, orderData)`:
  - Inserts into `orders`.
  - Splits orders into `orders` vs `thirdpartyorders` if quantity exceeds `availablequantity`.
  - Inserts corresponding `orderline` rows via `bulkInsertOrderlines`.

Updates:
- `ordersService.updateOrder`:
  - Sets `transactionid`, `orderstatus`, `ispaymentsucceed`.
  - If payment failed, sets `orderstatus = 'payment_failed'`.
  - Calls `ordersService.updateOrderStatus` to update `orderline`.
  - For rental orders, calls `stockRevoService.allocateRentalStock`.

## Transaction Insertion

Function: `transactionService.insertTransactionData`

Actions:
1. Inserts a row in `transaction` with:
   - `merchanttransactionId`, `name`, `amount`, `mobilenumber`,
   - `productid`, `transactionfor`, `userId`,
   - `transactiondata` (gateway response),
   - Razorpay IDs/signature.
2. Updates `orders` and `thirdpartyorders` based on whether the order id starts with `TEQIT`.

## Data Required at Each Step

### Payment initiation request body
`transaction` fields used:
- `merchanttransactionId`
- `name` (email)
- `amount`
- `mobilenumber`
- `userId`
- `productid` (array)
- `transactionfor`

`order` fields used:
- Required for inserts: `productid`, `userid`, `addressid`, `quantity`, `productamount`, `orderamount`
- Optional but used when present: `productname`, `productcategory`, `productcolour`, `discountamount`
- Additional fields used in `orders`: `ordername`, `paymentmethod`, `totalrentalamount`, `sgst`, `cgst`, `storelocation`, `assetnumber`, `location`, `vendorname`, `empid`, `deliverydate`, `brand`, `invoicefor`
- `cartId` is captured for deletion and removed before `orderline` insert.

### Confirmation request body (Razorpay)
- `razorpay_payment_id`
- `razorpay_order_id`
- `razorpay_signature`

### PhonePe status call
- Query params `id` (merchantTransactionId), `token`.

## Validation and Dependencies

Validations:
- Stock availability checks use `product_revo`:
  - Normal: `overallavailableqty`, `orderedquantity`, `lock_qty`.
  - Rental: `rentalavailablequantity`, `rentalorderedquantity`, `lock_qty`.
- Razorpay signature verification uses `ENV_RAZORPAY_KEY_SECRET`.
- Payment status is required to be `"captured"` for Razorpay.

Dependencies:
- `ENV_RAZORPAY_KEY_ID`, `ENV_RAZORPAY_KEY_SECRET`
- `REDIRECT_URL_PAYMENT_STATUS`, `REDIRECT_URL_SUCCESS`
- `GCP_PROJECT_ID`, `GCP_PROJECT_QUEUE`, `GCP_PROJECT_LOCATION`, `GCP_TASK_URL`
- `SHIPROCKET_*` for Shiprocket integration

## Observed Failure/Recovery Paths

- Stock check failure: returns 400 and does not proceed.
- Order insert or task creation failure: releases lock qty.
- Razorpay signature failure or payment not captured: releases lock qty.
- Payment failure branch: updates orders to `payment_failed` and inserts a transaction row.
- Manual cleanup endpoint available: `/delete/merchantid` which reverses locks and deletes orders.

