import { query } from "../database/postgres.js";
import imageResize from "../imageResize/imageRessize.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { picklistservice } from "./picklist.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var productService;
(function (productService) {
    productService.getProducts = async (pageNumber, recordCount, request) => {
        try {
            console.log("daat");
            console.log(request.isServerReady, "serice");
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderbyfield;
            let orderby;
            let sortByPrice = false;
            keys.forEach((key, index) => {
                let paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (key === "displaysize" || key === "price") {
                    let rangeWhereClause = paramValues
                        .map((range) => {
                        const [lowerBound, upperBound] = range.split("-");
                        queryParams.push(lowerBound, upperBound);
                        const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                        parameterIndex += 2;
                        return clause;
                    })
                        .join(" OR ");
                    whereClauses.push(`(${rangeWhereClause})`);
                }
                //sortby Query
                else if (key === "sortby") {
                    let [fieldName, fieldValue] = paramValues[0].split("-");
                    orderby = fieldValue;
                    orderbyfield = `(${paramValues.map((_, idx) => `${fieldName}`)})`;
                    sortByPrice = true;
                }
                else {
                    console.log(values);
                    console.log(values.indexOf('NOT warranty'), 'Having NOT???');
                    let splittext;
                    let splitwarranty;
                    let indexofnot = values.indexOf('NOT warranty');
                    if (indexofnot != -1) {
                        console.log(values[indexofnot]);
                        splittext = values[indexofnot];
                        console.log(splittext, 'data');
                        splitwarranty = splittext.split(' ');
                    }
                    if (Array.isArray(splitwarranty) && splitwarranty[0] === 'NOT') {
                        splittext = splitwarranty[1];
                    }
                    console.log(splittext, 'split texts');
                    // whereClauses.push(
                    //   `(${paramValues
                    //     .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                    //     .join(" OR ")})`
                    // );
                    console.log(key, 'key is');
                    console.log(keys[indexofnot], 'key is values');
                    console.log(indexofnot, 'index of not is');
                    console.log(paramValues, 'params valuese');
                    whereClauses.push(`(${paramValues
                        .map((_, idx) => {
                        console.log(idx, 'index is data');
                        console.log(indexofnot, 'index is not');
                        return `${index === indexofnot ? `${key} != $${parameterIndex + idx}` : `${key} = $${parameterIndex + idx}`}`;
                    })
                        .join(" OR ")})`);
                    console.log(whereClauses, 'whereclause');
                    console.log(queryParams);
                    if (index === indexofnot) {
                        paramValues = [splittext];
                    }
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            // const whereClause =
            //   whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
            // const offset = (pageNumber - 1) * recordCount;
            // let queryText;
            // if (whereClause) {
            //   if (!sortByPrice) {
            //     queryText = `SELECT * FROM products ${whereClause} AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)  ORDER BY modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
            //       }`;
            //   } else {
            //     queryText = `SELECT * FROM products ${whereClause} AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)  ORDER BY ${orderbyfield} ${orderby} OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
            //       }`;
            //   }
            // }
            // else {
            //   if (!sortByPrice) {
            //     queryText = `SELECT * FROM products where (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)  ORDER BY modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
            //       }`;
            //   } else {
            //     queryText = `SELECT * FROM products where (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)  ORDER BY ${orderbyfield} ${orderby} OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
            //       }`;
            //   }
            // }
            const offset = (pageNumber - 1) * recordCount;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ` : "where";
            let orderByClause = !sortByPrice ? "ORDER BY modifieddate DESC" : `ORDER BY ${orderbyfield} ${orderby}`;
            let queryText = `
          SELECT *
          FROM products
          ${whereClause}
          (isarchive = FALSE OR isarchive IS NULL)
          And (isdeleted = FALSE OR isdeleted IS NULL)
          ${orderByClause}
          OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}
      `;
            console.log(queryText, 'Query');
            console.log(queryParams);
            queryParams.push(offset, recordCount);
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getProducts", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.getEcomProducts = async (request) => {
        try {
            let offset;
            const pageNumber = request.query.page;
            const recordcount = request.query.count;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderbyfield;
            let orderby;
            let sortByPrice = false;
            keys.forEach((key, index) => {
                if (key !== "page" && key !== "count") {
                    let paramValues = Array.isArray(values[index])
                        ? values[index]
                        : [values[index]];
                    if (key === "displaysize" || key === "price") {
                        let rangeWhereClause = paramValues
                            .map((range) => {
                            console.log(range);
                            const [lowerBound, upperBound] = range.split("-");
                            queryParams.push(lowerBound, upperBound);
                            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
                            parameterIndex += 2;
                            return clause;
                        })
                            .join(" OR ");
                        whereClauses.push(`(${rangeWhereClause})`);
                    }
                    //sortby Query
                    else if (key === "sortby") {
                        let [fieldName, fieldValue] = paramValues[0].split("-");
                        orderby = fieldValue;
                        orderbyfield = `(${paramValues.map((_, idx) => `${fieldName}`)})`;
                        sortByPrice = true;
                    }
                    // else {
                    //   whereClauses.push(
                    //     `(${paramValues
                    //       .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                    //       .join(" OR ")})`
                    //   );
                    //   queryParams.push(...paramValues);
                    //   parameterIndex += paramValues.length;
                    // }
                    else {
                        console.log(values);
                        console.log(values.indexOf('NOT warranty'), 'Having NOT???');
                        let splittext;
                        let splitwarranty;
                        let indexofnot = values.indexOf('NOT warranty');
                        if (indexofnot != -1) {
                            console.log(values[indexofnot]);
                            splittext = values[indexofnot];
                            console.log(splittext, 'data');
                            splitwarranty = splittext.split(' ');
                        }
                        if (Array.isArray(splitwarranty) && splitwarranty[0] === 'NOT') {
                            splittext = splitwarranty[1];
                        }
                        console.log(splittext, 'split texts');
                        // whereClauses.push(
                        //   `(${paramValues
                        //     .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                        //     .join(" OR ")})`
                        // );
                        console.log(key, 'key is');
                        console.log(keys[indexofnot], 'key is values');
                        console.log(indexofnot, 'index of not is');
                        console.log(paramValues, 'params valuese');
                        whereClauses.push(`(${paramValues
                            .map((_, idx) => {
                            console.log(idx, 'index is data');
                            console.log(indexofnot, 'index is not');
                            return `${index === indexofnot ? `${key} != $${parameterIndex + idx}` : `${key} = $${parameterIndex + idx}`}`;
                        })
                            .join(" OR ")})`);
                        console.log(whereClauses, 'whereclause');
                        console.log(queryParams);
                        if (index === indexofnot) {
                            paramValues = [splittext];
                        }
                        queryParams.push(...paramValues);
                        parameterIndex += paramValues.length;
                    }
                }
            });
            if (pageNumber && recordcount) {
                offset = (pageNumber - 1) * recordcount;
            }
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
            let queryText = `SELECT DISTINCT ON (puc) * FROM products`;
            const baseConditions = ` (isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND ecompublish = TRUE AND removefromrecyclebin = false`;
            const orderByClause = sortByPrice
                ? `ORDER BY puc, ${orderbyfield} ${orderby}`
                : `ORDER BY puc, modifieddate DESC`;
            if (whereClause) {
                queryText += ` ${whereClause} AND ${baseConditions} ${orderByClause}`;
            }
            else {
                queryText += ` where ${baseConditions} ${orderByClause}`;
            }
            if (pageNumber && recordcount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            if (offset >= 0 && recordcount) {
                queryParams.push(offset, recordcount);
            }
            console.log(queryText);
            console.log(queryParams);
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getEcomProducts", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.getSimilarProducts = async (pageNumber, recordCount, request) => {
        try {
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let queryParams = [];
            let parameterIndex = 1;
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (index !== 0) {
                    whereClause += " AND ";
                }
                whereClause += `(${paramValues
                    .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                    .join(" OR ")})`;
                parameterIndex += paramValues.length;
                queryParams.push(...paramValues);
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM products`;
            if (whereClause) {
                queryText += ` WHERE ${whereClause} AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) ORDER BY modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            else {
                queryText += ` WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) ORDER BY modifieddate DESC OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            queryParams.push(offset, recordCount);
            const result = await query(queryText, queryParams);
            if (result.rows.length <= 1) {
                let queryTextLatest;
                let queryParamsLatest = [];
                queryParams = [];
                keys.forEach((key, index) => {
                    if (key === "subcategory") {
                        const paramValues = Array.isArray(values[index])
                            ? values[index]
                            : [values[index]];
                        whereClause = `(${paramValues
                            .map((_, idx) => `${key} = $1`)
                            .join(" OR ")})`;
                        queryTextLatest = `SELECT * FROM products WHERE ${whereClause} AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) ORDER BY modifieddate DESC OFFSET $2 LIMIT $3`;
                        queryParamsLatest.push(...paramValues, offset, recordCount);
                    }
                });
                const resultLatest = await query(queryTextLatest, queryParamsLatest);
                let datatyperesult = await dataTypeCheck(resultLatest);
                return datatyperesult;
            }
            else {
                return await dataTypeCheck(result);
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN getSimilarProducts", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.getArcheivedProducts = async (pageNumber, recordCount, request) => {
        try {
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClause = "";
            let parameterIndex = 1;
            let queryParams = [];
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index])
                    ? values[index]
                    : [values[index]];
                if (index !== 0) {
                    whereClause += " AND ";
                }
                whereClause += `(${paramValues
                    .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                    .join(" OR ")})`;
                parameterIndex += paramValues.length;
                queryParams.push(...paramValues);
            });
            const offset = (pageNumber - 1) * recordCount;
            let queryText = `SELECT * FROM products`;
            if (whereClause) {
                queryText += ` WHERE   ${whereClause} AND isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            else {
                queryText += ` WHERE isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
            }
            queryParams.push(offset, recordCount);
            const result = await query(queryText, queryParams);
            let datatypecheckResult = await dataTypeCheck(result);
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getArcheivedProducts", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.getEachProducts = async function (request, id) {
        try {
            console.log("getEachProducts call 3");
            console.log(id);
            const result = await query(`SELECT * FROM products where id=${id}`, []);
            let getvalues = { objectName: "null" };
            getvalues.objectName = "products";
            let data = await picklistservice.getProductPicklist(getvalues);
            console.log(data);
            let datatypecheckResult = await dataTypeCheck(result);
            datatypecheckResult[0].picklist = data;
            return datatypecheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getEachProducts", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.getStockData = async function (stockFields, stockValues) {
        try {
            console.log(3);
            function findAllNullIndices(arr) {
                return arr.reduce((indices, currentValue, currentIndex) => {
                    if (currentValue === null) {
                        indices.push(currentIndex);
                    }
                    return indices;
                }, []);
            }
            console.log(4);
            let gettingNullIndex = findAllNullIndices(stockValues);
            let paramIndex = 0;
            let findValue = stockFields.indexOf("colour");
            if (findValue !== -1) {
                console.log(stockValues[findValue], "colour is ");
            }
            else {
                console.log("not found!!!");
            }
            let queryStockData = `SELECT * FROM stock WHERE ${stockFields
                .map((field, index) => {
                if (gettingNullIndex.includes(index)) {
                    return `${field} IS NULL`;
                }
                else {
                    paramIndex++;
                    return `${field} ILIKE $${paramIndex}`;
                }
            })
                .join(" AND ")}`;
            let params = stockValues.filter((e) => e !== null);
            console.log(5);
            const result = await query(queryStockData, params);
            console.log(8);
            return result.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN getStockData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.insertStockData = async function (stockFields, stockValues) {
        try {
            console.log(11);
            let querydata;
            const insertStocks = (querydata = `INSERT INTO stock (${stockFields.join(", ")}) VALUES (${stockFields
                .map((_, index) => `$${index + 1}`)
                .join(", ")}) RETURNING *`);
            let params;
            params = [...stockValues];
            console.log(11);
            const Stockresult = await query(insertStocks, params);
            console.log(Stockresult.rows);
            console.log(12);
            return Stockresult.rows[0];
        }
        catch (error) {
            console.error("Query Execution Error: IN insertStockData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.updatestockQuantity = async function (puc, oldpuc) {
        try {
            console.log(puc, "puc data");
            console.log(oldpuc, "Old Puc");
            let querydata;
            let resultarray = [];
            if (puc && (!oldpuc || oldpuc === null || oldpuc === undefined)) {
                querydata = `select * from products where puc = '${puc}' AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)`;
                let result = await query(querydata, []);
                let updatestock = `UPDATE stock
        SET quantity = ${result.rows.length}
        WHERE puc = '${puc}' returning *; `;
                let resultupsertstock = await query(updatestock, []);
                resultarray.push({ puc: resultupsertstock.rows });
                return resultarray;
            }
            else if (oldpuc) {
                querydata = `select * from products where puc = '${oldpuc}' AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)`;
                let result = await query(querydata, []);
                let updatestock = `UPDATE stock
        SET quantity = ${result.rows.length}
        WHERE puc = '${oldpuc}' returning *; `;
                let resultupsertstock = await query(updatestock, []);
                resultarray.push({ oldpuc: resultupsertstock.rows });
                return resultarray;
            }
            else {
                return `Error in getting PUC from product `;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN updatestockQuantity", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.updateRemoveFromRecyclebin = async () => {
        console.log("inside update recycle bin");
        const updateQuery = `
        UPDATE products
        SET removefromrecyclebin = true
        WHERE isdeleted = true AND removefromrecyclebin = false
        AND to_timestamp(modifieddate) <= (CURRENT_TIMESTAMP - INTERVAL '30 days')
    `;
        let data = await query(updateQuery, []);
        return data;
    };
    //first
    productService.upsertProduct = async (request) => {
        try {
            const fieldsNeedingInitCap = ['colour', 'graphicscard', 'processor'];
            console.log(1);
            const upsertProductData = request;
            let oldpucvalue;
            let existingProductData = {};
            if (upsertProductData.id) {
                existingProductData = await query(`SELECT * FROM products where id=${upsertProductData.id}`, {});
            }
            let data = {};
            if (existingProductData.rows && existingProductData.rows.length > 0) {
                data = existingProductData?.rows[0];
            }
            const { id, ...upsertFields } = upsertProductData;
            let stockCompareData = {
                category: upsertFields?.category,
                subcategory: upsertFields?.subcategory,
                brand: upsertFields?.brand,
                model: upsertFields?.model,
                operatingsystem: upsertFields?.operatingsystem,
                operatingsystemversion: upsertFields?.operatingsystemversion,
                ram: upsertFields?.ram,
                storagetype: upsertFields?.storagetype,
                storagecapacity: upsertFields?.storagecapacity,
                colour: upsertFields?.colour,
                graphicscard: upsertFields?.graphicscard,
                processor: upsertFields?.processor,
            };
            const stockFields = Object.keys(stockCompareData);
            const stockValues = Object.values(stockCompareData);
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let querydata;
            let params = [];
            if (id) {
                let result = await productService.getStockData(stockFields, stockValues);
                if (result) {
                    var index = fieldNames.indexOf("puc");
                    var colorIndex = fieldNames.indexOf("colour");
                    if (index != -1) {
                        oldpucvalue = fieldValues[index];
                        fieldValues[index] = result.puc;
                    }
                    else {
                        fieldNames.push("puc");
                        fieldValues.push(result.puc);
                    }
                    // querydata = `UPDATE products SET ${fieldNames
                    //   .map((field, index) => `${field} = $${index + 1}`)
                    //   .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    querydata = `UPDATE products SET ${fieldNames
                        .map((field, index) => `${field} = ${fieldsNeedingInitCap.includes(field) ? `INITCAP($${index + 1})` : `$${index + 1}`}`)
                        .join(", ")} 
             WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    params = [...fieldValues, Number(id)];
                }
                else {
                    let Stockresult = await productService.insertStockData(stockFields, stockValues);
                    if (Stockresult) {
                        var index = fieldNames.indexOf("puc");
                        console.log(index);
                        if (index != -1) {
                            oldpucvalue = fieldValues[index];
                            fieldValues[index] = Stockresult.puc;
                        }
                        else {
                            fieldNames.push("puc");
                            fieldValues.push(Stockresult.puc);
                        }
                        // querydata = `UPDATE products SET ${fieldNames
                        //   .map((field, index) => `${field} = $${index + 1}`)
                        //   .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                        querydata = `UPDATE products SET ${fieldNames
                            .map((field, index) => `${field} = ${fieldsNeedingInitCap.includes(field) ? `INITCAP($${index + 1})` : `$${index + 1}`}`)
                            .join(", ")} 
               WHERE id = $${fieldNames.length + 1} RETURNING *`;
                        params = [...fieldValues, Number(id)];
                    }
                    else {
                        return "Error When Inserting Stock Please contact Admin";
                    }
                }
            }
            else {
                let getSubcategorydata = fieldNames.indexOf('subcategory');
                let subcategoryvalue = fieldValues[getSubcategorydata];
                let result;
                if (subcategoryvalue && subcategoryvalue != 'accessories') {
                    console.log(2);
                    result = await productService.getStockData(stockFields, stockValues);
                    console.log(9);
                }
                if (result) {
                    var index = fieldNames.indexOf("puc");
                    console.log(index);
                    if (index != -1) {
                        oldpucvalue = fieldValues[index];
                        fieldValues[index] = result.puc;
                    }
                    else {
                        fieldNames.push("puc");
                        fieldValues.push(result.puc);
                    }
                    // querydata = `INSERT INTO products (${fieldNames.join(
                    //   ", "
                    // )}) VALUES (${fieldNames
                    //   .map((_, index) => `$${index + 1}`)
                    //   .join(", ")}) RETURNING *`;
                    querydata = `INSERT INTO products (${fieldNames.join(", ")}) VALUES (${fieldNames
                        .map((field, index) => `${fieldsNeedingInitCap.includes(field) ? `INITCAP($${index + 1})` : `$${index + 1}`}`)
                        .join(", ")}) RETURNING *`;
                    params = fieldValues;
                }
                else {
                    console.log(10);
                    let Stockresult = await productService.insertStockData(stockFields, stockValues);
                    console.log(13);
                    if (Stockresult) {
                        var index = fieldNames.indexOf("puc");
                        console.log(index);
                        if (index != -1) {
                            oldpucvalue = fieldValues[index];
                            fieldValues[index] = Stockresult.puc;
                        }
                        else {
                            fieldNames.push("puc");
                            fieldValues.push(Stockresult.puc);
                        }
                        // querydata = `INSERT INTO products (${fieldNames.join(
                        //   ", "
                        // )}) VALUES (${fieldNames
                        //   .map((_, index) => `$${index + 1}`)
                        //   .join(", ")}) RETURNING *`;
                        querydata = `INSERT INTO products (${fieldNames.join(", ")}) VALUES (${fieldNames
                            .map((field, index) => `${fieldsNeedingInitCap.includes(field) ? `INITCAP($${index + 1})` : `$${index + 1}`}`)
                            .join(", ")}) RETURNING *`;
                        params = fieldValues;
                    }
                    else {
                        return "Error when Creating PUC Please Contact Support Team";
                    }
                }
            }
            const result = await query(querydata, params);
            let updatestockdataset = await productService.updatestockQuantity(result.rows[0].puc, oldpucvalue);
            if (Array.isArray(updatestockdataset) && updatestockdataset.length > 0) {
                return result;
            }
            else {
                return "Error when updating Quantity";
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertProduct", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.upsertProductwithFile = async (request) => {
        try {
            const { productid } = request.params;
            let existingProductData = {};
            const upsertProductData = [];
            if (productid) {
                existingProductData = await query(`SELECT * FROM products where id=${productid}`, {});
            }
            let data = {};
            if (existingProductData.rows && existingProductData.rows.length > 0) {
                data = existingProductData?.rows[0];
            }
            let imageData;
            if (request.files) {
                imageData = await imageResize(request);
                upsertProductData.large = data?.large
                    ? [...data.large, ...imageData.url.Large]
                    : imageData.url.Large;
                upsertProductData.medium = data?.medium
                    ? [...data.medium, ...imageData.url.Medium]
                    : imageData.url.Medium;
                upsertProductData.small = data?.small
                    ? [...data.small, ...imageData.url.Small]
                    : imageData.url.Small;
            }
            const pathurldatas = imageData?.path || null;
            const { ...upsertFields } = upsertProductData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            let querydata;
            let params = [];
            if (productid) {
                querydata = `UPDATE products SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, Number(productid)];
            }
            const result = await query(querydata, params);
            return { result, productid, pathurldatas };
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertProductwithFile", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    ``;
    productService.deleteProduct = async (id) => {
        try {
            if (id) {
                const result = await query(`delete FROM products WHERE id = ${id}`, []);
                if ((result.command = "DELETE")) {
                    if (result.rowCount != 0) {
                        return `${result.rowCount} Product deleted Sucessfully`;
                    }
                    else {
                        return `Product Not Deleted. Please Retry `;
                    }
                }
                else {
                    return `Error when Deleting Product please contact Admin`;
                }
            }
            else {
                return "Product Not Deleted.Please Contact Admin";
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteProduct", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    productService.rearrangeImage = async (request) => {
        try {
            const { large, medium, small } = request.body;
            const { productid } = request.params;
            const { ...upsertFields } = request.body;
            console.log(upsertFields);
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log(fieldNames, "Field Name");
            console.log(fieldValues, "field Values");
            let querydata;
            let params = [];
            let getData = await query(`select large,medium,small from products where id =${productid}`, {});
            let value = getData.rows[0];
            console.log(value);
            if (getData.rows.length > 0) {
                querydata = `UPDATE products SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, Number(productid)];
            }
            let result = await query(querydata, params);
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN rearrangeImage", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(productService || (productService = {}));
//# sourceMappingURL=product.service.js.map