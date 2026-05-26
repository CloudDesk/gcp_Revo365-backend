import { query } from "../database/postgres.js";
import { QueryResult } from "pg";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export module recordCountService {
  export const getRecordCount = async (objectName: string, request: any) => {
    try {
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);
      let whereClause = "";
      let whereClausearchive = "";
      let globalCount = false;
      let archieveCount = false;
      let archieveCountFilter = false;
      let recyclebin = false;
      let productecom = false;
      let parameterIndex = 1;
      const queryParams = [];
      let whereClauses = [];
      keys.forEach(async (key, index) => {
        if (
          key !== "globalSearch" &&
          key !== "Archive" &&
          key !== "archieveCountFilter" &&
          key !== "recyclebin" &&
          key !== "productecom"
        ) {
          const paramValues: any = Array.isArray(values[index])
            ? values[index]
            : [values[index]];
          if (
            key === "displaysize" ||
            key === "price" ||
            key === "createddate"
          ) {
            let rangeWhereClause = paramValues
              .map((range) => {
                const [lowerBound, upperBound] = range.split("-");
                queryParams.push(lowerBound, upperBound);
                const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
                  })`;
                parameterIndex += 2;
                return clause;
              })
              .join(" OR ");
            whereClauses.push(`(${rangeWhereClause})`);
          } else {
            whereClauses.push(
              `(${paramValues
                .map((_, idx) => `${key} = $${parameterIndex + idx}`)
                .join(" OR ")})`
            );
            queryParams.push(...paramValues);
            parameterIndex += paramValues.length;
          }
        } else if (key === "globalSearch") {
          globalCount = true;
        } else if (key === "Archive") {
          archieveCount = true;
        } else if (key === "recyclebin") {
          recyclebin = true;
        } else if (key === "productecom") {
          productecom = true;
        }
      });
      console.log(globalCount, " Global Count ");

      let getcount: QueryResult;
      console.log(whereClauses, "WHere Clauses");
      whereClause =
        whereClauses.length > 0 ? `${whereClauses.join(" AND ")}` : whereClause;
      console.log(whereClause, "----");
      if (whereClause && productecom === false) {
        if (objectName === "products") {
          let querystring = `select count(*) from ${objectName} where  (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND removefromrecyclebin = false  AND ${whereClause}`;
          getcount = await query(querystring, queryParams);
        } else {
          let querystring = `select count(*) from ${objectName} where removefromrecyclebin = false AND  ${whereClause}`;
          getcount = await query(querystring, queryParams);
        }
      } else if (whereClause && productecom) {
        if (objectName === "products") {
          let querystring = `select count(DISTINCT  puc) from ${objectName} where  (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND removefromrecyclebin = false AND ecompublish = TRUE  AND ${whereClause}`;
          getcount = await query(querystring, queryParams);
        } else {
          let querystring = `select count(DISTINCT  puc) from ${objectName} where  removefromrecyclebin = false AND ${whereClause}`;
          getcount = await query(querystring, queryParams);
        }
      } else if (archieveCount) {
        getcount = await query(
          `select count(*) from ${objectName} where isarchive = true AND removefromrecyclebin = false `,
          []
        );
      } else if (archieveCountFilter) {
        let querystring = `select count(*) from ${objectName} where isarchive = TRUE AND removefromrecyclebin = false AND ${whereClausearchive}`;
        getcount = await query(querystring, queryParams);
      } else if (recyclebin) {
        let querystring = `select count(*) from ${objectName} where isdeleted = TRUE AND removefromrecyclebin = false`;
        getcount = await query(querystring, queryParams);
      } else if (globalCount) {
        const result = await query(
          `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products';`,
          []
        );
        const searchQueries = result.rows.map(
          (row) =>
            `SELECT count(*) as ${row.table_name}_${row.column_name}_count FROM ${row.table_name} WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND removefromrecyclebin = false AND ${row.column_name}::text ILIKE $1`
        );
        const combinedSearchQuery = searchQueries.join(" UNION ALL ");
        const combinedSearchResult = await query(combinedSearchQuery, [
          `%${values}%`,
        ]);
        const totalCount = combinedSearchResult.rows.reduce((total, row) => {
          const count = parseInt(row[Object.keys(row)[0]]);
          return total + count;
        }, 0);
        console.log("Total record count:", totalCount);
        getcount = getcount = {
          rows: [
            {
              count: totalCount,
            },
          ],
        };
      } else {
        console.log("else");
        if (objectName === "products" && !productecom) {
          getcount = await query(
            `select count(*) from ${objectName} WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)`,
            []
          );
        } else if (objectName === "products" && productecom) {
          getcount = await query(
            `select count(DISTINCT puc) from ${objectName} WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND removefromrecyclebin = false AND ecompublish = TRUE`,
            []
          );
        } else if (objectName === "supplier") {
          getcount = await query(
            `select count(*) from ${objectName} WHERE (isdeleted = FALSE or isdeleted IS NULL)`,
            []
          );
        } else if (objectName === "cart") {
          getcount = await query(`select count(*) from ${objectName}`, []);
        } else if (objectName === "orders") {
          console.log("orders section");
          getcount = await query(`select count(*) from ${objectName}`, []);
        } else if (objectName === "stock") {
          console.log("stock section");
          getcount = await query(`select count(*) from ${objectName}`, []);
        }
        else if (objectName === "revoinvoice") {
          console.log("revoinvoice section");
          getcount = await query(`select count(*) from ${objectName}`, []);
          console.log("ObjectName", objectName)
        }
      }

      return getcount.rows[0].count;
    } catch (error) {
      console.error("Query Execution Error: IN getRecordCount", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const getRecordCountRevo = async (
    objectName: string,
    request: any
  ) => {
    try {
      const { query: queryParams } = request;
      const keys = Object.keys(queryParams);
      const values = Object.values(queryParams);
      console.log(objectName, "Object Name");

      const targetObj = objectName.toLowerCase().trim();
      const getCountQuery = async (queryStr: string, params: any[]) => {
        console.log(queryStr, "Count query string");
        const result: QueryResult = await query(queryStr, params);
        return result.rows[0].count;
      };

      // 🚨 Handle KUBB Tickets search specifically
      if (targetObj === "kubb_tickets") {
        const { search, searchTerm } = request.query;
        const finalSearch = search || searchTerm || "";
        if (finalSearch) {
          return await getCountQuery(
            `select count(*) from kubb_tickets WHERE name ILIKE $1 OR email ILIKE $1 OR phone::text ILIKE $1`,
            [`%${finalSearch}%`]
          );
        }
        // If no search, return total count for KUBB immediately
        return await getCountQuery(`select count(*) from kubb_tickets`, []);
      }

      if (targetObj === "buyback_enquiries") {
        const { search, searchTerm } = request.query;
        const finalSearch = search || searchTerm || "";
        if (finalSearch) {
          return await getCountQuery(
            `select count(*) from buyback_enquiries
             WHERE name ILIKE $1
                OR email ILIKE $1
                OR phone ILIKE $1
                OR device_type ILIKE $1
                OR device_model ILIKE $1
                OR status ILIKE $1`,
            [`%${finalSearch}%`]
          );
        }
        return await getCountQuery(`select count(*) from buyback_enquiries`, []);
      }

      let whereClause = "";
      let globalCount = false;
      let archieveCount = false;
      let recyclebin = false;
      let productecom = false;
      let ewaste = false;
      let parameterIndex = 1;
      const queryParamsList = [];
      const whereClauses = [];

      keys.forEach((key, index) => {
        // Skip custom search params that are handled above.
        if (
          (targetObj === "kubb_tickets" || targetObj === "buyback_enquiries") &&
          (key.toLowerCase() === "search" || key.toLowerCase() === "searchterm")
        ) {
          return;
        }

        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        console.log(key);
        if (
          ["displaysize", "price", "createddate", "delivereddate"].includes(key)
        ) {
          const rangeWhereClause = paramValues
            .map((range) => {
              const [lowerBound, upperBound] = range.split("-");
              queryParamsList.push(lowerBound, upperBound);
              const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
                })`;
              parameterIndex += 2;
              return clause;
            })
            .join(" OR ");
          whereClauses.push(`(${rangeWhereClause})`);
        } else if (
          ![
            "globalSearch",
            "Archive",
            "recyclebin",
            "productecom",
            "ewaste",
            "search",
            "searchTerm"
          ].includes(key)
        ) {
          const normalClauses = [];
          const notClauses = [];
          const nullClauses = [];
          paramValues.forEach((value: string) => {
            if (value.startsWith("NOT ") || value.startsWith("not ")) {
              const cleanValue = value.slice(4);
              notClauses.push(`${key} != $${parameterIndex}`);
              queryParamsList.push(cleanValue);
              parameterIndex++;
            } else if (value === "NULL" || value === "null") {
              nullClauses.push(`${key} IS NULL`);
            } else {
              normalClauses.push(`${key} = $${parameterIndex}`);
              queryParamsList.push(value);
              parameterIndex++;
            }
          });

          const combinedClauses = [
            ...normalClauses,
            ...notClauses,
            ...nullClauses,
          ];

          whereClauses.push(`(${combinedClauses.join(" OR ")})`);
        } else {
          if (key === "globalSearch") globalCount = true;
          if (key === "Archive") archieveCount = true;
          if (key === "recyclebin") recyclebin = true;
          if (key === "productecom") productecom = true;
          if (key === "ewaste") ewaste = true;
        }
      });
      console.log(archieveCount, "archive count");
      console.log(productecom, "PRoduct ecom is");
      whereClause = whereClauses.length > 0 ? whereClauses.join(" AND ") : "";
      console.log(objectName, "object Name is");
      console.log(objectName.toLowerCase(), "object name is ");
      console.log(whereClause, "where clause is ~");
      if (
        whereClause &&
        !productecom &&
        !archieveCount &&
        !recyclebin &&
        !globalCount &&
        !ewaste
      ) {
        console.log("1 st condition");
        const baseQuery = `select count(*) from ${objectName} where ${objectName.toLowerCase() === "product_revo" ||
          objectName.toLowerCase() === "stock_revo"
          ? "removefromrecyclebin = false AND "
          : ""
          } ${whereClause}`;
        const productsQuery = ` AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)`;
        let dat = await getCountQuery(
          objectName.toLowerCase() === "product_revo" ||
            objectName.toLowerCase() === "stock_revo"
            ? `${baseQuery}${productsQuery}`
            : baseQuery,
          queryParamsList
        );
        console.log(dat, "dat value");
        return dat;
      }

      if (whereClause && productecom) {
        console.log("2 nd condition");
        const baseQuery = `select count(*) from ${objectName} where removefromrecyclebin = false AND ${whereClause}`;
        const productsQuery = ` AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)`;
        return await getCountQuery(
          objectName.toLowerCase() === "product_revo" ||
            objectName.toLowerCase() === "stock_revo"
            ? `${baseQuery}${productsQuery}`
            : baseQuery,
          queryParamsList
        );
      }
      if (
        !whereClause &&
        productecom &&
        objectName.toLocaleLowerCase() === "stock_revo"
      ) {
        console.log("3rd condition");
        const baseQuery = `select count(*) from ${objectName} where removefromrecyclebin = false AND ecompublish = TRUE`;
        const productsQuery = ` AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)`;
        return await getCountQuery(
          objectName.toLocaleLowerCase() === "stock_revo"
            ? `${baseQuery}${productsQuery}`
            : baseQuery,
          queryParamsList
        );
      }
      if (
        (!whereClause && productecom) ||
        objectName.toLocaleLowerCase() === "product_revo"
      ) {
        console.log("4th condition");
        const baseQuery = `select count(*) from ${objectName} where removefromrecyclebin = false`;
        const productsQuery = ` AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL)`;
        return await getCountQuery(
          objectName.toLocaleLowerCase() === "product_revo"
            ? `${baseQuery}${productsQuery}`
            : baseQuery,
          queryParamsList
        );
      }
      if (
        !whereClause &&
        !productecom &&
        !archieveCount &&
        !recyclebin &&
        !globalCount &&
        !ewaste
      ) {
        console.log("5th condition");
        const baseQuery = `select count(*) from ${objectName} `;
        const productsQuery = ` where removefromrecyclebin = false AND (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND (ewaste = FALSE or ewaste IS NULL)`;
        return await getCountQuery(
          objectName.toLowerCase() === "product_revo" ||
            objectName.toLowerCase() === "stock_revo"
            ? `${baseQuery}${productsQuery}`
            : baseQuery,
          queryParamsList
        );
      }

      if (archieveCount) {
        console.log("inside archive count");
        console.log(queryParamsList, "query params list");
        return await getCountQuery(
          `select count(*) from ${objectName} where ${whereClause && whereClause.length > 0 ? whereClause + "AND" : ""
          } isarchive = true AND removefromrecyclebin = false`,
          queryParamsList
        );
      }

      if (recyclebin) {
        console.log("Inside recyclebin");
        return await getCountQuery(
          `select count(*) from ${objectName} where ${whereClause && whereClause.length > 0 ? whereClause + "AND" : ""
          } isdeleted = TRUE AND removefromrecyclebin = false`,
          queryParamsList
        );
      }
      if (ewaste) {
        console.log("Inside ewaste");
        return await getCountQuery(
          `select count(*) from ${objectName} where ${whereClause && whereClause.length > 0 ? whereClause + "AND" : ""
          } isdeleted = false AND removefromrecyclebin = false AND ewaste = TRUE`,
          queryParamsList
        );
      }
      if (globalCount) {
        const columnQuery = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_Revo';`;
        const columnsResult: QueryResult = await query(columnQuery, []);
        const searchQueries = columnsResult.rows.map(
          (row) =>
            `SELECT count(*) as ${row.table_name}_${row.column_name}_count FROM ${row.table_name} WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND removefromrecyclebin = false AND ${row.column_name}::text ILIKE $1`
        );
        const combinedSearchQuery = searchQueries.join(" UNION ALL ");
        const combinedSearchResult: QueryResult = await query(
          combinedSearchQuery,
          [`%${values}%`]
        );
        const totalCount = combinedSearchResult.rows.reduce(
          (total, row) => total + parseInt(row[Object.keys(row)[0]]),
          0
        );
        return totalCount;
      }

      const defaultQueries: { [key: string]: string } = {
        product_Revo: `select count(*) from ${"product_Revo"} WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`,
        supplier: `select count(*) from ${objectName} WHERE (isdeleted = FALSE or isdeleted IS NULL)`,
        cart: `select count(*) from ${objectName}`,
        orders: `select count(*) from ${objectName}`,
        stock_Revo: `select count(*) from ${objectName} WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`,
        kubb_tickets: `select count(*) from ${objectName}`,
        buyback_enquiries: `select count(*) from ${objectName}`,
      };

      if (productecom && objectName === "product_Revo") {
        return await getCountQuery(
          `select count(*) from ${objectName} WHERE (isarchive = FALSE or isarchive IS NULL) AND (isdeleted = FALSE or isdeleted IS NULL) AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`,
          []
        );
      }

      if (defaultQueries[objectName]) {
        return await getCountQuery(defaultQueries[objectName], []);
      }

      throw new Error("Unhandled case in getRecordCount");
    } catch (error) {
      console.error("Query Execution Error: IN getRecordCountRevo", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const getArchivefilterRecordCount = async (
    objectName: string,
    request: any
  ) => {
    try {
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);
      let whereClause = "";
      let parameterIndex = 1;
      const queryParams = [];
      keys.forEach(async (key, index) => {
        console.log(key, "Key is ");

        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        console.log(paramValues, " Param values are ");
        if (index !== 0) {
          whereClause += " AND ";
        }
        whereClause += `(${paramValues
          .map((_, idx) => `${key} = $${parameterIndex + idx}`)
          .join(" OR ")})`;
        parameterIndex += paramValues.length;
        queryParams.push(...paramValues);
      });
      let getcount: QueryResult;
      console.log(whereClause, "----");
      console.log("inside where");
      let querystring = `select count(*) from ${objectName} where isarchive = true AND ${whereClause}`;
      console.log(querystring);
      getcount = await query(querystring, queryParams);
      return getcount.rows[0].count;
    } catch (error) {
      console.error(
        "Query Execution Error: IN getArchivefilterRecordCount",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      console.log(ErrorMessage);
      return ErrorMessage;
    }
  };

  export const getRecordCountWithUserId = async (request) => {
    try {
      const { objectName, userId } = request.params;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);
      let whereClauses = [];
      let queryParams = [];
      let parameterIndex = 2;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const paramValues: any = Array.isArray(values[i])
          ? values[i]
          : [values[i]];

        if (key === "createddate" || key === "delivereddate") {
          let rangeWhereClause = paramValues
            .map((range) => {
              const [lowerBound, upperBound] = range.split("-");
              queryParams.push(lowerBound, upperBound);
              const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
                })`;
              parameterIndex += 2;
              return clause;
            })
            .join(" OR ");
          whereClauses.push(`(${rangeWhereClause})`);
        } else if (key !== "createddate" && key !== "delivereddate") {
          const clause = paramValues
            .map((_) => `${key} = $${parameterIndex++}`)
            .join(" OR ");
          whereClauses.push(`(${clause})`);
          queryParams.push(...paramValues);
        }
      }

      let querystring;
      if (whereClauses.length > 0) {
        querystring = `SELECT COUNT(*) FROM ${objectName} WHERE userId = $1 AND ${whereClauses.join(
          " AND "
        )}`;
      } else {
        querystring = `SELECT COUNT(*) FROM ${objectName} WHERE userId = $1`;
      }

      const getcount = await query(querystring, [...queryParams]);
      return getcount.rows[0].count;
    } catch (error) {
      console.error(
        "Query Execution Error: IN getRecordCountWithUserId",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };

  export const getGlobalProductDataCount = async (request: any, reply: any) => {
    try {
      const { globalsearch, subcategory } = request.query;
      const searchTerms = globalsearch.split(" ").join(" & ");
      let newSearch = globalsearch.split(" ");
      if (newSearch.length === 1) {
        newSearch = newSearch[0] + ":*";
      } else {
        newSearch = newSearch.join(":* & ") + ":*";
      }
      console.log(newSearch, "newSearch data count");

      let countQueryText = `
            SELECT COUNT(*) 
            FROM product_revo 
            WHERE searchtext @@ to_tsquery('english', $1)
        `;

      let params = [newSearch];

      if (subcategory && subcategory !== "All") {
        countQueryText += ` AND subcategory = $${params.length + 1}`;
        params.push(subcategory);
      }

      console.log("Final count query:", countQueryText);
      console.log("Params:", params);

      const resultData = await query(countQueryText, params);

      console.log("Count result:", resultData.rows[0].count);
      return parseInt(resultData.rows[0].count);
    } catch (error) {
      console.error(
        "Query Execution Error: IN getGlobalProductDataCount",
        error
      );
      let ErrorMessage = await ErrorHandler.handleQueryError(error);
      return ErrorMessage;
    }
  };
}
