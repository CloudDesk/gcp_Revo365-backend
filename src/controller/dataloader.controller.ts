import { validateDataLoader } from "../schemas/ajv.schema.js";
import { productInsertSchema } from "../schemas/v1/product.schema.js";
import { dataLoaderService } from "../services/dataloader.service.js"
import { productService } from "../services/product.service.js";
import _ from 'lodash'
import { stockRevoService } from "../services/stockRevo.service.js";
import { productrevoService } from "../services/productrevo.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

export module dataLoaderController {

    export const insertDataLoaderData = async (request: any, reply: any) => {
        try {

            let jsonresult = request.body
            let totalRecords = jsonresult.length;
            let successCount = 0;
            let failureCount = 0;
            let failuredata = []
            await Promise.all(jsonresult.map(async (e: any, index: any) => {
                try {
                    let validationresult = await validateDataLoader(productInsertSchema, e);
                    if (validationresult === true) {
                        let productUpsertResult: any = await productService.upsertProduct(e);
                        if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                            successCount++;
                        } else {
                            failureCount++;
                        }
                    } else {
                        failureCount++;
                        const errorObject: any = {};

                        validationresult.error.forEach(error => {
                            const key = error.instancePath.slice(1);
                            const value = error.message;
                            errorObject.rowNumber = index + 2
                            errorObject[key] = value;

                        });
                        failuredata.push(errorObject)
                    }
                } catch (error) {
                    failureCount++;
                    console.log(`Error in forEach validation test values are: ${error}`);
                }
            }));
            return { totalRecords, failureCount, successCount, failuredata }
        } catch (error) {
            console.log('ERROR IN  Controller insertDataLoaderData', error);
            let errordata = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);
        }
    }

    export const insertDataLoaderDatalatest = async (request: any, reply: any) => {
        try {

            let jsonresult = request.body;
            let totalRecords = jsonresult.length;
            let successCount = 0;
            let failureCount = 0;
            let failuredata = [];

            const arraydata = [
                'category', 'subcategory', 'brand', 'model', 'operatingsystem',
                'operatingsystemversion', 'ram', 'storagetype', 'colour',
                'graphicscard', 'processor'
            ];

            const groupByMultiple = (array, properties) => {
                return _.groupBy(array, item => properties.map(prop => item[prop]).join(' '));
            };

            const groupedData = groupByMultiple(jsonresult, arraydata);

            const result = Object.entries(groupedData).map(([key, value]) => {
                const keyParts = key.split(' ');
                const combination = arraydata.reduce((acc, prop, index) => {
                    acc[prop] = keyParts[index];
                    return acc;
                }, {});
                return {
                    combination: combination,
                    data: value
                };
            });

            reply.send(result);
        } catch (error) {
            console.log('ERROR IN  Controller insertDataLoaderDatalatest', error);
            let errordata = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);
        }
    }

    export const getDataLoaderData = async (request: any, reply: any) => {
        try {
            let jsonResult: any = await dataLoaderService.getDataLoaderData(request)
            reply.send(jsonResult)
        } catch (error) {
            console.log('ERROR IN  Controller getDataLoaderData', error);
            let errordata = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);
        }
    }


    export const getDataLoaderDataStock = async (request: any, reply: any) => {
        try {
            let jsonResult: any = await dataLoaderService.getDataLoaderDataStock(request)
            reply.send(jsonResult)
        } catch (error) {
            console.log('ERROR IN  Controller getDataLoaderDataStock', error);
            let errordata = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);
        }
    }

    export const insertBulkDataStock = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await dataLoaderService.upsertBulkDataStock(request, reply)
            if (upsertStockResult?.result?.command === "UPDATE" || upsertStockResult?.result?.command === "INSERT") {
                // Collect all unique PUCs from inserted rows (may span multiple products)
                const pucArray: string[] = Array.from(
                    new Set(upsertStockResult.result.rows.map((row: any) => row.puc))
                ) as string[];
                console.log("PUC Array for quantity update:", pucArray);

                // Step 1: updateQuantity — recalculates stock counts + calls testinupdateQuantity for JSONB
                await stockRevoService.updateQuantity(pucArray);

                // Step 2: updateCatalogueQuantities — ensures product_revo aggregate fields
                // (overallavailableqty, ecompublishedquantity, oncatalogueqty, offcatalogueqty, etc.)
                // are fully synced. This matches the single-stock creation path.
                for (const puc of pucArray) {
                    await productrevoService.updateCatalogueQuantities(puc);
                }

                let message: any = {
                    Stock: upsertStockResult?.result?.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                    "Total Records": upsertStockResult.totalRecords,
                    "Success Count": upsertStockResult.successCount
                };
                reply.status(200).send(message);
            } else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            console.log('ERROR IN Controller insertBulkDataStock', error);
            let errordata = await ErrorHandler.handleQueryError(error)
            reply.status(404).send(errordata);
        }
    }
}
