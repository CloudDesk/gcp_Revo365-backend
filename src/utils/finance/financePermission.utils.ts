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
 * Keeps the existing permission format. Dashboard, Reports, and Customer Statement are read-only;
 * Transactions and On Account additionally support Create.
 */
export const normalizeFinancePermissionSet = (
  role: unknown,
  value: unknown
) => {
  const financeRoleDefaultsToRead = isFinancePermissionRole(role);
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
            existing
              ? existing?.permissions?.read === true
              : financeRoleDefaultsToRead,
          create: false,
          edit: false,
          delete: false,
        },
      };
    }
  );

  const independentResources = [
    { object: "Transactions", objectAPI: "finance_transactions", create: true },
    { object: "On Account", objectAPI: "on_account", create: true },
    { object: "Customer Statement", objectAPI: "customer_statement", create: false },
  ];
  const independentEntries = independentResources.map((resource) => {
    const existing = unrelatedEntries.find((entry) => entry?.objectAPI === resource.objectAPI);
    return {
      ...existing,
      object: resource.object,
      objectAPI: resource.objectAPI,
      permissions: {
        read: existing?.permissions?.read === true,
        create: resource.create && existing?.permissions?.create === true,
        edit: false,
        delete: false,
      },
    };
  });
  return [
    ...unrelatedEntries.filter((entry) => !independentResources.some((resource) => resource.objectAPI === entry?.objectAPI)),
    ...independentEntries,
    ...normalizedFinanceEntries,
  ];
};
