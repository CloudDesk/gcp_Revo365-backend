import crypto from "crypto";
import axios from "axios";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { query } from "../database/postgres.js";
import { ordersService } from "./orders.service.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import Razorpay from "razorpay";
import {
  ENV_SHIPROCKET_WEBHOOK_TOKEN,
  ENV_RAZORPAY_KEY_ID,
  ENV_RAZORPAY_KEY_SECRET,
  ENV_RAZORPAY_WEBHOOK_SECRET,
  REDIRECT_URL_FAILURE,
  REDIRECT_URL_PAYMENT_STATUS,
  REDIRECT_URL_SUCCESS,
} from "../config/config.js";
import { productrevoService } from "./productrevo.service.js";
import { stockRevoService } from "./stockRevo.service.js";
import { createHttpTask } from "../googletask/createtask.js";
import { cartservice } from "./cart.service.js";
import { messageinitialization } from "../firebase/firebasepushmessage.js";
import { thirdPartyOrdersService } from "./thirdpartyorders.service.js";
import { inventoryReservationService } from "./inventoryReservation.service.js";
import loginShiprocket from "../shiprocket/shiprocketAuth.js";
import { redisClient } from "../database/redis.session.js";
import { resolveFulfillmentLocation } from "../config/fulfillment.config.js";
import {
  cancelShiprocketOrderForMerchant,
  getShiprocketSettings as getPersistedShiprocketSettings,
  listShiprocketPickupLocations,
  upsertShiprocketSettings,
} from "./shiprocket.service.js";
//phonepe pay
const MERCHANT_ID = "PGTESTPAYUAT86";
const SALT_KEY = "96434309-7796-489d-8924-ab56988a6076";
//razorpay pay
const RAZORPAY_KEY_ID = ENV_RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = ENV_RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = ENV_RAZORPAY_WEBHOOK_SECRET;
const RAZORPAY_WEBHOOK_LOG_PREFIX = "[RazorpayWebhook]";
const keyIndex = 1;
console.log("Razorpay gateway initialized");
let transactionDataset: any = {};
let dummyorderdata: any[] = [];
let cartIddata: any[] = [];
let productupdateorderqty: any[] = [];
let insersertdordderdatawithprocessing: any[] = [];

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

const toSafeNumber = (value: any, defaultValue = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const roundCurrency = (value: any): number =>
  Math.round((toSafeNumber(value, 0) + Number.EPSILON) * 100) / 100;

const roundPayableAmount = (value: any): number =>
  Math.round(roundCurrency(value));

const normalizeOptionalLocation = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const isRentalOrderItem = (item: any): boolean => {
  const invoiceFor = String(item?.invoicefor || "").trim().toLowerCase();
  const orderName = String(item?.ordername || "").trim().toLowerCase();
  return invoiceFor === "product rental" || orderName === "rental";
};

const resolveRequestedLocation = (item: any): string | null =>
  normalizeOptionalLocation(item?.deliveryfrom) ||
  normalizeOptionalLocation(item?.storelocation) ||
  normalizeOptionalLocation(item?.storeLocation) ||
  normalizeOptionalLocation(item?.location) ||
  null;

const allocateProductLocationsForOrder = async (orderItems: any[] = []) => {
  const productItems = (orderItems || []).filter((item) => {
    const productId = toSafeNumber(item?.productid, 0);
    const quantity = toSafeNumber(item?.quantity, 0);
    return productId > 0 && quantity > 0 && !isRentalOrderItem(item);
  });

  if (productItems.length === 0) {
    return;
  }

  const productIds = Array.from(
    new Set(productItems.map((item) => toSafeNumber(item?.productid, 0)).filter((id) => id > 0))
  );
  if (productIds.length === 0) {
    return;
  }

  const availabilityResult = await query(
    `
    SELECT
      p.id AS productid,
      s.location,
      COUNT(*)::int AS available_qty
    FROM stock_revo s
    JOIN product_revo p ON p.puc = s.puc
    WHERE p.id = ANY($1::int[])
      AND s.ecompublish = true
      AND s.stockstatus = 'Available'
      AND s.stocktype IN ('on_catalogue_product', 'off_catalogue_product')
      AND (s.isdeleted = false OR s.isdeleted IS NULL)
      AND (s.isarchive = false OR s.isarchive IS NULL)
      AND (s.removefromrecyclebin = false OR s.removefromrecyclebin IS NULL)
      AND (s.ewaste = false OR s.ewaste IS NULL)
      AND s.location IS NOT NULL
      AND s.location <> ''
    GROUP BY p.id, s.location
    `,
    [productIds]
  );

  const availabilityByProduct = new Map<
    number,
    Array<{ location: string; availableQty: number }>
  >();

  for (const row of availabilityResult.rows || []) {
    const productId = toSafeNumber(row?.productid, 0);
    const location = normalizeOptionalLocation(row?.location);
    const availableQty = toSafeNumber(row?.available_qty, 0);
    if (!productId || !location || availableQty <= 0) continue;

    if (!availabilityByProduct.has(productId)) {
      availabilityByProduct.set(productId, []);
    }
    availabilityByProduct.get(productId)!.push({ location, availableQty });
  }

  availabilityByProduct.forEach((locations) => {
    locations.sort((a, b) => {
      if (b.availableQty !== a.availableQty) return b.availableQty - a.availableQty;
      return a.location.localeCompare(b.location);
    });
  });

  const demandByProductLocation = new Map<string, number>();

  for (const item of productItems) {
    const productId = toSafeNumber(item?.productid, 0);
    const requestedQty = toSafeNumber(item?.quantity, 0);
    if (!productId || requestedQty <= 0) continue;

    const locations = availabilityByProduct.get(productId) || [];
    if (locations.length === 0) continue;

    const requestedLocation = resolveRequestedLocation(item);
    let chosenLocation: string | null = null;
    let bestRemaining = -1;

    for (const candidate of locations) {
      const demandKey = `${productId}::${candidate.location}`;
      const reservedSoFar = demandByProductLocation.get(demandKey) || 0;
      const remaining = candidate.availableQty - reservedSoFar;

      if (requestedLocation && candidate.location === requestedLocation && remaining >= requestedQty) {
        chosenLocation = candidate.location;
        break;
      }

      if (!requestedLocation && remaining >= requestedQty) {
        chosenLocation = candidate.location;
        break;
      }

      if (remaining > bestRemaining) {
        bestRemaining = remaining;
        chosenLocation = candidate.location;
      }
    }

    if (!chosenLocation) continue;

    const chosenKey = `${productId}::${chosenLocation}`;
    demandByProductLocation.set(chosenKey, (demandByProductLocation.get(chosenKey) || 0) + requestedQty);

    // Phase 1: stamp head_office as the authoritative fulfillment location on every
    // order item so reservations, orderlines, and Shiprocket all share one source.
    // chosenLocation is still used above for demand-tracking (stock validation);
    // only the location written onto the item is overridden here.
    // Phase 2: replace resolveFulfillmentLocation() with the assigned warehouse
    // from fulfillment_assignments once that table is live.
    const fulfillmentLocation = resolveFulfillmentLocation({ requestedLocation: chosenLocation });
    item.location = fulfillmentLocation;
    if (!normalizeOptionalLocation(item?.storelocation)) {
      item.storelocation = fulfillmentLocation;
    }
  }
};

const resolveTransactionStoreLocation = (orderItems: any[] = []) => {
  const productLocations = (orderItems || [])
    .filter((item) => !isRentalOrderItem(item))
    .map((item) => resolveRequestedLocation(item))
    .filter((location): location is string => Boolean(location));

  const uniqueLocations = Array.from(new Set(productLocations));
  return uniqueLocations.length === 1 ? uniqueLocations[0] : null;
};

const computePayableAmountFromOrderInput = (orderItems: any[], fallbackAmount: any) => {
  const fallback = toSafeNumber(fallbackAmount, 0);
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return roundPayableAmount(fallback);
  }

  const computed = orderItems.reduce((total, item) => {
    const quantity = toSafeNumber(item?.quantity, 0);
    const productAmount = toSafeNumber(item?.productamount, 0);
    const discountAmount = Math.max(0, toSafeNumber(item?.discountamount, 0));
    const lineOrderAmount = toSafeNumber(item?.orderamount, 0);

    if (lineOrderAmount > 0) {
      return total + lineOrderAmount;
    }
    if (productAmount > 0 && quantity > 0) {
      const taxRate =
        toSafeNumber(item?.cgst, 0) +
        toSafeNumber(item?.sgst, 0) +
        toSafeNumber(item?.igst, 0);
      const taxCalculationMode = String(item?.taxcalculationmode || "")
        .trim()
        .toLowerCase();
      const baseAmount = productAmount * quantity;
      const taxableAmount = Math.max(0, baseAmount - discountAmount);
      const payableAmount =
        taxCalculationMode === "exclusive"
          ? taxableAmount * (1 + taxRate / 100)
          : taxableAmount;
      return total + roundCurrency(payableAmount);
    }
    return total;
  }, 0);

  // Frontend total may include shipping/tax not represented in order lines.
  // Use the higher value, then round the payable total to the nearest rupee.
  return roundPayableAmount(Math.max(computed, fallback));
};

const groupOrderQuantities = (orderItems: any[] = []) => {
  const grouped = new Map<number, number>();
  for (const item of orderItems) {
    if (isRentalOrderItem(item)) continue;
    const productId = toSafeNumber(item?.productid, 0);
    const qty = toSafeNumber(item?.quantity, 0);
    if (!productId || qty <= 0) continue;
    grouped.set(productId, (grouped.get(productId) || 0) + qty);
  }
  return grouped;
};

const groupRentalOrderQuantities = (orderItems: any[] = []) => {
  const grouped = new Map<number, number>();
  for (const item of orderItems) {
    if (!isRentalOrderItem(item)) continue;
    const productId = toSafeNumber(item?.productid, 0);
    const qty = toSafeNumber(item?.quantity, 0);
    if (!productId || qty <= 0) continue;
    grouped.set(productId, (grouped.get(productId) || 0) + qty);
  }
  return grouped;
};

const validateReservationCapacity = async (
  orderItems: any[] = [],
  merchantTransactionId?: string | null
) => {
  const requestedByProduct = new Map<
    string,
    { productId: number; reservationType: "product" | "rental"; requestedQuantity: number }
  >();

  for (const item of orderItems || []) {
    const productId = toSafeNumber(item?.productid, 0);
    const quantity = toSafeNumber(item?.quantity, 0);
    if (!productId || quantity <= 0) continue;

    const invoiceFor = String(item?.invoicefor || "").trim().toLowerCase();
    const orderName = String(item?.ordername || "").trim().toLowerCase();
    const reservationType =
      invoiceFor === "product rental" || orderName === "rental" ? "rental" : "product";
    const key = `${productId}::${reservationType}`;
    const existing = requestedByProduct.get(key);
    if (existing) {
      existing.requestedQuantity += quantity;
      continue;
    }
    requestedByProduct.set(key, {
      productId,
      reservationType,
      requestedQuantity: quantity,
    });
  }

  const productIds = Array.from(
    new Set(Array.from(requestedByProduct.values()).map((entry) => entry.productId))
  );
  if (productIds.length === 0) {
    return { ok: true, violations: [] as any[] };
  }

  const productRows = await query(
    `SELECT id, overallavailableqty, rentalavailablequantity
     FROM product_revo
     WHERE id = ANY($1::int[])`,
    [productIds]
  );
  const heldRows = await inventoryReservationService.getHeldReservationTotalsByProduct(
    productIds,
    merchantTransactionId || null
  );

  const heldByProduct = new Map<string, number>();
  for (const row of heldRows) {
    const key = `${row.productid}::${row.reservation_type}`;
    heldByProduct.set(key, toSafeNumber(row.held_quantity, 0));
  }

  const availabilityByProduct = new Map<number, any>();
  for (const row of productRows.rows) {
    availabilityByProduct.set(Number(row.id), row);
  }

  const violations = [];
  for (const requestSummary of requestedByProduct.values()) {
    const productRow = availabilityByProduct.get(requestSummary.productId);
    const totalHeld =
      heldByProduct.get(`${requestSummary.productId}::${requestSummary.reservationType}`) || 0;
    const availableToPromise =
      requestSummary.reservationType === "rental"
        ? toSafeNumber(productRow?.rentalavailablequantity, 0)
        : toSafeNumber(productRow?.overallavailableqty, 0);

    if (availableToPromise - totalHeld - requestSummary.requestedQuantity < 0) {
      violations.push({
        productId: requestSummary.productId,
        reservationType: requestSummary.reservationType,
        availableToPromise,
        heldQuantity: totalHeld,
        requestedQuantity: requestSummary.requestedQuantity,
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
};

const buildProductCommitUpdatesFromRows = (rows: any[] = []) => {
  const grouped = new Map<string, { id: number; orderedquantity: number; ordername: string }>();

  for (const row of rows || []) {
    const productId = toSafeNumber(row?.productid, 0);
    const quantity = toSafeNumber(row?.quantity, 0);
    if (!productId || quantity <= 0) continue;

    const reservationType = String(row?.reservation_type || "").trim().toLowerCase();
    const normalizedOrderName = String(row?.ordername || "").trim().toLowerCase();
    const ordername =
      reservationType === "rental" || normalizedOrderName === "rental" ? "rental" : "online";
    const key = `${productId}::${ordername}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.orderedquantity += quantity;
      continue;
    }

    grouped.set(key, {
      id: productId,
      orderedquantity: quantity,
      ordername,
    });
  }

  return Array.from(grouped.values());
};

const clearLegacyLockQtyForRows = async (rows: any[] = []) => {
  const grouped = new Map<number, number>();

  for (const row of rows || []) {
    const productId = toSafeNumber(row?.productid, 0);
    const quantity = toSafeNumber(row?.quantity, 0);
    if (!productId || quantity <= 0) continue;
    grouped.set(productId, (grouped.get(productId) || 0) + quantity);
  }

  for (const [productId, quantity] of grouped.entries()) {
    await query(
      `
      UPDATE product_revo
      SET lock_qty = GREATEST(0, COALESCE(lock_qty, 0) - $1)
      WHERE id = $2
      `,
      [quantity, productId]
    );
  }
};

const commitMerchantTransactionInventory = async (
  merchantTransactionId: string,
  fallbackOrderLineItems: any[] = []
) => {
  const heldReservationResult =
    await inventoryReservationService.getReservationsForMerchantTransactionId(
      merchantTransactionId,
      ["held"]
    );
  const heldReservationRows = heldReservationResult?.rows || [];

  const reservationDrivenUpdates = buildProductCommitUpdatesFromRows(heldReservationRows);
  const fallbackUpdates = buildProductCommitUpdatesFromRows(
    (fallbackOrderLineItems || []).filter((item: any) => item?.ordertype === "Orders")
  );

  const quantityUpdates =
    reservationDrivenUpdates.length > 0 ? reservationDrivenUpdates : fallbackUpdates;

  if (quantityUpdates.length > 0) {
    await productrevoService.updateOrderedQuantityarray(quantityUpdates);
  }

  const legacyLockRows =
    heldReservationRows.length > 0
      ? heldReservationRows
      : (fallbackOrderLineItems || []).filter((item: any) => item?.ordertype === "Orders");

  if (legacyLockRows.length > 0) {
    await clearLegacyLockQtyForRows(legacyLockRows);
  }

  await inventoryReservationService.commitHeldReservationsForMerchantTransactionId(
    merchantTransactionId
  );

  return {
    quantityUpdates,
    heldReservationRows,
  };
};

const deletePurchasedCartEntries = async (
  userId: any,
  orderItems: any[] = []
) => {
  const numericUserId = toSafeNumber(userId, 0);
  if (!numericUserId) return;

  const requestedCartIds = orderItems
    .map((item) => toSafeNumber(item?.cartId, 0))
    .filter((id) => id > 0);

  if (requestedCartIds.length > 0) {
    await cartservice.deleteCart(Array.from(new Set(requestedCartIds)));
    return;
  }

  const productIds = Array.from(
    new Set(
      orderItems
        .map((item) => toSafeNumber(item?.productid, 0))
        .filter((id) => id > 0)
    )
  );

  if (productIds.length === 0) return;

  const cartRows = await query(
    `SELECT id
     FROM cart
     WHERE userid = $1
       AND iscart = TRUE
       AND productid = ANY($2::int[])`,
    [numericUserId, productIds]
  );

  const cartIds = cartRows.rows.map((row) => Number(row.id)).filter((id) => id > 0);
  if (cartIds.length > 0) {
    await cartservice.deleteCart(cartIds);
  }
};

const safeCleanupPendingOrder = async (merchantTransactionId: string) => {
  if (!merchantTransactionId) return;
  try {
    await ordersService.deleteFailedOrder(merchantTransactionId);
  } catch (cleanupError) {
    console.error("Failed to cleanup pending order:", cleanupError?.message || cleanupError);
  }
};

const parseHeaderValue = (headerValue: any): string | null => {
  if (!headerValue) return null;
  if (Array.isArray(headerValue)) {
    return headerValue[0] || null;
  }
  return String(headerValue);
};

const normalizeOptionalText = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const safeTimingCompare = (expected: string, received: string) => {
  try {
    const expectedBuffer = Buffer.from(expected || "", "utf8");
    const receivedBuffer = Buffer.from(received || "", "utf8");
    if (expectedBuffer.length === 0 || receivedBuffer.length === 0) return false;
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(
      new Uint8Array(expectedBuffer),
      new Uint8Array(receivedBuffer)
    );
  } catch {
    return false;
  }
};

const getMerchantTransactionIdIfExists = async (merchantTransactionId: string) => {
  const normalizedMerchantTx = normalizeOptionalText(merchantTransactionId);
  if (!normalizedMerchantTx) return null;

  const result = await query(
    `
    SELECT merchanttransactionid
    FROM orders
    WHERE merchanttransactionid = $1
    UNION ALL
    SELECT merchanttransactionid
    FROM thirdpartyorders
    WHERE merchanttransactionid = $1
    LIMIT 1
    `,
    [normalizedMerchantTx]
  );

  return result.rows[0]?.merchanttransactionid || null;
};

const resolveMerchantTransactionIdFromShiprocketRefs = async ({
  directCandidates = [],
  shipmentIds = [],
  shiprocketOrderIds = [],
  channelOrderIds = [],
}: {
  directCandidates?: any[];
  shipmentIds?: any[];
  shiprocketOrderIds?: any[];
  channelOrderIds?: any[];
}) => {
  const normalizedDirectCandidates = Array.from(
    new Set(
      (directCandidates || [])
        .map((candidate) => normalizeOptionalText(candidate))
        .filter(Boolean)
    )
  ) as string[];

  for (const directCandidate of normalizedDirectCandidates) {
    const merchantTx = await getMerchantTransactionIdIfExists(directCandidate);
    if (merchantTx) {
      return merchantTx;
    }
  }

  const shipmentRefs = Array.from(
    new Set(
      (shipmentIds || [])
        .map((candidate) => normalizeOptionalText(candidate))
        .filter(Boolean)
    )
  ) as string[];
  const shiprocketOrderRefs = Array.from(
    new Set(
      (shiprocketOrderIds || [])
        .map((candidate) => normalizeOptionalText(candidate))
        .filter(Boolean)
    )
  ) as string[];
  const channelOrderRefs = Array.from(
    new Set(
      (channelOrderIds || [])
        .map((candidate) => normalizeOptionalText(candidate))
        .filter(Boolean)
    )
  ) as string[];

  if (
    shipmentRefs.length === 0 &&
    shiprocketOrderRefs.length === 0 &&
    channelOrderRefs.length === 0
  ) {
    return null;
  }

  const lookupResult = await query(
    `
    SELECT merchanttransactionid
    FROM (
      SELECT merchanttransactionid, 1 AS priority
      FROM orders
      WHERE COALESCE(shiprocket_shipment_id::text, '') = ANY($1::text[])
      UNION ALL
      SELECT merchanttransactionid, 1 AS priority
      FROM thirdpartyorders
      WHERE COALESCE(shiprocket_shipment_id::text, '') = ANY($1::text[])
      UNION ALL
      SELECT merchanttransactionid, 2 AS priority
      FROM orders
      WHERE COALESCE(shiprocket_order_id::text, '') = ANY($2::text[])
      UNION ALL
      SELECT merchanttransactionid, 2 AS priority
      FROM thirdpartyorders
      WHERE COALESCE(shiprocket_order_id::text, '') = ANY($2::text[])
      UNION ALL
      SELECT merchanttransactionid, 3 AS priority
      FROM orders
      WHERE COALESCE(shiprocket_channel_order_id::text, '') = ANY($3::text[])
      UNION ALL
      SELECT merchanttransactionid, 3 AS priority
      FROM thirdpartyorders
      WHERE COALESCE(shiprocket_channel_order_id::text, '') = ANY($3::text[])
    ) refs
    ORDER BY priority
    LIMIT 1
    `,
    [shipmentRefs, shiprocketOrderRefs, channelOrderRefs]
  );

  return lookupResult.rows[0]?.merchanttransactionid || null;
};

const extractShiprocketWebhookIdentifiers = (payload: any) => {
  const data = payload?.data || {};
  const trackingData = payload?.tracking_data || data?.tracking_data || {};
  const trackingTrack = trackingData?.shipment_track?.[0] || {};

  return {
    directMerchantTransactionCandidates: [
      payload?.merchanttransactionid,
      payload?.merchantTransactionId,
      payload?.merchant_transaction_id,
      payload?.reference_id,
      data?.merchanttransactionid,
      data?.merchantTransactionId,
      data?.merchant_transaction_id,
      data?.reference_id,
      payload?.channel_order_id,
      payload?.channelOrderId,
      data?.channel_order_id,
      data?.channelOrderId,
      payload?.order_id,
      payload?.orderId,
      data?.order_id,
      data?.orderId,
    ],
    shipmentIds: [
      payload?.shipment_id,
      payload?.shipmentId,
      data?.shipment_id,
      data?.shipmentId,
      trackingData?.shipment_id,
      trackingData?.shipmentId,
      trackingTrack?.shipment_id,
    ],
    shiprocketOrderIds: [
      payload?.shiprocket_order_id,
      payload?.shiprocketOrderId,
      data?.shiprocket_order_id,
      data?.shiprocketOrderId,
      payload?.order_id,
      payload?.orderId,
      data?.order_id,
      data?.orderId,
    ],
    channelOrderIds: [
      payload?.channel_order_id,
      payload?.channelOrderId,
      data?.channel_order_id,
      data?.channelOrderId,
    ],
  };
};

const shortRef = (value: any, prefix = 6, suffix = 4): string | null => {
  if (!value) return null;
  const str = String(value);
  if (str.length <= prefix + suffix) return str;
  return `${str.slice(0, prefix)}...${str.slice(-suffix)}`;
};

const resolveWebhookTraceId = (eventId: string | null, paymentId: any): string => {
  if (eventId) return eventId;
  if (paymentId) return `payment-${paymentId}`;
  return `trace-${Date.now()}`;
};

const logWebhookStep = (
  traceId: string,
  step: string,
  details?: Record<string, any>
) => {
  if (details && Object.keys(details).length > 0) {
    console.log(
      `${RAZORPAY_WEBHOOK_LOG_PREFIX} [${traceId}] ${step}`,
      details
    );
    return;
  }
  console.log(`${RAZORPAY_WEBHOOK_LOG_PREFIX} [${traceId}] ${step}`);
};

const summarizeStatusCounts = (rows: any[], field: string) => {
  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const key = row?.[field] === null || row?.[field] === undefined
      ? "null"
      : String(row[field]);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

const summarizeWebhookPayload = (eventPayload: any) => {
  const paymentEntity = eventPayload?.payload?.payment?.entity || {};
  const orderEntity = eventPayload?.payload?.order?.entity || {};
  return {
    event: eventPayload?.event || null,
    accountId: eventPayload?.account_id || null,
    createdAt: eventPayload?.created_at || null,
    contains: Object.keys(eventPayload?.payload || {}),
    payment: {
      id: paymentEntity?.id || null,
      orderId: paymentEntity?.order_id || orderEntity?.id || null,
      status: paymentEntity?.status || null,
      amount: paymentEntity?.amount || null,
      currency: paymentEntity?.currency || null,
      method: paymentEntity?.method || null,
      captured: paymentEntity?.captured || null,
      errorCode: paymentEntity?.error_code || null,
      errorDescription: paymentEntity?.error_description || null,
    },
    order: {
      id: orderEntity?.id || null,
      amount: orderEntity?.amount || null,
      status: orderEntity?.status || null,
      paidAt: orderEntity?.paid_at || null,
    },
  };
};

const getMerchantTransactionStateSnapshot = async (merchantTransactionId: string) => {
  if (!merchantTransactionId) return null;
  try {
    const [ordersResult, thirdPartyOrdersResult, orderLineResult, transactionResult] =
      await Promise.all([
        query(
          `SELECT orderstatus, ispaymentsucceed FROM orders WHERE merchanttransactionid = $1`,
          [merchantTransactionId]
        ),
        query(
          `SELECT orderstatus, ispaymentsucceed FROM thirdpartyorders WHERE merchanttransactionid = $1`,
          [merchantTransactionId]
        ),
        query(
          `SELECT orderstatus FROM orderline WHERE merchanttransactionid = $1`,
          [merchantTransactionId]
        ),
        query(
          `SELECT transactionid, razorpay_payment_id, razorpay_order_id
           FROM transaction
           WHERE merchanttransactionid = $1
           ORDER BY createddate DESC
           LIMIT 5`,
          [merchantTransactionId]
        ),
      ]);

    return {
      merchantTransactionId,
      orders: {
        count: ordersResult.rowCount,
        statusCounts: summarizeStatusCounts(ordersResult.rows, "orderstatus"),
        paymentSuccessCounts: summarizeStatusCounts(
          ordersResult.rows,
          "ispaymentsucceed"
        ),
      },
      thirdPartyOrders: {
        count: thirdPartyOrdersResult.rowCount,
        statusCounts: summarizeStatusCounts(
          thirdPartyOrdersResult.rows,
          "orderstatus"
        ),
        paymentSuccessCounts: summarizeStatusCounts(
          thirdPartyOrdersResult.rows,
          "ispaymentsucceed"
        ),
      },
      orderLine: {
        count: orderLineResult.rowCount,
        statusCounts: summarizeStatusCounts(orderLineResult.rows, "orderstatus"),
      },
      transactions: {
        count: transactionResult.rowCount,
        latest: transactionResult.rows.map((row) => ({
          transactionid: row?.transactionid,
          razorpayPaymentId: row?.razorpay_payment_id,
          razorpayOrderId: row?.razorpay_order_id,
        })),
      },
    };
  } catch (error) {
    return {
      merchantTransactionId,
      snapshotError: error?.message || "Unable to fetch state snapshot",
    };
  }
};

const timingSafeHexEqual = (expectedHex: string, receivedHex: string) => {
  try {
    const expected = Buffer.from(expectedHex || "", "hex");
    const received = Buffer.from(receivedHex || "", "hex");
    if (expected.length === 0 || received.length === 0) return false;
    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(
      new Uint8Array(expected),
      new Uint8Array(received)
    );
  } catch {
    return false;
  }
};

const acquireProcessingLock = async (lockKey: string, ttlSeconds = 120) => {
  if (!lockKey || !redisClient || !redisClient.isOpen) {
    return { acquired: true, key: null as string | null };
  }

  const redisKey = `payment:lock:${lockKey}`;
  const result = await redisClient.set(redisKey, "1", {
    NX: true,
    EX: ttlSeconds,
  });
  return { acquired: result === "OK", key: redisKey };
};

const releaseProcessingLock = async (lockKey: string | null) => {
  if (!lockKey || !redisClient || !redisClient.isOpen) return;
  try {
    await redisClient.del(lockKey);
  } catch (lockReleaseError) {
    console.error("Unable to release processing lock:", lockReleaseError?.message || lockReleaseError);
  }
};

const createWebhookEventLedgerEntry = async (eventId: string, eventName: string, payload: any) => {
  if (!eventId) return null;
  try {
    const insertResult = await query(
      `INSERT INTO payment_webhook_events (provider, event_id, event_name, payload, status)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      ["razorpay", eventId, eventName || null, JSON.stringify(payload || {}), "received"]
    );

    if (insertResult.rows.length === 0) {
      return { duplicate: true, id: null };
    }

    return { duplicate: false, id: insertResult.rows[0].id };
  } catch (error) {
    return null;
  }
};

const markWebhookEventLedgerStatus = async (
  ledgerId: number | null,
  status: "processed" | "failed" | "ignored",
  errorMessage?: string
) => {
  if (!ledgerId) return;
  try {
    await query(
      `UPDATE payment_webhook_events
       SET status = $1,
           error_message = $2,
           processed_at = NOW()
       WHERE id = $3`,
      [status, errorMessage || null, ledgerId]
    );
  } catch (error) {
    console.error("Unable to update webhook ledger status:", error?.message || error);
  }
};

const hasProcessedWebhookEvent = async (eventId: string) => {
  if (!eventId || !redisClient || !redisClient.isOpen) {
    return false;
  }

  const redisKey = `razorpay:webhook:event:${eventId}`;
  const existing = await redisClient.get(redisKey);
  if (existing) return true;

  await redisClient.setEx(redisKey, 60 * 60 * 24 * 7, "1");
  return false;
};

const getOrderContextByMerchantTransactionId = async (merchantTransactionId: string) => {
  const ordersResult = await query(
    `SELECT * FROM orders WHERE merchanttransactionid = $1`,
    [merchantTransactionId]
  );
  const thirdPartyOrdersResult = await query(
    `SELECT * FROM thirdpartyorders WHERE merchanttransactionid = $1`,
    [merchantTransactionId]
  );
  const orderLineResult = await query(
    `SELECT * FROM orderline WHERE merchanttransactionid = $1`,
    [merchantTransactionId]
  );

  const combinedOrderRows = [...ordersResult.rows, ...thirdPartyOrdersResult.rows];
  if (combinedOrderRows.length === 0) {
    return null;
  }

  const expectedAmountRupees =
    ordersResult.rows.reduce((sum, row) => sum + toSafeNumber(row?.orderamount, 0), 0) +
    thirdPartyOrdersResult.rows.reduce((sum, row) => sum + toSafeNumber(row?.orderamount, 0), 0);

  const primaryOrderRow = orderLineResult.rows[0] || combinedOrderRows[0];
  const userId = primaryOrderRow?.userid;
  const addressId = primaryOrderRow?.addressid;

  const userResult = userId
    ? await query(
      `SELECT firstname, lastname, useremail, usermobilenumber FROM users WHERE id = $1`,
      [userId]
    )
    : { rows: [] };
  const addressResult = addressId
    ? await query(
      `SELECT address, city, state, pincode, mobilenumber FROM address WHERE id = $1`,
      [addressId]
    )
    : { rows: [] };

  const orderLineItems = orderLineResult.rows.map((row) => ({
    id: row.id,
    uniqueorderid: row.uniqueorderid,
    productid: row.productid,
    quantity: row.quantity,
    ordername: row.ordername,
    ordertype: row.ordertype,
    userid: row.userid,
    addressid: row.addressid,
    invoicefor: row.invoicefor,
    paymentmethod: row.paymentmethod,
    orderamount: row.orderamount,
    productamount: row.productamount,
    productname: row.productname,
    deliveryfrom: row.deliveryfrom,
    merchanttransactionid: row.merchanttransactionid,
  }));

  const productIdsFromOrderLine = orderLineItems
    .map((row) => row.productid)
    .filter((id) => id !== null && id !== undefined);

  const productIds =
    productIdsFromOrderLine.length > 0
      ? Array.from(new Set(productIdsFromOrderLine))
      : Array.from(
        new Set(
          combinedOrderRows.flatMap((row) =>
            Array.isArray(row?.productid) ? row.productid : [row?.productid]
          )
        )
      ).filter((id) => id !== null && id !== undefined);

  const transactionFor =
    primaryOrderRow?.invoicefor ||
    primaryOrderRow?.transactionfor ||
    "product";

  return {
    merchantTransactionId,
    combinedOrderRows,
    orderLineItems,
    primaryOrderRow,
    user: userResult.rows[0] || null,
    address: addressResult.rows[0] || null,
    userId,
    transactionFor,
    productIds,
    expectedAmountRupees,
  };
};

const isTruthyFlag = (value: any) =>
  value === true ||
  value === "true" ||
  value === 1 ||
  value === "1";

const getLatestTransactionByMerchantTransactionId = async (
  merchantTransactionId: string
) => {
  if (!merchantTransactionId) return null;

  const result = await query(
    `
    SELECT *
    FROM transaction
    WHERE merchanttransactionid = $1
    ORDER BY createddate DESC
    LIMIT 1
    `,
    [merchantTransactionId]
  );

  return result.rows[0] || null;
};

const syncSuccessfulPaymentStateFromTransaction = async (
  context: any,
  transactionRow: any
) => {
  if (!context || !transactionRow) {
    return context;
  }

  const orderHeaders = (context.combinedOrderRows || []).filter((row: any) =>
    String(row?.orderid || "").startsWith("TEQIT")
  );
  const thirdPartyHeaders = (context.combinedOrderRows || []).filter(
    (row: any) => !String(row?.orderid || "").startsWith("TEQIT")
  );

  const orderNeedsUpdate = orderHeaders.some(
    (row: any) => !isTruthyFlag(row?.ispaymentsucceed)
  );
  const thirdPartyNeedsUpdate = thirdPartyHeaders.some(
    (row: any) => !isTruthyFlag(row?.ispaymentsucceed)
  );

  const transactionSummary = {
    transactionid: transactionRow?.transactionid,
    name: transactionRow?.name || context?.user?.useremail || "unknown",
  };

  if (orderNeedsUpdate && orderHeaders.length > 0) {
    await ordersService.updateOrder(
      { order: orderHeaders, transactiondata: transactionSummary },
      false
    );
  }

  if (thirdPartyNeedsUpdate && thirdPartyHeaders.length > 0) {
    await thirdPartyOrdersService.updateThirdPartyOrder(
      { order: thirdPartyHeaders, transactiondata: transactionSummary },
      false
    );
  }

  if (!orderNeedsUpdate && !thirdPartyNeedsUpdate) {
    return context;
  }

  return await getOrderContextByMerchantTransactionId(context.merchantTransactionId);
};

const mapShiprocketStatusToOrderStatus = (rawStatus: any): string | null => {
  const normalized = String(rawStatus || "").trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("delivered")) return "delivered";
  if (normalized.includes("return")) return "returned";
  if (normalized.includes("cancel")) return "cancelled";
  if (
    normalized.includes("out for delivery") ||
    normalized.includes("in transit") ||
    normalized.includes("shipped") ||
    normalized.includes("dispatch") ||
    normalized.includes("pickup")
  ) {
    return "shipped";
  }
  if (
    normalized.includes("ready") ||
    normalized.includes("manifest") ||
    normalized.includes("awb") ||
    normalized.includes("label")
  ) {
    return "ready_to_dispatch";
  }
  return "ordered";
};

const mapShiprocketStatusCodeToOrderStatus = (statusCode: number | null): string | null => {
  if (statusCode === null || statusCode === undefined) return null;
  if (statusCode === 8) return "cancelled";
  if (statusCode === 1) return "ordered";
  return null;
};

const deriveShiprocketRawStatusFromCode = (
  statusCode: number | null,
  errorText: any
): string | null => {
  const normalizedError = String(errorText || "").trim().toLowerCase();
  if (normalizedError.includes("cancel")) return "CANCELED";

  if (statusCode === 8) return "CANCELED";
  if (statusCode === 1) return "NEW";
  return null;
};

const toNullableInteger = (value: any): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

const extractShiprocketTrackingSummary = (payload: any) => {
  let normalizedPayload = payload;
  if (Array.isArray(normalizedPayload) && normalizedPayload.length > 0) {
    normalizedPayload = normalizedPayload[0];
  }

  if (
    normalizedPayload &&
    typeof normalizedPayload === "object" &&
    !normalizedPayload?.tracking_data &&
    !normalizedPayload?.data?.tracking_data
  ) {
    const nestedEntries = Object.values(normalizedPayload).filter(
      (value: any) => value && typeof value === "object"
    );
    if (nestedEntries.length === 1) {
      normalizedPayload = nestedEntries[0];
    }
  }

  const trackingData =
    normalizedPayload?.tracking_data ||
    normalizedPayload?.data?.tracking_data ||
    normalizedPayload?.data ||
    {};
  const scans =
    normalizedPayload?.scans ||
    normalizedPayload?.data?.scans ||
    trackingData?.shipment_track_activities ||
    [];
  const primaryTrack =
    trackingData?.shipment_track?.[0] ||
    trackingData?.shipment_track_activities?.[0] ||
    trackingData?.track_status ||
    {};
  const firstScan = Array.isArray(scans) && scans.length > 0 ? scans[0] : {};

  const shipmentStatusCode =
    toNullableInteger(normalizedPayload?.shipment_status_id) ??
    toNullableInteger(normalizedPayload?.current_status_id) ??
    toNullableInteger(normalizedPayload?.data?.shipment_status_id) ??
    toNullableInteger(normalizedPayload?.data?.current_status_id) ??
    toNullableInteger(trackingData?.shipment_status) ??
    toNullableInteger(trackingData?.track_status) ??
    toNullableInteger(normalizedPayload?.status_code);

  const explicitRawStatus =
    normalizeOptionalText(normalizedPayload?.current_status) ||
    normalizeOptionalText(normalizedPayload?.shipment_status) ||
    normalizeOptionalText(normalizedPayload?.data?.current_status) ||
    normalizeOptionalText(normalizedPayload?.data?.shipment_status) ||
    normalizeOptionalText(trackingData?.shipment_status_label) ||
    normalizeOptionalText(trackingData?.current_status) ||
    normalizeOptionalText(primaryTrack?.current_status) ||
    normalizeOptionalText(primaryTrack?.activity) ||
    normalizeOptionalText(firstScan?.activity) ||
    normalizeOptionalText(normalizedPayload?.status);

  const rawStatus =
    explicitRawStatus ||
    deriveShiprocketRawStatusFromCode(
      shipmentStatusCode,
      trackingData?.error ||
      normalizedPayload?.error ||
      normalizedPayload?.message
    );

  const mappedOrderStatus =
    mapShiprocketStatusToOrderStatus(rawStatus) ??
    mapShiprocketStatusCodeToOrderStatus(shipmentStatusCode);

  return {
    rawStatus,
    mappedOrderStatus,
    awbCode:
      normalizedPayload?.awb ||
      normalizedPayload?.awb_code ||
      normalizedPayload?.data?.awb ||
      normalizedPayload?.data?.awb_code ||
      trackingData?.awb_code ||
      trackingData?.awb ||
      primaryTrack?.awb_code ||
      null,
    shipmentStatusCode,
    trackingData,
    scans,
  };
};

const applyShipmentLifecycleToOrders = async (
  merchantTransactionId: string,
  mappedStatus: string | null
) => {
  if (!merchantTransactionId || !mappedStatus) return;

  let previousStatuses = new Map<number, string>();
  if (mappedStatus === "returned") {
    const previousLineResult = await query(
      `
      SELECT id, orderstatus
      FROM orderline
      WHERE merchanttransactionid = $1
        AND COALESCE(orderstatus, '') NOT IN ('cancelled', 'returned', 'payment_failed')
      `,
      [merchantTransactionId]
    );
    previousStatuses = new Map(
      (previousLineResult.rows || []).map((row) => [
        Number(row.id),
        String(row.orderstatus || "").trim().toLowerCase(),
      ])
    );
  }

  let lineUpdateQuery = "";
  if (mappedStatus === "delivered") {
    lineUpdateQuery = `
      UPDATE orderline
      SET orderstatus = $1,
          dispatcheddate = COALESCE(dispatcheddate, EXTRACT(EPOCH FROM NOW())::bigint),
          delivereddate = COALESCE(delivereddate, EXTRACT(EPOCH FROM NOW())::bigint)
      WHERE merchanttransactionid = $2
        AND COALESCE(orderstatus, '') NOT IN ('cancelled', 'returned', 'payment_failed', 'delivered')
      RETURNING id, uniqueorderid, orderlinenumber, merchanttransactionid, productid, quantity, ordername, ordertype, deliveryfrom
    `;
  } else if (mappedStatus === "shipped") {
    lineUpdateQuery = `
      UPDATE orderline
      SET orderstatus = $1,
          readytodispatchdate = COALESCE(readytodispatchdate, EXTRACT(EPOCH FROM NOW())::bigint),
          dispatcheddate = COALESCE(dispatcheddate, EXTRACT(EPOCH FROM NOW())::bigint)
      WHERE merchanttransactionid = $2
        AND COALESCE(orderstatus, '') NOT IN ('cancelled', 'returned', 'payment_failed', 'delivered', 'shipped')
      RETURNING id, uniqueorderid, orderlinenumber, merchanttransactionid, productid, quantity, ordername, ordertype, deliveryfrom
    `;
  } else if (mappedStatus === "ready_to_dispatch") {
    lineUpdateQuery = `
      UPDATE orderline
      SET orderstatus = $1,
          readytodispatchdate = COALESCE(readytodispatchdate, EXTRACT(EPOCH FROM NOW())::bigint)
      WHERE merchanttransactionid = $2
        AND COALESCE(orderstatus, '') NOT IN ('cancelled', 'returned', 'payment_failed', 'delivered', 'shipped', 'ready_to_dispatch')
      RETURNING id, uniqueorderid, orderlinenumber, merchanttransactionid, productid, quantity, ordername, ordertype, deliveryfrom
    `;
  } else if (mappedStatus === "returned") {
    lineUpdateQuery = `
      UPDATE orderline
      SET orderstatus = $1,
          returneddate = COALESCE(returneddate, EXTRACT(EPOCH FROM NOW())::bigint)
      WHERE merchanttransactionid = $2
        AND COALESCE(orderstatus, '') NOT IN ('cancelled', 'returned', 'payment_failed')
      RETURNING id, uniqueorderid, orderlinenumber, merchanttransactionid, productid, quantity, ordername, ordertype, deliveryfrom
    `;
  } else {
    return;
  }

  const lineUpdateResult = await query(lineUpdateQuery, [mappedStatus, merchantTransactionId]);
  if (mappedStatus === "returned" && lineUpdateResult.rows.length > 0) {
    await ordersService.handleReturnedOrderLines(lineUpdateResult.rows, previousStatuses);
  }
  if ((mappedStatus === "shipped" || mappedStatus === "delivered") && lineUpdateResult.rows.length > 0) {
    await inventoryReservationService.transitionCommittedReservationsForOrderLines(
      lineUpdateResult.rows,
      "consumed",
      "shipment_sync"
    );
  }
  const uniqueOrderIds = Array.from(
    new Set(lineUpdateResult.rows.map((row) => row.uniqueorderid).filter(Boolean))
  ) as string[];
  if (uniqueOrderIds.length > 0) {
    await ordersService.syncOrderHeadersFromOrderLines(uniqueOrderIds);
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shiprocketAlreadySyncedForMerchant = async (
  merchantTransactionId: string
): Promise<boolean> => {
  if (!merchantTransactionId) return true;
  try {
    const r = await query(
      `SELECT 1 FROM orders WHERE merchanttransactionid = $1 AND shiprocket_order_id IS NOT NULL
       UNION ALL
       SELECT 1 FROM thirdpartyorders WHERE merchanttransactionid = $1 AND shiprocket_order_id IS NOT NULL
       LIMIT 1`,
      [merchantTransactionId]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
};

type ShiprocketCreateResult = {
  ok: boolean;
  reason: string;
  merchantTransactionId: string | null;
  pickupLocation?: string | null;
  attempts?: number;
  statusCode?: number | null;
  shiprocketOrderId?: string | null;
  shiprocketShipmentId?: string | null;
  error?: any;
  response?: any;
};

/**
 * Same Shiprocket ad-hoc create as Razorpay finalize, for Cash / PhonePe / retries.
 * Safe to call multiple times: skips if shipment ids already stored.
 */
const syncShiprocketAfterSuccessfulPayment = async (
  merchantTransactionId: string,
  transactionMeta?: {
    name?: string;
    amount?: number;
    mobilenumber?: string | null;
  }
) => {
  if (!merchantTransactionId) {
    return {
      ok: false,
      reason: "missing_merchant_transaction_id",
      merchantTransactionId: null,
    } as ShiprocketCreateResult;
  }
  try {
    if (await shiprocketAlreadySyncedForMerchant(merchantTransactionId)) {
      console.log(
        "[Shiprocket] Already synced; skip",
        shortRef(merchantTransactionId, 8, 6)
      );
      return {
        ok: true,
        reason: "already_synced",
        merchantTransactionId,
      } as ShiprocketCreateResult;
    }
    const context = await getOrderContextByMerchantTransactionId(merchantTransactionId);
    if (!context) {
      console.warn("[Shiprocket] No order context for merchant tx", merchantTransactionId);
      return {
        ok: false,
        reason: "missing_order_context",
        merchantTransactionId,
      } as ShiprocketCreateResult;
    }
    const tx = {
      merchanttransactionId: merchantTransactionId,
      name: transactionMeta?.name ?? context.user?.useremail ?? "unknown",
      amount: toSafeNumber(transactionMeta?.amount ?? context.expectedAmountRupees, 0),
      mobilenumber:
        transactionMeta?.mobilenumber ??
        context.user?.usermobilenumber ??
        context.address?.mobilenumber ??
        null,
    };
    const createResult = await createShiprocketOrderForTransaction(context, tx);
    if (!createResult.ok) {
      console.error("[Shiprocket] create failed after payment", {
        merchantTransactionId,
        reason: createResult.reason,
        pickupLocation: createResult.pickupLocation || null,
        attempts: createResult.attempts || 0,
        statusCode: createResult.statusCode ?? null,
        response: createResult.response ?? null,
        error: createResult.error ?? null,
      });
    }
    return createResult;
  } catch (e: any) {
    console.error("[Shiprocket] syncShiprocketAfterSuccessfulPayment:", e?.message || e);
    return {
      ok: false,
      reason: "sync_exception",
      merchantTransactionId,
      error: e?.response?.data || e?.message || e,
    } as ShiprocketCreateResult;
  }
};

const resolveUniqueOrderIdFromContext = (context: any) => {
  const candidates = [
    context?.primaryOrderRow?.uniqueorderid,
    context?.orderLineItems?.[0]?.uniqueorderid,
    context?.combinedOrderRows?.[0]?.orderid,
    context?.combinedOrderRows?.[0]?.uniqueorderid,
  ];

  for (const candidate of candidates) {
    if (candidate != null && String(candidate).trim() !== "") {
      return String(candidate).trim();
    }
  }

  return null;
};

const createShiprocketOrderForTransaction = async (context: any, transactionData: any) => {
  try {
    const merchantTx = transactionData?.merchanttransactionId;
    if (!merchantTx) {
      return {
        ok: false,
        reason: "missing_merchant_transaction_id",
        merchantTransactionId: null,
      } as ShiprocketCreateResult;
    }

    if (await shiprocketAlreadySyncedForMerchant(merchantTx)) {
      console.log("[Shiprocket] create skipped — DB already has shipment ids");
      return {
        ok: true,
        reason: "already_synced",
        merchantTransactionId: merchantTx,
      } as ShiprocketCreateResult;
    }

    const shippableOrderLineItems = (context.orderLineItems || []).filter(
      (item: any) => !isRentalOrderItem(item)
    );

    if (shippableOrderLineItems.length === 0) {
      console.log("[Shiprocket] create skipped — rental-only transaction", {
        merchantTransactionId: merchantTx,
        transactionFor: context?.transactionFor || null,
      });
      return {
        ok: true,
        reason: "rental_only_transaction",
        merchantTransactionId: merchantTx,
      } as ShiprocketCreateResult;
    }

    const orderData = shippableOrderLineItems[0] || context.primaryOrderRow;
    if (!orderData || !context.user || !context.address) {
      return {
        ok: false,
        reason: "missing_required_order_context",
        merchantTransactionId: merchantTx,
      } as ShiprocketCreateResult;
    }

    const shiprocketSettings = await getPersistedShiprocketSettings();
    if (!shiprocketSettings.autoCreateEnabled) {
      return {
        ok: true,
        reason: "auto_create_disabled",
        merchantTransactionId: merchantTx,
      } as ShiprocketCreateResult;
    }

    const pickupLocation =
      shiprocketSettings.pickupLocation ||
      resolveFulfillmentLocation({
        requestedLocation:
          shippableOrderLineItems.find((item: any) => item?.deliveryfrom)?.deliveryfrom ??
          context.combinedOrderRows.find((row: any) => row?.location)?.location ??
          null,
      });

    const shiprocketOrderItems =
      shippableOrderLineItems.length > 0
        ? shippableOrderLineItems.map((item: any) => ({
          name: item.productname || "Product",
          sku: `SKU-${item.productid}`,
          units: toSafeNumber(item.quantity, 1),
          selling_price: toSafeNumber(item.productamount, 0),
        }))
        : [
          {
            name: orderData.productname || "Product",
            sku: `SKU-${orderData.productid}`,
            units: toSafeNumber(orderData.quantity, 1),
            selling_price: toSafeNumber(orderData.productamount, 0),
          },
        ];

    const computedSubtotal =
      shippableOrderLineItems.reduce((sum: number, item: any) => {
        const quantity = toSafeNumber(item.quantity, 0);
        const productAmount = toSafeNumber(item.productamount, 0);
        return sum + quantity * productAmount;
      }, 0) || toSafeNumber(orderData.orderamount, transactionData.amount);

    const shiprocketPayload = {
      order_id: transactionData.merchanttransactionId,
      order_date: new Date().toISOString(),
      pickup_location: pickupLocation,
      billing_customer_name: context.user?.firstname || "Customer",
      billing_last_name: context.user?.lastname || "Customer",
      billing_address: context.address?.address || "Not Provided",
      billing_address_2: "Not Given",
      billing_city: context.address?.city || "Unknown City",
      billing_pincode: context.address?.pincode || "000000",
      billing_state: context.address?.state || "Unknown State",
      billing_country: "India",
      billing_email: context.user?.useremail || transactionData.name,
      billing_phone: context.user?.usermobilenumber || transactionData.mobilenumber,
      shipping_customer_name: context.user?.firstname || "Customer",
      shipping_last_name: context.user?.lastname || "Customer",
      shipping_address: context.address?.address || "Not Provided",
      shipping_address_2: "Not Given",
      shipping_city: context.address?.city || "Unknown City",
      shipping_pincode: context.address?.pincode || "000000",
      shipping_state: context.address?.state || "Unknown State",
      shipping_country: "India",
      shipping_is_billing: true,
      shipping_email: context.user?.useremail || transactionData.name,
      shipping_phone: context.user?.usermobilenumber || transactionData.mobilenumber,
      order_items: shiprocketOrderItems,
      payment_method: orderData.paymentmethod === "COD" ? "COD" : "Prepaid",
      sub_total: computedSubtotal,
      length: shiprocketSettings.defaultLength,
      breadth: shiprocketSettings.defaultBreadth,
      height: shiprocketSettings.defaultHeight,
      weight: shiprocketSettings.defaultWeight,
    };

    const baseUrl = process.env.SHIPROCKET_BASE_URL;
    if (!baseUrl) {
      console.error("[Shiprocket] SHIPROCKET_BASE_URL is not set");
      return {
        ok: false,
        reason: "missing_shiprocket_base_url",
        merchantTransactionId: merchantTx,
        pickupLocation,
      } as ShiprocketCreateResult;
    }

    const maxAttempts = 3;
    const retryDelaysMs = [0, 600, 2000];
    let shiprocketOrderData: any = null;
    let lastError: any = null;
    let lastResponse: any = null;
    let lastStatusCode: number | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (retryDelaysMs[attempt] > 0) {
        await sleep(retryDelaysMs[attempt]);
      }
      try {
        const token = await loginShiprocket();
        if (!token) {
          lastError = "shiprocket_login_failed";
          console.error(
            `[Shiprocket] login failed (attempt ${attempt + 1}/${maxAttempts})`,
            {
              merchantTransactionId: merchantTx,
              pickupLocation,
            }
          );
          continue;
        }
        const shiprocketResponse = await axios.post(
          `${baseUrl}/orders/create/adhoc`,
          shiprocketPayload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const data = shiprocketResponse.data;
        lastResponse = data;
        lastStatusCode = shiprocketResponse.status || null;
        if (data && (data.order_id != null || data.shipment_id != null)) {
          shiprocketOrderData = data;
          break;
        }
        console.warn(
          `[Shiprocket] Unexpected response (attempt ${attempt + 1}/${maxAttempts})`,
          {
            merchantTransactionId: merchantTx,
            pickupLocation,
            httpStatus: shiprocketResponse.status || null,
            response: data,
          }
        );
      } catch (error: any) {
        lastError = error?.response?.data || error?.message || error;
        lastStatusCode = error?.response?.status || null;
        console.error(
          `[Shiprocket] order create failed (attempt ${attempt + 1}/${maxAttempts}):`,
          {
            merchantTransactionId: merchantTx,
            pickupLocation,
            httpStatus: error?.response?.status || null,
            error: error?.response?.data || error?.message,
          }
        );
      }
    }

    if (!shiprocketOrderData) {
      return {
        ok: false,
        reason: "shiprocket_create_failed",
        merchantTransactionId: merchantTx,
        pickupLocation,
        attempts: maxAttempts,
        statusCode: lastStatusCode,
        error: lastError,
        response: lastResponse,
      } as ShiprocketCreateResult;
    }

    await query(
      `UPDATE orders 
       SET shiprocket_order_id = $1, shiprocket_shipment_id = $2, shiprocket_status_code = $3, shiprocket_status = $4, shiprocket_channel_order_id = $5
       WHERE merchanttransactionid = $6`,
      [
        shiprocketOrderData.order_id,
        shiprocketOrderData.shipment_id,
        shiprocketOrderData.status_code,
        shiprocketOrderData.status,
        shiprocketOrderData.channel_order_id,
        transactionData.merchanttransactionId,
      ]
    );

    await query(
      `UPDATE thirdpartyorders 
       SET shiprocket_order_id = $1, shiprocket_shipment_id = $2, shiprocket_status_code = $3, shiprocket_status = $4, shiprocket_channel_order_id = $5
       WHERE merchanttransactionid = $6`,
      [
        shiprocketOrderData.order_id,
        shiprocketOrderData.shipment_id,
        shiprocketOrderData.status_code,
        shiprocketOrderData.status,
        shiprocketOrderData.channel_order_id,
        transactionData.merchanttransactionId,
      ]
    );
    return {
      ok: true,
      reason: "shipment_created",
      merchantTransactionId: merchantTx,
      pickupLocation,
      attempts: 1,
      statusCode: 200,
      shiprocketOrderId: normalizeOptionalText(shiprocketOrderData.order_id),
      shiprocketShipmentId: normalizeOptionalText(shiprocketOrderData.shipment_id),
      response: shiprocketOrderData,
    } as ShiprocketCreateResult;
  } catch (error) {
    console.error("Shiprocket integration failed:", error?.message || error);
    return {
      ok: false,
      reason: "shiprocket_integration_exception",
      merchantTransactionId: transactionData?.merchanttransactionId || null,
      error: (error as any)?.response?.data || (error as any)?.message || error,
    } as ShiprocketCreateResult;
  }
};

const finalizeCapturedRazorpayPayment = async ({
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
  verifyCheckoutSignature,
  source,
  traceId = null,
}) => {
  const resolvedTraceId = traceId || `finalize-${source || "unknown"}`;
  logWebhookStep(resolvedTraceId, "FINALIZE_START", {
    source,
    razorpayPaymentId: shortRef(razorpayPaymentId),
    razorpayOrderId: shortRef(razorpayOrderId),
    verifyCheckoutSignature,
  });

  const gatewayOrder = await razorpay.orders.fetch(razorpayOrderId);
  const merchantTransactionId = gatewayOrder?.receipt;
  logWebhookStep(resolvedTraceId, "GATEWAY_ORDER_FETCHED", {
    razorpayOrderId: gatewayOrder?.id || razorpayOrderId,
    merchantTransactionId,
  });

  if (!merchantTransactionId) {
    logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
      status: 400,
      message: "Unable to map Razorpay order to merchant transaction",
    });
    return { status: 400, message: "Unable to map Razorpay order to merchant transaction" };
  }

  const lock = await acquireProcessingLock(
    `razorpay:${merchantTransactionId}:${razorpayPaymentId}`,
    180
  );
  logWebhookStep(resolvedTraceId, "LOCK_ATTEMPT", {
    merchantTransactionId,
    lockAcquired: lock.acquired,
  });
  if (!lock.acquired) {
    const existingTransaction = await query(
      `SELECT transactionid FROM transaction WHERE razorpay_payment_id = $1 OR razorpay_order_id = $2 OR merchanttransactionid = $3 LIMIT 1`,
      [razorpayPaymentId, razorpayOrderId, merchantTransactionId]
    );
    if (existingTransaction.rows.length > 0) {
      const existingContext = await getOrderContextByMerchantTransactionId(
        merchantTransactionId
      );
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 200,
        message: "Payment already processed",
        reason: "lock-not-acquired-existing-transaction",
      });
      return {
        status: 200,
        message: "Payment already processed",
        data: {
          redirectUrl: REDIRECT_URL_SUCCESS,
          uniqueorderid: resolveUniqueOrderIdFromContext(existingContext),
        },
      };
    }
    logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
      merchantTransactionId,
      status: 202,
      message: "Payment processing in progress",
      reason: "lock-not-acquired-no-transaction",
    });
    return { status: 202, message: "Payment processing in progress" };
  }

  try {
    let existingTransactionRecord = await getLatestTransactionByMerchantTransactionId(
      merchantTransactionId
    );
    if (existingTransactionRecord) {
      const existingContext = await getOrderContextByMerchantTransactionId(
        merchantTransactionId
      );
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 200,
        message: "Payment already processed",
        reason: "existing-transaction-before-process",
      });
      return {
        status: 200,
        message: "Payment already processed",
        data: {
          redirectUrl: REDIRECT_URL_SUCCESS,
          uniqueorderid: resolveUniqueOrderIdFromContext(existingContext),
        },
      };
    }

    if (verifyCheckoutSignature) {
      const generatedSignature = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${gatewayOrder.id}|${razorpayPaymentId}`)
        .digest("hex");
      logWebhookStep(resolvedTraceId, "CHECKOUT_SIGNATURE_VERIFICATION", {
        merchantTransactionId,
        generatedSignatureRef: shortRef(generatedSignature),
        receivedSignatureRef: shortRef(razorpaySignature),
      });

      if (!timingSafeHexEqual(generatedSignature, razorpaySignature || "")) {
        await safeCleanupPendingOrder(merchantTransactionId);
        const cleanupSnapshot = await getMerchantTransactionStateSnapshot(
          merchantTransactionId
        );
        logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
          merchantTransactionId,
          status: 400,
          message: "Invalid payment signature",
          cleanupSnapshot,
        });
        return { status: 400, message: "Invalid payment signature" };
      }
    }

    const payment = await razorpay.payments.fetch(razorpayPaymentId);
    logWebhookStep(resolvedTraceId, "PAYMENT_FETCHED", {
      merchantTransactionId,
      paymentStatus: payment?.status,
      paymentAmount: payment?.amount,
      paymentCurrency: payment?.currency,
      paymentMethod: payment?.method,
      paymentOrderId: payment?.order_id,
    });
    if (payment?.order_id !== gatewayOrder.id) {
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 400,
        message: "Payment does not belong to the expected order",
      });
      return { status: 400, message: "Payment does not belong to the expected order" };
    }

    if (payment.status !== "captured") {
      if (payment.status === "failed") {
        await safeCleanupPendingOrder(merchantTransactionId);
        const failedCleanupSnapshot = await getMerchantTransactionStateSnapshot(
          merchantTransactionId
        );
        logWebhookStep(resolvedTraceId, "PAYMENT_FAILED_CLEANUP", {
          merchantTransactionId,
          failedCleanupSnapshot,
        });
      }
      if (source === "webhook" && payment.status === "authorized") {
        logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
          merchantTransactionId,
          status: 200,
          message: "Payment authorized, waiting for capture",
        });
        return { status: 200, message: "Payment authorized, waiting for capture" };
      }
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 400,
        message: "Payment not captured",
      });
      return { status: 400, message: "Payment not captured" };
    }

    let context = await getOrderContextByMerchantTransactionId(merchantTransactionId);
    if (!context) {
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 400,
        message: "Payment timed out, try again.",
      });
      return { status: 400, message: "Payment timed out, try again." };
    }
    logWebhookStep(resolvedTraceId, "ORDER_CONTEXT_RESOLVED", {
      merchantTransactionId,
      totalOrderRows: context?.combinedOrderRows?.length || 0,
      totalOrderLineRows: context?.orderLineItems?.length || 0,
      transactionFor: context?.transactionFor,
      expectedAmountRupees: context?.expectedAmountRupees,
    });

    const expectedAmountPaise = Math.round(toSafeNumber(gatewayOrder?.amount, 0));
    if (expectedAmountPaise > 0 && Number(payment.amount) !== expectedAmountPaise) {
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 400,
        message: "Amount mismatch between order and payment",
        expectedAmountPaise,
        receivedAmountPaise: Number(payment.amount),
      });
      return { status: 400, message: "Amount mismatch between order and payment" };
    }

    const settledAmountRupees = Number(payment.amount) / 100;

    const transactionPayload = {
      transaction: {
        merchanttransactionId: merchantTransactionId,
        name: context.user?.useremail || "unknown",
        amount: toSafeNumber(settledAmountRupees, 0),
        mobilenumber:
          context.user?.usermobilenumber || context.address?.mobilenumber || null,
        productid: context.productIds,
        transactionfor: context.transactionFor,
        userId: context.userId,
        transactiondata: payment,
        razorpay_signature: razorpaySignature || "",
      },
      order: context.orderLineItems,
    };

    const heldReservationResult =
      await inventoryReservationService.getReservationsForMerchantTransactionId(
        merchantTransactionId,
        ["held"]
      );
    const hasHeldReservations = (heldReservationResult?.rows || []).length > 0;

    const alreadySucceeded = context.combinedOrderRows.some((row) =>
      isTruthyFlag(row?.ispaymentsucceed)
    );
    const headersNeedPaymentStateSync = context.combinedOrderRows.some(
      (row) => !isTruthyFlag(row?.ispaymentsucceed)
    );

    if (!existingTransactionRecord) {
      let result: any;
      try {
        logWebhookStep(resolvedTraceId, "TRANSACTION_INSERT_START", {
          merchantTransactionId,
          orderLineItems: context.orderLineItems.length,
        });
        result = await transactionService.insertTransactionData(
          transactionPayload,
          context.combinedOrderRows
        );
      } catch (error) {
        if (error?.code === "23505") {
          existingTransactionRecord = await getLatestTransactionByMerchantTransactionId(
            merchantTransactionId
          );
          logWebhookStep(resolvedTraceId, "TRANSACTION_INSERT_SKIPPED", {
            merchantTransactionId,
            reason: "unique-constraint-existing-transaction",
            transactionid: existingTransactionRecord?.transactionid || null,
          });
        } else {
          throw error;
        }
      }

      if (result) {
        logWebhookStep(resolvedTraceId, "TRANSACTION_INSERT_RESULT", {
          merchantTransactionId,
          transactionCount: Array.isArray(result?.transactionData)
            ? result.transactionData.length
            : 0,
          orderDataRows: Array.isArray(result?.orderdata) ? result.orderdata.length : 0,
        });

        if (
          !result?.orderdata ||
          !result?.transactionData ||
          result.orderdata.length === 0 ||
          result.transactionData.length === 0
        ) {
          const failedProcessSnapshot = await getMerchantTransactionStateSnapshot(
            merchantTransactionId
          );
          logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
            merchantTransactionId,
            status: 400,
            message:
              "Transaction failure. If payment debited, it will be refunded in 5 business days",
            failedProcessSnapshot,
          });
          return {
            status: 400,
            message:
              "Transaction failure. If payment debited, it will be refunded in 5 business days",
          };
        }

        existingTransactionRecord =
          result?.transactionData?.[0] ||
          (await getLatestTransactionByMerchantTransactionId(merchantTransactionId));
        context =
          (await getOrderContextByMerchantTransactionId(merchantTransactionId)) || context;
      }
    }

    if (!existingTransactionRecord) {
      const failedProcessSnapshot = await getMerchantTransactionStateSnapshot(
        merchantTransactionId
      );
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 400,
        message: "Unable to resolve transaction record for successful payment",
        failedProcessSnapshot,
      });
      return {
        status: 400,
        message: "Unable to resolve transaction record for successful payment",
      };
    }

    if (headersNeedPaymentStateSync || !alreadySucceeded) {
      context =
        (await syncSuccessfulPaymentStateFromTransaction(
          context,
          existingTransactionRecord
        )) || context;
    }

    if (!hasHeldReservations && context.combinedOrderRows.every((row) => isTruthyFlag(row?.ispaymentsucceed))) {
      const alreadyProcessedSnapshot = await getMerchantTransactionStateSnapshot(
        merchantTransactionId
      );
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 200,
        message: "Payment already processed",
        alreadyProcessedSnapshot,
      });
      return {
        status: 200,
        message: "Payment already processed",
        data: {
          redirectUrl: REDIRECT_URL_SUCCESS,
          uniqueorderid: resolveUniqueOrderIdFromContext(context),
        },
      };
    }

    const expectedAmountPaiseFromContext = Math.round(toSafeNumber(context.expectedAmountRupees, 0) * 100);
    if (expectedAmountPaiseFromContext > 0 && Number(payment.amount) !== expectedAmountPaiseFromContext) {
      logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
        merchantTransactionId,
        status: 400,
        message: "Amount mismatch between order and payment",
        expectedAmountPaise: expectedAmountPaiseFromContext,
        receivedAmountPaise: Number(payment.amount),
      });
      return { status: 400, message: "Amount mismatch between order and payment" };
    }

    const transactionPayloadForWebhook = {
      transaction: {
        merchanttransactionId: merchantTransactionId,
        name: context.user?.useremail || "unknown",
        amount: toSafeNumber(context.expectedAmountRupees, 0),
        mobilenumber:
          context.user?.usermobilenumber || context.address?.mobilenumber || null,
        productid: context.productIds,
        transactionfor: context.transactionFor,
        userId: context.userId,
        transactiondata: payment,
        razorpay_signature: razorpaySignature || "",
      },
      order: context.orderLineItems,
    };

    let result: any;
    try {
      logWebhookStep(resolvedTraceId, "TRANSACTION_INSERT_START", {
        merchantTransactionId,
        orderLineItems: context.orderLineItems.length,
      });
      result = await transactionService.insertTransactionData(
        transactionPayloadForWebhook,
        context.combinedOrderRows
      );
    } catch (error) {
      if (error?.code === "23505") {
        const duplicateSnapshot = await getMerchantTransactionStateSnapshot(
          merchantTransactionId
        );
        logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
          merchantTransactionId,
          status: 200,
          message: "Payment already processed",
          reason: "unique-constraint",
          duplicateSnapshot,
        });
        return {
          status: 200,
          message: "Payment already processed",
          data: {
            redirectUrl: REDIRECT_URL_SUCCESS,
            uniqueorderid: resolveUniqueOrderIdFromContext(
              await getOrderContextByMerchantTransactionId(merchantTransactionId)
            ),
          },
        };
      }
      throw error;
    }
    logWebhookStep(resolvedTraceId, "TRANSACTION_INSERT_RESULT", {
      merchantTransactionId,
      source: "reservation_ledger_with_orderline_fallback",
    });
    const inventoryCommitResult = await commitMerchantTransactionInventory(
      merchantTransactionId,
      context.orderLineItems
    );
    logWebhookStep(resolvedTraceId, "PRODUCT_QTY_UPDATE_DONE", {
      merchantTransactionId,
      updatedProducts: inventoryCommitResult.quantityUpdates.length,
      updatedItems: inventoryCommitResult.quantityUpdates,
      heldReservationRows: inventoryCommitResult.heldReservationRows.length,
    });

    await deletePurchasedCartEntries(context.userId, context.orderLineItems);

    logWebhookStep(resolvedTraceId, "SHIPROCKET_SYNC_START", {
      merchantTransactionId,
    });
    const shiprocketCreateResult = await createShiprocketOrderForTransaction(
      context,
      transactionPayload.transaction
    );
    if (shiprocketCreateResult?.ok) {
      logWebhookStep(resolvedTraceId, "SHIPROCKET_SYNC_DONE", {
        merchantTransactionId,
        reason: shiprocketCreateResult.reason,
        pickupLocation: shiprocketCreateResult.pickupLocation || null,
        shiprocketOrderId: shiprocketCreateResult.shiprocketOrderId || null,
        shiprocketShipmentId: shiprocketCreateResult.shiprocketShipmentId || null,
      });
    } else {
      logWebhookStep(resolvedTraceId, "SHIPROCKET_SYNC_FAILED", {
        merchantTransactionId,
        reason: shiprocketCreateResult?.reason || "unknown",
        pickupLocation: shiprocketCreateResult?.pickupLocation || null,
        attempts: shiprocketCreateResult?.attempts || 0,
        statusCode: shiprocketCreateResult?.statusCode ?? null,
        response: shiprocketCreateResult?.response ?? null,
        error: shiprocketCreateResult?.error ?? null,
      });
    }

    const successSnapshot = await getMerchantTransactionStateSnapshot(
      merchantTransactionId
    );
    logWebhookStep(resolvedTraceId, "FINALIZE_EXIT", {
      merchantTransactionId,
      status: 200,
      message: "Payment verified and processed successfully",
      successSnapshot,
    });

    return {
      status: 200,
      message: "Payment verified and processed successfully",
      uniqueorderid: resolveUniqueOrderIdFromContext(context),
      data: {
        redirectUrl: REDIRECT_URL_SUCCESS,
        uniqueorderid: resolveUniqueOrderIdFromContext(context),
      },
    };
  } finally {
    logWebhookStep(resolvedTraceId, "LOCK_RELEASE", {
      lockKey: lock.key,
    });
    await releaseProcessingLock(lock.key);
  }
};

export module transactionService {
  export const getTransactionData = async (request) => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);

      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "modifieddate";
      let orderByDirection = "DESC";

      keys.forEach((key, index) => {
        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        if (key === "displaysize" || key === "price") {
          const rangeClauses = paramValues.map((range) => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            return `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
              })`;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
          parameterIndex += 2 * paramValues.length;
        } else if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (paramValues[0].startsWith("NOT ")) {
          const cleanValue = paramValues[0].slice(4);
          whereClauses.push(`(${key} != $${parameterIndex})`);
          queryParams.push(cleanValue);
          parameterIndex++;
        } else if (key !== "page" && key !== "count") {
          const clauses = paramValues.map(
            (_, idx) => `${key} = $${parameterIndex + idx}`
          );
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });

      const offset = (pageNumber - 1) * recordCount;
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} ` : ``;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

      let queryText = `SELECT * FROM transaction ${whereClause} ${orderByClause}`;

      if (pageNumber && recordCount) {
        queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
      }
      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result);
      return datatypeCheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getTransactionData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const paymentInitialization = async (request: any) => {
    try {
      let {
        merchanttransactionId,
        name,
        amount,
        mobilenumber,
        userid,
        productid,
        transactionfor,
      } = request.body.transaction;
      let orderdata = request.body.order;
      await allocateProductLocationsForOrder(orderdata);
      request.body.transaction.storelocation = resolveTransactionStoreLocation(orderdata);
      const fulfillmentBuckets = await ordersService.buildFulfillmentBuckets(
        orderdata,
        merchanttransactionId
      );
      if (fulfillmentBuckets.validationErrors.length > 0) {
        return {
          status: 400,
          message:
            "One or more products are out of stock. Please try again later.",
          errorDetails: fulfillmentBuckets.validationErrors,
        };
      }
      await inventoryReservationService.replaceHeldReservations(
        merchanttransactionId,
        fulfillmentBuckets.ordersToInsert
      );
      const capacityCheck = await validateReservationCapacity(
        fulfillmentBuckets.ordersToInsert,
        merchanttransactionId
      );
      if (!capacityCheck.ok) {
        await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
          merchanttransactionId,
          "insufficient_inventory"
        );
        return {
          status: 400,
          message:
            "One or more products are out of stock. Please try again later.",
        };
      }
      const authoritativeAmount = computePayableAmountFromOrderInput(orderdata, amount);
      amount = authoritativeAmount;
      request.body.transaction.amount = authoritativeAmount;
      const data = {
        merchantId: MERCHANT_ID,
        merchantTransactionId: merchanttransactionId,
        name: name,
        amount: authoritativeAmount * 100,
        redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/status?id=${merchanttransactionId}&token=${request.headers.authorization}`,
        redirectMode: "POST",
        mobileNumber: mobilenumber,
        paymentInstrument: {
          type: "PAY_PAGE",
        },
      };
      const payload = JSON.stringify(data);
      const payloadMain = Buffer.from(payload).toString("base64");
      const string = payloadMain + "/pg/v1/pay" + SALT_KEY;
      const sha256 = crypto.createHash("sha256").update(string).digest("hex");
      const checksum = sha256 + "###" + keyIndex;

      const prod_url =
        "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";

      const options = {
        method: "POST",
        url: prod_url,
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
        },
        data: {
          request: payloadMain,
        },
      };
      let response;
      try {
        response = await axios(options);
      } catch (error) {
        console.log(error.message, "Error in axios options");
        await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
          merchanttransactionId,
          "gateway_initialization_error"
        );
        return REDIRECT_URL_SUCCESS;
      }

      request.body.order.forEach((e) => {
        e.merchanttransactionid = response.data.data.merchantTransactionId;
      });
      try {
        let createHttpTaskResult = await createHttpTask(
          response.data.data.merchantTransactionId
        );
        console.log(createHttpTaskResult, " ===>> createHttpTaskResult");
        if (createHttpTaskResult?.success === false) {
          await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
            response.data.data.merchantTransactionId,
            "task_creation_failed"
          );
          return {
            status: 400,
            message: "Task Not Created For Making Order. Please contact Admin",
          };
        }
        let insertorderdata = await ordersService.bulkInsertOrder(
          request.body.transaction,
          request.body.order
        );
      } catch (error) {
        console.log(error.message, "Error in Task paymentInitialization");
        await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
          response?.data?.data?.merchantTransactionId || merchanttransactionId,
          "order_initialization_error"
        );
        await safeCleanupPendingOrder(
          response?.data?.data?.merchantTransactionId || merchanttransactionId
        );
        return {
          status: 500,
          message: "Error processing order. Inventory reservation has been released.",
        };
      }
      console.log(response, " ===>> response in axios");

      return response.data.data.instrumentResponse.redirectInfo.url;
    } catch (error) {
      console.error(
        "Query Execution Error: IN paymentInitialization",
        error.message
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
        request?.body?.transaction?.merchanttransactionId,
        "payment_initialization_error"
      );
      await safeCleanupPendingOrder(request?.body?.transaction?.merchanttransactionId);
      return ErrorMessage;
    }
  };

  export const paymentConfirmation = async (request: any, reply: any) => {
    try {
      const merchantTransactionId = request.query.id;
      const checkMerchantId = await query(
        `SELECT merchanttransactionid FROM orders WHERE merchanttransactionid = $1`,
        [merchantTransactionId]
      );
      if (checkMerchantId.rows.length === 0) {
        return { message: "Payment timed out, try again." };
      }
      const cloudflaretoken = request.query.token;
      const transactionfor = request.query.transactionfor;
      const merchantId = MERCHANT_ID;
      const keyIndex = 1;
      const string =
        `/pg/v1/status/${merchantId}/${merchantTransactionId}` + SALT_KEY;
      const sha256 = crypto.createHash("sha256").update(string).digest("hex");
      const checksum = sha256 + `###` + keyIndex;
      const options = {
        method: "GET",
        url: `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchantId}/${merchantTransactionId}`,
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": `${merchantId}`,
        },
      };
      const response = await axios(options);
      const context = await getOrderContextByMerchantTransactionId(merchantTransactionId);
      if (!context) {
        return { message: "Payment timed out, try again." };
      }

      if (response.data.code && response.data.code == "PAYMENT_SUCCESS") {
        const transactionPayload = {
          transaction: {
            merchanttransactionId: merchantTransactionId,
            name: context.user?.useremail || "unknown",
            amount: toSafeNumber(context.expectedAmountRupees, 0),
            mobilenumber:
              context.user?.usermobilenumber || context.address?.mobilenumber || null,
            productid: context.productIds,
            transactionfor: context.transactionFor,
            userId: context.userId,
            transactiondata: response.data,
            razorpay_signature: "",
          },
          order: context.orderLineItems,
        };
        let result: any = await insertTransactionData(
          transactionPayload,
          context.combinedOrderRows
        );
        if (
          result.orderdata &&
          result.orderdata.length > 0 &&
          result.transactionData &&
          result.transactionData.length > 0
        ) {
          await commitMerchantTransactionInventory(
            merchantTransactionId,
            context.orderLineItems
          );
          await deletePurchasedCartEntries(context.userId, context.orderLineItems);
          const messageData = {
            title: "Hello User",
            body: "Payment Done Successfully",
          };
          await messageinitialization(
            context.userId,
            messageData
          );
          await syncShiprocketAfterSuccessfulPayment(merchantTransactionId, {
            name: context.user?.useremail || "unknown",
            amount: toSafeNumber(context.expectedAmountRupees, 0),
            mobilenumber:
              context.user?.usermobilenumber || context.address?.mobilenumber || null,
          });
        } else {
          await safeCleanupPendingOrder(merchantTransactionId);
          return "Transaction Failure If payment debited it will be refunded in 5 business Days";
        }
      } else {
        await safeCleanupPendingOrder(merchantTransactionId);
        const messageData = {
          title: "Hello User",
          body: "Payment Not Done. If Any Payment Debited it will be refunded in 5 business Days",
        };
        await messageinitialization(
          context.userId,
          messageData
        );
      }
      const queryParams = new URLSearchParams(response.data).toString();
      let url = REDIRECT_URL_SUCCESS;
      if (!response.data.success) {
        url = `${REDIRECT_URL_SUCCESS}`;
      }
      reply.redirect(url);
    } catch (error) {
      await safeCleanupPendingOrder(request?.query?.id);
      console.error("Query Execution Error: IN paymentConfirmation", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const insertTransaction = async (transactiondata: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...upsertFields } = transactiondata;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);

      querydata = `INSERT INTO transaction (${fieldNames.join(
        ", "
      )}) VALUES (${fieldNames
        .map((_, index) => `$${index + 1}`)
        .join(", ")}) RETURNING *`;
      params = fieldValues;

      const result = await query(querydata, params);
      return result;
    } catch (error) {
      console.error("Query Execution Error: IN insertTransaction", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const insertTransactionData = async (
    transactionData: any,
    insersertdordderdatawithprocessing: any,
    // razorpay_signature: string,
    paymentfailed = false
  ) => {
    try {
      console.log("Inside insertTransactionData service");
      console.log("Transaction Data:", transactionData);

      let {
        merchanttransactionId,
        name,
        amount,
        mobilenumber,
        productid,
        transactionfor,
        userId,
        transactiondata,
      } = transactionData.transaction;
      if (mobilenumber === "") {
        mobilenumber = null;
      }
      console.log("Transaction Data:>", transactionData);
      console.log("Transaction Data:>", transactionData.transaction);
      console.log(
        "razorpay_payment_id>",
        transactionData.transaction.transactiondata.id
      );
      console.log(
        "razorpay_order_id>",
        transactionData.transaction.transactiondata.order_id
      );
      // console.log("razorpay_signature:>", razorpay_signature);
      console.log("end");

      const razorpay_payment_id =
        transactionData.transaction.transactiondata.id;
      const razorpay_order_id =
        transactionData.transaction.transactiondata.order_id;
      const razorpay_signature = transactionData.transaction.razorpay_signature;

      const order = transactionData.order;

      const insertTransactionQuery = `
                INSERT INTO transaction (merchanttransactionId, name, amount, mobilenumber, productid, transactionfor, userId, transactiondata,razorpay_payment_id,razorpay_order_id, razorpay_signature)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`;

      const values = [
        merchanttransactionId,
        name,
        amount,
        mobilenumber,
        productid,
        transactionfor,
        userId,
        transactiondata,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
      ];

      const transactionResult = await query(insertTransactionQuery, values);
      console.log("Transaction Result:", transactionResult.rows);
      console.log("end");
      if (transactionResult.command === "INSERT") {
        const insertedTransaction = transactionResult.rows[0];
        const finalResult = {
          order: insersertdordderdatawithprocessing,
          transactiondata: { ...insertedTransaction },
        } as any;
        console.log("Final Result:", finalResult);
        const orderdata = {
          order: finalResult.order.filter(
            (order) => order.orderid && order.orderid.startsWith("TEQIT")
          ),
          transactiondata: finalResult.transactiondata,
        };

        const thirdpartyorderdata = {
          order: finalResult.order.filter(
            (order) => !order.orderid || !order.orderid.startsWith("TEQIT")
          ),
          transactiondata: finalResult.transactiondata,
        };

        console.log("Order Data:", orderdata);
        console.log("Third Party Order Data:", thirdpartyorderdata);
        console.log("Payment Failed:");

        let orderupdated = { status: null, data: null };
        let thirdpartyorderupdate = { status: null, data: null };

        const shouldUpdateOrder = orderdata.order && orderdata.order.length > 0;
        const shouldUpdateThirdPartyOrder =
          thirdpartyorderdata.order && thirdpartyorderdata.order.length > 0;
        console.log("Should Update Order:", shouldUpdateOrder);
        console.log(
          "Should Update Third Party Order:",
          shouldUpdateThirdPartyOrder
        );
        console.log("end");
        if (shouldUpdateOrder) {
          console.log("Going to update order");
          orderupdated = await ordersService.updateOrder(
            orderdata,
            paymentfailed
          );
        }

        if (shouldUpdateThirdPartyOrder) {
          console.log("Going to update third party order");
          thirdpartyorderupdate =
            await thirdPartyOrdersService.updateThirdPartyOrder(
              thirdpartyorderdata,
              paymentfailed
            );
        }

        const isOrderUpdateSuccess = shouldUpdateOrder
          ? orderupdated.status === "success"
          : true;
        const isThirdPartyUpdateSuccess = shouldUpdateThirdPartyOrder
          ? thirdpartyorderupdate.status === "success"
          : true;
        console.log("Is Order Update Success:", isOrderUpdateSuccess);
        console.log(
          "Is Third Party Update Success:",
          isThirdPartyUpdateSuccess
        );
        console.log("end");
        if (isOrderUpdateSuccess && isThirdPartyUpdateSuccess) {
          return {
            orderdata: orderupdated.data || thirdpartyorderupdate.data || null,
            transactionData: [finalResult.transactiondata],
          };
        } else {
          console.log("Order update failed");
          return {
            orderdata: "Order Not Updated Please contact Admin",
            transactionData: finalResult.transactiondata,
          };
        }
      } else {
        console.log("Transaction Not Inserted");
        return {
          orderdata: "Order Not Updated Please contact Admin",
          transactionData: "Order Not Updated Please contact Admin",
        };
      }
    } catch (error) {
      console.error("Error insertTransactionData:", error);
      throw error;
    }
  };

export const paymentInitializationRazorpay = async (request: any) => {
  try {
    console.log("Inside paymentInitializationRazorpay service");

    let {
      merchanttransactionId,
      name,
      amount,
      mobilenumber,
      userid,
      productid,
      transactionfor,
    } = request.body.transaction;

    let orderdata = request.body.order;

    // ✅ Assign locations
    await allocateProductLocationsForOrder(orderdata);
    request.body.transaction.storelocation = resolveTransactionStoreLocation(orderdata);

    // ✅ Build fulfillment
    const fulfillmentBuckets = await ordersService.buildFulfillmentBuckets(
      orderdata,
      merchanttransactionId
    );

    if (fulfillmentBuckets.validationErrors.length > 0) {
      return {
        status: 400,
        message: "One or more products are out of stock. Please try again later.",
        errorDetails: fulfillmentBuckets.validationErrors,
      };
    }

    const authoritativeAmount = computePayableAmountFromOrderInput(
      orderdata,
      amount
    );
    amount = authoritativeAmount;
    request.body.transaction.amount = authoritativeAmount;

    // ✅ Refresh rental quantities
    if (request.body?.order?.[0]?.invoicefor === "product rental") {
      try {
        const productIds = Array.from(
          new Set(
            (orderdata || [])
              .map((item: any) => Number(item?.productid))
              .filter((id: number) => Number.isFinite(id) && id > 0)
          )
        );

        if (productIds.length > 0) {
          const pucResult = await query(
            `SELECT DISTINCT puc FROM product_revo WHERE id = ANY($1)`,
            [productIds]
          );

          const pucs = (pucResult.rows || [])
            .map((row: any) => String(row?.puc || "").trim())
            .filter(Boolean);

          await Promise.all(
            pucs.map((puc: string) =>
              productrevoService.updateCatalogueQuantities(puc)
            )
          );
        }
      } catch (error) {
        console.warn("Rental quantity refresh failed:", error?.message || error);
      }
    }

    // ======================================================
    // ✅ CASH PAYMENT FLOW
    // ======================================================
    if (request.body.order[0].paymentmethod === "Cash") {

      await inventoryReservationService.replaceHeldReservations(
        merchanttransactionId,
        fulfillmentBuckets.ordersToInsert
      );

      const capacityCheck = await validateReservationCapacity(
        fulfillmentBuckets.ordersToInsert,
        merchanttransactionId
      );

      if (!capacityCheck.ok) {
        await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
          merchanttransactionId,
          "insufficient_inventory"
        );

        return {
          status: 400,
          message: "One or more products are out of stock. Please try again later.",
        };
      }

      // ✅ Create order
      const insertorderdata = await ordersService.bulkInsertOrder(
        request.body.transaction,
        request.body.order
      );

      const context = await getOrderContextByMerchantTransactionId(merchanttransactionId);

      if (!context) {
        await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
          merchanttransactionId,
          "missing_order_context"
        );
        await safeCleanupPendingOrder(merchanttransactionId);

        return {
          status: 500,
          message: "Unable to finalize cash order.",
        };
      }

      // ✅ Insert transaction
      const transactionPayload = {
        transaction: {
          merchanttransactionId,
          name,
          amount: authoritativeAmount,
          mobilenumber: mobilenumber === "" ? null : mobilenumber,
          productid,
          transactionfor,
          userId: context.userId,
          transactiondata: {
            status: "Cash Paid",
            provider: "offline_cash",
            amount: authoritativeAmount,
          },
          razorpay_signature: "",
        },
        order: context.orderLineItems,
      };

      const transactionResult = await insertTransactionData(
        transactionPayload,
        context.combinedOrderRows
      );

      if (
        !transactionResult?.orderdata ||
        !transactionResult?.transactionData
      ) {
        await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
          merchanttransactionId,
          "cash_finalize_failed"
        );
        await safeCleanupPendingOrder(merchanttransactionId);

        return {
          status: 500,
          message: "Unable to finalize cash order.",
        };
      }

      // ✅ Commit inventory
      await commitMerchantTransactionInventory(
        merchanttransactionId,
        context.orderLineItems
      );

      await deletePurchasedCartEntries(context.userId, orderdata);

      await syncShiprocketAfterSuccessfulPayment(merchanttransactionId, {
        name,
        amount: authoritativeAmount,
        mobilenumber,
      });

      return {
        status: 200,
        uniqueorderid: insertorderdata.rows[0].orderid,
        data: {
          status: "success",
          message: "Order placed successfully",
          uniqueorderid: insertorderdata.rows[0].orderid,
        },
      };
    }

    // ======================================================
    // ✅ ONLINE PAYMENT FLOW
    // ======================================================

    await inventoryReservationService.replaceHeldReservations(
      merchanttransactionId,
      fulfillmentBuckets.ordersToInsert
    );

    const capacityCheck = await validateReservationCapacity(
      fulfillmentBuckets.ordersToInsert,
      merchanttransactionId
    );

    if (!capacityCheck.ok) {
      await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
        merchanttransactionId,
        "insufficient_inventory"
      );

      return {
        status: 400,
        message: "One or more products are out of stock. Please try again later.",
      };
    }

    const order = await razorpay.orders.create({
      amount: authoritativeAmount * 100,
      currency: "INR",
      receipt: merchanttransactionId,
      notes: {
        name,
        mobilenumber,
        userid,
        transactionfor,
      },
    });

    request.body.order.forEach((e) => {
      e.merchanttransactionid = merchanttransactionId;
    });

    try {
      await createHttpTask(merchanttransactionId);

      const insertorderdata = await ordersService.bulkInsertOrder(
        request.body.transaction,
        request.body.order
      );

      if (!insertorderdata?.rows?.length) {
        throw new Error("Failed to initialize order");
      }

    } catch (error) {
      await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
        merchanttransactionId,
        "order_initialization_error"
      );
      await safeCleanupPendingOrder(merchanttransactionId);

      return {
        status: 500,
        message: "Error processing order. Inventory reservation released.",
      };
    }

    return {
      status: 200,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: RAZORPAY_KEY_ID,
        redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/confirmation-razorpay?id=${order.id}&token=${request.headers.authorization}`,
      },
    };

  } catch (error) {
    console.error("Query Execution Error: IN paymentInitializationRazorpay", error);

    await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(
      request?.body?.transaction?.merchanttransactionId,
      "razorpay_initialization_error"
    );

    await safeCleanupPendingOrder(
      request?.body?.transaction?.merchanttransactionId
    );

    return await ErrorHandler.handleQueryError(error);
  }
};

  export const paymentConfirmationRazorpay = async (request) => {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
        request.body || {};

      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return {
          status: 400,
          message: "Missing required payment verification fields",
        };
      }

      return await finalizeCapturedRazorpayPayment({
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
        verifyCheckoutSignature: true,
        source: "checkout",
      });
    } catch (error) {
      console.error(
        "Query Execution Error: IN paymentConfirmationRazorpay",
        error
      );
      return { status: 500, message: "Error verifying Razorpay payment" };
    }
  };

  export const paymentWebhookRazorpay = async (request) => {
    let webhookLedgerId: number | null = null;
    try {
      const rawEventId = parseHeaderValue(request.headers["x-razorpay-event-id"]);
      const bodyPaymentId =
        request?.body?.payload?.payment?.entity?.id ||
        request?.body?.payload?.order?.entity?.id ||
        null;
      const traceId = resolveWebhookTraceId(rawEventId, bodyPaymentId);
      logWebhookStep(traceId, "REQUEST_RECEIVED", {
        hasRawBody: Boolean(request.rawBody),
        hasBody: Boolean(request.body),
        headerKeys: Object.keys(request.headers || {}),
      });

      if (!RAZORPAY_WEBHOOK_SECRET) {
        logWebhookStep(traceId, "WEBHOOK_SECRET_MISSING", {
          responseStatus: 500,
          responseMessage: "Webhook secret is not configured",
        });
        return { status: 500, message: "Webhook secret is not configured" };
      }

      const receivedSignature = parseHeaderValue(
        request.headers["x-razorpay-signature"]
      );
      if (!receivedSignature) {
        logWebhookStep(traceId, "SIGNATURE_MISSING", {
          responseStatus: 400,
          responseMessage: "Missing webhook signature",
        });
        return { status: 400, message: "Missing webhook signature" };
      }

      const rawBody = request.rawBody;
      if (!rawBody) {
        logWebhookStep(traceId, "RAW_BODY_MISSING", {
          responseStatus: 400,
          responseMessage: "Missing raw webhook body",
        });
        return { status: 400, message: "Missing raw webhook body" };
      }

      const expectedSignature = crypto
        .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");
      logWebhookStep(traceId, "SIGNATURE_COMPUTED", {
        expectedSignatureRef: shortRef(expectedSignature),
        receivedSignatureRef: shortRef(receivedSignature),
      });

      if (!timingSafeHexEqual(expectedSignature, receivedSignature)) {
        logWebhookStep(traceId, "SIGNATURE_INVALID", {
          responseStatus: 400,
          responseMessage: "Invalid webhook signature",
        });
        return { status: 400, message: "Invalid webhook signature" };
      }

      const eventPayload = request.body || {};
      const eventName = eventPayload?.event;
      const eventId = rawEventId;
      const payloadSummary = summarizeWebhookPayload(eventPayload);
      logWebhookStep(traceId, "PAYLOAD_PARSED", payloadSummary);
      if (eventId) {
        const ledgerResult = await createWebhookEventLedgerEntry(
          eventId,
          eventName,
          eventPayload
        );
        logWebhookStep(traceId, "LEDGER_ENTRY_RESULT", {
          eventId,
          duplicate: ledgerResult?.duplicate || false,
          ledgerId: ledgerResult?.id || null,
        });
        if (ledgerResult?.duplicate) {
          logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
            responseStatus: 200,
            responseMessage: "Duplicate webhook ignored",
          });
          return { status: 200, message: "Duplicate webhook ignored" };
        }
        if (ledgerResult?.id) {
          webhookLedgerId = ledgerResult.id;
        } else if (await hasProcessedWebhookEvent(eventId)) {
          logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
            responseStatus: 200,
            responseMessage: "Duplicate webhook ignored",
            reason: "redis-dedupe",
          });
          return { status: 200, message: "Duplicate webhook ignored" };
        }
      }

      const paymentEntity = eventPayload?.payload?.payment?.entity;

      const paymentId = paymentEntity?.id;
      const orderId = paymentEntity?.order_id || eventPayload?.payload?.order?.entity?.id;

      if (
        eventName === "order.paid" ||
        eventName === "payment.captured" ||
        eventName === "payment.authorized"
      ) {
        if (!paymentId || !orderId) {
          await markWebhookEventLedgerStatus(webhookLedgerId, "ignored");
          logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
            eventName,
            responseStatus: 200,
            responseMessage: "Webhook event ignored due to missing IDs",
          });
          return { status: 200, message: "Webhook event ignored due to missing IDs" };
        }
        logWebhookStep(traceId, "EVENT_ROUTED_TO_FINALIZE", {
          eventName,
          paymentId,
          orderId,
        });
        const result = await finalizeCapturedRazorpayPayment({
          razorpayPaymentId: paymentId,
          razorpayOrderId: orderId,
          razorpaySignature: "",
          verifyCheckoutSignature: false,
          source: "webhook",
          traceId,
        });
        await markWebhookEventLedgerStatus(
          webhookLedgerId,
          result?.status === 500 ? "failed" : "processed",
          result?.status === 500 ? result?.message : undefined
        );
        logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
          eventName,
          responseStatus: result?.status || 200,
          responseMessage: result?.message || "Webhook processed",
        });
        return result;
      }

      if (eventName === "payment.failed" && orderId) {
        let merchantTransactionId: string | null = null;
        try {
          const gatewayOrder = await razorpay.orders.fetch(orderId);
          if (gatewayOrder?.receipt) {
            merchantTransactionId = gatewayOrder.receipt;
            await safeCleanupPendingOrder(gatewayOrder.receipt);
            const failedEventSnapshot = await getMerchantTransactionStateSnapshot(
              gatewayOrder.receipt
            );
            logWebhookStep(traceId, "PAYMENT_FAILED_CLEANUP_DONE", {
              eventName,
              orderId,
              merchantTransactionId: gatewayOrder.receipt,
              failedEventSnapshot,
            });
          }
        } catch (error) {
          console.error("Failed to process payment.failed webhook:", error?.message || error);
        }
        await markWebhookEventLedgerStatus(webhookLedgerId, "processed");
        logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
          eventName,
          orderId,
          merchantTransactionId,
          responseStatus: 200,
          responseMessage: "Failure webhook processed",
        });
        return { status: 200, message: "Failure webhook processed" };
      }

      await markWebhookEventLedgerStatus(webhookLedgerId, "ignored");
      logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
        eventName,
        responseStatus: 200,
        responseMessage: "Webhook event ignored",
      });
      return { status: 200, message: "Webhook event ignored" };
    } catch (error) {
      const traceId = resolveWebhookTraceId(
        parseHeaderValue(request.headers["x-razorpay-event-id"]),
        request?.body?.payload?.payment?.entity?.id
      );
      await markWebhookEventLedgerStatus(
        webhookLedgerId,
        "failed",
        error?.message || "Webhook processing failed"
      );
      logWebhookStep(traceId, "WEBHOOK_RESPONSE", {
        responseStatus: 500,
        responseMessage: "Error processing Razorpay webhook",
        errorMessage: error?.message || "Webhook processing failed",
      });
      console.error("Query Execution Error: IN paymentWebhookRazorpay", error);
      return { status: 500, message: "Error processing Razorpay webhook" };
    }
  };

  export const paymentWebhookShiprocket = async (request: any) => {
    try {
      const configuredToken = normalizeOptionalText(
        ENV_SHIPROCKET_WEBHOOK_TOKEN || process.env.SHIPROCKET_WEBHOOK_TOKEN
      );
      if (!configuredToken) {
        return {
          status: 500,
          message: "Shiprocket webhook token is not configured",
        };
      }

      const receivedToken = normalizeOptionalText(
        parseHeaderValue(request?.headers?.["x-api-key"])
      );
      if (!receivedToken) {
        return {
          status: 401,
          message: "Missing x-api-key header",
        };
      }

      if (!safeTimingCompare(configuredToken, receivedToken)) {
        return {
          status: 401,
          message: "Invalid x-api-key",
        };
      }

      const payload = request?.body || {};
      const identifiers = extractShiprocketWebhookIdentifiers(payload);
      const merchantTransactionId = await resolveMerchantTransactionIdFromShiprocketRefs({
        directCandidates: identifiers.directMerchantTransactionCandidates,
        shipmentIds: identifiers.shipmentIds,
        shiprocketOrderIds: identifiers.shiprocketOrderIds,
        channelOrderIds: identifiers.channelOrderIds,
      });

      if (!merchantTransactionId) {
        return {
          status: 200,
          message: "Shiprocket webhook received but no matching order found",
        };
      }

      const trackingSummary = extractShiprocketTrackingSummary(payload);

      await query(
        `UPDATE orders
         SET shiprocket_status = COALESCE($1, shiprocket_status),
             shiprocket_status_code = COALESCE($2, shiprocket_status_code)
         WHERE merchanttransactionid = $3`,
        [trackingSummary.rawStatus, trackingSummary.shipmentStatusCode, merchantTransactionId]
      );
      await query(
        `UPDATE thirdpartyorders
         SET shiprocket_status = COALESCE($1, shiprocket_status),
             shiprocket_status_code = COALESCE($2, shiprocket_status_code)
         WHERE merchanttransactionid = $3`,
        [trackingSummary.rawStatus, trackingSummary.shipmentStatusCode, merchantTransactionId]
      );

      await applyShipmentLifecycleToOrders(
        merchantTransactionId,
        trackingSummary.mappedOrderStatus
      );

      return {
        status: 200,
        message: "Shiprocket webhook processed successfully",
        data: {
          merchantTransactionId,
          shiprocketStatus: trackingSummary.rawStatus,
          mappedOrderStatus: trackingSummary.mappedOrderStatus,
          shipmentStatusCode: trackingSummary.shipmentStatusCode,
          awbCode: trackingSummary.awbCode,
        },
      };
    } catch (error: any) {
      console.error(
        "Error processing Shiprocket webhook:",
        error?.response?.data || error?.message || error
      );
      return {
        status: 500,
        message: "Error processing Shiprocket webhook",
      };
    }
  };

  export const syncShiprocketShipmentStatus = async (request: any) => {
    try {
      const merchantTransactionIdFromBody = request?.body?.merchanttransactionId;
      const payload = request?.body || {};
      const identifiers = extractShiprocketWebhookIdentifiers(payload);
      const merchantTransactionId = await resolveMerchantTransactionIdFromShiprocketRefs({
        directCandidates: [
          merchantTransactionIdFromBody,
          ...identifiers.directMerchantTransactionCandidates,
        ],
        shipmentIds: identifiers.shipmentIds,
        shiprocketOrderIds: identifiers.shiprocketOrderIds,
        channelOrderIds: identifiers.channelOrderIds,
      });

      if (!merchantTransactionId) {
        return {
          status: 400,
          message: "merchantTransactionId or shipment reference is required",
        };
      }

      const context = await getOrderContextByMerchantTransactionId(merchantTransactionId);
      if (!context) {
        return {
          status: 404,
          message: "No order found for the provided shipment reference",
        };
      }

      const token = await loginShiprocket();
      const baseUrl = process.env.SHIPROCKET_BASE_URL;
      if (!token || !baseUrl) {
        return {
          status: 500,
          message: "Shiprocket configuration is incomplete",
        };
      }

      const trackingResponse = await axios.get(
        `${baseUrl}/courier/track`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          params: {
            order_id: merchantTransactionId,
          },
        }
      );

      const trackingSummary = extractShiprocketTrackingSummary(trackingResponse.data);

      await query(
        `UPDATE orders
         SET shiprocket_status = COALESCE($1, shiprocket_status),
             shiprocket_status_code = COALESCE($2, shiprocket_status_code)
         WHERE merchanttransactionid = $3`,
        [trackingSummary.rawStatus, trackingSummary.shipmentStatusCode, merchantTransactionId]
      );
      await query(
        `UPDATE thirdpartyorders
         SET shiprocket_status = COALESCE($1, shiprocket_status),
             shiprocket_status_code = COALESCE($2, shiprocket_status_code)
         WHERE merchanttransactionid = $3`,
        [trackingSummary.rawStatus, trackingSummary.shipmentStatusCode, merchantTransactionId]
      );

      await applyShipmentLifecycleToOrders(
        merchantTransactionId,
        trackingSummary.mappedOrderStatus
      );

      return {
        status: 200,
        message: "Shipment status synchronized successfully",
        data: {
          merchantTransactionId,
          shiprocketStatus: trackingSummary.rawStatus,
          mappedOrderStatus: trackingSummary.mappedOrderStatus,
          shipmentStatusCode: trackingSummary.shipmentStatusCode,
          awbCode: trackingSummary.awbCode,
        },
      };
    } catch (error: any) {
      console.error("Error syncing Shiprocket shipment status:", error?.response?.data || error?.message || error);
      return {
        status: 500,
        message: "Unable to sync Shiprocket shipment status",
      };
    }
  };

  export const getShiprocketSettings = async () => {
    try {
      const settings = await getPersistedShiprocketSettings();
      return {
        status: 200,
        message: "Shiprocket settings fetched successfully",
        data: settings,
      };
    } catch (error: any) {
      return {
        status: 500,
        message: "Unable to fetch Shiprocket settings",
        error: error?.message || error,
      };
    }
  };

  export const updateShiprocketSettings = async (request: any) => {
    try {
      const settings = await upsertShiprocketSettings(request?.body || {});
      return {
        status: 200,
        message: "Shiprocket settings updated successfully",
        data: settings,
      };
    } catch (error: any) {
      return {
        status: 500,
        message: "Unable to update Shiprocket settings",
        error: error?.message || error,
      };
    }
  };

  export const getShiprocketPickupLocations = async () => {
    try {
      const result = await listShiprocketPickupLocations();
      return {
        status: result.ok ? 200 : 500,
        message: result.message,
        data: result.data || [],
      };
    } catch (error: any) {
      return {
        status: 500,
        message: "Unable to fetch Shiprocket pickup locations",
        error: error?.response?.data || error?.message || error,
      };
    }
  };

  export const createShiprocketShipment = async (request: any) => {
    try {
      const merchantTransactionId = normalizeOptionalText(
        request?.body?.merchantTransactionId || request?.body?.merchanttransactionid
      );
      if (!merchantTransactionId) {
        return {
          status: 400,
          message: "merchantTransactionId is required",
        };
      }

      const context = await getOrderContextByMerchantTransactionId(merchantTransactionId);
      if (!context) {
        return {
          status: 404,
          message: "No order found for the provided merchantTransactionId",
        };
      }

      const transactionRow = await getLatestTransactionByMerchantTransactionId(
        merchantTransactionId
      );
      if (!transactionRow) {
        return {
          status: 400,
          message: "No successful payment transaction found for this order",
        };
      }

      const createResult = await createShiprocketOrderForTransaction(context, transactionRow);
      return {
        status: createResult?.ok ? 200 : 500,
        message: createResult?.ok
          ? "Shiprocket shipment created successfully"
          : "Unable to create Shiprocket shipment",
        data: createResult,
      };
    } catch (error: any) {
      return {
        status: 500,
        message: "Unable to create Shiprocket shipment",
        error: error?.response?.data || error?.message || error,
      };
    }
  };

  export const cancelShiprocketShipment = async (request: any) => {
    try {
      const merchantTransactionId = normalizeOptionalText(
        request?.body?.merchantTransactionId || request?.body?.merchanttransactionid
      );
      if (!merchantTransactionId) {
        return {
          status: 400,
          message: "merchantTransactionId is required",
        };
      }

      const result = await cancelShiprocketOrderForMerchant(merchantTransactionId);
      return {
        status: result?.ok ? 200 : 500,
        message: result?.ok
          ? "Shiprocket cancellation processed"
          : "Unable to cancel Shiprocket shipment",
        data: result,
      };
    } catch (error: any) {
      return {
        status: 500,
        message: "Unable to cancel Shiprocket shipment",
        error: error?.response?.data || error?.message || error,
      };
    }
  };

  export const paymentInitializationRazorpayTicket = async (request: any) => {
    try {
      console.log("Inside paymentInitializationRazorpayTicket service");
      console.log(request.body, "req values")

      // Extract the amount payable from servicetype in the request body
      const amount = Number(request.body.servicetype); // amount in paise for Razorpay
      console.log(amount, "amount")
      // Generate a unique receipt id, can use any unique string generator or timestamp here
      const receiptId = `ticket_receipt_${Date.now()}`;

      // Create Razorpay order
      const order = await razorpay.orders.create({
        amount: Number(amount) * 100,
        currency: "INR",
        receipt: receiptId,
        notes: {
          userid: request.body.userid || "unknown",
          tickettype: request.body.tickettype || "unknown",
        },
      });

      console.log("Razorpay order created:", order);
      console.log('Vanakam')
      // Return the order info for the frontend to initiate payment
      return {
        status: 200,
        data: {
          status: 200,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          key: RAZORPAY_KEY_ID,
          redirectUrl: `${REDIRECT_URL_PAYMENT_STATUS}/payment/confirmation-razorpay?id=${order.id}&token=${request.headers.authorization}`,
        },
      };
    } catch (error) {
      console.error("Error in paymentInitializationRazorpayTicket:", error.message);
      // Handle errors appropriately
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };


  export const paymentConfirmationRazorpayTicket = async (request) => {
    console.log("Inside paymentConfirmationRazorpay service");
    console.log("Dummy");

    try {
      let transactionDataset = request.body.transactionData;
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
        request.body;
      console.log(request.body, "Request body in paymentConfirmationRazorpay");
      console.log(transactionDataset, "from conform");
      console.log("end");
      // Validate input
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        console.log("Come's inside first if");
        return {
          status: 400,
          message: "Missing required payment verification fields",
        };
      }

      // Verify Razorpay signature
      const generatedSignature = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      console.log(generatedSignature, "Generated Signature");
      console.log(razorpay_signature, "Existing Signature");
      if (generatedSignature !== razorpay_signature) {
        console.log("Come's inside invalid signature");
        await productrevoService.bulkupsertProducttosetZero(
          dummyorderdata,
          true
        );
        return { status: 400, message: "Invalid payment signature" };
      }

      // Fetch payment details from Razorpay
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      payment.amount = Number(payment.amount) / 100; // Convert amount from paise to rupees
      console.log(payment, "Payment details from Razorpay");
      if (payment.status !== "captured") {
        await productrevoService.bulkupsertProducttosetZero(
          dummyorderdata,
          true
        );
        return { status: 400, message: "Payment not captured" };
      }

      console.log("Stop")

      const message = { payment: "Payment done successfully" };
      console.log("updated", transactionDataset);
      const insertTransaction = await query(`
        Insert into transaction (
        transactiondata,
        userid,
        productid,
        merchanttransactionid,
        name,
        amount,
        mobilenumber,
        transactionfor,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [payment,
          transactionDataset.userId,
          transactionDataset.productid,
          transactionDataset.merchanttransactionId,
          transactionDataset.name,
          transactionDataset.amount,
          transactionDataset.mobilenumber,
          transactionDataset.transactionfor,
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature
        ])
      console.log(insertTransaction.command, "Insert Transaction Result:");
      console.log("end");
      if (insertTransaction.command === "INSERT") {
        return {
          status: 200,
          message: "Payment verified and processed successfully",
        };
      } else {
        return {
          status: 400,
          message:
            "Transaction failure. If payment debited, it will be refunded in 5 business days",
        };
      }

    } catch (error) {
      console.error(
        "Query Execution Error: IN paymentConfirmationRazorpay",
        error
      );
      return { status: 500, message: "Error verifying Razorpay payment" };
    }
  };
}
