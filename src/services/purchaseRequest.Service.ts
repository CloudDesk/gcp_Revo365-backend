import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { demandrequestService } from "./demandrequest.service.js";

export module purchaseRequestService {
    export const getPurchaseRequestData = async (request: any) => {
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
                if (key === "sortby") {
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
            const baseConditions = ``;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM purchaserequest ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result)
            return datatypeCheckResult
        } 
        catch (error) {
            console.error("Query Execution Error: IN getPurchaseRequestData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

// export const upsertPurchaseRequestData = async (prData: any) => {
//   delete prData.suppliercode;
//   console.log("Data in upsertPurchaseRequestData:", prData);
//   try {
//     let querydata: string;
//     let params: any[];

//     const { id, ...upsertFields } = prData;

//     function ensureJsonString(data: any): string {
//       return (typeof data === 'string' || data instanceof String) ? String(data) : JSON.stringify(data);
//     }

//     // Convert prdata to JSON string if it's not a string
//     if (upsertFields.prdata) {
//       upsertFields.prdata = ensureJsonString(upsertFields.prdata);
//     }

//     // Prepare query fields and values
//     const fieldNames = Object.keys(upsertFields);
//     const fieldValues = Object.values(upsertFields);

//     if (id) {
//       querydata = `UPDATE purchaserequest SET ${fieldNames
//         .map((field, index) => `${field} = $${index + 1}`)
//         .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
//       params = [...fieldValues, id];
//     } else {
//       querydata = `INSERT INTO purchaserequest (${fieldNames.join(
//         ", "
//       )}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
//       params = fieldValues;
//     }

//     const result = await query(querydata, params);

//     if (!result.rows.length) {
//       throw new Error("No rows returned from upsert query.");
//     }

//     const row = result.rows[0];
//     const { demandrequestid, prnumber } = row;

//     console.log('Demand Request ID:', demandrequestid, 'PR Number:', prnumber);

//     // 1. Fetch the existing demandrequestdata:
//     const demandRequestRow = await query(
//       'SELECT demandrequestdata FROM demandrequest WHERE id = $1',
//       [demandrequestid]
//     );

//     if (!demandRequestRow.rows.length) {
//       throw new Error(`Demand request with ID ${demandrequestid} not found.`);
//     }

//     let demandrequestdata = demandRequestRow.rows[0]?.demandrequestdata;
//     console.log('Demand Request Row:', demandRequestRow.rows[0]);

//     if (!demandrequestdata) demandrequestdata = [];
//     if (typeof demandrequestdata === 'string') {
//       try {
//         demandrequestdata = JSON.parse(demandrequestdata);
//       } catch {
//         demandrequestdata = [];
//       }
//     }

//     console.log('Demand Request Data:', demandrequestdata);

//     // Parse prdata from the current upsert (from your input)
//     let prdataInput = upsertFields.prdata;
//     if (typeof prdataInput === 'string') {
//       try {
//         prdataInput = JSON.parse(prdataInput);
//       } catch {
//         prdataInput = [];
//       }
//     }

//     const purchaseRequestId = row.id; // Purchase Request ID

// // Match via product name only
// const prNames = Array.isArray(prdataInput)
//   ? prdataInput.map((item: any) => item.name)
//   : [];

// demandrequestdata = demandrequestdata.map((item: any) => {
//   if (prNames.includes(item.name)) {
//     return {
//       ...item,
//       prnumber,
//       prid: purchaseRequestId
//     };
//   }
//   return item;
// });

// // Update the DB
// await query(
//   'UPDATE demandrequest SET demandrequestdata = $1 WHERE id = $2',
//   [JSON.stringify(demandrequestdata), demandrequestid]
// );
//     console.log('End');

//     return result;

//   } catch (error) {
//     console.error("Query Execution Error: IN upsertPurchaseRequestData", error);
//     // Assuming ErrorHandler is globally available and used to parse errors
//     const ErrorMessage = await ErrorHandler.handleQueryError(error);
//     return ErrorMessage;
//   }
// }
export const upsertPurchaseRequestData = async (prData: any) => {
  delete prData.suppliercode;
  console.log("Data in upsertPurchaseRequestData:", prData);
  try {
    let querydata: string;
    let params: any[];

    const { id, ...upsertFields } = prData;

    function ensureJsonString(data: any): string {
      return (typeof data === 'string' || data instanceof String) ? String(data) : JSON.stringify(data);
    }

    const supplierRes = await query(
  'SELECT suppliername FROM supplier WHERE id = $1',
  [prData.supplierid]
);

const suppliername = supplierRes.rows[0]?.suppliername || null;


    if (upsertFields.prdata) {
      upsertFields.prdata = ensureJsonString(upsertFields.prdata);
    }

    // Check if this is a demand request operation
    if (prData.isDemandRequest) {
      // First, fetch existing demandrequestdata for the provided demandRequestId (prData.demandRequestId)
      const demandRequestRow = await query(
        'SELECT demandrequestdata FROM demandrequest WHERE id = $1',
        [prData.demandRequestId]
      );

      if (!demandRequestRow.rows.length) {
        throw new Error(`Demand request with ID ${prData.demandRequestId} not found.`);
      }

      let demandrequestdata = demandRequestRow.rows[0]?.demandrequestdata;

      if (!demandrequestdata) demandrequestdata = [];
      if (typeof demandrequestdata === 'string') {
        try {
          demandrequestdata = JSON.parse(demandrequestdata);
        } catch {
          demandrequestdata = [];
        }
      }

      console.log('Demand Request Data:', demandrequestdata);

      // Parse prdata input from current upsert
      let prdataInput = upsertFields.prdata;
      if (typeof prdataInput === 'string') {
        try {
          prdataInput = JSON.parse(prdataInput);
        } catch {
          prdataInput = [];
        }
      }

      // -------------- NEW CHECK: BLOCK insert/update if 'Completed' PR exists --------------

      for (const inputProduct of prdataInput) {
        // Find corresponding product in demandrequestdata by name
        const existingProduct = demandrequestdata.find((item: any) => item.name === inputProduct.name);

        if (existingProduct && Array.isArray(existingProduct.prdata)) {
          // Check if there is any PR with status 'Completed'
          const hasCompleted = existingProduct.prdata.some((pr: any) => pr.prstatus === 'closed_won');

          if (hasCompleted) {
            throw new Error(
              `Cannot add/update PR, PR is already completed.`
            );
          }
        }
      }
    }

    const fieldNames = Object.keys(upsertFields);
    const fieldValues = Object.values(upsertFields);

    if (id) {
      querydata = `UPDATE purchaserequest SET ${fieldNames
        .map((field, index) => `${field} = $${index + 1}`)
        .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
      params = [...fieldValues, id];
    } else {
      querydata = `INSERT INTO purchaserequest (${fieldNames.join(
        ", "
      )}) VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`;
      params = fieldValues;
    }

    const result = await query(querydata, params);

    if (!result.rows.length) {
      throw new Error("No rows returned from upsert query.");
    }

    const row = result.rows[0];
    const { demandrequestid, prnumber, id: purchaseRequestId, prstatus } = row;

    console.log('Demand Request ID:', demandrequestid, 'PR Number:', prnumber, 'PR Status:', prstatus);

    // Only update demandrequestdata if this is a demand request operation
    if (prData.isDemandRequest) {
      // Re-fetch demandrequestdata (in case it was modified above)
      const demandRequestRow = await query(
        'SELECT demandrequestdata FROM demandrequest WHERE id = $1',
        [prData.demandRequestId]
      );

      let demandrequestdata = demandRequestRow.rows[0]?.demandrequestdata;

      if (!demandrequestdata) demandrequestdata = [];
      if (typeof demandrequestdata === 'string') {
        try {
          demandrequestdata = JSON.parse(demandrequestdata);
        } catch {
          demandrequestdata = [];
        }
      }

      // Parse prdata input from current upsert
      let prdataInput = upsertFields.prdata;
      if (typeof prdataInput === 'string') {
        try {
          prdataInput = JSON.parse(prdataInput);
        } catch {
          prdataInput = [];
        }
      }

      // Build a map from prdataInput by product name
      const prInputByName = Array.isArray(prdataInput)
        ? prdataInput.reduce((map: Record<string, any>, item: any) => {
            if (item?.name) map[item.name] = item;
            return map;
          }, {})
        : {};

      // Update demandrequestdata: add or append prdata array
      demandrequestdata = demandrequestdata.map((item: any) => {
        const prInputItem = prInputByName[item.name];
        if (prInputItem) {
          const newPrEntry = {
            prnumber,
            prid: purchaseRequestId,
            prstatus: prstatus ?? null,
            suppliername
          };
          const existingPrData = Array.isArray(item.prdata) ? item.prdata : [];
          const prExists = existingPrData.some(pr => pr.prnumber === prnumber);

          if (!prExists) {
            return {
              ...item,
              prdata: [...existingPrData, newPrEntry]
            };
          }
          return item;
        }
        return item;
      });

      console.log('Updated Demand Request Data:', demandrequestdata);
      console.log(
  'Updated Demand Request Data2:',
  JSON.stringify(demandrequestdata, null, 2)
);


      await query(
        'UPDATE demandrequest SET demandrequestdata = $1 WHERE id = $2',
        [JSON.stringify(demandrequestdata), demandrequestid]
      );
    }

    console.log('End');
    return result;

  } catch (error) {
    console.error("Query Execution Error: IN upsertPurchaseRequestData", error);
    const ErrorMessage = await ErrorHandler.handleQueryError(error);
    return ErrorMessage;
  }
}

    export const upsertstatusfield = async (prData: any) => {
        try {
            console.log("Request Body in upsertstatusfield:", prData);
            let querydata: string;
            let params: any[];
            const { prnumber, ...upsertFields } = prData;
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log("Field Names:", fieldNames);
            console.log("Field Values:", fieldValues);
            console.log('Sample')
            if (prnumber) {
                querydata = `update purchaserequest SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
                WHERE prnumber = $${fieldNames.length + 1} 
                RETURNING *`;
                params = [...fieldValues, prnumber];
            } else {
                querydata = `INSERT INTO purchaserequest (${fieldNames.join(
                    ", "
                )}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params)
            console.log("Result in upsertstatusfield:", result.rows);
            const drData ={id: result.rows[0].demandrequestid, prstatus: result.rows[0].prstatus}
            await demandrequestService.upsertDemandRequest(drData);
            console.log('Stop')
            return result;
        } catch (error) {
            console.error("Query Execution Error: IN upsertstatusfield", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }

    }
}