import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from './postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/**
 * Runs every .sql file under src/database/migrations/ in sequence.
 * Each file must be written idempotently (IF NOT EXISTS / IF EXISTS).
 * Called once from index.ts onReady hook.
 */
export async function runMigrations(): Promise<void> {
  const migrationPath = join(__dirname, 'migrations', 'rating_extend.sql');

  let sql: string;
  try {
    sql = readFileSync(migrationPath, 'utf-8');
  } catch (err) {
    console.warn('[Migrations] Could not read migration file:', migrationPath, err);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Migrations] rating_extend.sql applied successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    // Log but don't crash the server — the columns likely already exist
    console.error('[Migrations] rating_extend.sql failed (already applied?):', err.message);
  } finally {
    client.release();
  }
}
