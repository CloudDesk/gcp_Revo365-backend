import { productService } from "../services/product.service.js"
import uploadtos3 from "../aws/uploadtos3.js"
import { FastifyRequest, FastifyReply } from "fastify";

interface pageNumberandrecordCount {
    pageNumber: number;
    recordCount: number
}

interface idparams {
    id: number
}
export module productController {

    export const rearrangeImage = async function (request, reply) {
        try {

            let getProductsResult = await productService.rearrangeImage(request)
            console.log(getProductsResult);
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
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const getProducts = async function (request: any, reply: any) {
        try {
            // const client = await this.pg.connect()
            // let data = await client.query('select * from products')
            // console.log(data.rows.length, 'Dataset Values are data');
            // reply.send(data.rows)

            //Decorator test
            // console.log(request.isServerReady ,'Requesting data 1');             
            // console.log(request.gotch ,'Requesting data 1 gotch');             
            // console.log(reply.isNot ,'Requesting data 2'); 
            // console.log(request.yeah ,'Yeah request');  
            // console.log(this.data() ,'Getting data using this ');
            // console.log(this.utility('oHOOOOO') ,'Getting utility using this ');
            // console.log(this.almost('oHOOOOO almost') ,'Getting utility using this ');
            // console.log(this.testdata() ,'Getting testdata using this ');
            // console.log(this.testdatass() ,'Getting testdatass using this ');

            const { pageNumber, recordCount } = request.params
            let getProductsResult = await productService.getProducts(pageNumber, recordCount, request)
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const getEcomProducts = async function (request: any, reply: any) {
        try {

            let getProductsResult = await productService.getEcomProducts(request)
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const getSimilarProducts = async function (request: any, reply: any) {
        try {
            // const client = await this.pg.connect()
            // let data = await client.query('select * from products')
            // console.log(data.rows.length, 'Dataset Values are data');
            // reply.send(data.rows)

            //Decorator test
            // console.log(request.isServerReady ,'Requesting data 1');             
            // console.log(request.gotch ,'Requesting data 1 gotch');             
            // console.log(reply.isNot ,'Requesting data 2'); 
            // console.log(request.yeah ,'Yeah request');  
            // console.log(this.data() ,'Getting data using this ');
            // console.log(this.utility('oHOOOOO') ,'Getting utility using this ');
            // console.log(this.almost('oHOOOOO almost') ,'Getting utility using this ');
            // console.log(this.testdata() ,'Getting testdata using this ');
            // console.log(this.testdatass() ,'Getting testdatass using this ');

            const { pageNumber, recordCount } = request.params
            let getProductsResult = await productService.getSimilarProducts(pageNumber, recordCount, request)
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const getArcheivedProducts = async (request: FastifyRequest<{ Params: pageNumberandrecordCount }>, reply: FastifyReply) => {
        try {

            const { pageNumber, recordCount } = request.params
            let getProductsResult = await productService.getArcheivedProducts(pageNumber, recordCount, request)
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const getEachProducts = async function (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) {
        try {
            const { id } = request.params

            let getProductsResult = await productService.getEachProducts(request, Number(id))
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Each Products`)
        }
    }

    export const upsertProduct = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let productUpsertResult: any = await productService.upsertProduct(request.body)

            console.log(productUpsertResult, "productUpsertResult")
            if (productUpsertResult.command === "UPDATE" || productUpsertResult.command === "INSERT") {
                let message: any = {}
                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product Updated successfully`
                        : `Product Inserted successfully`
                };
                reply.status(200).send(message)
            }
            else {
                console.log("else productUpsertResult")
                console.log(productUpsertResult)
                reply.status(404).send({ error: [productUpsertResult] })
            }
        } catch (error) {
            console.log(error.message, 'Error in Upsert Prodouct data set');
            reply.status(404).send(` Error in upsert Product : ${error.message}`)
        }
    }

    export const upsertProductwithfile = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let productUpsertResult: any = await productService.upsertProductwithFile(request)
            if (productUpsertResult.command === "UPDATE" || productUpsertResult.command === "INSERT") {
                let message: any = {}
                let productId = productUpsertResult.productid
                // if (productId) {
                //     console.log(productId);
                //     let result = await uploadtos3(productUpsertResult.pathurldatas, productId)
                //     console.log(result);
                // }
                message = {
                    product: productUpsertResult.command === "UPDATE"
                        ? `Product File Updated successfully`
                        : `Product File Inserted successfully`
                };
                reply.status(200).send(message)
            }
        } catch (error) {
            console.log(error.message, 'Error in Upsert Prodouct data set');
            reply.send(` Error in upsert Product : ${error.message}`)
        }
    }

    export const updateRemovedFromRecyclebin = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let resultremoverecyclebin = await productService.updateRemoveFromRecyclebin()
            reply.send(resultremoverecyclebin)
        } catch (error) {
            reply.send(`Error in updating recyclebin : ${error.message}`)
        }
    }

    export const deleteProduct = async (request: FastifyRequest<{ Params: idparams }>, reply: FastifyReply) => {
        try {
            const { id } = request.params
            let getProductsResult = await productService.deleteProduct(Number(id))
            reply.send(getProductsResult)
        } catch (error) {
            reply.send(` Error in deleting Product : ${error.message}`)

        }
    }

}