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
     idleTimeoutMillis: 20000, // how long a client is allowed to remain idle before being closed
     connectionTimeoutMillis: 3000, // how long to wait when connecting a new client

});
export const checkDatabaseConnection = () => {
    return new Promise((resolve, reject) => {
        pool.connect((err: any, client: any, release: any) => {
            if (err) {
                console.error("Error connecting to the database:", err.message);
                reject(err);
            } else {
                console.log("Database connected");
                release();
                resolve('Database Connected');
            }
        });
    });
};
pool.on("error", (err: any) => {
    console.log("error is ");
    console.error("Error connecting to the database:", err.message);
});
export const query = async (stmt: any, options: any) => {
    let querydata = stmt;
    let params = options;
   
    if (Object.keys(options).length > 0 || options.length > 0) {
        // let res = await pool.query(stmt, options)
        // return res
        try {
            let res = await axios.post("https://docblitz-437213.uc.r.appspot.com/execute-query",{querydata, params})
            console.log(res ,'res ENgine');
            return res.data;
        } catch (error) {
            return error
        }


    } else {
        // console.log("else latest");
        // return await pool.query(stmt);
        try {
            let res = await axios.post("https://docblitz-437213.uc.r.appspot.com/execute-query",{querydata})
            console.log(res ,'res  APP engine');
            return res;
        } catch (error) {
            return error
        }
    }
};

export default pool;