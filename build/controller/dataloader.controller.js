import { validateDataLoader } from "../schemas/ajv.schema.js";
import { productInsertSchema } from "../schemas/v1/product.schema.js";
import { dataLoaderService } from "../services/dataloader.service.js";
import { productService } from "../services/product.service.js";
import _ from 'lodash';
import { stockRevoService } from "../services/stockRevo.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var dataLoaderController;
(function (dataLoaderController) {
    dataLoaderController.insertDataLoaderData = async (request, reply) => {
        try {
            let jsonresult = request.body;
            let totalRecords = jsonresult.length;
            let successCount = 0;
            let failureCount = 0;
            let failuredata = [];
            await Promise.all(jsonresult.map(async (e, index) => {
                try {
                    console.log(JSON.stringify(e), ' Each Records ');
                    let validationresult = await validateDataLoader(productInsertSchema, e);
                    if (validationresult === true) {
                        let productUpsertResult = await productService.upsertProduct(e);
                        if (productUpsertResult?.command === "UPDATE" || productUpsertResult?.command === "INSERT") {
                            successCount++;
                        }
                        else {
                            failureCount++;
                        }
                    }
                    else {
                        failureCount++;
                        console.log(validationresult.error);
                        const errorObject = {};
                        validationresult.error.forEach(error => {
                            const key = error.instancePath.slice(1);
                            const value = error.message;
                            errorObject.rowNumber = index + 2;
                            errorObject[key] = value;
                        });
                        failuredata.push(errorObject);
                        console.log(errorObject);
                    }
                }
                catch (error) {
                    failureCount++;
                    console.log(`Error in forEach validation test values are: ${error}`);
                }
            }));
            return { totalRecords, failureCount, successCount, failuredata };
        }
        catch (error) {
            console.log('ERROR IN  Controller insertDataLoaderData');
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    dataLoaderController.insertDataLoaderDatalatest = async (request, reply) => {
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
                console.log(keyParts);
                const combination = arraydata.reduce((acc, prop, index) => {
                    console.log(acc, 'acc');
                    console.log(prop);
                    acc[prop] = keyParts[index];
                    return acc;
                }, {});
                return {
                    combination: combination,
                    data: value
                };
            });
            reply.send(result);
        }
        catch (error) {
            console.log('ERROR IN  Controller insertDataLoaderDatalatest');
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    dataLoaderController.getDataLoaderData = async (request, reply) => {
        try {
            let jsonResult = await dataLoaderService.getDataLoaderData(request);
            console.log(jsonResult);
            reply.send(jsonResult);
        }
        catch (error) {
            console.log('ERROR IN  Controller getDataLoaderData');
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    dataLoaderController.getDataLoaderDataStock = async (request, reply) => {
        try {
            let jsonResult = await dataLoaderService.getDataLoaderDataStock(request);
            // console.log(jsonResult ,'Update Result ');
            reply.send(jsonResult);
        }
        catch (error) {
            console.log('ERROR IN  Controller getDataLoaderDataStock');
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
    dataLoaderController.insertBulkDataStock = async (request, reply) => {
        try {
            let upsertStockResult = await dataLoaderService.upsertBulkDataStock(request, reply);
            console.log(upsertStockResult, 'Result is Total data resutl data ');
            if (upsertStockResult?.result?.command === "UPDATE" || upsertStockResult?.result?.command === "INSERT") {
                console.log('--- multi', upsertStockResult.result);
                console.log(upsertStockResult.result.rows[0].puc, 'PRODUCT PUC');
                const puc = upsertStockResult.result.rows[0].puc;
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                console.log(pucArray, 'PUC ARRAY');
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                // let updateQuantity = await stockRevoService.testinupdateQuantity(pucArray);
                let message = {
                    Stock: upsertStockResult?.result?.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully `,
                    "Total Records": upsertStockResult.totalRecords,
                    "Success Count": upsertStockResult.successCount
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
                };
                reply.status(200).send(message);
            }
            else {
                console.log('ELSE');
                reply.status(404).send({ error: [upsertStockResult] });
            }
            // return result
        }
        catch (error) {
            console.log('ERROR IN  Controller insertBulkDataStock');
            let errordata = await ErrorHandler.handleQueryError(error);
            reply.status(404).send(errordata);
        }
    };
})(dataLoaderController || (dataLoaderController = {}));
//# sourceMappingURL=dataloader.controller.js.map