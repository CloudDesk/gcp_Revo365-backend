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
                console.log('***', updateAvgRating, '***');
                let message = {};
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                console.log(upsertRatingResult);
                reply.status(404).send({ error: [upsertRatingResult] });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    ratingController.upsertGcpRating = async (request, reply) => {
        try {
            let upsertRatingResult = await ratingService.upsertGcpRating(request, reply);
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                let productid = upsertRatingResult.rows[0].productid;
                let updateAvgRating = await ratingService.updateAvgRating(productid);
                console.log('***', updateAvgRating, '***');
                let message = {};
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                console.log(upsertRatingResult);
                reply.status(404).send({ error: [upsertRatingResult] });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRating controller", error);
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
                console.log(upsertRatingResult);
                reply.status(404).send({ error: [upsertRatingResult] });
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRating controller", error);
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
})(ratingController || (ratingController = {}));
//# sourceMappingURL=rating.controller.js.map