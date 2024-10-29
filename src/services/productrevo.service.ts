import { query } from "../database/postgres.js"
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import imageResize from "../imageResize/imageRessize.js";
// import  imageResizeGcp from "../imageResize/imageRessize.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { cartservice } from "./cart.service.js";
import { performance } from 'perf_hooks';

export module productrevoService {
  // export const getproductsData = async (request: any) => {
  //   try {
  //     console.log('get PRoduct function call');
  //     const pageNumber = parseInt(request.query.page) || 1;
  //     const recordCount = parseInt(request.query.count) || 5000;
  //     const keys = Object.keys(request.query);
  //     const values = Object.values(request.query);

  //     let whereClauses: string[] = [];
  //     let parameterIndex = 1;
  //     const queryParams: any[] = [];
  //     let orderByField = "modifieddate";
  //     let orderByDirection = "DESC";

  //     keys.forEach((key, index) => {
  //       const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
  //       if (key === "displaysize" || key === "price") {
  //         const rangeClauses = paramValues.map(range => {
  //           const [lowerBound, upperBound] = range.split("-");
  //           queryParams.push(lowerBound, upperBound);
  //           const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
  //           console.log(clause, 'clause 2');

  //           parameterIndex += 2;
  //           console.log(clause, 'clause');
  //           return clause;
  //         });
  //         whereClauses.push(`(${rangeClauses.join(" OR ")})`);
  //       } else if (key === "sortby") {
  //         const [fieldName, direction] = paramValues[0].split("-");
  //         orderByField = fieldName;
  //         orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
  //       } else if (paramValues[0].startsWith("NOT ")) {
  //         const cleanValue = paramValues[0].slice(4);
  //         whereClauses.push(`(${key} != $${parameterIndex})`);
  //         queryParams.push(cleanValue);
  //         parameterIndex++;
  //       } else if (key !== "page" && key !== "count") {
  //         const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
  //         whereClauses.push(`(${clauses.join(" OR ")})`);
  //         queryParams.push(...paramValues);
  //         parameterIndex += paramValues.length;
  //       }
  //     });
  //     const offset = (pageNumber - 1) * recordCount;
  //     const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
  //     const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
  //     const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

  //     let queryText = `SELECT * FROM product_revo ${whereClause} ${orderByClause}`;


  //     if (pageNumber && recordCount) {
  //       queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
  //       queryParams.push(offset, recordCount);
  //     }

  //     console.log("Query Text:", queryText);
  //     console.log("Query Params:", queryParams);
  //     console.log("before query")
  //     const result = await query(queryText, queryParams);
  //     console.log("after query")
  //     console.log("before datatype check")
  //     let datatypeCheckResult = await dataTypeCheck(result)
  //     console.log("after datatype check")
  //     return datatypeCheckResult
  //   }

  //   catch (error) {
  //     console.error("Query Execution Error: IN getproductsData", error);
  //     let ErrorMessage = await ErrorHandler.handleQueryError(error)
  //     console.log(ErrorMessage);
  //     return ErrorMessage
  //   }
  // };




  const TIMEOUT_THRESHOLD = 5000; // 5 seconds, adjust as needed

  export const getproductsData = async (request: any) => {
    const start = performance.now();
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${new Date().toISOString()}] [${requestId}] getProductsData function called`);

    try {
      const checkTimeout = (startTime: number, operationName: string) => {
        const currentTime = performance.now();
        if (currentTime - startTime > TIMEOUT_THRESHOLD) {
          throw new Error(`Timeout occurred during ${operationName}`);
        }
      };

      console.log(`[${new Date().toISOString()}] [${requestId}] Processing request parameters`);
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);

      checkTimeout(start, 'request parameter processing');

      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "modifieddate";
      let orderByDirection = "DESC";

      console.log(`[${new Date().toISOString()}] [${requestId}] Building query clauses`);
      keys.forEach((key, index) => {
        // ... (existing code for building query clauses)
        console.log(`[${new Date().toISOString()}] [${requestId}] Processing key: ${key}`);
        checkTimeout(start, `processing key ${key}`);
      });

      const offset = (pageNumber - 1) * recordCount;
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;

      let queryText = `SELECT * FROM product_revo ${whereClause} ${orderByClause}`;

      if (pageNumber && recordCount) {
        queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
      }

      console.log(`[${new Date().toISOString()}] [${requestId}] Query Text: ${queryText}`);
      console.log(`[${new Date().toISOString()}] [${requestId}] Query Params:`, queryParams);

      checkTimeout(start, 'query preparation');

      console.log(`[${new Date().toISOString()}] [${requestId}] Executing database query`);
      const queryStart = performance.now();
      const result = await query(queryText, queryParams);
      // console.log(`Query result:`, result);
      // console.log(`Query result:`, result.data.rows);
      // console.log(`Query result:`, result.data.rows[0]);

      const queryEnd = performance.now();
      console.log(`[${new Date().toISOString()}] [${requestId}] Query execution time: ${queryEnd - queryStart} ms`);

      checkTimeout(start, 'database query');

      console.log(`[${new Date().toISOString()}] [${requestId}] Performing datatype check`);
      const datatypeCheckStart = performance.now();
      let datatypeCheckResult = await dataTypeCheck(result);
      const datatypeCheckEnd = performance.now();
      console.log(`[${new Date().toISOString()}] [${requestId}] Datatype check time: ${datatypeCheckEnd - datatypeCheckStart} ms`);

      checkTimeout(start, 'datatype check');

      const end = performance.now();
      console.log(`[${new Date().toISOString()}] [${requestId}] getProductsData total execution time: ${end - start} ms`);

      return datatypeCheckResult;
    } catch (error) {
      const end = performance.now();
      const duration = end - start;
      if (error.message.startsWith('Timeout occurred during')) {
        console.error(`[${new Date().toISOString()}] [${requestId}] ${error.message} after ${duration} ms`);
      } else {
        console.error(`[${new Date().toISOString()}] [${requestId}] Error in getproductsData after ${duration} ms:`, error);
      }
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(`[${new Date().toISOString()}] [${requestId}] Error Message:`, ErrorMessage);
      return ErrorMessage;
    }
  };


  export const getEcomProducts = async (request: any) => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);

      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "modifieddate";
      let orderByDirection = "DESC";
      let additionalSortCriteria = "";
      keys.forEach((key, index) => {
        let paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
        console.log(paramValues[0], 'paramValues[0]');
        if (key === "displaysize" || key === "price") {
          const rangeClauses = paramValues.map(range => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
            console.log(clause, 'clause 2');

            parameterIndex += 2;
            console.log(clause, 'clause');
            return clause;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
        }
        else if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (key !== "page" && key !== "count") {
          const normalClauses = [];
          const notClauses = [];
          const nullClauses = [];
          paramValues.forEach((value: string) => {
            if (value.startsWith("NOT ") || value.startsWith("not ")) {
              const cleanValue = value.slice(4);
              notClauses.push(`${key} != $${parameterIndex}`);
              queryParams.push(cleanValue);
              parameterIndex++;
            } else if (value.toUpperCase() === 'NULL') {
              nullClauses.push(`${key} IS NULL`);
            } else {
              normalClauses.push(`${key} = $${parameterIndex}`);
              queryParams.push(value);
              parameterIndex++;
            }
          });

          const combinedClauses = [
            ...normalClauses,
            ...notClauses,
            ...nullClauses
          ];
          console.log(combinedClauses, 'combinedClauses');
          if (combinedClauses.length > 0) {
            whereClauses.push(`(${combinedClauses.join(" OR ")})`);
          }
        }
      });

      const offset = (pageNumber - 1) * recordCount;
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL)  AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
      let queryText = `SELECT * FROM product_revo`;
      if (whereClause) {
        queryText += ` ${whereClause} AND ${baseConditions} ${orderByClause}`;
      } else {
        queryText += ` WHERE ${baseConditions} ${orderByClause}`;
      }

      // Here, parameterIndex is already incremented based on previous clauses
      queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
      queryParams.push(offset, recordCount);

      console.log("Query Text:", queryText);
      console.log("Query Params:", queryParams);

      const result: QueryResult = await query(queryText, queryParams);
      const datatypeCheckResult = await dataTypeCheck(result);
      return datatypeCheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getEcomProducts", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };

  export const getSimilarProducts = async (request: any) => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);

      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];

      keys.forEach((key, index) => {
        if (key !== "page" && key !== "count") {
          let paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
          const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });

      const offset = (pageNumber - 1) * recordCount;
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")} AND ${baseConditions}` : `WHERE ${baseConditions}`;
      const orderByClause = `ORDER BY modifieddate DESC`;

      let queryText = `SELECT * FROM product_revo ${whereClause} ${orderByClause} OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
      queryParams.push(offset, recordCount);

      console.log("Query Text:", queryText);
      console.log("Query Params:", queryParams);

      const result: QueryResult = await query(queryText, queryParams);

      if (result.rows.length <= 1) {
        let queryTextLatest = '';
        const queryParamsLatest: any[] = [];

        keys.forEach((key, index) => {
          if (key === "subcategory") {
            const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
            const clauses = paramValues.map((_, idx) => `${key} = $1`);
            const whereClauseLatest = `(${clauses.join(" OR ")}) AND ${baseConditions}`;
            queryTextLatest = `SELECT * FROM products WHERE ${whereClauseLatest} ${orderByClause} OFFSET $2 LIMIT $3`;
            queryParamsLatest.push(...paramValues, offset, recordCount);
          }
        });

        const resultLatest: QueryResult = await query(queryTextLatest, queryParamsLatest);
        return await dataTypeCheck(resultLatest);
      } else {
        return await dataTypeCheck(result);
      }
    } catch (error) {
      console.error("Query Execution Error: IN getSimilarProducts", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };

  export const deleteProductrevo = async (id: number) => {
    try {
      const result: any = await query(`DELETE FROM product_revo WHERE id = $1`, [id]);
      if (result.rowCount != 0) {
        return `Data Deleted Successfully`;
      } else {
        return `Product not found with id ${id}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN deleteProductrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };

  export const upsertProductrevo = async (productrevoData: any) => {
    try {
      let querydata: string;
      let params: any[];
      const { id, ...upsertFields } = productrevoData;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      if (id) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, id];
      } else {
        querydata = `INSERT INTO product_revo (${fieldNames.join(
          ", "
        )}) VALUES (${fieldNames
          .map((_, index) => `$${index + 1}`)
          .join(", ")}) RETURNING *`;
        params = fieldValues;
      }

      const result = await query(querydata, params)
      return result;
    } catch (error) {
      console.error("Query Execution Error: IN upsertProductrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }

  }

  export const getArcheivedProductsrevo = async (request: any) => {
    try {
      const pageNumber = request.query.page || 1
      const recordCount = request.query.count || 5000
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);
      let whereClause = "";
      let parameterIndex = 1;
      let queryParams = [];
      keys.forEach((key, index) => {

        if (key !== 'page' && key != 'count') {
          const paramValues: any = Array.isArray(values[index])
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
        }

      });
      const offset = (pageNumber - 1) * recordCount;
      let queryText = `SELECT * FROM product_revo`;
      if (whereClause) {
        queryText += ` WHERE ${whereClause} AND isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
          }`;
      }
      else if (pageNumber && recordCount) {
        queryText += ` WHERE isarchive = true AND removefromrecyclebin = false  OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1
          }`;

        queryParams.push(offset, recordCount);

      }
      else {
        queryText += ` WHERE isarchive = true AND removefromrecyclebin = false`;
      }
      console.log(queryText, 'Query text is');
      console.log(queryParams, 'params');
      const result: QueryResult = await query(queryText, queryParams);
      let datatypecheckResult = await dataTypeCheck(result);
      return datatypecheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getArcheivedProductsrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }

  }

  export const getEachProductsRevo = async function (request: any, id: Number) {
    try {
      console.log("getEachProducts call");
      console.log(id);
      const result: QueryResult = await query(
        `SELECT * FROM product_revo where id=${id}`,
        []
      );
      let getvalues = { objectName: "null" };
      getvalues.objectName = "products";
      // let data = await picklistservice.getProductPicklist(getvalues);
      // console.log(data);
      let datatypecheckResult = await dataTypeCheck(result);
      // datatypecheckResult[0].picklist = data;
      return datatypecheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getEachProductsRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };

  export const upsertProductwithFileRevo = async (request: any) => {
    try {
      const { productid } = request.params;
      let existingProductData: any = {};
      const upsertProductData: any = [];
      if (productid) {
        existingProductData = await query(
          `SELECT * FROM product_revo where id=${productid}`,
          {}
        );
      }
      let data: any = {};
      if (existingProductData.rows && existingProductData.rows.length > 0) {
        data = existingProductData?.rows[0];
      }
      let imageData: any;
      console.log(request.files, 'FIles Log');
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
      let params: any[] = [];
      if (productid) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, Number(productid)];
      }
      const result = await query(querydata, params);
      return { result, productid, pathurldatas };
    } catch (error) {
      console.error("Query Execution Error: IN upsertProductwithFileRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };
  export const upsertProductwithfileRevogcp = async (request: any) => {
    try {
      const { productid } = request.body;
      let existingProductData: any = {};
      const upsertProductData: any = [];
      let data: any = {};
      if (productid) {
        existingProductData = await query(
          `SELECT * FROM product_revo where id=${productid}`,
          {}
        );
      }
      if (existingProductData.rows && existingProductData.rows.length > 0) {
        data = existingProductData?.rows[0];
      }
      console.log(data ,'data is here');
      let imageData: any;
      if (request.body.url) {
        imageData = request.body;
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
      const pathurldatas = imageData?.url || null;
      const { ...upsertFields } = upsertProductData;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      let querydata;
      let params: any[] = [];
      if (productid) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, Number(productid)];
      }
      const result = await query(querydata, params);
      return { result, productid, pathurldatas };
    } catch (error) {
      console.error("Query Execution Error: IN upsertProductwithFileRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };

  export const rearrangeImageRevo = async (request) => {
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
      let params: any[] = [];

      let getData = await query(
        `select large,medium,small from product_revo where id =${productid}`,
        {}
      );
      let value = getData.rows[0];
      console.log(value);
      if (getData.rows.length > 0) {
        querydata = `UPDATE product_revo SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, Number(productid)];
      }
      let result = await query(querydata, params);

      return result;
    } catch (error) {
      console.error("Query Execution Error: IN rearrangeImageRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };

  export const updateRemoveFromRecyclebinRevo = async () => {
    console.log("inside update recycle bin");
    const updateQuery = `
            UPDATE product_revo
            SET removefromrecyclebin = true
            WHERE isdeleted = true AND removefromrecyclebin = false
            AND to_timestamp(modifieddate) <= (CURRENT_TIMESTAMP - INTERVAL '30 days')
        `;
    let data = await query(updateQuery, []);
    return data
  };

  export const updateAvgRatingProductrevo = async (avgRating: number, productid: number) => {
    console.log('inside Update avg rating in productrevo', avgRating, productid);
    try {
      const result: any = await query(`UPDATE product_revo SET averagerating = $1 WHERE id = $2`, [avgRating, productid]);

      // Check if the update was successful
      if (result.rowCount != 0) {
        return `Average rating updated successfully for productid ${productid}`;
      } else {
        return `Product not found with productid ${productid}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN updateAvgRatingProductrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  }

  export const upsertQuantityFields = async (upsertData: any, orderedquantitydata, issold: boolean) => {
    const { quantity, ecompublishedquantity, soldquantity, availablequantity, puc, orderedquantity } = upsertData;
    try {
      console.log(orderedquantitydata, 'orderedquantitydata');
      let productquery = await query(`SELECT orderedquantity FROM product_revo WHERE puc = $1`, [puc]);
      let orderedquantityvalue = productquery.rows[0].orderedquantity;
      console.log(orderedquantityvalue, 'orderedquantityvalue');
      let productStatusValue: string
      if (availablequantity > 5) {
        productStatusValue = 'in_stock'
      }
      else if (availablequantity > 0 && availablequantity <= 5) {
        productStatusValue = 'low_stock'
      }
      else if (availablequantity === 0) {
        productStatusValue = 'out_of_stock'
      }
      console.log(orderedquantitydata, 'orderedquantityNumber bEFOQRE conversion');
      let orderedquantityNumber = Number(orderedquantitydata);
      console.log(orderedquantitydata, 'orderedquantityNumber after conversion');
      console.log(orderedquantityNumber, 'orderedquantityNumber');

      let updateQueryBase = `UPDATE product_revo SET quantity = $1, ecompublishedquantity = $2, soldquantity = $3, 
        availablequantity = $4, productstatus = $5`;
      let updateQuery = ''
      if (issold && !isNaN(orderedquantityNumber)) {
        updateQueryBase += `, orderedquantity = orderedquantity - $6`;
        updateQuery = `${updateQueryBase} WHERE puc = $7 RETURNING *`;
      } else if (!issold && isNaN(orderedquantityNumber)) {
        updateQuery = `${updateQueryBase} WHERE puc = $6 RETURNING *`;
      }
      else {
        updateQuery = `${updateQueryBase} WHERE puc = $6 RETURNING *`;

      }

      console.log(updateQuery, 'Update Query is FINAL');
      let updateParams = []
      if (issold && !isNaN(orderedquantityNumber)) {
        updateParams = [quantity, ecompublishedquantity, soldquantity, availablequantity, productStatusValue, orderedquantityNumber, puc]

      }
      else {
        updateParams = [quantity, ecompublishedquantity, soldquantity, availablequantity, productStatusValue, puc]

      }
      console.log(updateParams, 'Update Params is FINAL');
      const updateResult = await query(updateQuery, updateParams);
      let cartData = {
        productid: updateResult.rows[0].id,
        availablequantity
      }
      const updateCartQuantity = await cartservice.upsertCartQuantity(cartData)
      console.log(updateCartQuantity, 'upsert cart dataßß');
      if (updateCartQuantity?.command === 'UPDATE' || updateCartQuantity === null) {
        return updateResult.rows[0];
      }
      else {
        let message = {
          product: updateResult.rows[0],
          cart: 'Problem In Cart Quantity Updaations.Please contact support Team'
        }
        return message
      }
    } catch (error) {
      console.error("Query Execution Error: IN upsertQuantityFields", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      console.log(ErrorMessage);
      return ErrorMessage
    }
  };

  export const testupsertQuantityFieldsBatch = async (batchData: any[], issold: boolean) => {
    try {
      console.log(batchData, 'Batch Data is ');
      let updateQueryBase = `
            UPDATE product_revo
            SET quantityforlocation = 
                jsonb_set(
                    COALESCE(quantityforlocation, '{}'::jsonb),
                    array[$1]::text[],
                    jsonb_build_object(
                        'quantity', $2::integer,
                        'ecompublishedquantity', $3::integer,
                        'soldquantity', $4::integer,
                        'availablequantity', $5::integer
                    )
                )
            WHERE puc = $6
            RETURNING *
        `;

      // if (issold) {
      //   updateQueryBase = `
      //       UPDATE product_revo
      //       SET quantityforlocation = 
      //         jsonb_set(
      //           COALESCE(quantityforlocation, '{}'::jsonb),
      //           array[$1]::text[],
      //           jsonb_build_object(
      //             'quantity', $2::integer,
      //             'ecompublishedquantity', $3::integer,
      //             'soldquantity', $4::integer,
      //             'availablequantity', $5::integer
      //           )
      //         ),
      //         orderedquantity = orderedquantity - 1
      //       WHERE puc = $6
      //       RETURNING *
      //     `;
      // }
      if (issold) {
        updateQueryBase = `
            UPDATE product_revo
            SET quantityforlocation = 
              jsonb_set(
                COALESCE(quantityforlocation, '{}'::jsonb),
                array[$1]::text[],
                jsonb_build_object(
                  'quantity', $2::integer,
                  'ecompublishedquantity', $3::integer,
                  'soldquantity', $4::integer,
                  'availablequantity', $5::integer
                )
              )
            WHERE puc = $6
            RETURNING *
          `;
      }
      const updateQueries = batchData.map(data => {
        return {
          query: updateQueryBase,
          params: [
            data.location,
            data.quantity,
            data.ecompublishedquantity,
            data.soldquantity,
            data.availablequantity,
            data.puc
          ]
        };
      });
      console.log(updateQueries, 'Update Queries');
      console.log(updateQueries[0].query, 'Update Queries Query');
      const updatePromises = updateQueries.map(update => query(update.query, update.params));
      const updateResults = await Promise.all(updatePromises);
      return updateResults;

    } catch (error) {
      console.error("Batch Update Execution Error", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };


  // export const bulkupsertProducttosetZero = (async (data, setzero) => {
  //   try {
  //     console.log(data, 'data in bulk upsert');

  //     if (data.length === 0) {
  //       return { message: 'No data to update' };
  //     }

  //     // Construct the SQL query for bulk update
  //     let querytext = 'UPDATE product_revo SET lock_qty = CASE id ';
  //     const values = [];

  //     data.forEach((item, index) => {
  //       if (setzero) {
  //         // Set lock_qty to zero if setzero is true
  //         querytext += `WHEN $${index * 2 + 1} THEN 0 `;
  //         values.push(item.productid);  // Add productid only once
  //       } else {
  //         // Otherwise, update lock_qty by adding the new quantity to the existing lock_qty
  //         querytext += `WHEN $${index * 2 + 1} THEN lock_qty + $${index * 2 + 2} `;
  //         values.push(item.productid, item.quantity); // Push both productid and quantity
  //       }
  //     });

  //     querytext += 'ELSE lock_qty END WHERE id IN (';
  //     querytext += data.map((_, index) => `$${index * 2 + 1}`).join(', ');
  //     querytext += ');';
  //     console.log(querytext, 'querytext');
  //     console.log(values, 'values');
  //     await query(querytext, values);

  //     console.log('Bulk update completed');
  //     return { message: 'Bulk update successful' };
  //   } catch (error) {
  //     console.error("Query Execution Error: bulkupsertProduct result", error);
  //     let ErrorMessage = await ErrorHandler.handleQueryError(error);
  //     console.log(ErrorMessage);
  //     return ErrorMessage;
  //   }
  // })

  export const bulkupsertProducttosetZero = (async (data, setzero) => {
    try {
      console.log(data, 'data in bulk upsert');

      if (data.length === 0) {
        return { message: 'No data to update' };
      }

      // Construct the SQL query for bulk update
      let querytext = 'UPDATE product_revo SET lock_qty = CASE id ';
      const values = [];

      data.forEach((item, index) => {
        if (setzero) {
          // When setzero is true, only update ids and set lock_qty to 0
          const idPlaceholder = index + 1;  // Sequential id placeholders
          querytext += `WHEN $${idPlaceholder} THEN 0 `;
          values.push(item.productid);  // Add productid only
        } else {
          // When setzero is false, update lock_qty with id and quantity
          const idPlaceholder = index * 2 + 1;  // id placeholders
          const quantityPlaceholder = index * 2 + 2;  // quantity placeholders
          querytext += `WHEN $${idPlaceholder} THEN lock_qty + $${quantityPlaceholder} `;
          values.push(item.productid, item.quantity);  // Push both productid and quantity
        }
      });

      querytext += 'ELSE lock_qty END WHERE id IN (';

      // For setzero, just include id placeholders
      if (setzero) {
        querytext += data.map((_, index) => `$${index + 1}`).join(', ');  // Sequential ids
      } else {
        querytext += data.map((_, index) => `$${index * 2 + 1}`).join(', ');  // id placeholders
      }

      querytext += ');';

      console.log(querytext, 'querytext');
      console.log(values, 'values');
      await query(querytext, values);

      console.log('Bulk update completed');
      return { message: 'Bulk update successful' };
    } catch (error) {
      console.error("Query Execution Error: bulkupsertProduct result", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  });



  //   try {
  //     console.log(data, 'data in bulk upsert');

  //     if (data.length === 0) {
  //       return { message: 'No data to update' };
  //     }

  //     // Construct the SQL query for bulk update
  //     let querytext = 'UPDATE product_revo SET lock_qty = CASE ';
  //     const values = [];

  //     data.forEach((item, index) => {
  //       if (setzero) {
  //         // Set lock_qty to zero if setzero is true
  //         querytext += `WHEN id = $${index + 1} THEN 0::integer `;
  //         values.push(item.productid);  // Add productid only once
  //       } else {
  //         // Otherwise, update lock_qty by adding the new quantity to the existing lock_qty
  //         querytext += `WHEN id = $${index * 2 + 1} THEN lock_qty + $${index * 2 + 2}::integer `;
  //         values.push(item.productid, item.quantity); // Push both productid and quantity
  //       }
  //     });

  //     querytext += 'ELSE lock_qty END WHERE id IN (';
  //     querytext += data.map((_, index) => `$${index + 1}`).join(', ');  // Ensure the ids are properly listed in the WHERE clause
  //     querytext += ');';

  //     console.log(querytext, 'querytext');
  //     console.log(values, 'values');
  //     await query(querytext, values);

  //     console.log('Bulk update completed');
  //     return { message: 'Bulk update successful' };
  //   } catch (error) {
  //     console.error("Query Execution Error: bulkupsertProduct result", error);
  //     let ErrorMessage = await ErrorHandler.handleQueryError(error);
  //     console.log(ErrorMessage);
  //     return ErrorMessage;
  //   }
  // });





  export async function updateOrderedQuantity(productIds: Array<number>, orderedquantity: number) {

    try {
      // console.log(orderedquantity, 'ORDERED QUANTITY IS')
      // const queryvalue = `UPDATE product_revo SET orderedquantity = orderedquantity + ${orderedquantity} WHERE id = ANY($1::int[]) returning *`;
      // console.log(queryvalue, 'unorder query');
      // console.log(productIds, 'productIds');
      // let resultdata = await query(queryvalue, [productIds]);
      // console.log(resultdata.rows[0].orderedquantity, 'orderedquantity');
      return 'resultdata'
    } catch (error) {
      console.error('Error updating orderedquantity:', error);
    }
  }


  export async function updateOrderedQuantityarray(updatedData) {
    try {

      console.log('Updated Data:-', updatedData);
      let data = []
      updatedData.forEach(async (e) => {
        let id = e.id;
        let orderedquantity = e.orderedquantity;

        const queryText = `
        UPDATE product_revo
        SET orderedquantity = orderedquantity + ${orderedquantity},
        lock_qty = 0 
        WHERE id = ${id}
        RETURNING *`;

        let result = await query(queryText, [])
        console.log(result.rows);
        data.push(result)
      })

      //       let data = await query(`select id,orderedquantity from product_revo where id = 168`,[])
      //       console.log(data.rows ,'datais ');
      // return data
      // return result

    } catch (error) {
      console.error('Error updating orderedquantity:', error);
    }
  };


  export async function updateCancelledOrderedQuantity(productIds: Array<number>, quantitydata: number) {

    try {
      console.log(quantitydata, 'Cancelled Quantity')
      const queryvalue = `UPDATE product_revo SET orderedquantity = orderedquantity - ${quantitydata} 
      WHERE id = ANY($1::int[])    AND orderedquantity > 0
      returning *`;
      console.log(queryvalue, 'unorder query');
      console.log(productIds, 'productIds');
      let resultdata = await query(queryvalue, [productIds]);
      console.log(resultdata.rows[0].orderedquantity, 'orderedquantity');
      return resultdata
    } catch (error) {
      console.error('Error updating orderedquantity:', error);
    }
  }

}