import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import pool from "../database/postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.join(
  __dirname,
  "../database/migrations/20260922_consolidated_invoice_supporting_excel.sql"
);

const run = async () => {
  const sql = await readFile(migrationPath, "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Supporting Excel migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error("Supporting Excel migration failed:", error);
  process.exitCode = 1;
});
