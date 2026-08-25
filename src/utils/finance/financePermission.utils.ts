export const FINANCE_PERMISSION_RESOURCES = [
  { object: "Finance Dashboard", objectAPI: "finance_dashboard" },
  { object: "Finance Reports", objectAPI: "finance_reports" },
] as const;

export const normalizeFinancePermissionRole = (role: unknown) =>
  String(role || "").trim().toLowerCase();

export const isFinancePermissionRole = (role: unknown) =>
  ["admin", "accountant"].includes(normalizeFinancePermissionRole(role));

const parsePermissionSet = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Keeps the existing permission format while enforcing the hard finance role
 * boundary. Finance resources are read-only pages in the current CRUD editor.
 */
export const normalizeFinancePermissionSet = (
  role: unknown,
  value: unknown
) => {
  const roleCanUseFinance = isFinancePermissionRole(role);
  const permissionSet = parsePermissionSet(value);
  const financeEntries = new Map<string, any>();
  const unrelatedEntries: any[] = [];

  permissionSet.forEach((entry) => {
    const objectAPI = String(entry?.objectAPI || "").trim();
    if (
      FINANCE_PERMISSION_RESOURCES.some(
        (resource) => resource.objectAPI === objectAPI
      )
    ) {
      if (!financeEntries.has(objectAPI)) financeEntries.set(objectAPI, entry);
      return;
    }
    unrelatedEntries.push(entry);
  });

  const normalizedFinanceEntries = FINANCE_PERMISSION_RESOURCES.map(
    (resource) => {
      const existing = financeEntries.get(resource.objectAPI);
      return {
        ...(existing && typeof existing === "object" ? existing : {}),
        object: resource.object,
        objectAPI: resource.objectAPI,
        permissions: {
          read:
            roleCanUseFinance && existing
              ? existing?.permissions?.read === true
              : roleCanUseFinance,
          create: false,
          edit: false,
          delete: false,
        },
      };
    }
  );

  return [...unrelatedEntries, ...normalizedFinanceEntries];
};
