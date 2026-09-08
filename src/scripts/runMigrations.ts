import { runMigrations } from "../database/runMigrations.js";

const main = async () => {
  await runMigrations();
  console.log("[Migrations] Completed successfully.");
};

main().catch((error) => {
  console.error("[Migrations] Failed to complete.", error);
  process.exitCode = 1;
});
