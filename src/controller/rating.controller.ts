import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { ratingService } from "../services/rating.service.js";

export module ratingController  {
    export const getRatingData = async (request: any, reply: any) => {
        try {
            
            let getRatingDataResult = await ratingService.getRatingData(request);
            reply.send(getRatingDataResult);
        } catch (error) {
            console.error("Query Execution Error: IN getRatingData controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const upsertRating = async(request:any,reply:any)=>{
        try {

            let upsertRatingResult :any = await ratingService.upsertRating(request,reply)
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                let productid = upsertRatingResult.rows[0].productid;
                let updateAvgRating = await ratingService.updateAvgRating(productid);
                let message: any = {}
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertRatingResult] })
            }
            
        } catch (error) {
            console.error("Query Execution Error: IN upsertRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const upsertGcpRating = async(request:any,reply:any)=>{
        try {

            let upsertRatingResult :any = await ratingService.upsertGcpRating(request,reply)
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                let productid = upsertRatingResult.rows[0].productid;
                let updateAvgRating = await ratingService.updateAvgRating(productid);
                let message: any = {}
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertRatingResult] })
            }
            
        } catch (error) {
            console.error("Query Execution Error: IN upsertGcpRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const deleteImageRating = async(request:any,reply:any)=>{
        try {

            let upsertRatingResult :any = await ratingService.deleteImage(request,reply)
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                let message: any = {}
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertRatingResult] })
            }
            
        } catch (error) {
            console.error("Query Execution Error: IN deleteImageRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const deleteRating = async (request: any, reply:any) =>{
        try{
            const {id} = request.params
            let deleteRatingResult = await ratingService.deleteRating(id);
            reply.send(deleteRatingResult)
        } catch (error){
            console.error("Query Execution Error: IN daleteRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // PRODUCT REVIEW controllers — customer + admin
    // ─────────────────────────────────────────────────────────────────────

    /** Resolve session user id (customer = users table, admin = inventoryusers) */
    const resolveUserId = (session: any): number | null => {
        return session?.id ?? null;
    };

    const ERR_HTTP: Record<string, number> = {
        UNVERIFIED_PURCHASE: 403, ALREADY_REVIEWED: 409,
        EDIT_WINDOW_EXPIRED: 403, REVIEW_NOT_FOUND: 404,
        UNAUTHORIZED: 401, BULK_VALIDATION_FAILED: 422,
        NO_FIELDS: 400,
    };

    const ok  = (reply: any, data: any)          => reply.status(200).send({ success: true,  data });
    const err = (reply: any, code: string, msg?: string) =>
        reply.status(ERR_HTTP[code] ?? 500).send({ success: false, error: { code, message: msg ?? code } });

    // GET /products/:productId/reviews
    export const getReviewsForProduct = async (request: any, reply: any) => {
        try {
            const productid = Number(request.params.productId);
            const result    = await ratingService.getReviewsForProduct(productid, request.query);
            ok(reply, result);
        } catch (e) {
            console.error("ctrl getReviewsForProduct:", e);
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // GET /products/:productId/reviews/stats
    export const getReviewStats = async (request: any, reply: any) => {
        try {
            const productid = Number(request.params.productId);
            const stats     = await ratingService.getReviewStats(productid);
            ok(reply, stats);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // POST /products/:productId/reviews  (customer)
    export const createReview = async (request: any, reply: any) => {
        try {
            const session   = request.user ?? request.session;
            const userid    = resolveUserId(session);
            if (!userid) return err(reply, "UNAUTHORIZED");

            const productid = Number(request.params.productId);
            const { orderId, rating: starrating, title, reviewText } = request.body;

            const result = await ratingService.createReview(
                userid, productid, Number(orderId), Number(starrating), title, reviewText
            );
            if ((result as any).error) return err(reply, (result as any).error);
            reply.status(201).send({ success: true, data: result });
        } catch (e) {
            console.error("ctrl createReview:", e);
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // PUT /reviews/:reviewId  (customer — edit own)
    export const updateReview = async (request: any, reply: any) => {
        try {
            const session  = request.user ?? request.session;
            const userid   = resolveUserId(session);
            if (!userid) return err(reply, "UNAUTHORIZED");

            const reviewid = Number(request.params.reviewId);
            const { rating: starrating, title, reviewText } = request.body;

            const result = await ratingService.updateReview(
                reviewid, userid,
                starrating !== undefined ? Number(starrating) : undefined,
                title, reviewText
            );
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            console.error("ctrl updateReview:", e);
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // DELETE /reviews/:reviewId  (customer — own)
    export const deleteReviewCustomer = async (request: any, reply: any) => {
        try {
            const session  = request.user ?? request.session;
            const userid   = resolveUserId(session);
            if (!userid) return err(reply, "UNAUTHORIZED");

            const reviewid = Number(request.params.reviewId);
            const result   = await ratingService.deleteReview(reviewid, userid, false);
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // POST /reviews/:reviewId/report
    export const reportReview = async (request: any, reply: any) => {
        try {
            const result = await ratingService.reportReview(Number(request.params.reviewId));
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // POST /reviews/:reviewId/helpful
    export const markHelpful = async (request: any, reply: any) => {
        try {
            const result = await ratingService.markHelpful(Number(request.params.reviewId));
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // GET /admin/reviews
    export const getAdminReviews = async (request: any, reply: any) => {
        try {
            const result = await ratingService.getAdminReviews(request.query);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // POST /admin/products/:productId/reviews  (single)
    export const createAdminReview = async (request: any, reply: any) => {
        try {
            const productid = Number(request.params.productId);
            const { rating: starrating, title, reviewText } = request.body;
            const result = await ratingService.createAdminReview(
                productid, Number(starrating), title, reviewText
            );
            if ((result as any).error) return err(reply, (result as any).error);
            reply.status(201).send({ success: true, data: result });
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // POST /admin/products/:productId/reviews/bulk
    export const bulkCreateAdminReviews = async (request: any, reply: any) => {
        try {
            const productid = Number(request.params.productId);
            const { reviews } = request.body as { reviews: any[] };

            if (!Array.isArray(reviews) || reviews.length === 0)
                return reply.status(400).send({ success: false, error: { code: "INVALID_PAYLOAD", message: "reviews array is required" } });

            const result = await ratingService.bulkCreateAdminReviews(productid, reviews);

            if ((result as any).error === "BULK_VALIDATION_FAILED") {
                return reply.status(422).send({
                    success: false,
                    error: { code: "BULK_VALIDATION_FAILED", message: "Validation failed for some rows.", details: (result as any).details }
                });
            }
            reply.status(201).send({ success: true, data: result });
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // PATCH /admin/reviews/:reviewId/hide
    export const hideReview = async (request: any, reply: any) => {
        try {
            const session  = request.user ?? request.session;
            const adminId  = resolveUserId(session);
            const result   = await ratingService.hideReview(Number(request.params.reviewId), adminId);
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // PATCH /admin/reviews/:reviewId/unhide
    export const unhideReview = async (request: any, reply: any) => {
        try {
            const result = await ratingService.unhideReview(Number(request.params.reviewId));
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // POST /admin/reviews/:reviewId/reply
    export const addAdminReply = async (request: any, reply: any) => {
        try {
            const session  = request.user ?? request.session;
            const adminId  = resolveUserId(session);
            const { replyText } = request.body;
            if (!replyText) return reply.status(400).send({ success: false, error: { code: "INVALID_PAYLOAD" } });
            const result = await ratingService.addAdminReply(Number(request.params.reviewId), adminId, replyText);
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };

    // DELETE /admin/reviews/:reviewId
    export const deleteReviewAdmin = async (request: any, reply: any) => {
        try {
            const session  = request.user ?? request.session;
            const userid   = resolveUserId(session);
            const result   = await ratingService.deleteReview(Number(request.params.reviewId), userid, true);
            if ((result as any).error) return err(reply, (result as any).error);
            ok(reply, result);
        } catch (e) {
            reply.status(500).send({ success: false, error: { code: "SERVER_ERROR" } });
        }
    };
}
