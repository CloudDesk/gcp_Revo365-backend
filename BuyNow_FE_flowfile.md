# Buy Now / Place Order & Pay Flow (Frontend)

This document captures the **current Buy Now flow** as implemented in `src/Pages/BuyPage/index.tsx` and the **exact backend endpoints, payloads, and response fields** that the frontend uses.

## Base URL
The API base URL is taken from environment:
- `VITE_BACKEND_BASE_URL`

Current `.env` value:
- `https://revo365-sit-1004893667696.us-central1.run.app`

All backend endpoints below are **relative to** this base URL.

## High-Level Flow
1. User clicks **Place Order & Pay** → `initiateOrderPlacement()`.
2. Validate selected address and address correctness.
3. Check stock for each product (`/v2/product?id=...`).
4. If stock is OK, create a Razorpay order via backend (`/payment/razorpay`).
5. Open Razorpay checkout.
6. On successful payment, verify with backend (`/payment/confirmation-razorpay`).
7. If verified, refresh cart and redirect to `/myorder`.

## Endpoints, Payloads, and Expected Responses

### 1) Fetch Address List
**Endpoint**: `GET /address/{userId}`
- Invoked in `fetchAddressFromUser()`.
- Uses `loggedInUser?.[0]?.id`.

**Payload**: None

**Expected Response (frontend usage)**
- `result.data` should be an array of address objects.
- Frontend uses:
  - `addresses[0]` to set default `selectedAddress`
  - Fields referenced later: `id`, `name`, `email`, `mobilenumber`, `address`, `city`, `state`, `pincode`

### 2) Calculate Shipping
**Endpoint**: `POST /calculate-shipping`
- Invoked in `calculateShippingCost()`.

**Payload**
```json
{
  "deliveryPincode": "<pincode as string>",
  "weight": <number>,
  "cod": false
}
```

**Expected Response (frontend usage)**
- On success: `result.data.data.cost` is used as shipping cost.
- On failure or unexpected shape: defaults to `50`.

### 3) Stock Check for Each Product
**Endpoint**: `GET /v2/product?id={productId}`
- Invoked in `checkProductQuantity()` for each item.

**Payload**: None

**Expected Response (frontend usage)**
- `response.data[0]` should contain:
  - `orderedquantity`
  - `lock_qty`
  - `overallavailableqty`

**Logic**
```ts
overallavailableqty >= orderedquantity + lock_qty + requiredQty
```

If any item fails this check:
- Order is blocked and error toast is shown.

### 4) Create Razorpay Order (Backend)
**Endpoint**: `POST /payment/razorpay`
- Invoked in `processPayment()`.

**Payload** (constructed in frontend)
```json
{
  "transaction": {
    "merchanttransactionId": "U{userId}T{timestamp}",
    "name": "<user email>",
    "amount": <totalAmount>,
    "mobilenumber": "<phone or fallback>",
    "userId": <userId>,
    "productid": ["<productId>", "<productId>"] ,
    "transactionfor": "product"
  },
  "order": [
    {
      "productid": "<productId>",
      "productname": "<name>",
      "productcategory": "<category>",
      "productcolour": "<colour>",
      "userid": <userId>,
      "addressid": <selectedAddressId or null>,
      "productamount": <price>,
      "discountamount": <discount>,
      "orderamount": <price - discount (or * qty for cart)>,
      "quantity": <qty>,
      "cartId": <cartItemId or null>,
      "ordername": "online",
      "paymentmethod": "UPI",
      "invoicefor": "product"
    }
  ]
}
```

**Expected Response (frontend usage)**
Frontend expects the API response to contain:
```json
{
  "status": 200,
  "data": {
    "orderId": "<razorpay_order_id>",
    "amount": <number>,
    "currency": "INR",
    "key": "<razorpay_key_id>"
  }
}
```

If `status !== 200` or `data` missing → shows error toast.

### 5) Razorpay Checkout
The frontend opens Razorpay using:
```ts
const options = {
  key,
  amount,
  currency,
  order_id: orderId,
  handler: async (response) => { ... },
  prefill: { name: useremail, contact: phone },
  theme: { color: "#3399cc" }
}
new Razorpay(options).open()
```

### 6) Verify Razorpay Payment (Backend)
**Endpoint**: `POST /payment/confirmation-razorpay`
- Called inside Razorpay `handler()`.

**Payload**
```json
{
  "razorpay_payment_id": "<payment_id>",
  "razorpay_order_id": "<order_id>",
  "razorpay_signature": "<signature>"
}
```

**Expected Response (frontend usage)**
Frontend expects:
```json
{
  "status": 200,
  "message": "Payment successful!",
  "data": {
    "redirectUrl": "<url>"
  }
}
```

If success:
- `refreshCart()`
- `navigate("/myorder")`

If failure or missing `redirectUrl`:
- Error toast shown

## Notes / Assumptions
- **Webhooks** are not visible in the frontend code. If Razorpay webhooks exist, they are **handled in backend** only.
- Any additional backend-side actions (order finalization, inventory lock, payment status update) are not present in frontend code.
- Only the response fields listed above are required by the current UI logic.
- There is **no frontend handling** for Razorpay failure events (`payment.failed`) or modal dismissal (`modal.ondismiss`) in the current code, so **no backend call is made on failure** from the frontend side.

## Failure / Cancel Flow (Current Frontend Behavior)
- If payment **fails** or the user **closes** the Razorpay modal, the Razorpay `handler` is **not** invoked.
- Therefore `POST /payment/confirmation-razorpay` is **not** called.
- No UI message is shown for failure or cancellation (no event hooks are registered).

## Questions for Backend (Clarifications Needed)

1. **Test vs Live Mode**  
   - Which Razorpay key is returned by `POST /payment/razorpay` (test or live)?  
   - How do we switch environments (SIT/UAT/PROD) and ensure the correct key is used?

2. **Payment Capture and Settlement**  
   - Are payments auto-captured or only authorized?  
   - At what step do we actually capture the money?

3. **Webhook Handling**  
   - Which Razorpay webhooks are configured (e.g., `payment.captured`, `payment.failed`, `order.paid`)?  
   - What do we do when webhook verification fails?

4. **Source of Truth**  
   - Is the backend relying on webhook confirmation only, or on the frontend `confirmation-razorpay` call, or both?
   - What happens if the frontend verify call fails but the webhook succeeds (or vice versa)?

5. **Failure / Retry Logic**  
   - Do we persist failed payments?  
   - Is there a retry or reconciliation process for partial failures?

6. **Order State Updates**  
   - Which DB tables are updated after payment success/failure?  
   - At what step do we mark an order as paid/confirmed?

7. **Inventory Locking**  
   - When are product quantities locked and released?  
   - How do we handle payment failures and release inventory?

8. **Logging & Audit**  
   - Are we logging request/response payloads for payment creation and verification?  
   - Where can we trace a single transaction end-to-end?

## Relevant Files
- `src/Pages/BuyPage/index.tsx`
- `src/Service/urls.tsx`
- `src/Service/RequestServer.tsx`
- `.env`


Answers to FE Questions (from backend code)

Test vs Live Mode

Razorpay key returned is ENV_RAZORPAY_KEY_ID from environment config. There is no in-code switch by environment; deployment config decides test vs live.
PhonePe uses a hardcoded preprod sandbox URL: https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay.
Source: transaction.service.ts, config.ts.
Payment Capture and Settlement

Backend does not call Razorpay “capture” APIs.
Confirmation explicitly checks payment.status === "captured".
So capture must be automatic in Razorpay settings or handled elsewhere.
Source: paymentConfirmationRazorpay in transaction.service.ts.
Webhook Handling

No Razorpay or PhonePe webhook handlers exist in the repo.
No verification or webhook replay logic present.
Source: repo-wide search has no webhook handlers.
Source of Truth

Backend relies on the frontend confirmation call (/payment/confirmation-razorpay) and gateway status fetch.
No webhook-based reconciliation exists.
If FE confirmation fails but payment succeeds, there is no automatic recovery except manual cleanup endpoints.
Failure / Retry Logic

Failed payments set orderstatus = 'payment_failed' and ispaymentsucceed = false.
There is a cleanup endpoint POST /delete/merchantid that releases inventory and deletes orders.
A GCP Cloud Task is scheduled during initiation to trigger cleanup if needed.
No retry or reconciliation system beyond this is implemented in code.
Order State Updates

orders updated via ordersService.updateOrder after successful transaction insert.
orderline updated via ordersService.updateOrderStatus.
For Cash flow, orders and orderlines are updated immediately after insert.
Third-party orders handled separately in thirdPartyOrdersService.updateThirdPartyOrder.
Inventory Locking

Locking happens at initiation via bulkupsertProducttosetZero(orderdata, false) (increments lock_qty).
On failure, lock is reset to 0 by bulkupsertProducttosetZero(dummyorderdata, true).
On success, updateOrderedQuantityarray moves quantities into orderedquantity or rentalorderedquantity and decrements lock_qty.
Logging & Audit

Heavy console logging exists, but no dedicated audit table.
Traceability is via transaction, orders, orderline, thirdpartyorders, product_revo, and server logs.

