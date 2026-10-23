import { FULFILLMENT_DEFAULT_LOCATION } from "./config.js";

/**
 * FulfillmentLocationContext is intentionally optional and typed loosely so
 * Phase 1 callers can pass nothing, and Phase 2 callers can pass assignment data
 * without changing the call-sites.
 */
export type FulfillmentLocationContext = {
  /** The warehouse assigned to this order (from fulfillment_assignments in Phase 2). */
  assignedLocation?: string | null;
  /** Customer-requested or order-field-derived location hint (informational only in Phase 1). */
  requestedLocation?: string | null;
};

/**
 * Resolves the authoritative fulfillment (pickup) location for an order.
 *
 * ## Phase 1 — head_office only
 * All shipments originate from head_office regardless of what the order fields say.
 * The location is driven by the FULFILLMENT_DEFAULT_LOCATION env variable (defaults
 * to "head_office" if not set). This is safe: Shiprocket requires a pre-registered
 * pickup location name, and "head_office" is the only one registered right now.
 *
 * ## Phase 2 — multi-warehouse (future)
 * Uncomment the assignedLocation block below and wire in fulfillment_assignments.
 * All callers already accept a context object, so no call-site changes are needed.
 *
 * @param context  Optional order context. Unused in Phase 1; used in Phase 2.
 * @returns        The Shiprocket-registered pickup location name (string).
 */
export const resolveFulfillmentLocation = (
  context?: FulfillmentLocationContext
): string => {
  // ── Phase 1: always head_office ──────────────────────────────────────────
  return FULFILLMENT_DEFAULT_LOCATION ?? "head_office";

  // ── Phase 2: enable when fulfillment_assignments is live ─────────────────
  // if (context?.assignedLocation) {
  //   return context.assignedLocation;
  // }
  // return FULFILLMENT_DEFAULT_LOCATION ?? "head_office";
};
