import pkg from "pg";
import { POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_USER, POSTGRES__DATABASE } from "../config/config.js";
import axios from "axios";
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
        pool.connect((err, client, release) => {
            if (err) {
                console.error("Error connecting to the database:", err.message);
                reject(err);
            }
            else {
                console.log("Database connected");
                release();
                resolve('Database Connected');
            }
        });
    });
};
pool.on("error", (err) => {
    console.log("error is ");
    console.error("Error connecting to the database:", err.message);
});
export const query = async (stmt, options) => {
    let querydata = stmt;
    let params = options;
    if (Object.keys(options).length > 0 || options.length > 0) {
        // let res = await pool.query(stmt, options)
        // return res
        try {
            console.log(querydata, 'querydata if');
            console.log(params, 'querydata if');
            let res = await axios.post("https://docblitz-437213.uc.r.appspot.com/execute-query", { querydata, params });
            return res.data;
        }
        catch (error) {
            console.log('Errpr in query', error);
            return error;
        }
    }
    else {
        // console.log("else latest");
        // return await pool.query(stmt);
        try {
            console.log(querydata, 'querydata else');
            let res = await axios.post("https://docblitz-437213.uc.r.appspot.com/execute-query", { querydata });
            return res.data;
        }
        catch (error) {
            console.log('Errpr in query', error);
            return error;
        }
    }
};
export default pool;
//# sourceMappingURL=postgres.js.map