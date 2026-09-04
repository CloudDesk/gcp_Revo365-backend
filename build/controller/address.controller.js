import { addressService } from "../services/address.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var addressController;
(function (addressController) {
    addressController.getAddressData = async (request, reply) => {
        try {
            let getAddressDataResult = await addressService.getAddressData(request);
            reply.send(getAddressDataResult);
        }
        catch (error) {
            console.log('ERROR IN  Controller getAddressData', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    addressController.getUserAddressData = async (request, reply) => {
        try {
            let getAddressDataResult = await addressService.getUserAddressData(request);
            reply.send(getAddressDataResult);
        }
        catch (error) {
            console.log('ERROR IN  Controller getUserAddressData', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    addressController.deleteAddress = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteAddressResult = await addressService.deleteAddress(Number(id));
            reply.send(deleteAddressResult);
        }
        catch (error) {
            console.log('ERROR IN  Controller deleteAddress', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    addressController.upsertAddress = async (request, reply) => {
        try {
            const addressData = request.body;
            console.log("[DEBUG][POST /address] request payload:", addressData);
            let upsertAddressResult = await addressService.upsertAddress(addressData);
            console.log("[DEBUG][POST /address] service response command:", upsertAddressResult?.command);
            if (upsertAddressResult.command === "UPDATE" || upsertAddressResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertAddressResult.command === "UPDATE"
                        ? `Data Updated successfully in address`
                        : `Data Inserted successfully into address`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send(upsertAddressResult);
            }
        }
        catch (error) {
            console.log('ERROR IN  Controller upsertAddress', error);
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
})(addressController || (addressController = {}));
//# sourceMappingURL=address.controller.js.map