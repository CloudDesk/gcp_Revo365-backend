import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var stockService;
(function (stockService) {
    stockService.getStock = async (request) => {
        try {
            const pageNumber = request.query.page;
            const recordCount = request.query.count;
            const queryParams = [];
            let whereClauses = [];
            let offset;
            let parameterIndex = 1;
            Object.entries(request.query).forEach(([key, value], index) => {
                if (key !== 'page' && key !== 'count') {
                    const paramValues = Array.isArray(value) ? value : [value];
                    if (key === "createddate" || key === "modifieddate") {
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
                    else {
                        whereClauses.push(`(${paramValues.map((_, idx) => `${key} = $${parameterIndex}`).join(" OR ")})`);
                        queryParams.push(...paramValues);
                        parameterIndex += paramValues.length;
                    }
                }
            });
            if (pageNumber && recordCount) {
                offset = (pageNumber - 1) * recordCount;
            }
            let querydata = `select * from stock`;
            if (whereClauses.length > 0) {
                querydata += ` WHERE ${whereClauses.join(" AND ")} ORDER BY modifieddate DESC`;
            }
            else {
                querydata += ` ORDER BY modifieddate DESC`;
            }
            if (offset != null && recordCount != null) {
                querydata += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2}`;
                queryParams.push(offset, recordCount);
            }
            let data = await query(querydata, queryParams);
            return data.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getStock", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(stockService || (stockService = {}));
//# sourceMappingURL=stock.service.js.map