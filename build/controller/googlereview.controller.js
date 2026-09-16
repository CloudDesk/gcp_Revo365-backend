import { googlereviewService } from '../services/googlereview.service.js';
export var googlereviewController;
(function (googlereviewController) {
    async function getReviewsHandler(request, reply) {
        try {
            const data = await googlereviewService.fetchGoogleReviews();
            return reply.send(data);
        }
        catch (error) {
            return reply.status(500).send({ error: error.message });
        }
    }
    googlereviewController.getReviewsHandler = getReviewsHandler;
})(googlereviewController || (googlereviewController = {}));
//# sourceMappingURL=googlereview.controller.js.map