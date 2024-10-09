import { supplierSerivce } from "../services/supplier.service.js"

export module supplierController {
    export const getSupplier = async (request, reply) => {
        try {
            let getSupplierResult = await supplierSerivce.getSupplierData(request);
            reply.send(getSupplierResult)
        } catch (error) {
            reply.send(error.message, 'Error in get Supplier Data Controller')
        }
    }
    //lookup
    export const getSupplierName = async (request, reply) => {
        try {
            let getSupplierResult = await supplierSerivce.getSupplierName(request.query);
            reply.send(getSupplierResult)
        } catch (error) {
            reply.send(error.message, 'Error in get Supplier Data Controller')
        }
    }
    export const getSupplierProductdata = async (request, reply) => {
        try {
            let getSupplierResult = await supplierSerivce.getSupplierProductdata(request.params.id);
            reply.send(getSupplierResult)
        } catch (error) {
            reply.send(error.message, 'Error in get Supplier Data Controller')
        }
    }

    export const upsertSupplier = async (request, reply) => {
        try {
            let upsertSupplierResult = await supplierSerivce.upsertSupplierData(request.body);
            if (upsertSupplierResult.command === "UPDATE" || upsertSupplierResult.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertSupplierResult.command === "UPDATE"
                        ? `Data Updated successfully in supplier`
                        : `Data Inserted successfully into supplier`,
                        data:upsertSupplierResult.rows
                };
                reply.status(200).send(message);
            }
        } catch (error) {
            reply.send(error.message, 'Error in upsert Supplier Data Controller')
        }
    }

    export const deleteSupplier = async (request, reply) => {
        try {
            let deleteSupplierResult = await supplierSerivce.deleteSupplierData(request.params.id);
            reply.send(deleteSupplierResult)
        } catch (error) {
            reply.send(error.message, 'Error in delete Supplier Data Controller')
        }
    }
}