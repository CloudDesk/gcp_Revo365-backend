import { FastifyRequest, FastifyReply } from "fastify";
import { productrevoService } from "../services/productrevo.service.js";
import { stockRevoService } from "../services/stockRevo.service.js";
import { getSession } from "../services/session.service.js";
import uploadtos3 from "../aws/uploadtos3.js";
import { productBulkTemplateService } from "../services/productBulkTemplate.service.js";
// Note: stockRevoService import retained for other potential usages in this module.

interface idparams {
    id: number
}

export module productrevoController {
    export const getProductsrevoData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getProductRevoResult = await productrevoService.getproductsData(request, "visible");
            reply.send(getProductRevoResult)
        } catch (error) {
            console.error('ERROR IN  Controller getProductsrevoData', error);
            reply.status(500).send(error.message);
        }
    }
    // Admin route — no visibility filter; ecomvisible driven entirely by query params
    export const getAdminProductsrevoData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getProductRevoResult = await productrevoService.getproductsData(request);
            reply.send(getProductRevoResult)
        } catch (error) {
            console.error('ERROR IN Controller getAdminProductsrevoData', error);
            reply.status(500).send(error.message);
        }
    }
    //get
    export const getProductsEcomrevoData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getProductRevoResult = await productrevoService.getEcomProducts(request, "visible");
            reply.send(getProductRevoResult)
        } catch (error) {
            console.error('ERROR IN  Controller getProductsEcomrevoData', error);
            reply.send(error.message);
        }
    }
    export const getSimilarProducts = async function (request: any, reply: any) {
        try {
            let getProductsResult = await productrevoService.getSimilarProducts(request, "visible")
            reply.send(getProductsResult)
        } catch (error) {
            console.error('ERROR IN  Controller getSimilarProducts', error);
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const upsertlockqty = async function (request: any, reply: any) {
        try {
            let getProductsResult = await productrevoService.bulkupsertProducttosetZero(request.body, true)
            reply.send(getProductsResult)
        } catch (error) {
            console.error('ERROR IN  Controller upsertlockqty', error);
            reply.send(`${error.message} error in get Products`)
        }
    }
    export const getArcheivedProductsRevo = async (request: any, reply: any) => {
        try {
            let getProductsResult = await productrevoService.getArcheivedProductsrevo(request)
            reply.send(getProductsResult)
        } catch (error) {
            console.error('ERROR IN  Controller getArcheivedProductsRevo', error);
            reply.send(`${error.message} error in get Products`)
        }
    }

    // Admin single-product route — no visibility filter; query-param driven
    export const getEachProductsRevo = async function (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) {
        try {
            const { id } = request.params
            console.log("request.params", request.params)
            let getProductsResult = await productrevoService.getEachProductsRevo(request, Number(id))
            reply.send(getProductsResult)
        } catch (error) {
            console.error('ERROR IN  Controller getEachProductsRevo', error);
            reply.send(`${error.message} error in get Each Products`)
        }
    }
    // Ecom single-product route — always filters ecomvisible = TRUE
    export const getEachEcomProductsRevo = async function (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) {
        try {
            const { id } = request.params
            let getProductsResult = await productrevoService.getEachProductsRevo(request, Number(id), "visible")
            reply.send(getProductsResult)
        } catch (error) {
            console.error('ERROR IN  Controller getEachEcomProductsRevo', error);
            reply.send(`${error.message} error in get Each Ecom Products`)
        }
    }
    export const updateOrderedQuantityarray = async function (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) {
        try {
            const { id } = request.params

            let getProductsResult = await productrevoService.updateOrderedQuantityarray(request.body)
            reply.send(getProductsResult)
        } catch (error) {
            console.error('ERROR IN  Controller updateOrderedQuantityarray', error);
            reply.send(`${error.message} error in get Each Products`)
        }
    }
    export const deleteProductrevo = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            let deleteProductRevoResult = await productrevoService.deleteProductrevo(Number(id));
            reply.send(deleteProductRevoResult);
        } catch (error) {
            console.error('ERROR IN  Controller deleteProductrevo', error);
            reply.send(error.message);
        }
    }

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
    export const toggleEcomVisible = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            const body: any = request.body;

            // Session already validated by preHandler; re-call only to extract actor for audit trail.
            const sessionData = (request as any).sessionData ?? await getSession(request, reply);
            if (reply.sent) return; // guard if getSession already replied with 401

            if (typeof body?.ecomvisible !== 'boolean') {
                return reply.status(400).send({
                    error: 'Missing or invalid body field: ecomvisible (must be true or false)'
                });
            }

            const result: any = await productrevoService.toggleEcomVisible(
                Number(id),
                body.ecomvisible,
                sessionData
            );

            reply.status(result?.status ?? 200).send(result);
        } catch (error) {
            console.error('ERROR IN Controller toggleEcomVisible', error);
            reply.status(500).send({ error: error.message });
        }
    }
    export const upsertProductrevo = async (request: any, reply: any) => {
        try {
            const productrevoData = request.body;
            let upsertProductRevoResult = await productrevoService.upsertProductrevo(productrevoData)
            if (upsertProductRevoResult.command === "UPDATE" || upsertProductRevoResult.command === "INSERT") {
                let message: any = {}
                message = {
                    product: upsertProductRevoResult.command === "UPDATE"
                        ? `Product Updated successfully`
                        : `Product Inserted successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertProductRevoResult] })
            }
        } catch (error) {
            console.error('ERROR IN  Controller upsertProductrevo', error);
            reply.send(error.message)
        }
    }

    export const insertBulkProduct = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            console.log('insertBulkProduct controller called');
            const productrevoDataArray = request.body as any[];
            if (!Array.isArray(productrevoDataArray) || productrevoDataArray.length === 0) {
                return reply.status(400).send({ error: 'Invalid input: Expected a non-empty array of products' });
            }

            const result = await productrevoService.insertBulkProduct(productrevoDataArray);

            if (result.success) {
                reply.status(200).send({
                    message: `${result.insertedCount} product(s) inserted successfully`,
                    errors: result.errors.length > 0 ? result.errors : undefined,
                });
            } else {
                reply.status(400).send({
                    error: 'Failed to insert products check excel data that you uploaded',
                    details: result.errors,
                });
            }
        } catch (error) {
            console.error('ERROR IN Controller insertBulkProduct', error);
            reply.status(500).send({ error: `Error in bulk product insert: ${(error as Error).message}` });
        }
    };

    export const downloadBulkProductTemplate = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const workbook = await productBulkTemplateService.generateProductBulkTemplate();
            const workbookBuffer = await workbook.xlsx.writeBuffer();
            const buffer = Buffer.isBuffer(workbookBuffer) ? workbookBuffer : Buffer.from(workbookBuffer);
            const fileDate = new Date().toISOString().slice(0, 10);
            const fileName = `Product_Bulk_Template_${fileDate}.xlsx`;

            reply.header(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            reply.header("Content-Disposition", `attachment; filename="${fileName}"`);

            return reply.send(buffer);
        } catch (error) {
            console.error("ERROR IN Controller downloadBulkProductTemplate", error);
            reply.status(500).send({ error: `Failed to generate template: ${(error as Error).message}` });
        }
    };


    export const upsertProductwithfileRevo = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let productUpsertResult: any = await productrevoService.upsertProductwithFileRevo(request)
            if (productUpsertResult.command === "UPDATE" || productUpsertResult.command === "INSERT") {
                let message: any = {}
                let productId = productUpsertResult.productid
                if (productId) {
                    let result = await uploadtos3(productUpsertResult.pathurldatas, productId)
                }
                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product File Updated successfully`
                        : `Product File Inserted successfully`
                };
                reply.status(200).send(message)
            }
        } catch (error) {
            console.error('ERROR IN  Controller upsertProductwithfileRevo', error);
            reply.send(` Error in upsert Product : ${error.message}`)
        }
    }
    export const upsertProductwithfileRevogcp = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let productUpsertResult: any = await productrevoService.upsertProductwithfileRevogcp(request)
            if (productUpsertResult.result.command === "UPDATE" || productUpsertResult.result.command === "INSERT") {
                let message: any = {}

                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product File Updated successfully`
                        : `Product File Inserted successfully`
                };
                return message
            }
            // reply.send('Success')
        } catch (error) {
            console.error('ERROR IN  Controller upsertProductwithfileRevogcp', error);
            reply.send(` Error in upsert Product : ${error.message}`)
        }
    }

    export const rearrangeImageRevo = async function (request, reply) {
        try {

            let getProductsResult = await productrevoService.rearrangeImageRevo(request)
            if (getProductsResult.command === "UPDATE" || getProductsResult.command === "INSERT") {
                let message: any = {}
                message = {
                    product: getProductsResult.command === "UPDATE"
                        ? `Image Rearranged  successfully`
                        : `Image Rearranged  successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(500).send(getProductsResult)
            }

        } catch (error) {
            console.error('ERROR IN  Controller rearrangeImageRevo', error);
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const updateRemovedFromRecyclebinRevo = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let resultremoverecyclebin = await productrevoService.updateRemoveFromRecyclebinRevo()
            reply.send(resultremoverecyclebin)
        } catch (error) {
            console.error('ERROR IN  Controller updateRemovedFromRecyclebinRevo', error);
            reply.send(`Error in updating recyclebin : ${error.message}`)
        }
    }


}
