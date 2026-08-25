import assert from "node:assert/strict";
import test from "node:test";
import {
  isFinancePermissionRole,
  normalizeFinancePermissionSet,
} from "../utils/finance/financePermission.utils.js";

const byApi = (permissions: any[]) =>
  new Map(permissions.map((permission) => [permission.objectAPI, permission]));

test("finance role matching is normalized and restricted", () => {
  assert.equal(isFinancePermissionRole(" Admin "), true);
  assert.equal(isFinancePermissionRole("ACCOUNTANT"), true);
  assert.equal(isFinancePermissionRole("storemanager"), false);
  assert.equal(isFinancePermissionRole("technician"), false);
  assert.equal(isFinancePermissionRole(undefined), false);
});

test("Admin and Accountant receive readable finance resources by default", () => {
  for (const role of ["Admin", "accountant"]) {
    const permissions = byApi(normalizeFinancePermissionSet(role, []));
    for (const objectAPI of ["finance_dashboard", "finance_reports"]) {
      assert.deepEqual(permissions.get(objectAPI)?.permissions, {
        read: true,
        create: false,
        edit: false,
        delete: false,
      });
    }
  }
});

test("non-finance roles cannot grant themselves finance access", () => {
  const maliciousInput = [
    {
      object: "Finance Dashboard",
      objectAPI: "finance_dashboard",
      permissions: { read: true, create: true, edit: true, delete: true },
    },
    {
      object: "Finance Reports",
      objectAPI: "finance_reports",
      permissions: { read: true, create: true, edit: true, delete: true },
    },
  ];

  for (const role of ["storemanager", "technician", "vendor", "unknown"]) {
    const permissions = byApi(
      normalizeFinancePermissionSet(role, maliciousInput)
    );
    for (const objectAPI of ["finance_dashboard", "finance_reports"]) {
      assert.deepEqual(permissions.get(objectAPI)?.permissions, {
        read: false,
        create: false,
        edit: false,
        delete: false,
      });
    }
  }
});

test("existing Admin and Accountant read restrictions are preserved", () => {
  const input = [
    {
      object: "Old dashboard label",
      objectAPI: "finance_dashboard",
      permissions: { read: false },
    },
  ];
  const permissions = byApi(normalizeFinancePermissionSet("admin", input));

  assert.equal(permissions.get("finance_dashboard")?.permissions.read, false);
  assert.equal(permissions.get("finance_reports")?.permissions.read, true);
});

test("normalization preserves unrelated entries and removes finance duplicates", () => {
  const input = JSON.stringify([
    {
      object: "Home",
      objectAPI: "home",
      permissions: { read: true },
    },
    {
      object: "Finance Dashboard",
      objectAPI: "finance_dashboard",
      permissions: { read: true },
    },
    {
      object: "Duplicate Dashboard",
      objectAPI: "finance_dashboard",
      permissions: { read: false },
    },
  ]);

  const result = normalizeFinancePermissionSet("accountant", input);
  assert.equal(result.filter((item) => item.objectAPI === "home").length, 1);
  assert.equal(
    result.filter((item) => item.objectAPI === "finance_dashboard").length,
    1
  );
  assert.equal(
    result.filter((item) => item.objectAPI === "finance_reports").length,
    1
  );
});
