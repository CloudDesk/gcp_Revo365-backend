import assert from "node:assert/strict";
import { test } from "node:test";
import pool from "../database/postgres.js";
import { requireFinancePermission, type FinanceResource } from "../services/financeAccess.service.js";

test("finance permissions stay independent and preserve Cash/Bank defaults", async (t) => {
  const grants: Record<string, Record<string, boolean>> = {
    cash_bank_account: { read: true, create: true, edit: true },
    chart_of_accounts: { read: false, create: false },
  };
  const calls: string[][] = [];
  t.mock.method(pool, "query", async (_sql: string, params: string[]) => {
    calls.push(params);
    return { rows: grants[params[1]] ? [{ permissions: grants[params[1]] }] : [] };
  });
  const check = async (
    action: "read" | "create" | "edit",
    resource?: FinanceResource,
    role = "admin"
  ) => {
    const reply = {
      statusCode: 200,
      body: null as any,
      status(code: number) { this.statusCode = code; return this; },
      send(body: any) { this.body = body; return this; },
    };
    await requireFinancePermission(action, resource)({ session: { role } }, reply);
    return reply;
  };

  for (const role of ["admin", "accountant"]) {
    for (const action of ["read", "create", "edit"] as const) {
      assert.equal((await check(action, undefined, role)).statusCode, 200);
      assert.deepEqual(calls.at(-1), [role, "cash_bank_account"]);
    }
    assert.equal((await check("read", "chart_of_accounts", role)).statusCode, 403);
  }
  grants.cash_bank_account = { read: false, create: false, edit: false };
  grants.chart_of_accounts = { read: true, create: false };
  assert.equal((await check("read", "chart_of_accounts")).statusCode, 200);
  assert.equal((await check("create", "chart_of_accounts")).statusCode, 403);
  assert.equal((await check("read")).statusCode, 403);
  grants.chart_of_accounts.create = true;
  assert.equal((await check("create", "chart_of_accounts")).statusCode, 200);
  delete grants.chart_of_accounts;
  assert.equal((await check("read", "chart_of_accounts")).statusCode, 403);

  for (const resource of ["finance_transactions", "on_account", "customer_statement"] as const) {
    grants.cash_bank_account = { read: true, create: true };
    assert.equal((await check("read", resource)).statusCode, 403);
    grants.cash_bank_account = { read: false, create: false };
    grants[resource] = { read: true, create: false };
    assert.equal((await check("read", resource)).statusCode, 200);
    assert.equal((await check("create", resource)).statusCode, 403);
    assert.equal((await check("read", resource, "vendor")).statusCode, 403);
    delete grants[resource];
  }
  const count = calls.length;
  for (const role of ["", "vendor", "customer"]) {
    assert.equal((await check("read", "chart_of_accounts", role)).statusCode, 403);
    assert.equal((await check("read", undefined, role)).statusCode, 403);
  }
  assert.equal(calls.length, count, "disallowed roles never query permissions");
});

test("shared lookups accept any explicit grant, regardless of row order", async (t) => {
  let allowed = true;
  t.mock.method(pool, "query", async (sql: string, params: any[]) => {
    assert.match(sql, /ANY\(\$2::text\[\]\)/);
    assert.doesNotMatch(sql, /LIMIT 1/);
    assert.deepEqual(params[1], ["cash_bank_account", "finance_transactions"]);
    return { rows: [{ permissions: { read: false } }, { permissions: { read: allowed } }] };
  });
  for (const expected of [200, 403]) {
    const reply = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      send(_body: any) { return this; },
    };
    await requireFinancePermission("read", ["cash_bank_account", "finance_transactions"])(
      { session: { role: "admin" } }, reply
    );
    assert.equal(reply.statusCode, expected);
    allowed = false;
  }
});
