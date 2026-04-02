import { FastifyRequest, FastifyReply } from "fastify";
import { addressService } from "../services/address.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { bannerService } from "../services/banner.service.js";

interface idparams {
    id: number
}

export module bannerController {

    export const upsertBanner = async (request: any, reply: any) => {
        try {
            const bannerData = request.body;
            let upsertBannerResult = await bannerService.upsertBanner(bannerData);
            if (upsertBannerResult.command === "UPDATE" || upsertBannerResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertBannerResult.command === "UPDATE"
                        ? `Banner Updated successfully`
                        : `Banner Inserted successfully`
                };
                reply.status(200).send(message);
            }else{
                reply.status(404).send(upsertBannerResult);
            }
        } catch (error) {
            console.log('ERROR IN  Controller upsertBanner', error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);           }
    }

    export const getAllBanner = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getAllBannerResult = await bannerService.getAllBanner();
            reply.status(200).send(getAllBannerResult);
        } catch (error) {
            console.log('ERROR IN  Controller getAllBanner', error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);        }  
    }

    export const deleteBanner = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteBannerResult = await bannerService.deleteBanner(Number(id));
            reply.send(deleteBannerResult);
        } catch (error) {
            console.error('ERROR IN  Controller deleteBanner', error);
            reply.send(error.message);
        }
    }
}
