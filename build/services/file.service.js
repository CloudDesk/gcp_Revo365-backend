import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var fileservice;
(function (fileservice) {
    fileservice.insertFile = async (request) => {
        try {
            let resultsdata; // Array to store results
            console.log(request.files.length, 'length of files');
            let count = 0;
            for (const file of request.files) {
                console.log('for loop calling ......');
                const { id, ...upsertFields } = file;
                upsertFields.fileurl = request.protocol + "s://" + request.headers.host + '/' + upsertFields.filename;
                console.log(upsertFields.fileurl, 'fileurlis');
                if (request.productid) {
                    upsertFields.productid = request.productid;
                }
                let createdDateUtc = new Date().getTime();
                upsertFields.createddate = createdDateUtc;
                const fieldNames = Object.keys(upsertFields);
                const fieldValues = Object.values(upsertFields);
                let querydata;
                let params = [];
                if (id) {
                    // If id is provided, update the existing file
                    querydata = `UPDATE files SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(", ")} WHERE id = $${fieldNames.length + 1}`;
                    params = [...fieldValues, id];
                }
                else {
                    // If id is not provided, insert a new file
                    querydata = `INSERT INTO files (${fieldNames.join(", ")}) VALUES (${fieldNames
                        .map((_, index) => `$${index + 1}`)
                        .join(", ")}) RETURNING *`; // Return inserted row
                    params = fieldValues;
                }
                const result = await query(querydata, params);
                console.log(result.rowCount, '****** before after update row count 1');
                count++;
                result.rowCount = count;
                console.log(result.rowCount, '****** before after update row count 2');
                // Push result to array
                resultsdata = result;
            }
            console.log(resultsdata, 'returning data is ');
            return resultsdata;
        }
        catch (error) {
            console.error("Query Execution Error: IN insertFile", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(fileservice || (fileservice = {}));
//# sourceMappingURL=file.service.js.map