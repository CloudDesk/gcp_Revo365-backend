import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export module fileservice {
    export const insertFile = async (request: any) => {
        try {
            let resultsdata; // Array to store results
            let count =0
            for (const file of request.files) {
                const { id, ...upsertFields } = file;
                upsertFields.fileurl = request.protocol + "s://" + request.headers.host +'/'+ upsertFields.filename
                if (request.productid) {
                    upsertFields.productid = request.productid
               }
               
                let createdDateUtc = new Date().getTime()
                upsertFields.createddate = createdDateUtc
                const fieldNames = Object.keys(upsertFields);
                const fieldValues = Object.values(upsertFields);
                let querydata;
                let params: any[] = [];
                if (id) {
                    querydata = `UPDATE files SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(", ")} WHERE id = $${fieldNames.length + 1}`;
                    params = [...fieldValues, id];
                } else {
                    querydata = `INSERT INTO files (${fieldNames.join(
                        ", "
                    )}) VALUES (${fieldNames
                        .map((_, index) => `$${index + 1}`)
                        .join(", ")}) RETURNING *`; 
                    params = fieldValues;
                }

                const result = await query(querydata, params);
                count++
                result.rowCount = count;
                resultsdata = result

            }

            return resultsdata;

        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
}
