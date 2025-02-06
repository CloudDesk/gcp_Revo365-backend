import { FastifyRequest, FastifyReply } from "fastify";
import { addressService } from "../services/address.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

interface idparams {
    id: number
}

export module addressController {

    export const getAddressData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getAddressDataResult = await addressService.getAddressData(request)
            reply.send(getAddressDataResult)
        } catch (error) {
            console.log('ERROR IN  Controller getAddressData',error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);
        }
    }
    export const getUserAddressData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getAddressDataResult = await addressService.getUserAddressData(request)
            reply.send(getAddressDataResult)
        } catch (error) {
            console.log('ERROR IN  Controller getUserAddressData', error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);     
           }
    }

    export const deleteAddress = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteAddressResult = await addressService.deleteAddress(Number(id));
            reply.send(deleteAddressResult);
        } catch (error) {
            console.log('ERROR IN  Controller deleteAddress', error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);           }
    }

    export const upsertAddress = async (request: any, reply: any) => {
        try {
            const addressData = request.body;
            let upsertAddressResult = await addressService.upsertAddress(addressData);
            if (upsertAddressResult.command === "UPDATE" || upsertAddressResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertAddressResult.command === "UPDATE"
                        ? `Data Updated successfully in address`
                        : `Data Inserted successfully into address`
                };
                reply.status(200).send(message);
            }else{
                reply.status(404).send(upsertAddressResult);
            }
        } catch (error) {
            console.log('ERROR IN  Controller upsertAddress', error);
            let errordata  = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);           }
    }
}
