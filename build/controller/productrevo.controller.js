import { productrevoService } from "../services/productrevo.service.js";
import { getSession } from "../services/session.service.js";
import uploadtos3 from "../aws/uploadtos3.js";
import { productBulkTemplateService } from "../services/productBulkTemplate.service.js";
const resolveBulkMode = (query) => query?.mode === "skip_duplicates" ? "skip_duplicates" : "strict";
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
    productrevoController.getProductComponentOptions = async function (request, reply) {
        try {
            const result = await productrevoService.getProductComponentOptions(request);
            reply.send(result);
        }
        catch (error) {
            console.error('ERROR IN Controller getProductComponentOptions', error);
            reply.status(500).send(error.message);
        }
    };
    productrevoController.getProductBom = async function (request, reply) {
        try {
            const result = await productrevoService.getProductBom(Number(request.params.id));
            reply.send(result);
        }
        catch (error) {
            console.error('ERROR IN Controller getProductBom', error);
            reply.status(500).send(error.message);
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
                const responseMessage = upsertProductRevoResult.command === "UPDATE"
                    ? `Product Updated successfully`
                    : `Product Inserted successfully`;
                const message = {
                    product: responseMessage,
                    message: responseMessage,
                    record: upsertProductRevoResult.rows?.[0] || null,
                    command: upsertProductRevoResult.command,
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
            const mode = resolveBulkMode((request.query || {}));
            const uploadedByRaw = request?.session?.id;
            const uploadedBy = Number.isFinite(Number(uploadedByRaw)) ? Number(uploadedByRaw) : null;
            if (!Array.isArray(productrevoDataArray) || productrevoDataArray.length === 0) {
                return reply.status(400).send({ error: 'Invalid input: Expected a non-empty array of products' });
            }
            const validationResult = await productrevoService.validateBulkProductPayload(productrevoDataArray, { mode });
            if (!validationResult.isValid) {
                return reply.status(400).send({
                    success: false,
                    message: "Bulk validation failed. Fix the highlighted rows and retry.",
                    validation: validationResult,
                });
            }
            const result = await productrevoService.insertBulkProduct(productrevoDataArray, {
                mode,
                uploadedBy,
            });
            if (result.success) {
                const summaryMessage = result.insertedCount > 0
                    ? `${result.insertedCount} product(s) inserted successfully`
                    : "No new rows inserted. All rows were treated as duplicates.";
                reply.status(200).send({
                    success: true,
                    message: summaryMessage,
                    mode,
                    insertedCount: result.insertedCount,
                    skippedCount: result.skippedCount,
                    duplicateRowCount: result.duplicateRowCount,
                    payloadHash: result.payloadHash,
                    duplicateOf: result.duplicateOf,
                    errors: result.errors.length > 0 ? result.errors : undefined,
                });
            }
            else {
                const statusCode = result.errorCode === "DUPLICATE_BULK_UPLOAD" || result.errorCode === "DUPLICATE_ROWS"
                    ? 409
                    : 400;
                reply.status(statusCode).send({
                    success: false,
                    code: result.errorCode || "BULK_INSERT_FAILED",
                    message: result.error || 'Failed to insert products. Check uploaded data.',
                    mode,
                    payloadHash: result.payloadHash,
                    duplicateOf: result.duplicateOf,
                    details: result.errors,
                });
            }
        }
        catch (error) {
            console.error('ERROR IN Controller insertBulkProduct', error);
            reply.status(500).send({ error: `Error in bulk product insert: ${error.message}` });
        }
    };
    productrevoController.validateBulkProduct = async (request, reply) => {
        try {
            const productrevoDataArray = request.body;
            const mode = resolveBulkMode((request.query || {}));
            if (!Array.isArray(productrevoDataArray) || productrevoDataArray.length === 0) {
                return reply.status(400).send({
                    success: false,
                    message: "Invalid input: Expected a non-empty array of products.",
                });
            }
            const validationResult = await productrevoService.validateBulkProductPayload(productrevoDataArray, { mode });
            if (validationResult.isValid) {
                return reply.status(200).send({
                    success: true,
                    message: "Validation successful. Data is ready for bulk insert.",
                    mode,
                    validation: validationResult,
                });
            }
            return reply.status(400).send({
                success: false,
                message: "Validation failed. Please correct the invalid rows.",
                mode,
                validation: validationResult,
            });
        }
        catch (error) {
            console.error("ERROR IN Controller validateBulkProduct", error);
            return reply.status(500).send({
                success: false,
                message: `Bulk validation failed unexpectedly: ${error.message}`,
            });
        }
    };
    productrevoController.downloadBulkProductTemplate = async (request, reply) => {
        try {
            const { profile } = (request.query || {});
            const workbook = await productBulkTemplateService.generateProductBulkTemplate(profile);
            const workbookBuffer = await workbook.xlsx.writeBuffer();
            const buffer = Buffer.isBuffer(workbookBuffer) ? workbookBuffer : Buffer.from(workbookBuffer);
            const fileDate = new Date().toISOString().slice(0, 10);
            const profileKey = profile || productBulkTemplateService.defaultProfile;
            const fileName = `Product_Bulk_Template_${profileKey}_${fileDate}.xlsx`;
            reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
            return reply.send(buffer);
        }
        catch (error) {
            console.error("ERROR IN Controller downloadBulkProductTemplate", error);
            const message = error.message || "Unknown error";
            const statusCode = message.startsWith("Invalid template profile") ? 400 : 500;
            reply.status(statusCode).send({ error: `Failed to generate template: ${message}` });
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