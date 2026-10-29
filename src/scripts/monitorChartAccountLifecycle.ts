import pool, { query } from "../database/postgres.js";

const organizationId = Number(process.argv[2] || 1);
const hours = Number(process.argv[3] || 24);

if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
  throw new Error("organizationId must be a positive integer.");
}
if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 90) {
  throw new Error("hours must be greater than zero and no more than 2160 (90 days).");
}

const lifecycleActions = [
  "chart_account_activated",
  "chart_account_deactivated",
  "chart_account_deleted",
  "chart_account_bulk_status_completed",
  "chart_account_bulk_delete_completed",
  "direct_ledger_activated_by_chart_account",
  "direct_ledger_deactivated_by_chart_account",
  "direct_ledger_deleted_by_chart_account",
  "bank_cash_balance_rebuilt",
];

const monitor = async () => {
  const sinceEpoch = Math.floor(Date.now() / 1000 - hours * 60 * 60);
  const [summaryResult, recentResult] = await Promise.all([
    query(
      `SELECT action,
              COUNT(*)::int AS count,
              MAX(createddate)::bigint AS latestepoch
         FROM finance_audit_events
        WHERE organizationid = $1
          AND createddate >= $2
          AND action = ANY($3::text[])
        GROUP BY action
        ORDER BY action`,
      [organizationId, sinceEpoch, lifecycleActions]
    ),
    query(
      `SELECT id,
              entitytype,
              entityid,
              action,
              actor,
              eventdata,
              createddate
         FROM finance_audit_events
        WHERE organizationid = $1
          AND createddate >= $2
          AND action = ANY($3::text[])
        ORDER BY createddate DESC, id DESC
        LIMIT 100`,
      [organizationId, sinceEpoch, lifecycleActions]
    ),
  ]);

  console.log(
    `[Chart Account Lifecycle Monitor] organization=${organizationId} window=${hours}h since=${new Date(
      sinceEpoch * 1000
    ).toISOString()}`
  );
  if (summaryResult.rows.length === 0) {
    console.log("[Chart Account Lifecycle Monitor] No lifecycle audit events in this window.");
    return;
  }

  console.table(
    summaryResult.rows.map((row: any) => ({
      action: row.action,
      count: Number(row.count),
      latest: new Date(Number(row.latestepoch) * 1000).toISOString(),
    }))
  );
  console.log(
    JSON.stringify(
      recentResult.rows.map((row: any) => ({
        id: Number(row.id),
        entitytype: row.entitytype,
        entityid: Number(row.entityid),
        action: row.action,
        actor: row.actor,
        created: new Date(Number(row.createddate) * 1000).toISOString(),
        eventdata: row.eventdata,
      })),
      null,
      2
    )
  );
};

monitor()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
