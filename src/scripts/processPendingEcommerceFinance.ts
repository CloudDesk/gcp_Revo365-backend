import pool from "../database/postgres.js";
import { ecommercePaymentFinanceService } from "../services/ecommercePaymentFinance.service.js";

const run = async () => {
  const limit = Number(process.argv[2] || 100);
  const results =
    await ecommercePaymentFinanceService.processPendingPayments(limit);
  const summary = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});

  console.log(
    `[Ecommerce Finance] Processed ${results.length} event(s): ${JSON.stringify(summary)}`
  );
};

run()
  .catch((error) => {
    console.error(
      "[Ecommerce Finance] Pending-event processing failed:",
      error?.message || error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
