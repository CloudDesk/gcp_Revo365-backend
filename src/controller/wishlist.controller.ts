import { FastifyRequest, FastifyReply } from "fastify";
import { wishListService } from "../services/wishlist.service.js";

interface idparams {
    id: number
}

export module wishListController {

    export const getWishlistData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getWishlistDataResult = await wishListService.getWishlistData(request)
            reply.send(getWishlistDataResult)
        } catch (error) {
            console.error("Error in getWishlistData", error)
            reply.send(error.message)
        }
    }
    export const getUserWishlistData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getWishlistDataResult = await wishListService.getUserWishlistData(request)
            reply.send(getWishlistDataResult)
        } catch (error) {
            console.error("Error in getUserWishlistData", error)    
            reply.send(error.message)
        }
    }

    export const deleteFromWishlist = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteFromWishlistResult = await wishListService.deleteFromWishlist(Number(id));
            reply.send(deleteFromWishlistResult);
        } catch (error) {
            console.error("Error in deleteFromWishlist", error);
            reply.send(error.message);
        }
    }

    export const upsertToWishlist = async (request: any, reply: any) => {
        try {
            const wishlistData = request.body;
            let upsertToWishlistResult = await wishListService.upsertToWishlist(wishlistData);
            if (upsertToWishlistResult.command === "UPDATE" || upsertToWishlistResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertToWishlistResult.command === "UPDATE"
                        ? `Product Added to wishlist`
                        : `Product Added to wishlist`
                };
                reply.status(200).send(message);
            }
        } catch (error) {
            console.error("Error in upsertToWishlist", error);
            reply.send(error.message);
        }
    }
}
