import csvtojson from 'csvtojson'
import { ProductNumberFields, productArrayFields, productBooleanFields, productStringFields } from '../utils/Fields/productFields.js';
import { validateDataLoader } from '../schemas/ajv.schema.js';
import { productInsertSchema } from '../schemas/v1/product.schema.js';
import { query } from "../database/postgres.js";
import { QueryResult } from "pg";
import { stockRevoService } from './stockRevo.service.js';
import { stockArray, stockBoolean, stockInteger, stocklocationArray, stockText } from '../utils/Fields/stockFields.js';
import { stockrevoSchema } from '../schemas/stockRevo.schema.js';
import { ErrorHandler } from '../errorHandler/errorHandler.js';
import { json } from 'stream/consumers';
import { getStockLocationData } from '../utils/StockLocationPicklist/locationpicklist.js';
//  export const stocklocationdataajv = [];

export module dataLoaderService {
    export const getDataLoaderData = async (request) => {
        try {
            const files = request.files[0].filename;
            const csvfilepath = 'uploads/' + files;
            const jsonresult = await csvtojson().fromFile(csvfilepath);
            let failuredata = []
            console.log(jsonresult);
            await Promise.all(jsonresult.map(async (e: any, index: number) => {
                try {
                    for (let [key, value] of Object.entries(e)) {
                        if (!value) {
                            e[key] = null;
                        } else {
                            if (ProductNumberFields.includes(key)) {
                                let valueconvert: any = Number(value);
                                if (isNaN(valueconvert)) {
                                    e[key] = value;
                                } else {
                                    e[key] = valueconvert;
                                }
                            } else if (productBooleanFields.includes(key)) {
                                if (e[key] === 'FALSE' || e[key] === 'false' || e[key] === 'False') {
                                    e[key] = false;
                                } else if (e[key] === 'True' || e[key] === 'TRUE' || e[key] === 'true') {
                                    e[key] = true;
                                }
                                else {
                                    e[key] = value;
                                }
                            } else if (productStringFields.includes(key)) {
                                e[key] = value;
                            }
                            else if (productArrayFields.includes(key)) {
                                if (typeof value === 'string') {
                                    try {
                                        e[key] = JSON.parse(value);
                                    } catch (error) {
                                        console.log('json parsing error ');
                                        e[key] = value;
                                    }
                                } else {
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
                        console.log(validationresult.error);
                        const errorObject: any = {};
                        validationresult.error.forEach(error => {
                            const key = error.instancePath.slice(1);
                            const value = error.message;
                            errorObject.rowNumber = index + 2
                            errorObject[key] = value;
                        });
                        failuredata.push(errorObject)
                        console.log(errorObject);
                    }
                } catch (error) {
                    console.error("Query Execution Error: IN getDataLoaderData promise", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error)
                    console.log(ErrorMessage);
                    return ErrorMessage
                }
            }));
            console.log(failuredata);
            if (failuredata.length > 0) {
                return { error: failuredata, data: jsonresult }
            }
            else {
                return jsonresult
            }
        } catch (error) {
            console.error("Query Execution Error: IN getDataLoaderData common", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
    export const getDataLoaderDataStock = async (request) => {
        try {
            const files = request.files[0].filename;
            const csvfilepath = 'uploads/' + files;
            const jsonresult = await csvtojson().fromFile(csvfilepath);
            const locationdataarray = await getStockLocationData();
            console.log('11',locationdataarray,'11')
            let failuredata = []
            console.log('data');
            console.log(JSON.stringify(jsonresult), 'Data is');
            await Promise.all(jsonresult.map(async (e: any, index: number) => {
                try {
                    for (let [key, value] of Object.entries(e)) {
                        if (!value) {
                            e[key] = null;
                        } else {
                            if (stockInteger.includes(key)) {
                                let valueconvert: any = Number(value);
                                if (isNaN(valueconvert)) {
                                    e[key] = value;
                                } else {
                                    e[key] = valueconvert;
                                }
                            } else if (stockBoolean.includes(key)) {
                                console.log(key, 'Remove From Recycle BIn is ');
                                console.log(e[key]);
                                if (e[key] === 'FALSE' || e[key] === 'false' || e[key] === 'False') {
                                    e[key] = false;
                                } else if (e[key] === 'True' || e[key] === 'TRUE' || e[key] === 'true') {
                                    e[key] = true;
                                }
                                else {
                                    e[key] = value;
                                }
                            } else if (stockText.includes(key)) {
                                // let valueconvert: any = Number(value);
                                // if (isNaN(valueconvert)) {
                                //     e[key] = value;
                                // } else {
                                //     e[key] = valueconvert;
                                // }
                                e[key] = value;
                            }
                            else if (stockArray.includes(key)) {
                                if (typeof value === 'string') {
                                    try {
                                        e[key] = JSON.parse(value);
                                    } catch (error) {
                                        e[key] = value;
                                    }
                                } else {
                                    e[key] = value;
                                }
                            }
                            else if (stocklocationArray.includes(key)){
                                console.log('Location--',e.location)
                                let convertedvalue : any = value
                                convertedvalue =   convertedvalue.toLowerCase().replace(' ', '_');
                                console.log('---',convertedvalue,'--- CONVERTED')
                                e[key] = convertedvalue
                            }
                            else {
                                e[key] = value;
                            }
                        }

                    }
                     console.log(e.ecompublish, 'Ecom Publish is Before');
                    if(e.rfid === null || e.rfid === undefined || e.rfid === '') {
                        e.ecompublish = false;
                    }
                    console.log(e.ecompublish, 'Ecom Publish is AFTER');
                    console.log(e, 'Ecom Publish is AFTER');

                    let validationresult = await validateDataLoader(stockrevoSchema, e);
                    // console.log(validationresult, 'Validation Result is ');
                    if (validationresult === true) {
                    }
                    else {
                        const errorObject: any = {};
                        console.log(validationresult ,'VALIDATION ERROR IS');
                        validationresult.error.forEach(error => {
                            const key = error.instancePath.slice(1);
                            const value = error.message;
                            errorObject.rowNumber = index + 2
                            errorObject[key] = value;
                        });
                        failuredata.push(errorObject)
                    }
                } catch (error) {
                    console.error("Query Execution Error: IN getDataLoaderDataStock promise", error);
                    let ErrorMessage = await ErrorHandler.handleQueryError(error)
                    console.log(ErrorMessage);
                    return ErrorMessage
                }
            }));
            if (failuredata.length > 0) {
                return { error: failuredata, data: jsonresult }
            }
            else {
                return jsonresult
            }

        } catch (error) {
            console.error("Query Execution Error: IN getDataLoaderDataStock", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }


    export const upsertBulkDataStock = async (request, reply) => {
        try {

            let upsertStockResult = await stockRevoService.upsertBulkStockRevoData(request.body)
            console.log(upsertStockResult, 'USPERT STOCK RESULT IS ;;;;');
            return upsertStockResult
        } catch (error) {
            console.error("Query Execution Error: In upsertBulkDataStock", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }

}