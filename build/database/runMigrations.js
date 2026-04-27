import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from './postgres.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Runs every .sql file under src/database/migrations/ in sequence.
 * Each file must be written idempotently (IF NOT EXISTS / IF EXISTS).
 * Called once from index.ts onReady hook.
 */
export async function runMigrations() {
    const candidateDirectories = [
        join(__dirname, 'migrations'),
        join(__dirname, '..', '..', 'src', 'database', 'migrations'),
    ];
    const migrationDir = candidateDirectories.find((directory) => existsSync(directory)) ??
        candidateDirectories[0];
    let migrationFiles = [];
    try {
        migrationFiles = readdirSync(migrationDir)
            .filter((file) => file.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b));
    }
    catch (err) {
        console.warn('[Migrations] Could not read migration directory:', migrationDir, err);
        return;
    }
    if (migrationFiles.length === 0) {
        console.log('[Migrations] No migration files found.');
        return;
    }
    const client = await pool.connect();
    try {
        for (const fileName of migrationFiles) {
            const migrationPath = join(migrationDir, fileName);
            let sql = '';
            try {
                sql = readFileSync(migrationPath, 'utf-8');
            }
            catch (readErr) {
                console.warn('[Migrations] Could not read migration file:', migrationPath, readErr);
                continue;
            }
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('COMMIT');
                console.log(`[Migrations] ${fileName} applied successfully.`);
            }
            catch (migrationErr) {
                await client.query('ROLLBACK');
                console.error(`[Migrations] ${fileName} failed:`, migrationErr?.message || migrationErr);
            }
        }
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=runMigrations.js.map