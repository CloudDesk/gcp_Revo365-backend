import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import { QueryResult } from "pg";
import { convertDateRangeToEpoch } from "../utils/Date/fromtoEpochDashboard.js"

const validMonthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];

const isValidMonth = (month: string): boolean => {
    return validMonthNames.includes(month.toLowerCase());
};

const isValidYear = (year: string): boolean => {
    return /^\d{4}$/.test(year);
};

export module dashboardservice {

    export const getSalesPerMonthData = async (querydata: any) => {
        try {
            const fields = Object.keys(querydata);
            const values = Object.values(querydata);
            const currentYear = new Date().getFullYear();
            const fieldMappings: { [key: string]: string } = {
                'orderstatus': 'o.orderstatus',
                'subcategory': 'p.subcategory',
                'category': 'p.category'
            };

            let conditions: string[] = [];
            let queryParams: any[] = [];

            fields.forEach((key, index) => {
                if (fieldMappings[key]) {
                    conditions.push(`${fieldMappings[key]} = $${index + 1}`);
                    queryParams.push(values[index]);
                } else if (key === 'month') {
                    if (!isValidMonth(values[index] as string)) {
                        throw new Error('Invalid month value');
                    }
                    conditions.push(`TO_CHAR(TO_TIMESTAMP(o.createddate ), 'Month') ILIKE $${index + 1}`);
                    queryParams.push(`%${(values[index] as string).charAt(0).toUpperCase() + (values[index] as string).slice(1).toLowerCase()}%`);

                    if (!querydata.year) {
                        conditions.push(`DATE_TRUNC('year', TO_TIMESTAMP(o.createddate )) = DATE_TRUNC('year', TO_DATE($${index + 2}, 'YYYY'))`);
                        queryParams.push(currentYear);
                    }
                } else if (key === 'year') {
                    if (!isValidYear(values[index] as string)) {
                        throw new Error('Invalid year value');
                    }
                    conditions.push(`DATE_TRUNC('year', TO_TIMESTAMP(o.createddate )) = DATE_TRUNC('year', TO_DATE($${index + 1}, 'YYYY'))`);
                    queryParams.push(values[index]);
                }
            });

            const queryText = `
                SELECT 
                    COALESCE(SUM(o.quantity), 0) AS total_quantity, 
                    COALESCE(SUM(o.orderamount), 0) AS total_orderamount
                FROM orders AS o
                JOIN product_revo AS p ON o.productid = p.id
                WHERE ${conditions.join(' AND ')}
            `;
            const result: QueryResult = await query(queryText, queryParams);
            await dataTypeCheck(result);
            const data = result.rows[0] || { total_quantity: 0, total_orderamount: 0 };

            const response: { [key: string]: any } = {
                total_quantity: data.total_quantity,
                total_orderamount: data.total_orderamount
            };

            if (querydata.year || (querydata.month && !querydata.year)) {
                response.year = querydata.year || currentYear;
            }
            if (querydata.month) {
                response.month = querydata.month;
            }
            if (querydata.orderstatus) {
                response.orderstatus = querydata.orderstatus;
            }
            if (querydata.category) {
                response.category = querydata.category;
            }
            if (querydata.subcategory) {
                response.subcategory = querydata.subcategory;
            }

            return response;

            // API - /dashboard/totalsales?month=july&year=2024&orderstatus=ordered&category=new&subcategory=laptop

        } catch (error) {
            const ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.error("Error in getSalesPerMonthData:", ErrorMessage);
            return { error: ErrorMessage };
        }
    }

    export const getSalesMonthlyData = async (querydata: any) => {
        try {
            const dataParam = querydata.data;
            if (!dataParam) {
                throw new Error('Missing data parameter');
            }

            const [startMonth, endMonth] = dataParam.split(',');
            if (!startMonth || !endMonth) {
                throw new Error('Invalid data parameter format');
            }

            const [startYear, startMonthName] = startMonth.split('-');
            const [endYear, endMonthName] = endMonth.split('-');

            if (!startYear || !startMonthName || !endYear || !endMonthName) {
                throw new Error('Invalid date format');
            }

            const monthMap: { [key: string]: number } = {
                'january': 1,
                'february': 2,
                'march': 3,
                'april': 4,
                'may': 5,
                'june': 6,
                'july': 7,
                'august': 8,
                'september': 9,
                'october': 10,
                'november': 11,
                'december': 12
            };

            const startMonthNumber = monthMap[startMonthName.toLowerCase()];
            const endMonthNumber = monthMap[endMonthName.toLowerCase()];

            if (!startMonthNumber || !endMonthNumber) {
                throw new Error('Invalid month name');
            }

            const startDate = new Date(`${startYear}-${startMonthNumber.toString().padStart(2, '0')}-01T00:00:00Z`);
            const endDate = new Date(`${endYear}-${endMonthNumber.toString().padStart(2, '0')}-01T00:00:00Z`);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0); 
            endDate.setHours(23, 59, 59, 999); 

            const startTimestamp = Math.floor(startDate.getTime() / 1000);
            const endTimestamp = Math.floor(endDate.getTime() / 1000);

            const queryText = `
            SELECT
    TO_CHAR(months.month, 'Mon') AS "Month",
    TO_CHAR(months.month, 'YYYY') AS year,
    COALESCE(SUM(o.orderamount), 0) AS "Total Sales",
    COALESCE(SUM(o.quantity), 0) AS "Total Quantity"
FROM
    generate_series(
        DATE_TRUNC('Month', TO_TIMESTAMP($1)),
        DATE_TRUNC('Month', TO_TIMESTAMP($2)),
        INTERVAL '1 month'
    ) AS months(month)
LEFT JOIN
    orderline AS o ON DATE_TRUNC('Month', TO_TIMESTAMP(o.createddate::bigint)) = months.month
    AND o.orderstatus = 'delivered'
GROUP BY
    "Month", year, months.month
ORDER BY
    months.month
`;

            const result: QueryResult = await query(queryText, [startTimestamp, endTimestamp]);

            await dataTypeCheck(result);
            const data = result.rows || [];
            let newArray = [Object.keys(data[0]).filter(key => key !== 'year' && key !== 'Total Quantity')];
            result.rows.forEach((row) => {
                const values: any =
                    Object.entries(row)
                        .filter(([key]) => key !== 'year' && key !== 'Total Quantity')
                        .map(([, value]) => value);
                newArray.push(values);
            });

            return newArray

            // API - /dashboard/monthwise?data=2024-january,2024-july

        } catch (error) {
            const ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.error("Error in getSalesMonthlyData:", ErrorMessage);
            return { error: ErrorMessage };
        }
    };

    export const getSalesMonthlyLocationData = async (querydata: any) => {
        try {
            const dataParam = querydata.data;
            const location = querydata.location
            if (!dataParam) {
                throw new Error('Missing data parameter');
            }

            const [startMonth, endMonth] = dataParam.split(',');
            if (!startMonth || !endMonth) {
                throw new Error('Invalid data parameter format');
            }

            const [startYear, startMonthName] = startMonth.split('-');
            const [endYear, endMonthName] = endMonth.split('-');

            if (!startYear || !startMonthName || !endYear || !endMonthName) {
                throw new Error('Invalid date format');
            }

            const monthMap: { [key: string]: number } = {
                'january': 1,
                'february': 2,
                'march': 3,
                'april': 4,
                'may': 5,
                'june': 6,
                'july': 7,
                'august': 8,
                'september': 9,
                'october': 10,
                'november': 11,
                'december': 12
            };

            const startMonthNumber = monthMap[startMonthName.toLowerCase()];
            const endMonthNumber = monthMap[endMonthName.toLowerCase()];

            if (!startMonthNumber || !endMonthNumber) {
                throw new Error('Invalid month name');
            }

            const startDate = new Date(`${startYear}-${startMonthNumber.toString().padStart(2, '0')}-01T00:00:00Z`);
            const endDate = new Date(`${endYear}-${endMonthNumber.toString().padStart(2, '0')}-01T00:00:00Z`);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0); // Set to the last day of the month
            endDate.setHours(23, 59, 59, 999); // Set time to end of the day

            const startTimestamp = Math.floor(startDate.getTime() / 1000);
            const endTimestamp = Math.floor(endDate.getTime() / 1000);

            const queryText = `
            SELECT
    TO_CHAR(months.month, 'Mon') AS "Month",
    TO_CHAR(months.month, 'YYYY') AS year,
    COALESCE(SUM(o.orderamount), 0) AS "Total Sales",
    COALESCE(SUM(o.quantity), 0) AS "Total Quantity"
FROM
    generate_series(
        DATE_TRUNC('Month', TO_TIMESTAMP($1)),
        DATE_TRUNC('Month', TO_TIMESTAMP($2)),
        INTERVAL '1 month'
    ) AS months(month)
LEFT JOIN
    orderline AS o ON DATE_TRUNC('Month', TO_TIMESTAMP(o.createddate::bigint)) = months.month
    AND o.orderstatus = 'delivered' AND o.deliveryfrom = '${location}'
GROUP BY
    "Month", year, months.month
ORDER BY
    months.month
`;

            const result: QueryResult = await query(queryText, [startTimestamp, endTimestamp]);

            await dataTypeCheck(result);
            const data = result.rows || [];
            let newArray = [Object.keys(data[0]).filter(key => key !== 'year' && key !== 'Total Quantity')];
            result.rows.forEach((row) => {
                const values: any =
                    Object.entries(row)
                        .filter(([key]) => key !== 'year' && key !== 'Total Quantity')
                        .map(([, value]) => value);
                newArray.push(values);
            });

            return newArray

        } catch (error) {
            const ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.error("Error in getSalesMonthlyLocationData:", ErrorMessage);
            return { error: ErrorMessage };
        }
    };

  

    export const getGroupedData = async (querydata) => {
        try {
            const getColumns = async (tableName) => {
                const columnQuery = `
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                    AND table_name = $1
                `;
                const result = await query(columnQuery, [tableName]);
                return result.rows.map(row => row.column_name);
            };

            const orderColumns = await getColumns('orders');
            const productRevoColumns = await getColumns('product_revo');

            const orderColumnsSet = new Set(orderColumns);
            const productRevoColumnsSet = new Set(productRevoColumns);

            let selectedColumns = [];
            let groupByColumns = [];

            const dateRange = querydata.data ? querydata.data.split(',') : [];

            let startEpoch = 0;
            let endEpoch = 0;
            if (querydata.data) {
                const dateRange = querydata.data.split(',');
                ({ startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange));
            }

            if (!startEpoch || !endEpoch) {
                throw new Error('Invalid date range.');
            }

            for (const field of Object.keys(querydata)) {
                if (field === 'data') {
                    continue;
                }

                // Fetch distinct values for each specified field
                let distinctValues = {};
                for (const field of Object.keys(querydata)) {
                    if (field === 'data') continue;

                    if (orderColumnsSet.has(field)) {
                        selectedColumns.push(`o.${field}`);
                        groupByColumns.push(`o.${field}`);
                        const distinctQuery = `SELECT DISTINCT o.${field} FROM orders AS o`;
                        const result = await query(distinctQuery, []);
                        distinctValues[field] = result.rows.map(row => row[field]);
                    } else if (productRevoColumnsSet.has(field)) {
                        selectedColumns.push(`p.${field}`);
                        groupByColumns.push(`p.${field}`);
                        const distinctQuery = `SELECT DISTINCT p.${field} FROM product_revo AS p`;
                        const result = await query(distinctQuery, []);
                        distinctValues[field] = result.rows.map(row => row[field]);
                    } else {
                        throw new Error(`Invalid column: ${field}`);
                    }
                }

                selectedColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon') AS month");
                selectedColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate)) AS year");
                groupByColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon')");
                groupByColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate))");


                let queryText = `
                SELECT
                    COALESCE(SUM(o.quantity), 0) AS quantity,
                    COALESCE(SUM(o.orderamount), 0) AS total_amount,
                    ${selectedColumns.join(', ')}
                FROM orders AS o
                JOIN product_revo AS p ON o.productid = p.id
                WHERE o.createddate BETWEEN $1 AND $2
            `;

                if (groupByColumns.length > 0) {
                    queryText += `
                    GROUP BY ${groupByColumns.join(', ')}
                `;
                }

                const result = await query(queryText, [startEpoch, endEpoch]);

                return result.rows;

                // API - /dashboard/group-by?data=2023-january,2024-july&orderstatus
            }
        } catch (error) {
            console.log("Error in getGroupedData", error.message);
            return { error: { errorMessage: error.message, errorDetails: [], statusCode: 404 } };
        }
    };

  export const getCountData2 = async (querydata: any) => {
        try {
            const dateRange = querydata.data ? querydata.data.split(',') : [];
            if (dateRange.length !== 2) {
                throw new Error('Invalid date range.');
            }
            const { startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange);
            let orderStatuses = querydata.orderstatus;
            if (!Array.isArray(orderStatuses)) {
                orderStatuses = orderStatuses ? [orderStatuses] : [];
            }
            if (orderStatuses.length === 0) {
                throw new Error('No order status provided.');
            }
            const filterConditions = orderStatuses.map((status, i) => `o.orderstatus = $${i + 1}`).join(' OR ');
            const queryText = `
                WITH date_series AS (
                    SELECT date_trunc('month', d)::date AS month
                    FROM generate_series(
                        to_timestamp($${orderStatuses.length + 1})::date,
                        to_timestamp($${orderStatuses.length + 2})::date,
                        '1 month'::interval
                    ) d
                ),
                order_data AS (
                    SELECT
                        date_trunc('month', to_timestamp(o.createddate))::date AS month,
                        COUNT(o.id) FILTER (WHERE ${filterConditions}) AS ordercount,
                        SUM(o.quantity) FILTER (WHERE ${filterConditions}) AS orderquantity
                    FROM orders AS o
                    WHERE o.createddate BETWEEN $${orderStatuses.length + 1} AND $${orderStatuses.length + 2}
                    GROUP BY month
                )
                SELECT
                    TO_CHAR(ds.month, 'Mon') AS month,
                    COALESCE(od.ordercount, 0) AS ordercount,
                    COALESCE(od.orderquantity, 0) AS orderquantity
                FROM date_series ds
                LEFT JOIN order_data od ON ds.month = od.month
                ORDER BY ds.month
            `;
            const queryParams = [...orderStatuses, startEpoch, endEpoch];
            const result = await query(queryText, queryParams);
            result.rows.pop();
            return result.rows;
        } catch (error) {
            console.error("Error in getCountData2:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

    export const getGroupbyValueData = async (querydata) => {
        try {
            const getColumns = async (tableName) => {
                const columnQuery = `
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = $1
            `;
                const result = await query(columnQuery, [tableName]);
                return result.rows.map(row => row.column_name);
            };

            const orderColumns = await getColumns('orders');
            const productRevoColumns = await getColumns('product_revo');

            const orderColumnsSet = new Set(orderColumns);
            const productRevoColumnsSet = new Set(productRevoColumns);

            let selectedColumns = [];
            let groupByColumns = [];
            let whereClauses = [];
            let queryParams = [];
            let orConditions = {
                o: [],
                p: []
            };

            const dateRange = querydata.data ? querydata.data.split(',') : [];
            let startEpoch = 0;
            let endEpoch = 0;

            if (dateRange.length === 2) {
                ({ startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange));
            } else {
                throw new Error('Invalid date range.');
            }

            whereClauses.push(`o.createddate BETWEEN $1 AND $2`);
            queryParams.push(startEpoch, endEpoch);

            // Collect conditions for each field
            for (const [field, values] of Object.entries(querydata)) {
                if (field === 'data') continue; // skip date range parameter

                if (Array.isArray(values)) {
                    // Multiple values for the same field
                    if (orderColumnsSet.has(field)) {
                        orConditions['o'].push(`o.${field} IN (${values.map((_, i) => `$${queryParams.length + i + 1}`).join(', ')})`);
                        queryParams.push(...values);
                        selectedColumns.push(`o.${field}`);
                        groupByColumns.push(`o.${field}`);
                    } else if (productRevoColumnsSet.has(field)) {
                        orConditions['p'].push(`p.${field} IN (${values.map((_, i) => `$${queryParams.length + i + 1}`).join(', ')})`);
                        queryParams.push(...values);
                        selectedColumns.push(`p.${field}`);
                        groupByColumns.push(`p.${field}`);
                    } else {
                        throw new Error(`Invalid column: ${field}`);
                    }
                } else {
                    // Single value
                    if (orderColumnsSet.has(field)) {
                        whereClauses.push(`o.${field} = $${queryParams.length + 1}`);
                        queryParams.push(values);
                        selectedColumns.push(`o.${field}`);
                        groupByColumns.push(`o.${field}`);
                    } else if (productRevoColumnsSet.has(field)) {
                        whereClauses.push(`p.${field} = $${queryParams.length + 1}`);
                        queryParams.push(values);
                        selectedColumns.push(`p.${field}`);
                        groupByColumns.push(`p.${field}`);
                    } else {
                        throw new Error(`Invalid column: ${field}`);
                    }
                }
            }

            // Add OR conditions to WHERE clause
            if (orConditions.o.length > 0) {
                whereClauses.push(`(${orConditions.o.join(' OR ')})`);
            }
            if (orConditions.p.length > 0) {
                whereClauses.push(`(${orConditions.p.join(' OR ')})`);
            }

            selectedColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon') AS month");
            selectedColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate)) AS year");
            groupByColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon')");
            groupByColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate))");

            let queryText = `
            SELECT
                COALESCE(SUM(o.quantity), 0) AS quantity,
                COALESCE(SUM(o.orderamount), 0) AS total_amount,
                ${selectedColumns.join(', ')}
            FROM orders AS o
            JOIN product_revo AS p ON o.productid = p.id
            WHERE ${whereClauses.join(' AND ')}
        `;

            if (groupByColumns.length > 0) {
                queryText += `
                GROUP BY ${groupByColumns.join(', ')}
            `;
            }

            const result = await query(queryText, queryParams);

            return result.rows;

        } catch (error) {
            console.error("Error in getGroupbyValueData", error.message);
            return { error: { errorMessage: error.message, errorDetails: [], statusCode: 404 } };
        }
    };

    export const getDynamicGroupbyValueData = async (querydata) => {
        try {
            const getColumns = async (tableName) => {
                const columnQuery = `
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = $1
            `;
                const result = await query(columnQuery, [tableName]);
                return result.rows.map(row => row.column_name);
            };

            const orderColumns = await getColumns('orders');
            const productRevoColumns = await getColumns('product_revo');

            const orderColumnsSet = new Set(orderColumns);
            const productRevoColumnsSet = new Set(productRevoColumns);

            let selectedColumns = [];
            let groupByColumns = [];
            let whereClauses = [];
            let queryParams = [];
            let orConditions = {
                o: [],
                p: []
            };

            const dateRange = querydata.data ? querydata.data.split(',') : [];
            let startEpoch = 0;
            let endEpoch = 0;

            if (dateRange.length === 2) {
                ({ startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange));
            } else {
                throw new Error('Invalid date range.');
            }

            whereClauses.push(`o.createddate BETWEEN $1 AND $2`);
            queryParams.push(startEpoch, endEpoch);

            let dynamicQuantityField = 'quantity'; // Default quantity field

            // Track the number of specified fields for dynamic aliasing
            let specifiedField = null;

            for (const [field, value] of Object.entries(querydata)) {
                if (field === 'data') continue; // Skip date range parameter

                if (specifiedField) {
                    throw new Error('Only one field can be specified in the API.');
                }

                specifiedField = field;
                dynamicQuantityField = `${value}_quantity`; // Dynamic aliasing based on the value

                if (orderColumnsSet.has(field)) {
                    whereClauses.push(`o.${field} = $${queryParams.length + 1}`);
                    queryParams.push(value);
                } else if (productRevoColumnsSet.has(field)) {
                    whereClauses.push(`p.${field} = $${queryParams.length + 1}`);
                    queryParams.push(value);
                } else {
                    throw new Error(`Invalid column: ${field}`);
                }
            }

            // Add OR conditions to WHERE clause
            if (orConditions.o.length > 0) {
                whereClauses.push(`(${orConditions.o.join(' OR ')})`);
            }
            if (orConditions.p.length > 0) {
                whereClauses.push(`(${orConditions.p.join(' OR ')})`);
            }

            selectedColumns.push(`COALESCE(SUM(o.quantity), 0) AS ${dynamicQuantityField}`); // Dynamically alias quantity field
            selectedColumns.push("COALESCE(SUM(o.orderamount), 0) AS total_amount");
            selectedColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon') AS month");
            selectedColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate)) AS year");
            groupByColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon')");
            groupByColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate))");

            let queryText = `
            SELECT
                ${selectedColumns.join(', ')}
            FROM orders AS o
            JOIN product_revo AS p ON o.productid = p.id
            WHERE ${whereClauses.join(' AND ')}
        `;

            if (groupByColumns.length > 0) {
                queryText += `
                GROUP BY ${groupByColumns.join(', ')}
            `;
            }

            const result = await query(queryText, queryParams);

            return result.rows;

        } catch (error) {
            console.error("Error in getDynamicGroupbyValueData", error.message);
            return { error: { errorMessage: error.message, errorDetails: [], statusCode: 404 } };
        }
    };

    export const getDynamicGroupbyValueData2 = async (querydata) => {
        try {
            const getColumns = async (tableName) => {
                const columnQuery = `
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = $1
            `;
                const result = await query(columnQuery, [tableName]);
                return result.rows.map(row => row.column_name);
            };

            const orderColumns = await getColumns('orders');
            const productRevoColumns = await getColumns('product_revo');

            const orderColumnsSet = new Set(orderColumns);
            const productRevoColumnsSet = new Set(productRevoColumns);

            let selectedColumns = [];
            let groupByColumns = [];
            let whereClauses = [];
            let queryParams = [];
            let dynamicQuantityFieldParts = [];

            const dateRange = querydata.data ? querydata.data.split(',') : [];
            let startEpoch = 0;
            let endEpoch = 0;

            if (dateRange.length === 2) {
                ({ startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange));
            } else {
                throw new Error('Invalid date range.');
            }

            whereClauses.push(`o.createddate BETWEEN $1 AND $2`);
            queryParams.push(startEpoch, endEpoch);

            for (const [field, value] of Object.entries(querydata)) {
                if (field === 'data') continue; // Skip date range parameter

                dynamicQuantityFieldParts.push(value); // Add value to dynamic quantity field parts

                if (orderColumnsSet.has(field)) {
                    whereClauses.push(`o.${field} = $${queryParams.length + 1}`);
                    queryParams.push(value);
                } else if (productRevoColumnsSet.has(field)) {
                    whereClauses.push(`p.${field} = $${queryParams.length + 1}`);
                    queryParams.push(value);
                } else {
                    throw new Error(`Invalid column: ${field}`);
                }
            }

            const dynamicQuantityField = `${dynamicQuantityFieldParts.join('_')}_quantity`; // Create dynamic quantity field alias

            selectedColumns.push(`COALESCE(SUM(o.quantity), 0) AS ${dynamicQuantityField}`); // Dynamically alias quantity field
            selectedColumns.push("COALESCE(SUM(o.orderamount), 0) AS total_amount");
            selectedColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon') AS month");
            selectedColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate)) AS year");
            groupByColumns.push("TO_CHAR(to_timestamp(o.createddate), 'Mon')");
            groupByColumns.push("EXTRACT(YEAR FROM to_timestamp(o.createddate))");

            let queryText = `
            SELECT
                ${selectedColumns.join(', ')}
            FROM orders AS o
            JOIN product_revo AS p ON o.productid = p.id
            WHERE ${whereClauses.join(' AND ')}
        `;

            if (groupByColumns.length > 0) {
                queryText += `
                GROUP BY ${groupByColumns.join(', ')}
            `;
            }

            const result = await query(queryText, queryParams);

            return result.rows;

        } catch (error) {
            console.error("Error in getDynamicGroupbyValueData2", error.message);
            return { error: { errorMessage: error.message, errorDetails: [], statusCode: 404 } };
        }
    };

    export const getOrderStstusDashboardAmountQuantityData = async (querydata) => {
        try {
            const { data, orderstatus } = querydata;

            const dateRange = data ? data.split(',') : [];
            let startEpoch = 0;
            let endEpoch = 0;

            if (dateRange.length === 2) {
                ({ startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange));
            } else {
                throw new Error('Invalid date range.');
            }

            const allStatuses = ['ordered', 'ready_to_dispatch', 'returned', 'delivered', 'cancelled', 'dispatched'];

            let statusesToInclude;
            if (Array.isArray(orderstatus)) {
                statusesToInclude = orderstatus.filter(status => allStatuses.includes(status));
            } else if (orderstatus === 'all') {
                statusesToInclude = allStatuses;
            } else if (allStatuses.includes(orderstatus)) {
                statusesToInclude = [orderstatus];
            } else {
                throw new Error('Invalid orderstatus value(s)');
            }

            const formatColumnName = (name) => {
                return name.split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            };

            const selectClauses = statusesToInclude.flatMap(status => [
                `COALESCE(SUM(CASE WHEN o.orderstatus = '${status}' THEN o.orderamount ELSE 0 END), 0) AS "${formatColumnName(status)} Amount"`,
                `COALESCE(SUM(CASE WHEN o.orderstatus = '${status}' THEN o.quantity ELSE 0 END), 0) AS "${formatColumnName(status)} Quantity"`
            ]);

            if (statusesToInclude.length === allStatuses.length) {
                selectClauses.push(
                    `COALESCE(SUM(o.orderamount), 0) AS "Total Amount"`,
                    `COALESCE(SUM(o.quantity), 0) AS "Total Quantity"`
                );
            }

            let queryText = `
                WITH date_series AS (
                    SELECT generate_series(
                        date_trunc('month', to_timestamp($1)),
                        date_trunc('month', to_timestamp($2)) + '1 month'::interval - '1 day'::interval,
                        '1 month'::interval
                    ) AS month_start
                )
                SELECT
                    TO_CHAR(ds.month_start, 'Mon') AS "Month",
                    EXTRACT(YEAR FROM ds.month_start) AS "Year",
                    ${selectClauses.join(',\n                ')}
                FROM
                    date_series ds
                LEFT JOIN
                    orders AS o ON date_trunc('month', to_timestamp(o.createddate)) = ds.month_start
                    AND o.orderstatus IN (${statusesToInclude.map((_, i) => `$${i + 3}`).join(', ')})
                WHERE
                    ds.month_start < date_trunc('month', to_timestamp($2))
                GROUP BY
                    ds.month_start
                ORDER BY
                    ds.month_start
            `;

            const queryParams = [startEpoch, endEpoch, ...statusesToInclude];

            const result = await query(queryText, queryParams);
            const formattedResult = result.rows.map(row => {
                const newRow = {};
                for (let [key, value] of Object.entries(row)) {
                    if (key != 'Month') {
                        value = Number(value)
                    }
                    else {
                        value = value
                    }
                    if (key != 'Year') {
                        newRow[formatColumnName(key)] = value;
                    }
                }
                return newRow;
            });

            let formattedResult1 = [Object.keys(formattedResult[0])]
            formattedResult.forEach((e) => {
                formattedResult1.push(Object.values(e))
            })
            return formattedResult1;
        } catch (error) {
            console.error("Error in getOrderStsDashboardAmountQuantity", error.message);
            return { error: { errorMessage: error.message, errorDetails: [], statusCode: 404 } };
        }
    };


    export const getOrderStstusDashboardQuantityData = async (querydata) => {
        try {
            const { data, orderstatus } = querydata;

            const dateRange = data ? data.split(',') : [];
            let startEpoch = 0;
            let endEpoch = 0;

            if (dateRange.length === 2) {
                ({ startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange));
            } else {
                throw new Error('Invalid date range.');
            }

            const allStatuses = ['ordered', 'ready_to_dispatch', 'returned', 'delivered', 'cancelled', 'dispatched'];

            let statusesToInclude;
            if (Array.isArray(orderstatus)) {
                statusesToInclude = orderstatus.filter(status => allStatuses.includes(status));
            } else if (orderstatus === 'all') {
                statusesToInclude = allStatuses;
            } else if (allStatuses.includes(orderstatus)) {
                statusesToInclude = [orderstatus];
            } else {
                throw new Error('Invalid orderstatus value(s)');
            }

            const formatColumnName = (name) => {
                return name.split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            };

            const selectClauses = statusesToInclude.flatMap(status => [
                `COALESCE(SUM(CASE WHEN ol.orderstatus = '${status}' THEN ol.quantity ELSE 0 END), 0) AS "${formatColumnName(status)} Quantity"`
            ]);

            if (statusesToInclude.length === allStatuses.length) {
                selectClauses.push(
                    `COALESCE(SUM(ol.quantity), 0) AS "Total Quantity"`
                );
            }

            let queryText = `
                WITH date_series AS (
                    SELECT generate_series(
                        date_trunc('month', to_timestamp($1)),
                        date_trunc('month', to_timestamp($2)) + '1 month'::interval - '1 day'::interval,
                        '1 month'::interval
                    ) AS month_start
                )
                SELECT
                    TO_CHAR(ds.month_start, 'Mon') AS "Month",
                    EXTRACT(YEAR FROM ds.month_start) AS "Year",
                    ${selectClauses.join(',\n                ')}
                FROM
                    date_series ds
                LEFT JOIN
                    orderline AS ol ON date_trunc('month', to_timestamp(ol.createddate)) = ds.month_start
                AND ol.orderstatus IN (${statusesToInclude.map((_, i) => `$${i + 3}`).join(', ')})
                WHERE
                    ds.month_start <= date_trunc('month', to_timestamp($2)) 
                GROUP BY
                    ds.month_start
                ORDER BY
                    ds.month_start
            `;

            const queryParams = [startEpoch, endEpoch, ...statusesToInclude];

            const result = await query(queryText, queryParams);

            const headerRow = ['Month', ...statusesToInclude.map(status => `${formatColumnName(status)} Quantity`)];
            if (statusesToInclude.length === allStatuses.length) {
                headerRow.push('Total Quantity');
            }

            const dataRows = result.rows.map(row => {
                const rowData = [row.Month];
                statusesToInclude.forEach(status => {
                    const columnName = `${formatColumnName(status)} Quantity`;
                    rowData.push(Number(row[columnName]) || 0); 
                });
                if (statusesToInclude.length === allStatuses.length) {
                    rowData.push(Number(row['Total Quantity']) || 0);
                }
                return rowData;
            });

            const finalResult = [headerRow, ...dataRows];
            return finalResult;

        } catch (error) {
            console.error("Error in getOrderStstusDashboardQuantityData", error.message);
            return { error: { errorMessage: error.message, errorDetails: [], statusCode: 404 } };
        }

        // API - /dashboard/quantity?data=2023-july,2024-september&orderstatus=all

    };

    export const getCountDashboardData = async (querydata: Record<string, string | string[]>, params: { objectName: string }) => {
        try {
            const { data, ...filters } = querydata;
            const { objectName } = params;

            let countlabel: string;
            if (objectName === 'stock_revo') {
                countlabel = 'stockcount';
            } else if (objectName === 'product_revo') {
                countlabel = 'product';
            } else {
                countlabel = objectName;
            }

            const dateRange = data ? (data as string).split(',') : [];
            let startEpoch = 0;
            let endEpoch = 0;

            if (dateRange.length === 2) {
                ({ startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange));
            } else {
                throw new Error('Invalid date range.');
            }

            const getAllFieldNames = async () => {
                const queryText = `SELECT column_name FROM information_schema.columns WHERE table_name = $1;`;
                const result = await query(queryText, [objectName]);
                return result.rows.map(row => row.column_name);
            };

            const allFieldNames = await getAllFieldNames();

            const formatColumnName = (name: string) => {
                return name.split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            };

            let selectClauses: string[] = [];
            let whereClauses: string[] = [];
            let queryParams: (string | number)[] = [startEpoch, endEpoch];

            Object.entries(filters).forEach(([key, value]) => {
                if (allFieldNames.includes(key)) {
                    if (value === 'all') {
                        selectClauses.push(`COALESCE(COUNT(id) FILTER (WHERE ${key} IS NOT NULL), 0) AS "${formatColumnName(key)} Count"`);
                    } else if (Array.isArray(value)) {
                        value.forEach(v => {
                            selectClauses.push(`COALESCE(COUNT(id) FILTER (WHERE ${key} = $${queryParams.length + 1}), 0) AS "${formatColumnName(key)} ${v} Count"`);
                            whereClauses.push(`${key} = $${queryParams.length + 1}`);
                            queryParams.push(v);
                        });
                    } else if (typeof value === 'string') {
                        selectClauses.push(`COALESCE(COUNT(id) FILTER (WHERE ${key} = $${queryParams.length + 1}), 0) AS "${formatColumnName(key)} ${value} Count"`);
                        whereClauses.push(`${key} = $${queryParams.length + 1}`);
                        queryParams.push(value);
                    }
                }
            });

            if (selectClauses.length === 0) {
                selectClauses.push(`COALESCE(COUNT(id), 0) AS "Total ${countlabel} Count"`);
            }

            let queryText = `
  WITH RECURSIVE date_series AS (
    SELECT date_trunc('month', to_timestamp($1)) AS month_start
    UNION ALL
    SELECT date_trunc('month', month_start + interval '1 month')
    FROM date_series
    WHERE date_trunc('month', month_start + interval '1 month') <= date_trunc('month', to_timestamp($2))
  )
  SELECT 
    TO_CHAR(ds.month_start, 'Mon') AS "Month",
    EXTRACT(YEAR FROM ds.month_start) AS "Year",
    ${selectClauses.join(',\n ')}
  FROM date_series ds
  LEFT JOIN ${objectName} AS t ON date_trunc('month', to_timestamp(t.createddate)) = ds.month_start
    AND t.createddate >= $1 AND t.createddate <= $2
    ${whereClauses.length > 0 ? `AND (${whereClauses.join(' OR ')})` : ''}
  GROUP BY ds.month_start
  ORDER BY ds.month_start
`;
 

            const result = await query(queryText, queryParams);

            const formattedResult = result.rows.map(row => {
                const newRow: Record<string, string | number> = {};
                for (const [key, value] of Object.entries(row)) {
                    if (key === 'Month' || key === 'Year') {
                        newRow[formatColumnName(key)] = value as string;
                    } else {
                        newRow[formatColumnName(key)] = parseInt(value as string, 10);
                    }
                }
                return newRow;
            });
            formattedResult.pop()
            return formattedResult;
        } catch (error) {
            console.error("Error in getCountDashboardData", error.message);
            return { error: { errorMessage: error.message, errorDetails: [], statusCode: 404 } };
        }
    };

    export const getTicketCountDashboardData = async (querydata) => {
        try {
            const { data, ticketstatus } = querydata;

            const dateRange = data ? data.split(',') : [];
            if (dateRange.length !== 2) {
                throw new Error('Invalid date range.');
            }
            const { startEpoch, endEpoch } = convertDateRangeToEpoch(dateRange);

            const allStatuses = [
                'waiting_for_cost_estimation_approval', 'out_for_delivery', 'new',
                'testing_in_progress', 'service_in_progress', 'waiting_for_spare',
                'open', 'closed'
            ];

            let statusesToInclude;
            if (Array.isArray(ticketstatus)) {
                statusesToInclude = ticketstatus.filter(status => allStatuses.includes(status));
            } else if (ticketstatus === 'all') {
                statusesToInclude = allStatuses;
            } else if (allStatuses.includes(ticketstatus)) {
                statusesToInclude = [ticketstatus];
            } else {
                throw new Error('Invalid ticketstatus value(s)');
            }

            const formatColumnName = (name) => name
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            const selectClauses = statusesToInclude.map((status, i) =>
                `COUNT(CASE WHEN o.ticketstatus = $${i + 3} THEN 1 ELSE NULL END) AS "${formatColumnName(status)} Count"`
            );

            if (statusesToInclude.length === allStatuses.length) {
                selectClauses.push('COUNT(o.id) AS "Total Count"');
            }

            const queryText = `
                WITH date_series AS (
                    SELECT generate_series(
                        date_trunc('month', to_timestamp($1)),
                        date_trunc('month', to_timestamp($2)) + '1 month'::interval - '1 day'::interval,
                        '1 month'::interval
                    ) AS month_start
                )
                SELECT
                    TO_CHAR(ds.month_start, 'Mon') AS "Month",
                    EXTRACT(YEAR FROM ds.month_start) AS "Year",
                    ${selectClauses.join(',\n                ')}
                FROM
                    date_series ds
                LEFT JOIN
                    tickets AS o ON date_trunc('month', to_timestamp(o.createddate)) = ds.month_start
                    AND o.ticketstatus IN (${statusesToInclude.map((_, i) => `$${i + 3}`).join(', ')})
                WHERE
                    ds.month_start BETWEEN date_trunc('month', to_timestamp($1)) AND date_trunc('month', to_timestamp($2))
                GROUP BY
                    ds.month_start
                ORDER BY
                    ds.month_start
            `;

            const queryParams = [startEpoch, endEpoch, ...statusesToInclude];

            const result = await query(queryText, queryParams);
            result.rows.pop()


            const formattedResult: any[] = [];

            result.rows.forEach(row => {
                statusesToInclude.forEach(status => {
                    const formattedStatus = formatColumnName(status);
                    formattedResult.push([
                        formattedStatus,
                        row["Month"],
                        Number(row[`${formattedStatus} Count`] || 0)]);
                });
            });
            formattedResult.unshift(['Ticket Status', 'Month', 'Count'])
            return formattedResult;

            // API - /dashboard/ticket-count?data=2024-july,2024-july&ticketstatus=all
        } catch (error) {
            console.error("Error in getTicketCountDashboardData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

    export const getEpochTicketCountDashboardData = async (querydata) => {
        try {
            const { date, ticketstatus } = querydata;
            if (!date) {
                throw new Error('Date parameter is required.');
            }

            const epochdate = date.split('-');
            if (epochdate.length !== 2) {
                throw new Error('Invalid date format. Expected format: smallepoch-greatepoch');
            }

            const fromEpoch = parseInt(epochdate[0], 10);
            const toEpoch = parseInt(epochdate[1], 10);

            if (isNaN(fromEpoch) || isNaN(toEpoch)) {
                throw new Error('Invalid epoch values.');
            }

            if (fromEpoch > toEpoch) {
                throw new Error('From epoch cannot be greater than to epoch.');
            }

            const allStatuses = [
                'new', 'open', 'testing_in_progress', 'waiting_for_cost_estimation_approval',
                'service_in_progress', 'waiting_for_spare', 'resolved_closed',
                'unresolved_closed', 'out_for_delivery', 'reopened_ticket'
            ]

            let statusesToInclude;
            if (Array.isArray(ticketstatus)) {
                statusesToInclude = ticketstatus.filter(status => allStatuses.includes(status));
            } else if (ticketstatus === 'all') {
                statusesToInclude = allStatuses;
            } else if (allStatuses.includes(ticketstatus)) {
                statusesToInclude = [ticketstatus];
            } else {
                throw new Error('Invalid ticketstatus value(s)');
            }

            const formatColumnName = (name) => name
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            const selectClauses = statusesToInclude.map((status, i) =>
                `COUNT(CASE WHEN o.ticketstatus = $${i + 3} THEN 1 ELSE NULL END) AS "${formatColumnName(status)} Count"`
            );

            if (statusesToInclude.length === allStatuses.length) {
                selectClauses.push('COUNT(o.id) AS "Total Count"');
            }

            const queryText = `
                SELECT
                    ${selectClauses.join(',\n                ')}
                FROM
                    tickets AS o
                WHERE
                    to_timestamp(o.createddate) BETWEEN to_timestamp($1) AND to_timestamp($2)
                    AND o.ticketstatus IN (${statusesToInclude.map((_, i) => `$${i + 3}`).join(', ')})
            `;

            const queryParams = [fromEpoch, toEpoch, ...statusesToInclude];

            const result = await query(queryText, queryParams);

            const formattedResult: [string, number | string][] = [];

            if (result.rows.length > 0) {
                const row = result.rows[0];

                statusesToInclude.forEach(status => {
                    const formattedStatus = formatColumnName(status);
                    formattedResult.push([
                        formattedStatus,
                        Number(row[`${formattedStatus} Count`] || 0)
                    ]);
                });

                if (statusesToInclude.length === allStatuses.length) {
                    formattedResult.push([
                        'Total Count',
                        Number(row['Total Count'] || 0)
                    ]);
                }
            }

            formattedResult.unshift(['Ticket Status', 'Count']);
            return formattedResult;

        } catch (error) {
            console.error("Error in getEpochTicketCountDashboardData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }

        // API - /dashboard/epoch-ticket-count?date=1704067200-1726230525&ticketstatus=all
    };

    export const getEpochTicketCountLocationBasedData = async (querydata) => {
        try {
            const { date, ticketstatus, location,role } = querydata;

            if (!date) {
                throw new Error('Date parameter is required.');
            }

            const epochdate = date.split('-');
            if (epochdate.length !== 2) {
                throw new Error('Invalid date format. Expected format: smallepoch-greatepoch');
            }

            const fromEpoch = parseInt(epochdate[0], 10);
            const toEpoch = parseInt(epochdate[1], 10);

            if (isNaN(fromEpoch) || isNaN(toEpoch)) {
                throw new Error('Invalid epoch values.');
            }

            if (fromEpoch > toEpoch) {
                throw new Error('From epoch cannot be greater than to epoch.');
            }

            const allStatuses = [
                'new', 'open', 'testing_in_progress', 'waiting_for_cost_estimation_approval',
                'service_in_progress', 'waiting_for_spare', 'resolved_closed',
                'unresolved_closed', 'out_for_delivery', 'reopened_ticket'
            ]

            let statusesToInclude;
            if (Array.isArray(ticketstatus)) {
                statusesToInclude = ticketstatus.filter(status => allStatuses.includes(status));
            } else if (ticketstatus === 'all') {
                statusesToInclude = allStatuses;
            } else if (allStatuses.includes(ticketstatus)) {
                statusesToInclude = [ticketstatus];
            } else {
                throw new Error('Invalid ticketstatus value(s)');
            }

            const formatColumnName = (name) => name
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            const selectClauses = statusesToInclude.map((status, i) =>
                `COUNT(CASE WHEN o.ticketstatus = $${i + 3} THEN 1 ELSE NULL END) AS "${formatColumnName(status)} Count"`
            );

            if (statusesToInclude.length === allStatuses.length) {
                selectClauses.push('COUNT(o.id) AS "Total Count"');
            }

            let queryText = `
                SELECT
                    ${selectClauses.join(',\n                ')}
                FROM
                    tickets AS o
                WHERE
                    to_timestamp(o.createddate) BETWEEN to_timestamp($1) AND to_timestamp($2)
            `;

            const queryParams = [fromEpoch, toEpoch, ...statusesToInclude];

            if (location) {
                queryText += ` AND o.location = $${queryParams.length + 1}`;
                queryParams.push(location);
            }

            queryText += ` AND o.ticketstatus IN (${statusesToInclude.map((_, i) => `$${i + 3}`).join(', ')})`;

            const result = await query(queryText, queryParams);

            const formattedResult = [];

            if (result.rows.length > 0) {
                const row = result.rows[0];

                statusesToInclude.forEach(status => {
                    const formattedStatus = formatColumnName(status);
                    formattedResult.push([
                        formattedStatus,
                        Number(row[`${formattedStatus} Count`] || 0)
                    ]);
                });

                if (statusesToInclude.length === allStatuses.length) {
                    formattedResult.push([
                        'Total Count',
                        Number(row['Total Count'] || 0)
                    ]);
                }
            }

            formattedResult.unshift(['Ticket Status', 'Count']);
            return formattedResult;

        } catch (error) {
            console.error("Error in getEpochTicketCountLocationBasedData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }

        // API - /dashboard/epoch-ticket-count/location?date=1704067200-1726230525&ticketstatus=all&location=head_office
    };

    export const getProductStatusCountDashboardData = async (querydata) => {
        try {
            const { productstatus } = querydata;

            const allStatuses = ['low_stock', 'out_of_stock', 'in_stock'];

            let selectClauses;
            if (Array.isArray(productstatus)) {
                const validStatuses = productstatus.filter(status => allStatuses.includes(status));
                if (validStatuses.length === 0) {
                    throw new Error('Invalid productstatus value(s)');
                }

                selectClauses = validStatuses.map(status =>
                    `COUNT(id) FILTER (WHERE productstatus = '${status}') AS ${status}`
                );
            } else if (productstatus === 'all') {
                selectClauses = allStatuses.map(status =>
                    `COUNT(id) FILTER (WHERE productstatus = '${status}') AS ${status}`
                );
            } else if (allStatuses.includes(productstatus)) {
                selectClauses = [
                    `COUNT(id) FILTER (WHERE productstatus = '${productstatus}') AS ${productstatus}`
                ];
            } else {
                throw new Error('Invalid productstatus value(s)');
            }

            const queryText = `
                SELECT
                    ${selectClauses.join(',\n                ')}
                FROM
                    product_revo
            `;

            const result = await query(queryText, []);

            const formatColumnName = (name) => name
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            const formattedResult = [];
            selectClauses.forEach(clause => {
                const match = clause.match(/AS (\w+)$/);
                if (match) {
                    const status = match[1];
                    const formattedStatus = formatColumnName(status);
                    const count = result.rows[0][status];
                    formattedResult.push([
                        formattedStatus,
                        Number(count || 0)
                    ]);
                }
            });

            formattedResult.unshift(['Status', 'Count']);
            return formattedResult;

            // API - /dashboard/product-count?productstatus=all

        } catch (error) {
            console.error("Error in getProductStatusCountDashboardData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

    export const getTodayTicketPriorityCountData = async (querydata) => {
        try {
            const { ticketpriority } = querydata;

            const allPriorities = ['high', 'low'];

            let selectClauses;
            if (Array.isArray(ticketpriority)) {
                const validPriorities = ticketpriority.filter(p => allPriorities.includes(p));
                if (validPriorities.length === 0) {
                    throw new Error('Invalid ticketpriority value(s)');
                }

                selectClauses = validPriorities.map(p =>
                    `COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP) AND lower(ticketpriority) = '${p}') AS ${p}`
                );
            } else if (ticketpriority === 'all') {
                selectClauses = allPriorities.map(p =>
                    `COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP) AND lower(ticketpriority) = '${p}') AS ${p}`
                );
                selectClauses.push(`COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP)) AS total`);
            } else if (allPriorities.includes(ticketpriority)) {
                selectClauses = [
                    `COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP) AND lower(ticketpriority) = '${ticketpriority}') AS ${ticketpriority}`
                ];
            } else {
                throw new Error('Invalid ticketpriority value(s)');
            }

            const queryText = `
                SELECT
                    ${selectClauses.join(',\n                ')}
                FROM
                    tickets
            `;

            const result = await query(queryText, []);

            const formatColumnName = (name) => name
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            const formattedResult = [];
            selectClauses.forEach(clause => {
                const match = clause.match(/AS (\w+)$/);
                if (match) {
                    const status = match[1];
                    const formattedStatus = formatColumnName(status);
                    const count = result.rows[0][status];
                    formattedResult.push([
                        formattedStatus,
                        Number(count || 0)
                    ]);
                }
            });

            formattedResult.unshift(['Priority', 'Count']);
            return formattedResult;

            // API - /dashboard/today-ticket?priority=all

        } catch (error) {
            console.error("Error in getTodayTicketPriorityCountData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

    export const getTodayTicketTypeCountData = async (querydata) => {
        try {
            const { tickettype } = querydata;

            const allTypes = ['Repair Non Purchased', 'Product Issue', 'Payment Issue', 'Tracking Issue', 'Repair Purchased'];

            let selectClauses;
            if (Array.isArray(tickettype)) {
                const validTypes = tickettype.filter(p => allTypes.includes(p));
                if (validTypes.length === 0) {
                    throw new Error('Invalid tickettype value(s)');
                }

                selectClauses = validTypes.map(p =>
                    `COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP) AND lower(tickettype) = '${p.toLowerCase()}') AS "${p}"`
                );
            } else if (tickettype === 'all') {
                selectClauses = allTypes.map(p =>
                    `COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP) AND lower(tickettype) = '${p.toLowerCase()}') AS "${p}"`
                );
                selectClauses.push(`COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP)) AS "total"`);
            } else if (allTypes.includes(tickettype)) {
                selectClauses = [
                    `COUNT(id) FILTER (WHERE date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP) AND lower(tickettype) = '${tickettype.toLowerCase()}') AS "${tickettype}"`
                ];
            } else {
                throw new Error('Invalid tickettype value');
            }

            const queryText = `
                SELECT
                    ${selectClauses.join(',\n                ')}
                FROM
                    tickets
                WHERE
                    date_trunc('day', to_timestamp(createddate)) = date_trunc('day', CURRENT_TIMESTAMP)
            `;

            const result = await query(queryText, []);
            const formatColumnName = (name) => name
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

            const formattedResult = [];
            selectClauses.forEach(clause => {
                const match = clause.match(/AS "([^"]+)"/);
                if (match) {
                    const status = match[1];
                    const formattedStatus = formatColumnName(status);
                    const count = result.rows[0][status];
                    formattedResult.push([
                        formattedStatus,
                        Number(count || 0)
                    ]);
                }
            });

            formattedResult.unshift(['Type', 'Count']);
            return formattedResult;
            // API - /dashboard/today-tickettype?tickettype=all
        } catch (error) {
            console.error("Error in getTodayTicketTypeCountData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

    export const getAvailableCountTotalData = async () => {
        try {
            const queryText = `
                SELECT s.category,
                       s.subcategory,
                       COUNT(s.id) AS total_count,
                       SUM(p.price) AS total
                FROM stock_revo AS s
                JOIN product_revo AS p ON s.puc = p.puc
                WHERE s.isarchive = FALSE
                  AND s.isdeleted = FALSE
                  AND s.removefromrecyclebin = FALSE
                  AND s.stockstatus = 'Available'
                GROUP BY s.category, s.subcategory;
            `;

            const result = await query(queryText, []);
            // Predefined categories
            const categories = [
                'New Laptop',
                'Refurbished Laptop',
                'New Mobile Phone',
                'Refurbished Mobile Phone',
                'New Accessories',
                'Refurbished Accessories'
            ];

            // Function to format result based on category and subcategory
            const formattedResult = categories.map(category => {
                const [cat, subcat] = category.split(' ');

                // Find the matching row from result.rows
                const row = result.rows.find(r =>
                    r.category.toLowerCase() === cat.toLowerCase() &&
                    r.subcategory.toLowerCase() === subcat.toLowerCase()
                );

                // Format the result, defaulting to 0 if no match is found
                return [
                    category,
                    Number(row?.total_count || 0),
                    Number(row?.total || 0)        
                ];
            });

            formattedResult.unshift(['Category', 'Quantity', 'Total Amount']);

            return formattedResult;

        } catch (error) {
            console.error("Error in getAvailableCountTotalData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };


    export const getAvailableCountTotalLocationBasedData = async (querydata) => {
        try {
            const { location } = querydata;
            if (!location) {
                throw new Error('Location parameter is required.');
            }

            const queryText = `
                SELECT s.category,
                       s.subcategory,
                       SUM(s.total_count * p.price) AS total
                FROM (
                    SELECT s.category,
                           s.subcategory,
                           s.puc,
                           COUNT(s.id) AS total_count
                    FROM stock_revo AS s
                    WHERE s.isarchive = FALSE
                      AND s.location = $1
                      AND s.isdeleted = FALSE
                      AND s.removefromrecyclebin = FALSE
                      AND s.stockstatus = 'Available'
                    GROUP BY s.category, s.subcategory, s.puc
                ) AS s
                JOIN product_revo AS p
                ON p.puc = s.puc
                GROUP BY s.category, s.subcategory;
            `;

            const result = await query(queryText, [location]);

            const categories = [
                'new laptop',
                'refurbished laptop',
                'new mobile_phone',
                'refurbished mobile_phone',
                'new accessories',
                'refurbished accessories'
            ];

            const formatCategoryName = (category) => {
                return category
                    .replace('_', ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
            };

            // Format the final result
            const formattedResult = categories.map(category => {
                const [cat, subcat] = category.split(' ');
                const row = result.rows.find(r =>
                    r.category.toLowerCase() === cat.toLowerCase() &&
                    r.subcategory.toLowerCase() === subcat.toLowerCase()
                );

                const formattedCategory = formatCategoryName(category);

                return [
                    formattedCategory,
                    Number(row?.total || 0) 
                ];
            });

            formattedResult.unshift(['Category', 'Total Value']);

            return formattedResult;

        } catch (error) {
            console.error("Error in getAvailableCountTotalLocationBasedData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };



    export const getAvailableCountData = async () => {
        try {
            const queryText = `
                SELECT
                    count(id) FILTER (WHERE category = 'new' AND subcategory = 'laptop' AND stockstatus = 'Available' and isdeleted = FALSE and isarchive = FALSE and removefromrecyclebin = FALSE) AS new_laptop_quantity,
                    count(id) FILTER (WHERE category = 'refurbished' AND subcategory = 'laptop' AND stockstatus = 'Available' and isdeleted = FALSE and isarchive = FALSE and removefromrecyclebin = FALSE) AS refurbished_laptop_quantity,
                    count(id) FILTER (WHERE category = 'new' AND subcategory = 'mobile_phone' AND stockstatus = 'Available' and isdeleted = FALSE and isarchive = FALSE and removefromrecyclebin = FALSE) AS new_mobile_phone_quantity,
                    count(id) FILTER (WHERE category = 'refurbished' AND subcategory = 'mobile_phone' AND stockstatus = 'Available' and isdeleted = FALSE and isarchive = FALSE and removefromrecyclebin = FALSE) AS refurbished_mobile_phone_quantity,
                    count(id) FILTER (WHERE category = 'new' AND subcategory = 'accessories' AND stockstatus = 'Available' and isdeleted = FALSE and isarchive = FALSE and removefromrecyclebin = FALSE) AS new_accessories_quantity,
                    count(id) FILTER (WHERE category = 'refurbished' AND subcategory = 'accessories' AND stockstatus = 'Available' and isdeleted = FALSE and isarchive = FALSE and removefromrecyclebin = FALSE) AS refurbished_accessories_quantity
                FROM
                    stock_revo
            `;

            const result = await query(queryText, []);

            const categories = [
                'New Laptop',
                'Refurbished Laptop',
                'New Mobile Phone',
                'Refurbished Mobile Phone',
                'New Accessories',
                'Refurbished Accessories'
            ];

            const formattedResult = categories.map(category => {
                const snakeCase = category.toLowerCase().replace(/ /g, '_');
                return [
                    category,
                    Number(result.rows[0][`${snakeCase}_quantity`] || 0),
                ];
            });

            formattedResult.unshift(['Category', 'Quantity']);
            return formattedResult;

            // API - /dashboard/avalible/count-quantity

        } catch (error) {
            console.error("Error in getAvalibleCountData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };


    export const getAvailableCountDatalocation = async (querydata) => {
        try {
            const { location } = querydata;

            if (!location) {
                throw new Error('Location parameter is required.');
            }

            const queryText = `
                SELECT 
                    COUNT(id) as total_stock_count,
                    category,
                    subcategory
                FROM stock_revo 
                WHERE location = $1
                    AND stockstatus = 'Available'
                    AND isdeleted = FALSE 
                    AND isarchive = FALSE 
                    AND removefromrecyclebin = FALSE
                GROUP BY category, subcategory
            `;
            const result = await query(queryText, [location]);

            const categories = [
                'new laptop',
                'refurbished laptop',
                'new mobile_phone',
                'refurbished mobile_phone',
                'new accessories',
                'refurbished accessories'
            ];

            const formatCategoryName = (category) => {
                return category
                    .replace('_', ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join(' ');
            };

            const formattedResult = categories.map(category => {
                const [cat, subcat] = category.split(' ');
                const row = result.rows.find(r =>
                    r.category.toLowerCase() === cat &&
                    r.subcategory.toLowerCase() === subcat
                );

                const formattedCategory = formatCategoryName(category);
                return [
                    formattedCategory,
                    Number(row?.total_stock_count || 0)
                ];
            });

            formattedResult.unshift(['Category', 'Total Stock Count']);
            return formattedResult;

        } catch (error) {
            console.error("Error in getAvailableCountDatalocation:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }

        // API - /dashboard/available/quantity/location?location=head_office
    };

    export const getRevenueQuarterData = async (querydata) => {
        try {
            const { data } = querydata;

            const queryText = `
                SELECT
                    CASE
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 1 AND 3 THEN 'Jan - Mar'
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 4 AND 6 THEN 'Apr - Jun'
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 7 AND 9 THEN 'Jul - Sep'
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 10 AND 12 THEN 'Oct - Dec'
                    END AS quarter,
                    SUM(orderamount) AS total_revenue
                FROM
                    orderline o
                WHERE
                    EXTRACT(YEAR FROM to_timestamp(o.createddate)) = $1
                    AND o.orderstatus = 'delivered'
                GROUP BY
                    quarter
                ORDER BY
                    quarter;
            `;

            const result = await query(queryText, [data]);

            const quarters = ['Jan - Mar', 'Apr - Jun', 'Jul - Sep', 'Oct - Dec'];

            const formattedResult = quarters.map(quarter => {
                return [
                    quarter,
                    Number(result.rows.find(row => row.quarter === quarter)?.total_revenue || 0)
                ];
            });

            formattedResult.unshift(['Quarter', 'Total Revenue']);
            return formattedResult;
            // API - /dashboard/revenue?data=2024            
        } catch (error) {
            console.error("Error in getRevenueQuarterData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

    export const getRevenueQuarterDataLocation = async (querydata) => {
        try {
            const { data, location } = querydata;

            const queryText = `
                SELECT
                    CASE
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 1 AND 3 THEN 'Jan - Mar'
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 4 AND 6 THEN 'Apr - Jun'
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 7 AND 9 THEN 'Jul - Sep'
                        WHEN EXTRACT(MONTH FROM to_timestamp(o.createddate)) BETWEEN 10 AND 12 THEN 'Oct - Dec'
                    END AS quarter,
                    SUM(orderamount) AS total_revenue
                FROM
                    orderline o
                WHERE
                    EXTRACT(YEAR FROM to_timestamp(o.createddate)) = $1
                    AND o.orderstatus = 'delivered' AND o.deliveryfrom = '${location}'
                GROUP BY
                    quarter
                ORDER BY
                    quarter;
            `;
            const result = await query(queryText, [data]);

            const quarters = ['Jan - Mar', 'Apr - Jun', 'Jul - Sep', 'Oct - Dec'];

            const formattedResult = quarters.map(quarter => {
                return [
                    quarter,
                    Number(result.rows.find(row => row.quarter === quarter)?.total_revenue || 0)
                ];
            });

            formattedResult.unshift(['Quarter', 'Total Revenue']);
            return formattedResult;
        } catch (error) {
            console.error("Error in getRevenueQuarterDataLocation:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

    export const getInvoiceData = async () => {
        try {
            const queryText = `
                SELECT 
                    p.ponumber,
                    p.suppliercompanyname,
                    p.suppliergstnumber,
                    i.invoiceamount, 
                    (i.invoiceamount - i.balanceamount) AS paidamount,
                    i.balanceamount,
                    to_char(to_timestamp(p.createddate), 'DD-Mon-YYYY') as pocreateddate,
                    to_char(to_timestamp(i.createddate), 'DD-Mon-YYYY') as invoicecreateddate
                FROM 
                    poinvoice AS i 
                JOIN 
                    purchaseorder AS p ON i.ponumber = p.ponumber
                ORDER BY 
                    pocreateddate ASC;
            `;

            const result = await query(queryText, []);

            return result.rows;

        } catch (error) {
            console.error("Error in getInvoiceData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }

        // API - /audit-file
    };

    export const getInvoiceDataDateBased = async (querydata) => {
        try {
            let { date } = querydata;
            let [startMonth, endMonth] = date.split(',');

            const monthMap = {
                'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
                'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
            };

            const parseDate = (dateString) => {
                let [year, month] = dateString.split('-');
                month = monthMap[month.trim().toLowerCase()] || month;
                month = month.toString().padStart(2, '0');
                return {
                    startDate: new Date(`${year}-${month}-01T00:00:00Z`).getTime() / 1000,
                    endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59)).getTime() / 1000
                };
            };

            const startRange = parseDate(startMonth);
            const endRange = parseDate(endMonth);

            let endDate = endRange.endDate;

            const queryText = `
                SELECT 
                    p.ponumber,
                    p.suppliercompanyname,
                    p.suppliergstnumber,
                    i.invoiceamount, 
                    (i.invoiceamount - i.balanceamount) AS paidamount,
                    i.balanceamount,
                    to_char(to_timestamp(p.createddate), 'DD-Mon-YYYY') as pocreateddate,
                    to_char(to_timestamp(i.createddate), 'DD-Mon-YYYY') as invoicecreateddate
                FROM 
                    poinvoice AS i 
                JOIN 
                    purchaseorder AS p ON i.ponumber = p.ponumber
                WHERE 
                    p.createddate >= $1 
                    AND p.createddate <= $2
                ORDER BY 
                    pocreateddate ASC;
            `;

            const result = await query(queryText, [startRange.startDate, endDate]);

            return result.rows;

        } catch (error) {
            console.error("Error in getInvoiceDataDateBased:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }

        // API - /audit-file/date?date=2024-july,2024-august
    };

    export const getSoldDetailsData = async (querydata) => {
        try {
            let { year, month } = querydata;

            const monthMap = {
                'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
                'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
            };

            if (typeof month === 'string') {
                month = month.trim().toLowerCase();
                month = monthMap[month] || month;
            }

            if (!year || !month || isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                throw new Error('Invalid year or month provided');
            }

            month = month.toString().padStart(2, '0');

            let startDate = (new Date(`${year}-${month}-01T00:00:00Z`).getTime()) / 1000;
            let endDate = (new Date(Date.UTC(year, month, 0, 23, 59, 59)).getTime()) / 1000;

            const sqlQuery = `
                SELECT p.productname, 
                       s.stockstatus, 
                       s.puc, 
                       p.price, 
                       DATE_PART('day', TO_TIMESTAMP(s.solddate)) AS day_of_month,
                       COUNT(s.id) AS soldcount, 
                       (p.price * COUNT(s.id)) AS total
                FROM stock_revo AS s 
                JOIN product_revo AS p ON s.puc = p.puc 
                WHERE s.stockstatus = 'Sold' 
                  AND s.solddate >= $1 
                  AND s.solddate <= $2
                GROUP BY p.productname, s.stockstatus, s.puc, p.price, day_of_month;
            `;

            const result = await query(sqlQuery, [startDate, endDate]);

            const formattedResults = result.rows.map(row => {
                const { day_of_month } = row;
                const day = day_of_month.toString().padStart(2, '0');
                const monthName = month.toString().padStart(2, '0');
                return {
                    ...row,
                    Date: `${day}-${monthName}-${year}`
                };
            });

            return formattedResults.map(({ day_of_month, ...rest }) => rest);

            // API - /dashboard/sold-details?year=2024&month=august

        } catch (error) {
            console.error("Error in getSoldDetailsData:", error.message);
            return { error: { errorMessage: error.message, statusCode: 404 } };
        }
    };

}
