import { cartservice } from "../services/cart.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var cartController;
(function (cartController) {
    cartController.getCartData = async (request, reply) => {
        try {
            let getCartDataResult = await cartservice.getCartData(request);
            reply.send(getCartDataResult);
        }
        catch (error) {
            console.log("ERROR IN Controller getCartData", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    cartController.getUserCartData = async (request, reply) => {
        try {
            let getCartDataResult = await cartservice.getCartData(request);
            reply.send(getCartDataResult);
        }
        catch (error) {
            console.log("ERROR IN  Controller getUserCartData", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    cartController.deleteCart = async (request, reply) => {
        try {
            let { id } = request.params;
            let iddata = [];
            iddata.push(id);
            let deleteCartResult = await cartservice.deleteCart(iddata);
            reply.send(deleteCartResult);
        }
        catch (error) {
            console.log("ERROR IN Controller deleteCart", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    cartController.upsertCart = async (request, reply) => {
        try {
            const cartData = request.body;
            let upsertCartResult = await cartservice.upsertCart(cartData);
            if (upsertCartResult.command === "UPDATE" ||
                upsertCartResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertCartResult.command === "UPDATE"
                        ? `Product Added to Cart `
                        : `Product Added to Cart `,
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send(upsertCartResult);
            }
        }
        catch (error) {
            console.log("ERROR IN Controller upsertCart", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    cartController.updateCartQuantity = async (request, reply) => {
        try {
            let result = await cartservice.upsertCartQuantity(request.body);
            reply.send(result);
        }
        catch (error) {
            console.log("ERROR IN Controller UPDATE CART QUANTITY", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            return errordata;
        }
    };
})(cartController || (cartController = {}));
//# sourceMappingURL=cart.controller.js.map