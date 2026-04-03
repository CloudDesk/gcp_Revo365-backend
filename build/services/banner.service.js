import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var bannerService;
(function (bannerService) {
    bannerService.upsertBanner = async (bannerData) => {
        try {
            let results = [];
            for (const banner of bannerData) {
                let querydata, params;
                const { id, ...upsertFields } = banner;
                const fieldNames = Object.keys(upsertFields);
                const fieldValues = Object.values(upsertFields);
                if (id) {
                    querydata = `UPDATE banner SET ${fieldNames
                        .map((field, index) => `${field} = $${index + 1}`)
                        .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                    params = [...fieldValues, id];
                }
                else {
                    querydata = `INSERT INTO banner (${fieldNames.join(", ")}) VALUES (${fieldNames
                        .map((_, index) => `$${index + 1}`)
                        .join(", ")}) RETURNING *`;
                    params = fieldValues;
                }
                const result = await query(querydata, params);
                results.push(result);
            }
            const allCommands = results.map(r => r.command);
            const uniqueCommands = [...new Set(allCommands)];
            if (uniqueCommands.length === 1) {
                return {
                    command: uniqueCommands[0],
                    rowCount: results.reduce((acc, r) => acc + r.rowCount, 0),
                    rows: results.flatMap(r => r.rows),
                    ...results[0]
                };
            }
            else {
                return results;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertBanner", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    bannerService.getAllBanner = async () => {
        try {
            const querydata = `SELECT * FROM banner`;
            const result = await query(querydata, []);
            return result.rows;
        }
        catch (error) {
        }
    };
    bannerService.deleteBanner = async (id) => {
        try {
            const result = await query(`DELETE FROM banner WHERE id = $1`, [id]);
            if (result.rowCount != 0) {
                return `Data Deleted Successfully`;
            }
            else {
                return `Banner not found with id ${id}`;
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN deleteBanner", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(bannerService || (bannerService = {}));
//# sourceMappingURL=banner.service.js.map