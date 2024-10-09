import pkg from "pg";
import { POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_USER, POSTGRES__DATABASE } from "../config/config.js";
const pool = new pkg.Pool({
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    host: POSTGRES_HOST,
    port: POSTGRES_PORT,
    database: POSTGRES__DATABASE

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
    if (Object.keys(options).length > 0 || options.length > 0) {
        let res = await pool.query(stmt, options)
        return res


    } else {
        console.log("else latest");
        return await pool.query(stmt);
    }
};

export default pool;