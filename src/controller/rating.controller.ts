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
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }

    export const upsertRating = async(request:any,reply:any)=>{
        try {

            let upsertRatingResult :any = await ratingService.upsertRating(request,reply)
            if (upsertRatingResult.command === "UPDATE" || upsertRatingResult.command === "INSERT") {
                console.log('---',upsertRatingResult.rows,'---');
                let productid = upsertRatingResult.rows[0].productid;
                // console.log(productid);

                let updateAvgRating = await ratingService.updateAvgRating(productid);
                console.log('***',updateAvgRating,'***');
                let message: any = {}
                message = {
                    product: upsertRatingResult.command === "UPDATE"
                        ? `Rating Updated successfully`
                        : `Rating Inserted successfully`
                };
                reply.status(200).send(message)
            }
            else {
                console.log("else upsertRatingResult")
                console.log(upsertRatingResult)
                reply.status(404).send({ error: [upsertRatingResult] })
            }
            
        } catch (error) {
            console.error("Query Execution Error: IN upsertRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
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
                console.log("else upsertRatingResult")
                console.log(upsertRatingResult)
                reply.status(404).send({ error: [upsertRatingResult] })
            }
            
        } catch (error) {
            console.error("Query Execution Error: IN upsertRating controller", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
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
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
}
