import { supplierSerivce } from "../services/supplier.service.js";
export var supplierController;
(function (supplierController) {
    supplierController.getSupplier = async (request, reply) => {
        try {
            let getSupplierResult = await supplierSerivce.getSupplierData(request);
            reply.send(getSupplierResult);
        }
        catch (error) {
            console.error('Error in getSupplier Controller', error);
            reply.send(error.message, 'Error in get Supplier Data Controller');
        }
    };
    supplierController.getSupplierName = async (request, reply) => {
        try {
            let getSupplierResult = await supplierSerivce.getSupplierName(request.query);
            reply.send(getSupplierResult);
        }
        catch (error) {
            console.error('Error in getSupplierName Controller', error);
            reply.send(error.message, 'Error in get Supplier Data Controller');
        }
    };
    supplierController.getSupplierProductdata = async (request, reply) => {
        try {
            let getSupplierResult = await supplierSerivce.getSupplierProductdata(request.params.id);
            reply.send(getSupplierResult);
        }
        catch (error) {
            console.error('Error in getSupplierProductdata Controller', error);
            reply.send(error.message, 'Error in get Supplier Data Controller');
        }
    };
    supplierController.upsertSupplier = async (request, reply) => {
        try {
            let upsertSupplierResult = await supplierSerivce.upsertSupplierData(request.body);
            if (upsertSupplierResult.command === "UPDATE" || upsertSupplierResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertSupplierResult.command === "UPDATE"
                        ? `Data Updated successfully in supplier`
                        : `Data Inserted successfully into supplier`,
                    data: upsertSupplierResult.rows
                };
                reply.status(200).send(message);
            }
        }
        catch (error) {
            console.error('Error in upsertSupplier Controller', error);
            reply.send(error.message, 'Error in upsert Supplier Data Controller');
        }
    };
    supplierController.deleteSupplier = async (request, reply) => {
        try {
            let deleteSupplierResult = await supplierSerivce.deleteSupplierData(request.params.id);
            reply.send(deleteSupplierResult);
        }
        catch (error) {
            console.error('Error in deleteSupplier Controller', error);
            reply.send(error.message, 'Error in delete Supplier Data Controller');
        }
    };
})(supplierController || (supplierController = {}));
//# sourceMappingURL=supplier.controller.js.map