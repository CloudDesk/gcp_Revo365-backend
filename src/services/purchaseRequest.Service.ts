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

//     export const upsertPurchaseRequestData = async (prData: any) => {
//         delete prData.suppliercode;
//         console.log("Data in upsertPurchaseRequestData:", prData);
//         try {
//             let querydata: string;
//             let params: any[];
//             const { id, ...upsertFields } = prData;
//             let prdataJsonString;
//             function ensureJsonString(data) {
//                 return (typeof data === 'string' || data instanceof String) ? data : JSON.stringify(data);
//             }
//             if (upsertFields.prdata) {
//                 prdataJsonString = ensureJsonString(upsertFields.prdata);
//                 upsertFields.prdata = prdataJsonString
//             }

//             const fieldNames = Object.keys(upsertFields);
//             const fieldValues = Object.values(upsertFields);
//             if (id) {
//                 querydata = `UPDATE purchaserequest SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")} 
//                 WHERE id = $${fieldNames.length + 1} 
//                 RETURNING *`;
//                 params = [...fieldValues, id];
//             } else {
//                 querydata = `INSERT INTO purchaserequest (${fieldNames.join(
//                     ", "
//                 )}) VALUES (${fieldNames
//                     .map((_, index) => `$${index + 1}`)
//                     .join(", ")}) RETURNING *`;
//                 params = fieldValues;
//             }
//             const result = await query(querydata, params)
//             const { demandrequestid, prnumber } = result.rows[0];
//   console.log('Demand Request ID:', demandrequestid, 'PR Number:', prnumber);
// // 1. Fetch the existing demandrequestdata:
// const demandRequestRow = await query(
//     'SELECT demandrequestdata FROM demandrequest WHERE id = $1',
//     [demandrequestid]
// );
// console.log('Demand Request Row:', demandRequestRow.rows[0]);
// let demandrequestdata = demandRequestRow.rows[0]?.demandrequestdata;
// console.log('Demand Request Data:', demandrequestdata);
// if (!demandrequestdata) demandrequestdata = [];
// if (typeof demandrequestdata === 'string') {
//     try { demandrequestdata = JSON.parse(demandrequestdata); }
//     catch { demandrequestdata = []; }
// }

// // 2. Patch prnumber into each demandrequestdata item:
// if (Array.isArray(demandrequestdata)) {
//     demandrequestdata = demandrequestdata.map(item => ({
//         ...item,
//         prnumber
//     }));
// }
// console.log('Updated Demand Request Data:', demandrequestdata);
// // 3. Update the field back in the demandrequest row:
// await query(
//     'UPDATE demandrequest SET demandrequestdata = $1 WHERE id = $2',
//     [JSON.stringify(demandrequestdata), demandrequestid]
// );

//             // console.log("Result in upsertPurchaseRequestData:", result.rows);
//             // if(result.rows.length > 0 && result.rows[0].isdemandrequest===true) {
//             //     const demandrequestData = {id: result.rows[0].demandrequestid,prstatus:result.rows[0].prstatus,prnumber:result.rows[0].prnumber}
//             //     console.log("Demand Request Data in upsertPurchaseRequestData:", demandrequestData);
//             //     await demandrequestService.upsertDemandRequest(demandrequestData);
//             // }
//             console.log('End')
//             return result;
//         } catch (error) {
//             console.error("Query Execution Error: IN upsertPurchaseRequestData", error);
//             let ErrorMessage = await ErrorHandler.handleQueryError(error)
//             return ErrorMessage
//         }

//     }
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

    // Convert prdata to JSON string if it's not a string
    if (upsertFields.prdata) {
      upsertFields.prdata = ensureJsonString(upsertFields.prdata);
    }

    // Prepare query fields and values
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
    const { demandrequestid, prnumber } = row;

    console.log('Demand Request ID:', demandrequestid, 'PR Number:', prnumber);

    // 1. Fetch the existing demandrequestdata:
    const demandRequestRow = await query(
      'SELECT demandrequestdata FROM demandrequest WHERE id = $1',
      [demandrequestid]
    );

    if (!demandRequestRow.rows.length) {
      throw new Error(`Demand request with ID ${demandrequestid} not found.`);
    }

    let demandrequestdata = demandRequestRow.rows[0]?.demandrequestdata;
    console.log('Demand Request Row:', demandRequestRow.rows[0]);

    if (!demandrequestdata) demandrequestdata = [];
    if (typeof demandrequestdata === 'string') {
      try {
        demandrequestdata = JSON.parse(demandrequestdata);
      } catch {
        demandrequestdata = [];
      }
    }

    console.log('Demand Request Data:', demandrequestdata);

    // Parse prdata from the current upsert (from your input)
    let prdataInput = upsertFields.prdata;
    if (typeof prdataInput === 'string') {
      try {
        prdataInput = JSON.parse(prdataInput);
      } catch {
        prdataInput = [];
      }
    }

    const purchaseRequestId = row.id; // Purchase Request ID

// Match via product name only
const prNames = Array.isArray(prdataInput)
  ? prdataInput.map((item: any) => item.name)
  : [];

demandrequestdata = demandrequestdata.map((item: any) => {
  if (prNames.includes(item.name)) {
    return {
      ...item,
      prnumber,
      prid: purchaseRequestId
    };
  }
  return item;
});

// Update the DB
await query(
  'UPDATE demandrequest SET demandrequestdata = $1 WHERE id = $2',
  [JSON.stringify(demandrequestdata), demandrequestid]
);
    console.log('End');

    return result;

  } catch (error) {
    console.error("Query Execution Error: IN upsertPurchaseRequestData", error);
    // Assuming ErrorHandler is globally available and used to parse errors
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