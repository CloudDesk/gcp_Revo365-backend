import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { ratingService } from "../services/rating.service.js";
export var ratingController;
(function (ratingController) {
    ratingController.getRatingData = async (request, reply) => {
        try {
            let getRatingDataResult = await ratingService.getRatingData(request);
            reply.send(getRatingDataResult);
        }
        catch (error) {
            console.error("Query Execution Error: IN getRatingData controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingController.upsertRating = async (request, reply) => {
        try {
            let upsertRatingResult = await ratingService.upsertRating(request, reply);
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                let productid = upsertRatingResult.rows[0].productid;
                let updateAvgRating = await ratingService.updateAvgRating(productid);
                let message = {};
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [upsertRatingResult] });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingController.upsertGcpRating = async (request, reply) => {
        try {
            let upsertRatingResult = await ratingService.upsertGcpRating(request, reply);
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                let productid = upsertRatingResult.rows[0].productid;
                let updateAvgRating = await ratingService.updateAvgRating(productid);
                let message = {};
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [upsertRatingResult] });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertGcpRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingController.deleteImageRating = async (request, reply) => {
        try {
            let upsertRatingResult = await ratingService.deleteImage(request, reply);
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                let message = {};
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [upsertRatingResult] });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteImageRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    ratingController.deleteRating = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteRatingResult = await ratingService.deleteRating(id);
            reply.send(deleteRatingResult);
        }
        catch (error) {
            console.error("Query Execution Error: IN daleteRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    // ─────────────────────────────────────────────────────────────────────
    // PRODUCT REVIEW controllers — customer + admin
    // ─────────────────────────────────────────────────────────────────────
    /** Resolve session user id (customer = users table, admin = inventoryusers) */
    const resolveUserId = (session) => {
        return session?.id ?? null;
    };
    const ERR_HTTP = {
        UNVERIFIED_PURCHASE: 403, ALREADY_REVIEWED: 409,
        EDIT_WINDOW_EXPIRED: 403, REVIEW_NOT_FOUND: 404,
        UNAUTHORIZED: 401, BULK_VALIDATION_FAILED: 422,
        NO_FIELDS: 400,
    };
    const ok = (reply, data) => reply.status(200).send({ success: true, data });
    const err = (reply, code, msg) => reply.status(ERR_HTTP[code] ?? 500).send({ success: false, error: { code, message: msg ?? code } });
    // GET /products/:productId/reviews
    ratingController.getReviewsForProduct = async (request, reply) => {
        try {
            const productid = Number(request.params.productId);
            const result = await ratingService.getReviewsForProduct(productid, request.query);
            ok(reply, result);
        }
        catch (e) {
            console.error("ctrl getReviewsForProduct:", e);
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // GET /products/:productId/reviews/stats
    ratingController.getReviewStats = async (request, reply) => {
        try {
            const productid = Number(request.params.productId);
            const stats = await ratingService.getReviewStats(productid);
            ok(reply, stats);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // POST /products/:productId/reviews  (customer)
    ratingController.createReview = async (request, reply) => {
        try {
            const session = request.user ?? request.session;
            const userid = resolveUserId(session);
            if (!userid)
                return err(reply, "UNAUTHORIZED");
            const productid = Number(request.params.productId);
            const { orderId, rating: starrating, title, reviewText } = request.body;
            const result = await ratingService.createReview(userid, productid, Number(orderId), Number(starrating), title, reviewText);
            if (result.error)
                return err(reply, result.error);
            reply.status(201).send({ success: true, data: result });
        }
        catch (e) {
            console.error("ctrl createReview:", e);
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // PUT /reviews/:reviewId  (customer — edit own)
    ratingController.updateReview = async (request, reply) => {
        try {
            const session = request.user ?? request.session;
            const userid = resolveUserId(session);
            if (!userid)
                return err(reply, "UNAUTHORIZED");
            const reviewid = Number(request.params.reviewId);
            const { rating: starrating, title, reviewText } = request.body;
            const result = await ratingService.updateReview(reviewid, userid, starrating !== undefined ? Number(starrating) : undefined, title, reviewText);
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            console.error("ctrl updateReview:", e);
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // DELETE /reviews/:reviewId  (customer — own)
    ratingController.deleteReviewCustomer = async (request, reply) => {
        try {
            const session = request.user ?? request.session;
            const userid = resolveUserId(session);
            if (!userid)
                return err(reply, "UNAUTHORIZED");
            const reviewid = Number(request.params.reviewId);
            const result = await ratingService.deleteReview(reviewid, userid, false);
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // POST /reviews/:reviewId/report
    ratingController.reportReview = async (request, reply) => {
        try {
            const result = await ratingService.reportReview(Number(request.params.reviewId));
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // POST /reviews/:reviewId/helpful
    ratingController.markHelpful = async (request, reply) => {
        try {
            const result = await ratingService.markHelpful(Number(request.params.reviewId));
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // GET /admin/reviews
    ratingController.getAdminReviews = async (request, reply) => {
        try {
            const result = await ratingService.getAdminReviews(request.query);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // POST /admin/products/:productId/reviews  (single)
    ratingController.createAdminReview = async (request, reply) => {
        try {
            const productid = Number(request.params.productId);
            const { rating: starrating, title, reviewText } = request.body;
            const result = await ratingService.createAdminReview(productid, Number(starrating), title, reviewText);
            if (result.error)
                return err(reply, result.error);
            reply.status(201).send({ success: true, data: result });
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // POST /admin/products/:productId/reviews/bulk
    ratingController.bulkCreateAdminReviews = async (request, reply) => {
        try {
            const productid = Number(request.params.productId);
            const { reviews } = request.body;
            if (!Array.isArray(reviews) || reviews.length === 0)
                return reply.status(400).send({ success: false, error: { code: "INVALID_PAYLOAD", message: "reviews array is required" } });
            const result = await ratingService.bulkCreateAdminReviews(productid, reviews);
            if (result.error === "BULK_VALIDATION_FAILED") {
                return reply.status(422).send({
                    success: false,
                    error: { code: "BULK_VALIDATION_FAILED", message: "Validation failed for some rows.", details: result.details }
                });
            }
            reply.status(201).send({ success: true, data: result });
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // PATCH /admin/reviews/:reviewId/hide
    ratingController.hideReview = async (request, reply) => {
        try {
            const session = request.user ?? request.session;
            const adminId = resolveUserId(session);
            const result = await ratingService.hideReview(Number(request.params.reviewId), adminId);
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // PATCH /admin/reviews/:reviewId/unhide
    ratingController.unhideReview = async (request, reply) => {
        try {
            const result = await ratingService.unhideReview(Number(request.params.reviewId));
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // POST /admin/reviews/:reviewId/reply
    ratingController.addAdminReply = async (request, reply) => {
        try {
            const session = request.user ?? request.session;
            const adminId = resolveUserId(session);
            const { replyText } = request.body;
            if (!replyText)
                return reply.status(400).send({ success: false, error: { code: "INVALID_PAYLOAD" } });
            const result = await ratingService.addAdminReply(Number(request.params.reviewId), adminId, replyText);
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
    // DELETE /admin/reviews/:reviewId
    ratingController.deleteReviewAdmin = async (request, reply) => {
        try {
            const session = request.user ?? request.session;
            const userid = resolveUserId(session);
            const result = await ratingService.deleteReview(Number(request.params.reviewId), userid, true);
            if (result.error)
                return err(reply, result.error);
            ok(reply, result);
        }
        catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
})(ratingController || (ratingController = {}));
//# sourceMappingURL=rating.controller.js.map