import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { bannerService } from "../services/banner.service.js";
export var bannerController;
(function (bannerController) {
    bannerController.upsertBanner = async (request, reply) => {
        try {
            const bannerData = request.body;
            let upsertBannerResult = await bannerService.upsertBanner(bannerData);
            console.log("Upsert Banner Result:", upsertBannerResult);
            if (upsertBannerResult.command === "UPDATE" || upsertBannerResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertBannerResult.command === "UPDATE"
                        ? `Banner Updated successfully`
                        : `Banner Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send(upsertBannerResult);
            }
        }
        catch (error) {
            console.log('ERROR IN  Controller upsertBanner', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    bannerController.getAllBanner = async (request, reply) => {
        try {
            let getAllBannerResult = await bannerService.getAllBanner();
            console.log("Get All Banner Result:", getAllBannerResult);
            reply.status(200).send(getAllBannerResult);
        }
        catch (error) {
            console.log('ERROR IN  Controller getAllBanner', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    bannerController.deleteBanner = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteBannerResult = await bannerService.deleteBanner(Number(id));
            reply.send(deleteBannerResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller deleteBanner', error);
            reply.send(error.message);
        }
    };
})(bannerController || (bannerController = {}));
//# sourceMappingURL=banner.controller.js.map