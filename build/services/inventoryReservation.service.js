import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var inventoryReservationService;
(function (inventoryReservationService) {
    const DEFAULT_HOLD_MINUTES = 15;
    const normalizeText = (value) => {
        if (value === null || value === undefined)
            return null;
        const normalized = String(value).trim();
        return normalized ? normalized : null;
    };
    const resolveReservationType = (item) => {
        const invoiceFor = normalizeText(item?.invoicefor)?.toLowerCase();
        const orderName = normalizeText(item?.ordername)?.toLowerCase();
        if (invoiceFor === "product rental" || orderName === "rental") {
            return "rental";
        }
        return "product";
    };
    const resolveReservationLocation = (item) => normalizeText(item?.deliveryfrom) ||
        normalizeText(item?.storelocation) ||
        normalizeText(item?.location) ||
        null;
    const buildGroupedReservations = (items = []) => {
        const grouped = new Map();
        for (const item of items) {
            const productid = Number(item?.productid);
            const quantity = Number(item?.quantity);
            if (!Number.isFinite(productid) || productid <= 0)
                continue;
            if (!Number.isFinite(quantity) || quantity <= 0)
                continue;
            const reservationType = resolveReservationType(item);
            const location = resolveReservationLocation(item);
            const ordertype = normalizeText(item?.ordertype);
            const ordername = normalizeText(item?.ordername);
            const key = [productid, reservationType, location || ""].join("::");
            const existing = grouped.get(key);
            if (existing) {
                existing.quantity += quantity;
                continue;
            }
            grouped.set(key, {
                productid,
                quantity,
                reservationType,
                location,
                ordertype,
                ordername,
            });
        }
        return Array.from(grouped.values());
    };
    inventoryReservationService.replaceHeldReservations = async (merchantTransactionId, items, expiresInMinutes = DEFAULT_HOLD_MINUTES) => {
        try {
            if (!merchantTransactionId) {
                return { rows: [], rowCount: 0 };
            }
            const groupedReservations = buildGroupedReservations(items);
            await inventoryReservationService.releaseHeldReservationsForMerchantTransactionId(merchantTransactionId, "replaced");
            if (groupedReservations.length === 0) {
                return { rows: [], rowCount: 0 };
            }
            const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
            const values = [];
            const valueClauses = groupedReservations.map((reservation, index) => {
                const offset = index * 8;
                values.push(merchantTransactionId, reservation.productid, reservation.location, reservation.quantity, reservation.reservationType, reservation.ordertype, reservation.ordername, expiresAt);
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, 'held', $${offset + 6}, $${offset + 7}, $${offset + 8}, NOW())`;
            });
            return await query(`
        INSERT INTO inventory_reservations (
          merchanttransactionid,
          productid,
          location,
          quantity,
          reservation_type,
          status,
          ordertype,
          ordername,
          expires_at,
          updated_at
        )
        VALUES ${valueClauses.join(", ")}
        RETURNING *
        `, values);
        }
        catch (error) {
            console.error("Error in replaceHeldReservations:", error);
            throw await ErrorHandler.handleQueryError(error);
        }
    };
    inventoryReservationService.getHeldReservationTotalsByProduct = async (productIds, merchantTransactionId) => {
        try {
            const normalizedProductIds = Array.from(new Set((productIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
            if (normalizedProductIds.length === 0) {
                return [];
            }
            const params = [normalizedProductIds];
            const merchantFilter = merchantTransactionId
                ? `AND merchanttransactionid <> $2`
                : "";
            if (merchantTransactionId) {
                params.push(merchantTransactionId);
            }
            const result = await query(`
        SELECT productid, reservation_type, COALESCE(SUM(quantity), 0) AS held_quantity
        FROM inventory_reservations
        WHERE productid = ANY($1::int[])
          AND status = 'held'
          AND expires_at > NOW()
          ${merchantFilter}
        GROUP BY productid, reservation_type
        `, params);
            return result.rows;
        }
        catch (error) {
            console.error("Error in getHeldReservationTotalsByProduct:", error);
            throw await ErrorHandler.handleQueryError(error);
        }
    };
    inventoryReservationService.getReservationsForMerchantTransactionId = async (merchantTransactionId, statuses = ["held"]) => {
        try {
            if (!merchantTransactionId || !Array.isArray(statuses) || statuses.length === 0) {
                return { rows: [], rowCount: 0 };
            }
            return await query(`
        SELECT *
        FROM inventory_reservations
        WHERE merchanttransactionid = $1
          AND status = ANY($2::text[])
        ORDER BY created_at ASC, id ASC
        `, [merchantTransactionId, statuses]);
        }
        catch (error) {
            console.error("Error in getReservationsForMerchantTransactionId:", error);
            throw await ErrorHandler.handleQueryError(error);
        }
    };
    inventoryReservationService.releaseHeldReservationsForMerchantTransactionId = async (merchantTransactionId, reason = "released") => {
        try {
            if (!merchantTransactionId) {
                return { rows: [], rowCount: 0 };
            }
            return await query(`
        UPDATE inventory_reservations
        SET status = 'released',
            released_at = NOW(),
            release_reason = $2,
            updated_at = NOW()
        WHERE merchanttransactionid = $1
          AND status = 'held'
        RETURNING *
        `, [merchantTransactionId, reason]);
        }
        catch (error) {
            console.error("Error in releaseHeldReservationsForMerchantTransactionId:", error);
            throw await ErrorHandler.handleQueryError(error);
        }
    };
    inventoryReservationService.commitHeldReservationsForMerchantTransactionId = async (merchantTransactionId) => {
        try {
            if (!merchantTransactionId) {
                return { rows: [], rowCount: 0 };
            }
            return await query(`
        UPDATE inventory_reservations
        SET status = 'committed',
            committed_at = NOW(),
            updated_at = NOW()
        WHERE merchanttransactionid = $1
          AND status = 'held'
        RETURNING *
        `, [merchantTransactionId]);
        }
        catch (error) {
            console.error("Error in commitHeldReservationsForMerchantTransactionId:", error);
            throw await ErrorHandler.handleQueryError(error);
        }
    };
    inventoryReservationService.transitionCommittedReservationsForOrderLines = async (lines, targetStatus, reason) => {
        try {
            const groupedLines = buildGroupedReservations(lines);
            for (const line of groupedLines) {
                const merchantTransactionId = normalizeText(lines.find((item) => Number(item?.productid) === line.productid &&
                    resolveReservationType(item) === line.reservationType)?.merchanttransactionid);
                if (!merchantTransactionId)
                    continue;
                let remaining = Number(line.quantity) || 0;
                if (remaining <= 0)
                    continue;
                const committedRows = await query(`
          SELECT *
          FROM inventory_reservations
          WHERE merchanttransactionid = $1
            AND productid = $2
            AND reservation_type = $3
            AND status = 'committed'
          ORDER BY
            CASE
              WHEN COALESCE(location, '') = COALESCE($4, '') THEN 0
              WHEN location IS NULL THEN 1
              ELSE 2
            END,
            created_at ASC
          `, [merchantTransactionId, line.productid, line.reservationType, line.location]);
                for (const reservationRow of committedRows.rows) {
                    if (remaining <= 0)
                        break;
                    const rowQuantity = Number(reservationRow.quantity) || 0;
                    if (rowQuantity <= 0)
                        continue;
                    const transitionQuantity = Math.min(rowQuantity, remaining);
                    if (rowQuantity === transitionQuantity) {
                        await query(`
              UPDATE inventory_reservations
              SET status = $1::varchar,
                  location = COALESCE($2::varchar, location),
                  released_at = CASE WHEN $1::varchar = 'released' THEN NOW() ELSE released_at END,
                  consumed_at = CASE WHEN $1::varchar = 'consumed' THEN NOW() ELSE consumed_at END,
                  release_reason = CASE WHEN $1::varchar = 'released' THEN $3::varchar ELSE release_reason END,
                  updated_at = NOW()
              WHERE id = $4
              `, [targetStatus, line.location, reason, reservationRow.id]);
                    }
                    else {
                        await query(`
              UPDATE inventory_reservations
              SET quantity = quantity - $1,
                  updated_at = NOW()
              WHERE id = $2
              `, [transitionQuantity, reservationRow.id]);
                        await query(`
              INSERT INTO inventory_reservations (
                merchanttransactionid,
                productid,
                location,
                quantity,
                reservation_type,
                status,
                ordertype,
                ordername,
                metadata,
                expires_at,
                committed_at,
                released_at,
                consumed_at,
                release_reason,
                created_at,
                updated_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11,
                CASE WHEN $6::varchar = 'released' THEN NOW() ELSE NULL END,
                CASE WHEN $6::varchar = 'consumed' THEN NOW() ELSE NULL END,
                CASE WHEN $6::varchar = 'released' THEN $12::varchar ELSE NULL END,
                NOW(),
                NOW()
              )
              `, [
                            reservationRow.merchanttransactionid,
                            reservationRow.productid,
                            line.location || reservationRow.location,
                            transitionQuantity,
                            reservationRow.reservation_type,
                            targetStatus,
                            reservationRow.ordertype,
                            reservationRow.ordername,
                            reservationRow.metadata || {},
                            reservationRow.expires_at,
                            reservationRow.committed_at || new Date().toISOString(),
                            reason,
                        ]);
                    }
                    remaining -= transitionQuantity;
                }
            }
        }
        catch (error) {
            console.error("Error in transitionCommittedReservationsForOrderLines:", error);
            throw await ErrorHandler.handleQueryError(error);
        }
    };
})(inventoryReservationService || (inventoryReservationService = {}));
//# sourceMappingURL=inventoryReservation.service.js.map