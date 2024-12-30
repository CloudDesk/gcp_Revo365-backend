import { productService } from "../services/product.service.js";
export var productController;
(function (productController) {
    productController.rearrangeImage = async function (request, reply) {
        try {
            let getProductsResult = await productService.rearrangeImage(request);
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
            reply.send(`${error.message} error in get Products`);
        }
    };
    productController.getProducts = async function (request, reply) {
        try {
            const { pageNumber, recordCount } = request.params;
            let getProductsResult = await productService.getProducts(pageNumber, recordCount, request);
            reply.send(getProductsResult);
        }
        catch (error) {
            reply.send(`${error.message} error in get Products`);
        }
    };
    productController.getEcomProducts = async function (request, reply) {
        try {
            let getProductsResult = await productService.getEcomProducts(request);
            reply.send(getProductsResult);
        }
        catch (error) {
            reply.send(`${error.message} error in get Products`);
        }
    };
    productController.getSimilarProducts = async function (request, reply) {
        try {
            const { pageNumber, recordCount } = request.params;
            let getProductsResult = await productService.getSimilarProducts(pageNumber, recordCount, request);
            reply.send(getProductsResult);
        }
        catch (error) {
            reply.send(`${error.message} error in get Products`);
        }
    };
    productController.getArcheivedProducts = async (request, reply) => {
        try {
            const { pageNumber, recordCount } = request.params;
            let getProductsResult = await productService.getArcheivedProducts(pageNumber, recordCount, request);
            reply.send(getProductsResult);
        }
        catch (error) {
            reply.send(`${error.message} error in get Products`);
        }
    };
    productController.getEachProducts = async function (request, reply) {
        try {
            const { id } = request.params;
            let getProductsResult = await productService.getEachProducts(request, Number(id));
            reply.send(getProductsResult);
        }
        catch (error) {
            reply.send(`${error.message} error in get Each Products`);
        }
    };
    productController.upsertProduct = async (request, reply) => {
        try {
            let productUpsertResult = await productService.upsertProduct(request.body);
            if (productUpsertResult.command === "UPDATE" || productUpsertResult.command === "INSERT") {
                let message = {};
                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product Updated successfully`
                        : `Product Inserted successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [productUpsertResult] });
            }
        }
        catch (error) {
            reply.status(404).send(` Error in upsert Product : ${error.message}`);
        }
    };
    productController.upsertProductwithfile = async (request, reply) => {
        try {
            let productUpsertResult = await productService.upsertProductwithFile(request);
            if (productUpsertResult.command === "UPDATE" || productUpsertResult.command === "INSERT") {
                let message = {};
                let productId = productUpsertResult.productid;
                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product File Updated successfully`
                        : `Product File Inserted successfully`
                };
                reply.status(200).send(message);
            }
        }
        catch (error) {
            console.log(error.message, 'Error in Upsert Prodouct data set');
            reply.send(` Error in upsert Product : ${error.message}`);
        }
    };
    productController.updateRemovedFromRecyclebin = async (request, reply) => {
        try {
            let resultremoverecyclebin = await productService.updateRemoveFromRecyclebin();
            reply.send(resultremoverecyclebin);
        }
        catch (error) {
            reply.send(`Error in updating recyclebin : ${error.message}`);
        }
    };
    productController.deleteProduct = async (request, reply) => {
        try {
            const { id } = request.params;
            let getProductsResult = await productService.deleteProduct(Number(id));
            reply.send(getProductsResult);
        }
        catch (error) {
            reply.send(` Error in deleting Product : ${error.message}`);
        }
    };
})(productController || (productController = {}));
//# sourceMappingURL=Product.controller.js.map