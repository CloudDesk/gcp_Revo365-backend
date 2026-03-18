import { productrevoService } from "../services/productrevo.service.js";
import { getSession } from "../services/session.service.js";
import uploadtos3 from "../aws/uploadtos3.js";
export var productrevoController;
(function (productrevoController) {
    productrevoController.getProductsrevoData = async (request, reply) => {
        try {
            let getProductRevoResult = await productrevoService.getproductsData(request, "visible");
            reply.send(getProductRevoResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getProductsrevoData', error);
            reply.status(500).send(error.message);
        }
    };
    // Admin route — no visibility filter; ecomvisible driven entirely by query params
    productrevoController.getAdminProductsrevoData = async (request, reply) => {
        try {
            let getProductRevoResult = await productrevoService.getproductsData(request);
            reply.send(getProductRevoResult);
        }
        catch (error) {
            console.error('ERROR IN Controller getAdminProductsrevoData', error);
            reply.status(500).send(error.message);
        }
    };
    //get
    productrevoController.getProductsEcomrevoData = async (request, reply) => {
        try {
            let getProductRevoResult = await productrevoService.getEcomProducts(request, "visible");
            reply.send(getProductRevoResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getProductsEcomrevoData', error);
            reply.send(error.message);
        }
    };
    productrevoController.getSimilarProducts = async function (request, reply) {
        try {
            let getProductsResult = await productrevoService.getSimilarProducts(request, "visible");
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
    // Admin single-product route — no visibility filter; query-param driven
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
    // Ecom single-product route — always filters ecomvisible = TRUE
    productrevoController.getEachEcomProductsRevo = async function (request, reply) {
        try {
            const { id } = request.params;
            let getProductsResult = await productrevoService.getEachProductsRevo(request, Number(id), "visible");
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error('ERROR IN  Controller getEachEcomProductsRevo', error);
            reply.send(`${error.message} error in get Each Ecom Products`);
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
    // ─── ECOM VISIBILITY TOGGLE ────────────────────────────────────────────
    /**
     * PATCH /v2/product/:id/ecom-visibility
     * Body: { ecomvisible: true | false }
     *
     * Approach A — ecomvisible is a product-level visibility flag only.
     *
     * Toggle OFF (false):
     *   1. Validate: product exists? Already false? → return early
     *   2. BEGIN TRANSACTION
     *       a. UPDATE product_revo SET ecomvisible = FALSE, statushistory = <audit[]> WHERE id = $1
     *       b. DELETE FROM cart WHERE productid = $1  (clears cart AND wishlist if same table)
     *   3. COMMIT
     *   4. Return: { ecomvisible: false, cart_cleared: N, status_history: { active: {...}, total_entries: N } }
     *
     * Toggle ON (true):
     *   1. Validate: product exists? Already true? → return early
     *   2. BEGIN TRANSACTION
     *       a. UPDATE product_revo SET ecomvisible = TRUE, statushistory = <audit[]> WHERE id = $1
     *   3. COMMIT
     *   4. Return: { ecomvisible: true, status_history: { active: {...}, total_entries: N } }
     *
     * Physical stock (stock_revo) and qty counters are intentionally untouched.
     * Session is validated by the getSession preHandler on this route.
     */
    productrevoController.toggleEcomVisible = async (request, reply) => {
        try {
            const { id } = request.params;
            const body = request.body;
            // Session already validated by preHandler; re-call only to extract actor for audit trail.
            const sessionData = request.sessionData ?? await getSession(request, reply);
            if (reply.sent)
                return; // guard if getSession already replied with 401
            if (typeof body?.ecomvisible !== 'boolean') {
                return reply.status(400).send({
                    error: 'Missing or invalid body field: ecomvisible (must be true or false)'
                });
            }
            const result = await productrevoService.toggleEcomVisible(Number(id), body.ecomvisible, sessionData);
            reply.status(result?.status ?? 200).send(result);
        }
        catch (error) {
            console.error('ERROR IN Controller toggleEcomVisible', error);
            reply.status(500).send({ error: error.message });
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