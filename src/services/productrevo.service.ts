import { query } from "../database/postgres.js"
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import imageResize from "../imageResize/imageRessize.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { cartservice } from "./cart.service.js";
import { performance } from 'perf_hooks';

export module productrevoService {

  const TIMEOUT_THRESHOLD = 5000;

  export const getproductsData = async (request: any) => {
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

      keys.forEach((key, index) => {
        const paramValues: any = Array.isArray(values[index]) ? values[index] : [values[index]];
        if (key === "displaysize" || key === "price") {
          const rangeClauses = paramValues.map(range => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
            parameterIndex += 2;
            return clause;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
        } else if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (paramValues[0].startsWith("NOT ")) {
          const cleanValue = paramValues[0].slice(4);
          whereClauses.push(`(${key} != $${parameterIndex})`);
          queryParams.push(cleanValue);
          parameterIndex++;
        } else if (key !== "page" && key !== "count") {
          const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
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

      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result)
      return datatypeCheckResult
    }

    catch (error) {
      console.error("Query Execution Error: IN getproductsData", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
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
        if (key === "displaysize" || key === "price") {
          const rangeClauses = paramValues.map(range => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1})`;
            parameterIndex += 2;
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

      queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
      queryParams.push(offset, recordCount);

      const result: QueryResult = await query(queryText, queryParams);
      const datatypeCheckResult = await dataTypeCheck(result);
      return datatypeCheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getEcomProducts", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
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
      return ErrorMessage
    }

  }

  export const insertBulkProduct = async (productrevoDataArray: any[]) => {
    try {
      console.log('In insertBulkProduct', productrevoDataArray);
      if (!productrevoDataArray.length) {
        return { success: false, error: 'No products to insert', errors: [] };
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < productrevoDataArray.length; i++) {
        const productData = productrevoDataArray[i];
        const fieldNames = Object.keys(productData).filter(
          (key) => productData[key] !== null && productData[key] !== undefined
        );
        const fieldValues = fieldNames.map((name) => productData[name]);

        let queryStr = `INSERT INTO product_revo (${fieldNames.join(', ')}) VALUES (${fieldNames
          .map((_, index) => `$${index + 1}`)
          .join(', ')}) RETURNING *`;

        try {
          const result = await query(queryStr, fieldValues);
          if (result.command === 'INSERT') {
            results.push(result);
          } else {
            errors.push({ index: i, error: 'Failed to insert product' });
          }
        } catch (err) {
          console.error(`Error inserting product at index ${i}:`, err);
          errors.push({ index: i, error: (err as Error).message || 'Database error' });
        }
      }

      const insertedCount = results.length;
      return {
        success: insertedCount > 0,
        insertedCount,
        errors: errors.length > 0 ? errors : [],
      };
    } catch (error) {
      console.error('Query Execution Error: IN insertBulkProduct', error);
      let errorMessage = await ErrorHandler.handleQueryError(error);
      return { success: false, error: errorMessage, errors: [{ index: -1, error: errorMessage }] };
    }
  };

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
      const result: QueryResult = await query(queryText, queryParams);
      let datatypecheckResult = await dataTypeCheck(result);
      return datatypecheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getArcheivedProductsrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }

  }

  //get
  export const getEachProductsRevo = async function (request: any, id: Number) {
    try {
      const result: QueryResult = await query(
        `SELECT * FROM product_revo where id=${id}`,
        []
      );
      let getvalues = { objectName: "null" };
      getvalues.objectName = "products";
      let datatypecheckResult = await dataTypeCheck(result);
      return datatypecheckResult;
    } catch (error) {
      console.error("Query Execution Error: IN getEachProductsRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
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
      return ErrorMessage
    }
  };

  export const rearrangeImageRevo = async (request) => {
    try {
      const { productid } = request.params;
      const { ...upsertFields } = request.body;
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      let querydata;
      let params: any[] = [];

      let getData = await query(
        `select large,medium,small from product_revo where id =${productid}`,
        {}
      );
      let value = getData.rows[0];
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
      return ErrorMessage
    }
  };

  export const updateRemoveFromRecyclebinRevo = async () => {
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
    try {
      const result: any = await query(`UPDATE product_revo SET averagerating = $1 WHERE id = $2`, [avgRating, productid]);

      if (result.rowCount != 0) {
        return `Average rating updated successfully for productid ${productid}`;
      } else {
        return `Product not found with productid ${productid}`;
      }
    } catch (error) {
      console.error("Query Execution Error: IN updateAvgRatingProductrevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  }

  export const updateoverallAvailableQuantity = async (puc: any)=>{
    try{
      const quertTogetThirdpartyproduct = await query(`SELECT id, thirdpartyquantity from stock_revo where puc = $1 and stocktype = 'third_party_product'`, [puc]);
      console.log('quertTogetThirdpartyproduct', quertTogetThirdpartyproduct.rows);
      if(quertTogetThirdpartyproduct.rows.length > 0){
        const stockid = quertTogetThirdpartyproduct.rows[0].id;
        const thirdpartyquantity = quertTogetThirdpartyproduct.rows[0].thirdpartyquantity;
        const queryToUpdateOverallAvailableQuantity = `UPDATE product_revo SET overallavailableqty = (${thirdpartyquantity} + availablequantity) WHERE puc = $1  RETURNING *`;
        const result = await query(queryToUpdateOverallAvailableQuantity, [puc]);
        console.log("result of update overall available quantity", result.rows);
        return result.rows[0];
      } else {
        const queryToUpdateOverallAvailableQuantity = `UPDATE product_revo SET overallavailableqty = availablequantity WHERE puc = $1  RETURNING *`;
        const result = await query(queryToUpdateOverallAvailableQuantity, [puc]);
        return result.rows[0];
      }
    }catch(error){
      console.error("Query Execution Error: IN updateoverallAvailableQuantity", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  }

  export const upsertQuantityFields = async (upsertData: any, orderedquantitydata, issold: boolean) => {
    console.log('--upsertQuantityFields', upsertData);
    const { quantity, ecompublishedquantity, soldquantity, availablequantity, puc, overallavailableqty,rentalsoldquantity } = upsertData;
    try {
      let productquery = await query(`SELECT orderedquantity FROM product_revo WHERE puc = $1`, [puc]);
      let orderedquantityvalue = productquery.rows[0].orderedquantity;
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
      let orderedquantityNumber = Number(orderedquantitydata);

      let updateQueryBase = `UPDATE product_revo SET quantity = $1, ecompublishedquantity = $2, soldquantity = $3, 
        availablequantity = $4, productstatus = $5, overallavailableqty=$6, rentalsoldquantity = $7`;
      let updateQuery = ''
      if (issold && !isNaN(orderedquantityNumber)) {
        updateQueryBase += `, orderedquantity = orderedquantity - $8`;
        updateQuery = `${updateQueryBase} WHERE puc = $9 RETURNING *`;
      } else if (!issold && isNaN(orderedquantityNumber)) {
        updateQuery = `${updateQueryBase} WHERE puc = $8 RETURNING *`;
      }
      else {
        updateQuery = `${updateQueryBase} WHERE puc = $8 RETURNING *`;

      }

      let updateParams = []
      if (issold && !isNaN(orderedquantityNumber)) {
        updateParams = [quantity, ecompublishedquantity, soldquantity, availablequantity, productStatusValue,overallavailableqty, rentalsoldquantity, orderedquantityNumber, puc]

      }
      else {
        updateParams = [quantity, ecompublishedquantity, soldquantity, availablequantity, productStatusValue,overallavailableqty, rentalsoldquantity, puc]

      }
      const updateResult = await query(updateQuery, updateParams);
      let cartData = {
        productid: updateResult.rows[0].id,
        availablequantity
      }
      const updateCartQuantity = await cartservice.upsertCartQuantity(cartData)
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
      return ErrorMessage
    }
  };

  export const testupsertQuantityFieldsBatch = async (batchData: any[], issold: boolean) => {
    try {
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
      const updatePromises = updateQueries.map(update => query(update.query, update.params));
      const updateResults = await Promise.all(updatePromises);
      return updateResults;

    } catch (error) {
      console.error("Error in testupsertQuantityFieldsBatch", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const bulkupsertProducttosetZero = (async (data, setzero) => {
    try {

      console.log(data + 'data for bulk upsert product to set zero');
      if (data.length === 0) {
        return { message: 'No data to update' };
      }

      let querytext = 'UPDATE product_revo SET lock_qty = CASE id ';
      const values = [];

      data.forEach((item, index) => {
        if (setzero) {
          const idPlaceholder = index + 1;
          querytext += `WHEN $${idPlaceholder} THEN 0 `;
          values.push(item.productid);
        } else {
          const idPlaceholder = index * 2 + 1;
          const quantityPlaceholder = index * 2 + 2;
          querytext += `WHEN $${idPlaceholder} THEN lock_qty + $${quantityPlaceholder} `;
          values.push(item.productid, item.quantity);
        }
      });

      querytext += 'ELSE lock_qty END WHERE id IN (';

      if (setzero) {
        querytext += data.map((_, index) => `$${index + 1}`).join(', ');
      } else {
        querytext += data.map((_, index) => `$${index * 2 + 1}`).join(', ');
      }

      querytext += ');';

      await query(querytext, values);
      console.log('success bulk upsert product to set zero');
      return { message: 'Bulk update successful' };
    } catch (error) {
      console.error("Query Execution Error: bulkupsertProducttosetZero result", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  });

  export async function updateOrderedQuantity(productIds: Array<number>, orderedquantity: number) {

    try {
      return 'resultdata'
    } catch (error) {
      console.error('Error in updateOrderedQuantity:', error);
    }
  }


  export async function updateOrderedQuantityarray(updatedData) {
  try {
    console.log('Inside updateorderqty');
    console.log('Inside updateorderqty', updatedData);

    let data = [];
    for (const e of updatedData) {
      const { id, orderedquantity } = e;
      console.log(id, orderedquantity, 'kkkk');

      const queryText = `
        UPDATE product_revo
        SET orderedquantity = orderedquantity + $1,
            lock_qty = lock_qty - $1 
        WHERE id = $2
        RETURNING *`;

      let result = await query(queryText, [orderedquantity, id]);
      console.log('---', result);
      console.log('---', result.rows);
      data.push(result);
    }

    return data;  // return array of results
  } catch (error) {
    console.error('Error in updateOrderedQuantityarray:', error);
    throw error;  // better to throw so caller knows of the error
  }
}


  export async function updateCatalogueQuantities(puc) {
    console.log('puc:', puc);
    const queryText = `
        WITH counts AS (
            SELECT 
                COALESCE(SUM(CASE WHEN stocktype = 'on_catalogue_product' THEN 1 ELSE 0 END), 0) AS on_catalogue_count,
                COALESCE(SUM(CASE WHEN stocktype = 'off_catalogue_product' THEN 1 ELSE 0 END), 0) AS off_catalogue_count
            FROM stock_revo 
            WHERE 
                puc = $1
                AND ecompublish = true 
                AND stockstatus = 'Available' 
                AND isdeleted = false 
                AND isarchive = false 
                AND removefromrecyclebin = false 
                AND ewaste = false
        )
        UPDATE product_revo 
        SET 
            oncatalogueqty = counts.on_catalogue_count,
            offcatalogueqty = counts.off_catalogue_count
        FROM counts
        WHERE puc = $1
        RETURNING counts.on_catalogue_count, counts.off_catalogue_count;
    `;
    console.log('queryText:', queryText);
    let result = await query(queryText, [puc]);
    console.log('result:', result.rows);

    if (result.rows.length > 0) {
      return {
        onCatalogueCount: result.rows[0].on_catalogue_count,
        offCatalogueCount: result.rows[0].off_catalogue_count
      };
    } else {
      return { message: 'No data Found' };
    }
  }


  export async function updateCancelledOrderedQuantity(productIds: Array<number>, quantitydata: number) {

    try {
      const queryvalue = `UPDATE product_revo SET orderedquantity = orderedquantity - ${quantitydata} 
      WHERE id = ANY($1::int[])    AND orderedquantity > 0
      returning *`;
      let resultdata = await query(queryvalue, [productIds]);
      return resultdata
    } catch (error) {
      console.error('Error in updateCancelledOrderedQuantity:', error);
    }
  }

}