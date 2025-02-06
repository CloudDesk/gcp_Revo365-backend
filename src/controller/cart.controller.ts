import { FastifyRequest, FastifyReply } from "fastify";
import { cartservice } from "../services/cart.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

interface idparams {
    id: number;
}

export module cartController {
    export const getCartData = async (
        request: FastifyRequest,
        reply: FastifyReply
    ) => {
        try {
            let getCartDataResult = await cartservice.getCartData(request);
            reply.send(getCartDataResult);
        } catch (error) {
            console.log("ERROR IN Controller getCartData", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    export const getUserCartData = async (request: any, reply: any) => {
        try {
            let getCartDataResult = await cartservice.getCartData(request);
            reply.send(getCartDataResult);
        } catch (error) {
            console.log("ERROR IN  Controller getUserCartData", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };

    export const deleteCart = async (
        request: FastifyRequest<{ Params: idparams }>,
        reply: FastifyReply
    ) => {
        try {
            let { id } = request.params;
            let iddata = []
            iddata.push(id);
            let deleteCartResult = await cartservice.deleteCart(iddata);
            reply.send(deleteCartResult);
        } catch (error) {
            console.log("ERROR IN Controller deleteCart", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };

    export const upsertCart = async (request: any, reply: any) => {
        try {
            const cartData = request.body;
            let upsertCartResult = await cartservice.upsertCart(cartData);
            if (
                upsertCartResult.command === "UPDATE" ||
                upsertCartResult.command === "INSERT"
            ) {
                let message: any = {};
                message = {
                    message:
                        upsertCartResult.command === "UPDATE"
                            ? `Product Added to Cart `
                            : `Product Added to Cart `,
                };
                reply.status(200).send(message);
            } else {
                reply.status(404).send(upsertCartResult);
            }
        } catch (error) {
            console.log("ERROR IN Controller upsertCart", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };

    export const updateCartQuantity = async (request: any, reply: any) => {
        try {
            let result = await cartservice.upsertCartQuantity(request.body);
            reply.send(result);
        } catch (error) {
            console.log("ERROR IN Controller UPDATE CART QUANTITY", error);
            let errordata = await ErrorHandler.handleQueryError(error);
            return errordata;
        }
    };
}
