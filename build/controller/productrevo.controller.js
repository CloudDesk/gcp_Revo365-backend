import { productrevoService } from "../services/productrevo.service.js";
import uploadtos3 from "../aws/uploadtos3.js";
export var productrevoController;
(function (productrevoController) {
    productrevoController.getProductsrevoData = async (request, reply) => {
        try {
            let getProductRevoResult = await productrevoService.getproductsData(request);
            reply.send(getProductRevoResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getProductsrevoData', error);
            reply.status(500).send(error.message);
        }
    };
    //get
    productrevoController.getProductsEcomrevoData = async (request, reply) => {
        try {
            let getProductRevoResult = await productrevoService.getEcomProducts(request);
            reply.send(getProductRevoResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getProductsEcomrevoData', error);
            reply.send(error.message);
        }
    };
    productrevoController.getSimilarProducts = async function (request, reply) {
        try {
            let getProductsResult = await productrevoService.getSimilarProducts(request);
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getSimilarProducts', error);
            reply.send(`${error.message} error in get Products`);
        }
    };
    productrevoController.upsertlockqty = async function (request, reply) {
        try {
            let getProductsResult = await productrevoService.bulkupsertProducttosetZero(request.body, true);
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller upsertlockqty', error);
            reply.send(`${error.message} error in get Products`);
        }
    };
    productrevoController.getArcheivedProductsRevo = async (request, reply) => {
        try {
            let getProductsResult = await productrevoService.getArcheivedProductsrevo(request);
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getArcheivedProductsRevo', error);
            reply.send(`${error.message} error in get Products`);
        }
    };
    productrevoController.getEachProductsRevo = async function (request, reply) {
        try {
            const { id } = request.params;
            console.log("request.params", request.params);
            let getProductsResult = await productrevoService.getEachProductsRevo(request, Number(id));
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getEachProductsRevo', error);
            reply.send(`${error.message} error in get Each Products`);
        }
    };
    productrevoController.updateOrderedQuantityarray = async function (request, reply) {
        try {
            const { id } = request.params;
            let getProductsResult = await productrevoService.updateOrderedQuantityarray(request.body);
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller updateOrderedQuantityarray', error);
            reply.send(`${error.message} error in get Each Products`);
        }
    };
    productrevoController.deleteProductrevo = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteProductRevoResult = await productrevoService.deleteProductrevo(Number(id));
            reply.send(deleteProductRevoResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller deleteProductrevo', error);
            reply.send(error.message);
        }
    };
    productrevoController.upsertProductrevo = async (request, reply) => {
        try {
            const productrevoData = request.body;
            let upsertProductRevoResult = await productrevoService.upsertProductrevo(productrevoData);
            if (upsertProductRevoResult.command === "UPDATE" || upsertProductRevoResult.command === "INSERT") {
                let message = {};
                message = {
                    product: upsertProductRevoResult.command === "UPDATE"
                        ? `Product Updated successfully`
                        : `Product Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [upsertProductRevoResult] });
            }
        }
        catch (error) {
            console.error('ERROR IN  Controller upsertProductrevo', error);
            reply.send(error.message);
        }
    };
    productrevoController.insertBulkProduct = async (request, reply) => {
        try {
            console.log('insertBulkProduct controller called');
            const productrevoDataArray = request.body;
            if (!Array.isArray(productrevoDataArray) || productrevoDataArray.length === 0) {
                return reply.status(400).send({ error: 'Invalid input: Expected a non-empty array of products' });
            }
            const result = await productrevoService.insertBulkProduct(productrevoDataArray);
            if (result.success) {
                reply.status(200).send({
                    message: `${result.insertedCount} product(s) inserted successfully`,
                    errors: result.errors.length > 0 ? result.errors : undefined,
                });
            }
            else {
                reply.status(400).send({
                    error: 'Failed to insert products check excel data that you uploaded',
                    details: result.errors,
                });
            }
        }
        catch (error) {
            console.error('ERROR IN Controller insertBulkProduct', error);
            reply.status(500).send({ error: `Error in bulk product insert: ${error.message}` });
        }
    };
    productrevoController.upsertProductwithfileRevo = async (request, reply) => {
        try {
            let productUpsertResult = await productrevoService.upsertProductwithFileRevo(request);
            if (productUpsertResult.command === "UPDATE" || productUpsertResult.command === "INSERT") {
                let message = {};
                let productId = productUpsertResult.productid;
                if (productId) {
                    let result = await uploadtos3(productUpsertResult.pathurldatas, productId);
                }
                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product File Updated successfully`
                        : `Product File Inserted successfully`
                };
                reply.status(200).send(message);
            }
        }
        catch (error) {
            console.error('ERROR IN  Controller upsertProductwithfileRevo', error);
            reply.send(` Error in upsert Product : ${error.message}`);
        }
    };
    productrevoController.upsertProductwithfileRevogcp = async (request, reply) => {
        try {
            let productUpsertResult = await productrevoService.upsertProductwithfileRevogcp(request);
            if (productUpsertResult.result.command === "UPDATE" || productUpsertResult.result.command === "INSERT") {
                let message = {};
                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product File Updated successfully`
                        : `Product File Inserted successfully`
                };
                return message;
            }
            // reply.send('Success')
        }
        catch (error) {
            console.error('ERROR IN  Controller upsertProductwithfileRevogcp', error);
            reply.send(` Error in upsert Product : ${error.message}`);
        }
    };
    productrevoController.rearrangeImageRevo = async function (request, reply) {
        try {
            let getProductsResult = await productrevoService.rearrangeImageRevo(request);
            if (getProductsResult.command === "UPDATE" || getProductsResult.command === "INSERT") {
                let message = {};
                message = {
                    product: getProductsResult.command === "UPDATE"
                        ? `Image Rearranged  successfully`
                        : `Image Rearranged  successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(getProductsResult);
            }
        }
        catch (error) {
            console.error('ERROR IN  Controller rearrangeImageRevo', error);
            reply.send(`${error.message} error in get Products`);
        }
    };
    productrevoController.updateRemovedFromRecyclebinRevo = async (request, reply) => {
        try {
            let resultremoverecyclebin = await productrevoService.updateRemoveFromRecyclebinRevo();
            reply.send(resultremoverecyclebin);
        }
        catch (error) {
            console.error('ERROR IN  Controller updateRemovedFromRecyclebinRevo', error);
            reply.send(`Error in updating recyclebin : ${error.message}`);
        }
    };
})(productrevoController || (productrevoController = {}));
//# sourceMappingURL=productrevo.controller.js.map