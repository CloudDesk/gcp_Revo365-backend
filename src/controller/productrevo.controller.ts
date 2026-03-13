import { FastifyRequest, FastifyReply } from "fastify";
import { productrevoService } from "../services/productrevo.service.js";
import { stockRevoService } from "../services/stockRevo.service.js";
import { getSession } from "../services/session.service.js";
import uploadtos3 from "../aws/uploadtos3.js";

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
    export const getHiddenProductsrevoData = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getProductRevoResult = await productrevoService.getproductsData(request, "hidden");
            reply.send(getProductRevoResult)
        } catch (error) {
            console.error('ERROR IN Controller getHiddenProductsrevoData', error);
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

    export const getEachProductsRevo = async function (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) {
        try {
            const { id } = request.params
            console.log("request.params", request.params)

            let getProductsResult = await productrevoService.getEachProductsRevo(request, Number(id), "visible")
            reply.send(getProductsResult)
        } catch (error) {
            console.error('ERROR IN  Controller getEachProductsRevo', error);
            reply.send(`${error.message} error in get Each Products`)
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
     * Body: { ecom_visible: true | false }
     *
     * Single lifecycle toggle for product visibility and soft delete.
     * false -> hidden + soft deleted
     * true  -> restored + visible
     */
    export const toggleEcomVisible = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            const body: any = request.body;
            const sessionData = await getSession(request, reply);

            if (!sessionData || reply.sent) {
                return;
            }

            if (typeof body?.ecom_visible !== 'boolean') {
                return reply.status(400).send({
                    error: 'Missing or invalid body field: ecom_visible (must be true or false)'
                });
            }

            const result: any = await productrevoService.toggleEcomVisible(Number(id), body.ecom_visible, sessionData);

            if (result?.puc) {
                try {
                    await stockRevoService.updateQuantity([result.puc], 0, false, false);
                } catch (qtyErr: any) {
                    console.error('[controller] Qty recalc failed after ecom visibility toggle:', qtyErr?.message);
                }
            }

            reply.status(result?.status ?? result?.statusCode ?? 200).send(result);
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
