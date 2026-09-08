import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import pool from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { productrevoService } from "./productrevo.service.js";
// Basic profanity list — extend as needed
const PROFANITY_LIST = ["badword1", "badword2", "fuck", "shit", "ass", "bitch", "bastard"];
function containsProfanity(text) {
    if (!text)
        return false;
    const lower = text.toLowerCase();
    return PROFANITY_LIST.some((w) => lower.includes(w));
}
export var ratingService;
(function (ratingService) {
    ratingService.getRatingData = async (request) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "displaysize" || key === "price") {
                    const rangeClauses = paramValues.map(range => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        return `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                    });
                    whereClauses.push(`(${rangeClauses.join(" OR ")})`);
                    parameterIndex += 2 * paramValues.length;
                }
                else if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                }
                else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                }
                else if (key !== "page" && key !== "count") {
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            const offset = (pageNumber - 1) * recordCount;
            const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : '';
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM rating ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getRatingData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingService.upsertRating = async (request, reply) => {
        try {
            let querydata;
            let params;
            let ratingData = request.body;
            let filedata = request.files;
            let url = [];
            filedata && filedata.length > 0 && filedata.forEach((e) => {
                url.push(`${PROTOCOL}://${request.headers.host}/${e.filename}`);
            });
            ratingData.url = url;
            const { id, ...upsertFields } = ratingData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                const fetchUrlQuery = 'SELECT url FROM rating WHERE id = $1';
                const existingUrlResult = await query(fetchUrlQuery, [id]);
                if (existingUrlResult.rows.length > 0) {
                    const existingUrls = existingUrlResult.rows[0].url;
                    const updatedUrls = existingUrls.concat(url);
                    upsertFields.url = updatedUrls;
                    const fieldNames = Object.keys(upsertFields);
                    const fieldValues = Object.values(upsertFields);
                    querydata = `UPDATE rating SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(', ')} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    params = [...fieldValues, id];
                }
                else {
                    return `No rating found with id ${id}`;
                }
            }
            else {
                querydata = `INSERT INTO rating (${fieldNames.join(', ')}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(', ')}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRating", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingService.upsertGcpRating = async (request, reply) => {
        try {
            let querydata;
            let params;
            let ratingData = request.body;
            const { id, ...upsertFields } = ratingData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                const fetchUrlQuery = 'SELECT url FROM rating WHERE id = $1';
                const existingUrlResult = await query(fetchUrlQuery, [id]);
                if (existingUrlResult.rows.length > 0) {
                    const existingUrls = existingUrlResult.rows[0].url;
                    const updatedUrls = existingUrls.concat(ratingData.url);
                    upsertFields.url = updatedUrls;
                    const fieldNames = Object.keys(upsertFields);
                    const fieldValues = Object.values(upsertFields);
                    querydata = `UPDATE rating SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(', ')} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    params = [...fieldValues, id];
                }
                else {
                    return `No rating found with id ${id}`;
                }
            }
            else {
                querydata = `INSERT INTO rating (${fieldNames.join(', ')}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(', ')}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertGcpRating", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingService.deleteImage = async (request, reply) => {
        try {
            let querydata = '';
            let params;
            let ratingData = request.body;
            const { id, ...upsertFields } = ratingData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            if (id) {
                querydata = `UPDATE rating SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(', ')} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            const result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteImage", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingService.deleteRating = async (id) => {
        try {
            const result = await query(`DELETE FROM rating where id = $1`, [id]);
            if (result.rowCount != 0) {
                return `Rating Deleted Successfully`;
            }
            else {
                return `Rating not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteRating", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingService.updateAvgRating = async (productid) => {
        try {
            const result = await query(`SELECT SUM(starrating) AS totalRating, 
                                         COUNT(starrating) AS ratingCount 
                                         FROM rating WHERE productid = $1`, [productid]);
            if (result.rows.length === 0) {
                return `No ratings found for productid ${productid}`;
            }
            const totalRating = result.rows[0].totalrating;
            const ratingCount = result.rows[0].ratingcount;
            const avgRating = parseFloat((totalRating / ratingCount).toFixed(1));
            const updateAvgRatingInProductrevo = await productrevoService.updateAvgRatingProductrevo(avgRating, productid);
            return updateAvgRatingInProductrevo;
        }
        catch (error) {
            console.error("Query Execution Error: IN updateAvgRating", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    // ─────────────────────────────────────────────────────────────────────
    // PRODUCT REVIEWS — extended methods (rating table with new columns)
    // ─────────────────────────────────────────────────────────────────────
    const PROFANITY = ["fuck", "shit", "ass", "bitch", "bastard", "crap", "damn"];
    const hasProfanity = (t) => !!t && PROFANITY.some((w) => t.toLowerCase().includes(w));
    /** Internal: recalculate averagerating from visible rows only */
    ratingService.recalculateAverageRating = async (productid) => {
        try {
            const r = await query(`SELECT ROUND(AVG(starrating)::numeric, 1) AS avg
         FROM rating
         WHERE productid = $1 AND status = 'visible' AND starrating IS NOT NULL`, [productid]);
            const avg = r.rows[0]?.avg ?? null;
            await query(`UPDATE product_revo SET averagerating = $1 WHERE id = $2`, [avg, productid]);
        }
        catch (e) {
            console.error("recalculateAverageRating error:", e);
        }
    };
    /** Public: aggregate stats only (visible reviews) */
    ratingService.getReviewStats = async (productid) => {
        try {
            const r = await query(`SELECT COUNT(*)                                    AS total,
                ROUND(AVG(starrating)::numeric, 1)          AS average,
                COUNT(*) FILTER (WHERE starrating = 5)      AS five,
                COUNT(*) FILTER (WHERE starrating = 4)      AS four,
                COUNT(*) FILTER (WHERE starrating = 3)      AS three,
                COUNT(*) FILTER (WHERE starrating = 2)      AS two,
                COUNT(*) FILTER (WHERE starrating = 1)      AS one
         FROM rating
         WHERE productid = $1 AND status = 'visible' AND starrating IS NOT NULL`, [productid]);
            return r.rows[0];
        }
        catch (e) {
            console.error("getReviewStats error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Public: paginated reviews for a product */
    ratingService.getReviewsForProduct = async (productid, q) => {
        try {
            const { status = "visible", rating: star, sort = "newest", page = 1, limit = 10 } = q;
            const params = [productid];
            let idx = 2;
            const conds = ["r.productid = $1"];
            if (status !== "all") {
                conds.push(`r.status = $${idx++}`);
                params.push(status);
            }
            if (star) {
                conds.push(`r.starrating = $${idx++}`);
                params.push(Number(star));
            }
            const sorts = {
                newest: "r.createddate DESC", oldest: "r.createddate ASC",
                highest_rating: "r.starrating DESC", most_helpful: "r.helpfulcount DESC",
            };
            const orderBy = sorts[sort] ?? "r.createddate DESC";
            const offset = (Number(page) - 1) * Number(limit);
            params.push(Number(limit), offset);
            const rows = (await query(`SELECT r.*,
                u.firstname AS reviewer_firstname,
                u.lastname  AS reviewer_lastname
         FROM rating r
         LEFT JOIN users u ON u.id = r.userid
         WHERE ${conds.join(" AND ")}
         ORDER BY ${orderBy}
         LIMIT $${idx++} OFFSET $${idx++}`, params)).rows;
            const stats = await ratingService.getReviewStats(productid);
            return { reviews: rows, stats };
        }
        catch (e) {
            console.error("getReviewsForProduct error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Public: single review */
    ratingService.getReviewById = async (reviewid) => {
        try {
            const r = await query(`SELECT r.*, u.firstname AS reviewer_firstname, u.lastname AS reviewer_lastname, p.productname
         FROM rating r
         LEFT JOIN users u ON u.id = r.userid
         LEFT JOIN product_revo p ON p.id = r.productid
         WHERE r.id = $1`, [reviewid]);
            return r.rows[0] ?? null;
        }
        catch (e) {
            console.error("getReviewById error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Admin: all reviews with filters */
    ratingService.getAdminReviews = async (q) => {
        try {
            const { status, page = 1, limit = 20 } = q;
            // accept both ?productId= (camelCase) and ?productid= (lowercase)
            const productid = q.productId ?? q.productid;
            const conds = [];
            const params = [];
            let idx = 1;
            if (productid) {
                conds.push(`r.productid = $${idx++}`);
                params.push(Number(productid));
            }
            if (status && status !== 'all') {
                conds.push(`r.status = $${idx++}`);
                params.push(status);
            }
            const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
            const offset = (Number(page) - 1) * Number(limit);
            params.push(Number(limit), offset);
            return (await query(`SELECT r.*, u.firstname AS reviewer_firstname, u.lastname AS reviewer_lastname, p.productname
         FROM rating r
         LEFT JOIN users u ON u.id = r.userid
         LEFT JOIN product_revo p ON p.id = r.productid
         ${where}
         ORDER BY r.createddate DESC
         LIMIT $${idx++} OFFSET $${idx++}`, params)).rows;
        }
        catch (e) {
            console.error("getAdminReviews error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Customer: create verified-purchase review */
    ratingService.createReview = async (userid, productid, orderid, starrating, title, reviewtext) => {
        try {
            // Guard 1 — verified purchase via orderline
            const purchase = await query(`SELECT id FROM orderline
         WHERE userid = $1 AND productid = $2 AND uniqueorderid = $3 AND orderstatus = 'delivered'
         LIMIT 1`, [userid, productid, orderid]);
            if (!purchase.rows.length)
                return { error: "UNVERIFIED_PURCHASE", status: 403 };
            // Guard 2 — duplicate
            const dup = await query(`SELECT id FROM rating
         WHERE userid = $1 AND productid = $2 AND orderid = $3 AND admincreated = FALSE LIMIT 1`, [userid, productid, orderid]);
            if (dup.rows.length)
                return { error: "ALREADY_REVIEWED", status: 409 };
            // Guard 3 — profanity
            const status = hasProfanity(reviewtext) || hasProfanity(title) ? "flagged" : "visible";
            const res = await query(`INSERT INTO rating
           (userid, productid, orderid, starrating, title, reviewtext, status, admincreated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE) RETURNING *`, [userid, productid, orderid, starrating, title ?? null, reviewtext ?? null, status]);
            await ratingService.recalculateAverageRating(productid);
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("createReview error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Admin: create single review — no purchase check */
    ratingService.createAdminReview = async (productid, starrating, title, reviewtext) => {
        try {
            const res = await query(`INSERT INTO rating
           (productid, starrating, title, reviewtext, status, admincreated, userid, orderid)
         VALUES ($1,$2,$3,$4,'visible',TRUE,NULL,NULL) RETURNING *`, [productid, starrating, title ?? null, reviewtext ?? null]);
            await ratingService.recalculateAverageRating(productid);
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("createAdminReview error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Admin: bulk-insert reviews in a transaction */
    ratingService.bulkCreateAdminReviews = async (productid, reviews) => {
        // Validate first — reject entire batch on any error
        const errors = [];
        reviews.forEach((r, i) => {
            const star = r.starrating ?? r.rating;
            if (!star || star < 1 || star > 5)
                errors.push({ row: i + 1, reason: "rating must be between 1 and 5" });
        });
        if (errors.length)
            return { error: "BULK_VALIDATION_FAILED", details: errors };
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const inserted = [];
            for (const r of reviews) {
                const star = r.starrating ?? r.rating;
                const res = await client.query(`INSERT INTO rating
             (productid, starrating, title, reviewtext, status, admincreated, userid, orderid)
           VALUES ($1,$2,$3,$4,'visible',TRUE,NULL,NULL) RETURNING *`, [productid, star, r.title ?? null, r.reviewText ?? null]);
                inserted.push(res.rows[0]);
            }
            await client.query("COMMIT");
            await ratingService.recalculateAverageRating(productid);
            return { inserted: inserted.length, failed: 0, reviews: inserted };
        }
        catch (e) {
            await client.query("ROLLBACK");
            console.error("bulkCreateAdminReviews error:", e);
            return ErrorHandler.handleQueryError(e);
        }
        finally {
            client.release();
        }
    };
    /** Customer: edit own review within 7 days */
    ratingService.updateReview = async (reviewid, userid, starrating, title, reviewtext) => {
        try {
            const ex = await query(`SELECT * FROM rating WHERE id = $1 AND userid = $2 AND admincreated = FALSE`, [reviewid, userid]);
            if (!ex.rows.length)
                return { error: "REVIEW_NOT_FOUND", status: 404 };
            const created = new Date(ex.rows[0].createddate);
            const diffDays = (Date.now() - created.getTime()) / 86400000;
            if (diffDays > 7)
                return { error: "EDIT_WINDOW_EXPIRED", status: 403 };
            const sets = [];
            const params = [];
            let idx = 1;
            if (starrating !== undefined) {
                sets.push(`starrating = $${idx++}`);
                params.push(starrating);
            }
            if (title !== undefined) {
                sets.push(`title = $${idx++}`);
                params.push(title);
            }
            if (reviewtext !== undefined) {
                sets.push(`reviewtext = $${idx++}`);
                params.push(reviewtext);
            }
            if (!sets.length)
                return { error: "NO_FIELDS", status: 400 };
            params.push(reviewid);
            const res = await query(`UPDATE rating SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, params);
            await ratingService.recalculateAverageRating(ex.rows[0].productid);
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("updateReview error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Customer (author) or admin: delete review */
    ratingService.deleteReview = async (reviewid, userid, isAdmin) => {
        try {
            const ex = await query(`SELECT * FROM rating WHERE id = $1`, [reviewid]);
            if (!ex.rows.length)
                return { error: "REVIEW_NOT_FOUND", status: 404 };
            if (!isAdmin && ex.rows[0].userid !== userid)
                return { error: "UNAUTHORIZED", status: 401 };
            await query(`DELETE FROM rating WHERE id = $1`, [reviewid]);
            await ratingService.recalculateAverageRating(ex.rows[0].productid);
            return { success: true };
        }
        catch (e) {
            console.error("deleteReview error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Admin: hide a review */
    ratingService.hideReview = async (reviewid, adminUserId) => {
        try {
            const res = await query(`UPDATE rating SET status='hidden', hiddenat=NOW(), hiddenby=$1 WHERE id=$2 RETURNING *`, [adminUserId, reviewid]);
            if (!res.rows.length)
                return { error: "REVIEW_NOT_FOUND", status: 404 };
            await ratingService.recalculateAverageRating(res.rows[0].productid);
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("hideReview error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Admin: unhide a review */
    ratingService.unhideReview = async (reviewid) => {
        try {
            const res = await query(`UPDATE rating SET status='visible', hiddenat=NULL, hiddenby=NULL WHERE id=$1 RETURNING *`, [reviewid]);
            if (!res.rows.length)
                return { error: "REVIEW_NOT_FOUND", status: 404 };
            await ratingService.recalculateAverageRating(res.rows[0].productid);
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("unhideReview error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Admin: add/update reply */
    ratingService.addAdminReply = async (reviewid, adminUserId, replyText) => {
        try {
            const res = await query(`UPDATE rating SET adminreply=$1, adminreplyat=NOW(), adminreplyby=$2 WHERE id=$3 RETURNING *`, [replyText, adminUserId, reviewid]);
            if (!res.rows.length)
                return { error: "REVIEW_NOT_FOUND", status: 404 };
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("addAdminReply error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Customer: report/flag a review */
    ratingService.reportReview = async (reviewid) => {
        try {
            const res = await query(`UPDATE rating
         SET flagcount = flagcount + 1,
             status    = CASE WHEN (flagcount + 1) >= 3 THEN 'flagged' ELSE status END
         WHERE id = $1 RETURNING *`, [reviewid]);
            if (!res.rows.length)
                return { error: "REVIEW_NOT_FOUND", status: 404 };
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("reportReview error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
    /** Customer: mark a review helpful */
    ratingService.markHelpful = async (reviewid) => {
        try {
            const res = await query(`UPDATE rating SET helpfulcount = helpfulcount + 1 WHERE id = $1 RETURNING *`, [reviewid]);
            if (!res.rows.length)
                return { error: "REVIEW_NOT_FOUND", status: 404 };
            return { review: res.rows[0] };
        }
        catch (e) {
            console.error("markHelpful error:", e);
            return ErrorHandler.handleQueryError(e);
        }
    };
})(ratingService || (ratingService = {}));
//# sourceMappingURL=rating.service.js.map