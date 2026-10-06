import { readFile } from "node:fs/promises";
import pool from "../database/postgres.js";

const run = async () => {
  try {
    const sql = await readFile(
      new URL("../database/migrations/20261006_separate_finance_screen_permissions.sql", import.meta.url),
      "utf8"
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('revo365_schema_migrations'))");
      const result = await client.query(sql);
      await client.query("COMMIT");
      console.log(`Separate finance screen permissions migration completed: ${result.rowCount ?? 0} role(s) updated.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
};

run().catch((error: any) => {
  console.error("Separate finance screen permissions migration failed:", error?.message || "Unknown error");
  process.exitCode = 1;
});

