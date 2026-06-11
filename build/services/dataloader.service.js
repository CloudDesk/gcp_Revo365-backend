import csvtojson from "csvtojson";
import { ProductNumberFields, productArrayFields, productBooleanFields, productStringFields, } from "../utils/Fields/productFields.js";
import { validateDataLoader } from "../schemas/ajv.schema.js";
import { productInsertSchema } from "../schemas/v1/product.schema.js";
import { stockRevoService } from "./stockRevo.service.js";
import { stockArray, stockBoolean, stockInteger, stocklocationArray, stockText, } from "../utils/Fields/stockFields.js";
import { stockrevoSchema } from "../schemas/stockRevo.schema.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { getStockLocationData } from "../utils/StockLocationPicklist/locationpicklist.js";
//  export const stocklocationdataajv = [];
const normalizeStockImportHeader = (key) => String(key ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
const isUploadedBarcodeField = (key) => ["rfid", "barcode", "barcodenumber"].includes(normalizeStockImportHeader(key));
const removeUploadedBarcodeFields = (row) => {
    Object.keys(row || {}).forEach((key) => {
        if (isUploadedBarcodeField(key)) {
            delete row[key];
        }
    });
};
export var dataLoaderService;
(function (dataLoaderService) {
    dataLoaderService.getDataLoaderData = async (request) => {
        try {
            const files = request.files[0].filename;
            const csvfilepath = "uploads/" + files;
            const jsonresult = await csvtojson().fromFile(csvfilepath);
            let failuredata = [];
            await Promise.all(jsonresult.map(async (e, index) => {
                try {
                    removeUploadedBarcodeFields(e);
                    for (let [key, value] of Object.entries(e)) {
                        if (!value) {
                            e[key] = null;
                        }
                        else {
                            if (ProductNumberFields.includes(key)) {
                                let valueconvert = Number(value);
                                if (isNaN(valueconvert)) {
                                    e[key] = value;
                                }
                                else {
                                    e[key] = valueconvert;
                                }
                            }
                            else if (productBooleanFields.includes(key)) {
                                if (e[key] === "FALSE" ||
                                    e[key] === "false" ||
                                    e[key] === "False") {
                                    e[key] = false;
                                }
                                else if (e[key] === "True" ||
                                    e[key] === "TRUE" ||
                                    e[key] === "true") {
                                    e[key] = true;
                                }
                                else {
                                    e[key] = value;
                                }
                            }
                            else if (productStringFields.includes(key)) {
                                e[key] = value;
                            }
                            else if (productArrayFields.includes(key)) {
                                if (typeof value === "string") {
                                    try {
                                        e[key] = JSON.parse(value);
                                    }
                                    catch (error) {
                                        e[key] = value;
                                    }
                                }
                                else {
                                    e[key] = value;
                                }
                            }
                            else {
                                e[key] = value;
                            }
                        }
                    }
                    let validationresult = await validateDataLoader(productInsertSchema, e);
                    if (validationresult === true) {
                    }
                    else {
                        const errorObject = {};
                        validationresult.error.forEach((error) => {
                            const key = error.instancePath.slice(1);
                            const value = error.message;
                            errorObject.rowNumber = index + 2;
                            errorObject[key] = value;
                        });
                        failuredata.push(errorObject);
                    }
                }
                catch (error) {
                    console.error("Query Execution Error: IN getDataLoaderData promise", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error);
                    return ErrorMessage;
                }
            }));
            if (failuredata.length > 0) {
                return { error: failuredata, data: jsonresult };
            }
            else {
                return jsonresult;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN getDataLoaderData common", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    dataLoaderService.getDataLoaderDataStock = async (request) => {
        try {
            const files = request.files[0].filename;
            const csvfilepath = "uploads/" + files;
            const jsonresult = await csvtojson().fromFile(csvfilepath);
            const locationdataarray = await getStockLocationData();
            let failuredata = [];
            await Promise.all(jsonresult.map(async (e, index) => {
                try {
                    for (let [key, value] of Object.entries(e)) {
                        if (!value) {
                            e[key] = null;
                        }
                        else {
                            // Normalize stocktype field: convert variations to "rental_product"
                            if (key === "stocktype" && typeof value === "string") {
                                const normalizedValue = value.toLowerCase().replace(/\s+/g, "_");
                                if (normalizedValue === "rental_product") {
                                    e[key] = "rental_product";
                                }
                                else {
                                    e[key] = value;
                                }
                            }
                            else if (stockInteger.includes(key)) {
                                let valueconvert = Number(value);
                                if (isNaN(valueconvert)) {
                                    e[key] = value;
                                }
                                else {
                                    e[key] = valueconvert;
                                }
                            }
                            else if (stockBoolean.includes(key)) {
                                if (e[key] === "FALSE" ||
                                    e[key] === "false" ||
                                    e[key] === "False") {
                                    e[key] = false;
                                }
                                else if (e[key] === "True" ||
                                    e[key] === "TRUE" ||
                                    e[key] === "true") {
                                    e[key] = true;
                                }
                                else {
                                    e[key] = value;
                                }
                            }
                            else if (stockText.includes(key)) {
                                e[key] = value;
                            }
                            else if (stockArray.includes(key)) {
                                if (typeof value === "string") {
                                    try {
                                        e[key] = JSON.parse(value);
                                    }
                                    catch (error) {
                                        e[key] = value;
                                    }
                                }
                                else {
                                    e[key] = value;
                                }
                            }
                            else if (stocklocationArray.includes(key)) {
                                let convertedvalue = value;
                                convertedvalue = convertedvalue
                                    .toLowerCase()
                                    .replace(" ", "_");
                                e[key] = convertedvalue;
                            }
                            else {
                                e[key] = value;
                            }
                        }
                    }
                    // Force ecompublish = false if stocktype is rental_product
                    if (e.stocktype === "rental_product") {
                        e.ecompublish = false;
                    }
                    let validationresult = await validateDataLoader(stockrevoSchema, e);
                    if (validationresult === true) {
                    }
                    else {
                        const errorObject = {};
                        validationresult.error.forEach((error) => {
                            const key = error.instancePath.slice(1);
                            const value = error.message;
                            errorObject.rowNumber = index + 2;
                            errorObject[key] = value;
                        });
                        failuredata.push(errorObject);
                    }
                }
                catch (error) {
                    console.error("Query Execution Error: IN getDataLoaderDataStock promise", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error);
                    return ErrorMessage;
                }
            }));
            if (failuredata.length > 0) {
                return { error: failuredata, data: jsonresult };
            }
            else {
                return jsonresult;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN getDataLoaderDataStock", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    dataLoaderService.upsertBulkDataStock = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertBulkStockRevoData(request.body);
            return upsertStockResult;
        }
        catch (error) {
            console.error("Query Execution Error: In upsertBulkDataStock", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(dataLoaderService || (dataLoaderService = {}));
//# sourceMappingURL=dataloader.service.js.map