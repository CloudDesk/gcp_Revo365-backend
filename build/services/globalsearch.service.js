import { query } from "../database/postgres.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var globalserachService;
(function (globalserachService) {
    globalserachService.getGlobalData = async (request) => {
        try {
            const { globalSearch, subcategory, sortby, page, recordcount } = request.query;
            console.log("Global Search:", globalSearch);
            console.log("Subcategory:", subcategory);
            console.log("Sort By:", sortby);
            const searchTerms = globalSearch.split(' ');
            console.log(searchTerms, 'Search Terms ');
            // Construct the SQL query dynamically based on the global search term
            let searchQuery;
            let results;
            const result = await query(`
                SELECT column_name, data_type 
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'products';
            `, []);
            const searchConditions = result.rows.map(row => {
                if (row.data_type === 'numeric') {
                    return `CAST(${row.column_name} AS TEXT) LIKE ANY ($1)`;
                }
                else {
                    return `${row.column_name}::text LIKE ANY ($1)`;
                }
            });
            let orderBy = '';
            if (sortby) {
                let [fieldName, fieldValue] = sortby.split("-");
                orderBy = ` ORDER BY ${fieldName} ${fieldValue}, modifieddate DESC`;
            }
            else {
                orderBy = ` ORDER BY modifieddate DESC`;
            }
            let params = [];
            if (searchTerms.length > 0) {
                params.push(searchTerms.map(term => `%${term}%`));
            }
            if (subcategory && subcategory !== "All") {
                params.push(subcategory);
            }
            let condition = '';
            if (searchConditions.length > 0) {
                condition = `(${searchConditions.join(' OR ')})`;
            }
            if (page && recordcount) {
                console.log('Pagination enabled');
                if (subcategory !== "All" && subcategory !== undefined) {
                    searchQuery = `SELECT * FROM products WHERE subcategory = $2 AND ${condition} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
                    params.push(recordcount, (page - 1) * recordcount);
                }
                else {
                    searchQuery = `SELECT * FROM products WHERE ${condition} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
                    params.push(recordcount, (page - 1) * recordcount);
                }
            }
            else {
                console.log('Fetch all data');
                if (subcategory !== "All" && subcategory !== undefined) {
                    searchQuery = `SELECT * FROM products WHERE  subcategory = $2 AND ${condition} ${orderBy}`;
                }
                else {
                    searchQuery = `SELECT * FROM products WHERE ${condition} ${orderBy}`;
                }
            }
            // Flatten params array if needed
            console.log(params, 'params');
            // params = params.flat();
            // console.log(params, 'flattend');
            // Execute the query with repeatedParams
            results = await query(searchQuery, params);
            const searchResults = results;
            let checkingData = await dataTypeCheck(searchResults);
            console.log("Checking Data Length:", checkingData.length);
            return checkingData;
        }
        catch (error) {
            console.error("Query Execution Error: IN getGlobalData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    globalserachService.getGlobalProductData = async (request, reply) => {
        try {
            console.log(request.query);
            const { globalsearch, subcategory, sortby, page, recordcount } = request.query;
            console.log(globalsearch, 'globalsearch');
            const searchTerms = globalsearch.split(' ').join(' & ');
            let newSearch = globalsearch.split(' ');
            console.log(newSearch.length, 'newSearch length');
            if (newSearch.length === 1) {
                console.log(newSearch, 'data is');
                newSearch = newSearch[0] + ':*';
            }
            else {
                let a = [];
                console.log(newSearch, 'New Search daata');
                newSearch.forEach((e, index) => {
                    if (e) {
                        a.push(e);
                    }
                });
                if (a.length === 1) {
                    newSearch = a[0] + ':*';
                }
                else {
                    newSearch = a.join(':* & ') + ':*';
                }
            }
            console.log(newSearch, 'newSearch data');
            console.log(searchTerms);
            let queryText = `
                SELECT * 
                FROM product_revo 
                WHERE searchtext @@ to_tsquery('english', $1)
            `;
            let params = [newSearch];
            if (subcategory && subcategory !== "All") {
                queryText += ` AND subcategory = $${params.length + 1}`;
                params.push(subcategory);
            }
            let orderBy = 'modifieddate';
            let orderBydirection = 'DESC';
            if (sortby) {
                const [fieldName, fieldValue] = sortby.split("-");
                orderBy = fieldName;
                orderBydirection = fieldValue;
                queryText += ` ORDER BY ${orderBy} ${orderBydirection}`;
            }
            else {
                queryText += ` ORDER BY ${orderBy} ${orderBydirection}`;
            }
            console.log(page, 'page');
            console.log(recordcount, 'record Count');
            if (page && recordcount) {
                queryText += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
                params.push(parseInt(recordcount), (parseInt(page) - 1) * parseInt(recordcount));
            }
            console.log('Final query:', queryText);
            console.log('Params:', params);
            // Execute the query
            const resultData = await query(queryText, params);
            console.log(resultData.rows.length);
            return resultData.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getGlobalProductData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
    globalserachService.getGlobalStockOrderTicketData = async (request, reply) => {
        try {
            console.log(request.query);
            const { globalsearch, subcategory, sortby, page, recordcount } = request.query;
            console.log(globalsearch, 'globalsearch');
            let newSearch = globalsearch.split(' ');
            console.log(newSearch.length, 'newSearch length');
            if (newSearch.length === 1) {
                console.log(newSearch, 'data is');
                newSearch = newSearch[0] + ':*';
            }
            else {
                let a = [];
                console.log(newSearch, 'New Search data');
                newSearch.forEach((e) => {
                    if (e) {
                        a.push(e);
                    }
                });
                newSearch = a.length === 1 ? a[0] + ':*' : a.join(':* & ') + ':*';
            }
            console.log(newSearch, 'newSearch data');
            const queries = {
                stock: {
                    text: `
                        SELECT * 
                        FROM stock_revo 
                        WHERE searchtext @@ to_tsquery('english', $1)
                    `,
                    params: [newSearch]
                },
                product: {
                    text: `
                        SELECT * 
                        FROM product_revo 
                        WHERE searchtext @@ to_tsquery('english', $1)
                    `,
                    params: [newSearch]
                },
                tickets: {
                    text: `
                        SELECT * 
                        FROM tickets 
                        WHERE searchtext @@ to_tsquery('english', $1)
                    `,
                    params: [newSearch]
                }
            };
            if (/\d/.test(globalsearch)) {
                const numericPart = globalsearch.match(/\d+/)[0];
                queries.product.text += ` OR qrcode ILIKE $${queries.product.params.length + 1}`; // Use qrcode for product_revo
                queries.product.params.push(`%${numericPart}%`);
                queries.product.text += ` OR barcode ILIKE $${queries.product.params.length + 1}`; // Use barcode for product_revo
                queries.product.params.push(`%${numericPart}%`);
                queries.tickets.text += ` OR ticketnumber ILIKE $${queries.tickets.params.length + 1}`;
                queries.tickets.params.push(`%${numericPart}%`);
            }
            if (subcategory && subcategory !== "All") {
                queries.stock.text += ` AND subcategory = $${queries.stock.params.length + 1}`;
                queries.stock.params.push(subcategory);
            }
            let orderBy = 'modifieddate';
            let orderBydirection = 'DESC';
            if (sortby) {
                const [fieldName, fieldValue] = sortby.split("-");
                orderBy = fieldName;
                orderBydirection = fieldValue;
            }
            Object.values(queries).forEach(query => {
                query.text += ` ORDER BY ${orderBy} ${orderBydirection}`;
            });
            console.log(page, 'page');
            console.log(recordcount, 'record Count');
            if (page && recordcount) {
                Object.values(queries).forEach(query => {
                    query.text += ` LIMIT $${query.params.length + 1} OFFSET $${query.params.length + 2}`;
                    query.params.push(parseInt(recordcount), (parseInt(page) - 1) * parseInt(recordcount));
                });
            }
            Object.entries(queries).forEach(([key, query]) => {
                console.log(`${key} Final query:`, query.text);
                console.log(`${key} Params:`, query.params);
            });
            // Execute all queries
            const [stockResult, productRevoResult, ticketsResult] = await Promise.all([
                query(queries.stock.text, queries.stock.params),
                query(queries.product.text, queries.product.params),
                query(queries.tickets.text, queries.tickets.params)
            ]);
            const formattedResults = {
                stock: stockResult.rows || [],
                product: productRevoResult.rows || [],
                tickets: ticketsResult.rows || []
            };
            console.log('Results count:', {
                tickets: formattedResults.tickets.length,
                product: formattedResults.product.length,
                stock: formattedResults.stock.length
            });
            return formattedResults;
        }
        catch (error) {
            console.error("Query Execution Error: IN getGlobalStockOrderTicketData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(globalserachService || (globalserachService = {}));
//# sourceMappingURL=globalsearch.service.js.map