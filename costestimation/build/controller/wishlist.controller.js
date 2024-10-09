import { wishListService } from "../services/wishlist.service.js";
export var wishListController;
(function (wishListController) {
    wishListController.getWishlistData = async (request, reply) => {
        try {
            let getWishlistDataResult = await wishListService.getWishlistData(request);
            reply.send(getWishlistDataResult);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    wishListController.getUserWishlistData = async (request, reply) => {
        try {
            let getWishlistDataResult = await wishListService.getUserWishlistData(request);
            reply.send(getWishlistDataResult);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    wishListController.deleteFromWishlist = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteFromWishlistResult = await wishListService.deleteFromWishlist(Number(id));
            reply.send(deleteFromWishlistResult);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    wishListController.upsertToWishlist = async (request, reply) => {
        try {
            const wishlistData = request.body;
            let upsertToWishlistResult = await wishListService.upsertToWishlist(wishlistData);
            if (upsertToWishlistResult.command === "UPDATE" || upsertToWishlistResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertToWishlistResult.command === "UPDATE"
                        ? `Product Added to wishlist`
                        : `Product Added to wishlist`
                };
                reply.status(200).send(message);
            }
        }
        catch (error) {
            reply.send(error.message);
        }
    };
})(wishListController || (wishListController = {}));
//# sourceMappingURL=wishlist.controller.js.map