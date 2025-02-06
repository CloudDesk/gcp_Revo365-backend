import { query } from "../database/postgres.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var globalserachService;
(function (globalserachService) {
    globalserachService.getGlobalData = async (request) => {
        try {
            const { globalSearch, subcategory, sortby, page, recordcount } = request.query;
            const searchTerms = globalSearch.split(' ');
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
                if (subcategory !== "All" && subcategory !== undefined) {
                    searchQuery = `SELECT * FROM products WHERE  subcategory = $2 AND ${condition} ${orderBy}`;
                }
                else {
                    searchQuery = `SELECT * FROM products WHERE ${condition} ${orderBy}`;
                }
            }
            results = await query(searchQuery, params);
            const searchResults = results;
            let checkingData = await dataTypeCheck(searchResults);
            return checkingData;
        }
        catch (error) {
            console.error("Query Execution Error: IN getGlobalData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    globalserachService.getGlobalProductData = async (request, reply) => {
        try {
            const { globalsearch, subcategory, sortby, page, recordcount } = request.query;
            const searchTerms = globalsearch.split(' ').join(' & ');
            let newSearch = globalsearch.split(' ');
            if (newSearch.length === 1) {
                newSearch = newSearch[0] + ':*';
            }
            else {
                let a = [];
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
            if (page && recordcount) {
                queryText += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
                params.push(parseInt(recordcount), (parseInt(page) - 1) * parseInt(recordcount));
            }
            const resultData = await query(queryText, params);
            return resultData.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getGlobalProductData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    globalserachService.getGlobalStockOrderTicketData = async (request, reply) => {
        try {
            const { globalsearch, subcategory, sortby, page, recordcount } = request.query;
            let newSearch = globalsearch.split(' ');
            if (newSearch.length === 1) {
                newSearch = newSearch[0] + ':*';
            }
            else {
                let a = [];
                newSearch.forEach((e) => {
                    if (e) {
                        a.push(e);
                    }
                });
                newSearch = a.length === 1 ? a[0] + ':*' : a.join(':* & ') + ':*';
            }
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
            if (page && recordcount) {
                Object.values(queries).forEach(query => {
                    query.text += ` LIMIT $${query.params.length + 1} OFFSET $${query.params.length + 2}`;
                    query.params.push(parseInt(recordcount), (parseInt(page) - 1) * parseInt(recordcount));
                });
            }
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
            return formattedResults;
        }
        catch (error) {
            console.error("Query Execution Error: IN getGlobalStockOrderTicketData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(globalserachService || (globalserachService = {}));
//# sourceMappingURL=globalsearch.service.js.map