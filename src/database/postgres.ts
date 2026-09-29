import pkg from "pg";
import {
  POSTGRESS_QUERY_API,
  POSTGRES_HOST,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_USER,
  POSTGRES__DATABASE,
} from "../config/config.js";
import axios from "axios";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
const pool = new pkg.Pool({
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  host: POSTGRES_HOST,
  port: POSTGRES_PORT,
  database: POSTGRES__DATABASE,
  // Connection pool settings
  max: 500, // maximum number of clients in the pool
  idleTimeoutMillis: 200000, // how long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 30000, // how long to wait when connecting a new client
});
export const checkDatabaseConnection = () => {
  return new Promise((resolve, reject) => {
    pool.connect((err: any, client: any, release: any) => {
      if (err) {
        console.error("Error connecting to the database:", err.message);
        reject(err);
      } else {
        release();
        resolve("Database Connected");
      }
    });
  });
};
pool.on("error", (err: any) => {
  console.error("Error connecting to the database:", err.message);
});

//App Engine
// export const query = async (stmt: any, options: any) => {
//   let querydata = stmt;
//   let params = options;

//   if (Object.keys(options).length > 0 || options.length > 0) {
//     // let res = await pool.query(stmt, options)
//     // return res
//     try {
//       let res = await axios.post(
//         POSTGRESS_QUERY_API,
//         { querydata, params }
//       );
//       return res.data;
//     } catch (error) {
//       console.log("Errpr in query data", error.response.data);
//       let errorResult = await ErrorHandler.checkErrorMessage(
//         error.response.data
//       );
//       console.log(errorResult, "Error Result is ");
//       throw errorResult;
//     }
//   } else {
//     try {
//       let res = await axios.post(
//         POSTGRESS_QUERY_API,
//         { querydata }
//       );
//       return res.data;
//     } catch (error) {
//       console.log("Errpr in query data else ", error.response.data);
//       let errorResult = await ErrorHandler.checkErrorMessage(
//         error.response.data
//       );
//       throw errorResult;
//     }
//   }
// };



export const query = async (stmt: any, options: any = []) => {
    if (options && (Object.keys(options).length > 0 || options.length > 0)) {
        let res = await pool.query(stmt, options)
        return res
    } else {
        return await pool.query(stmt);
    }
};









export default pool;
