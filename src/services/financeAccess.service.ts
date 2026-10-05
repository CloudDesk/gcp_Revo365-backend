import { query } from "../database/postgres.js";

export type FinancePermission =
  | "read"
  | "create"
  | "edit";

export const requireFinancePermission = (
  permission: FinancePermission,
  resource: "cash_bank_account" | "chart_of_accounts" = "cash_bank_account"
) => {
  return async (request: any, reply: any) => {
    const role = String(request.session?.role || "").trim().toLowerCase();
    if (!role) {
      return reply.status(403).send({
        success: false,
        error: {
          code: "FINANCE_ACCESS_DENIED",
          message: "Finance access is restricted to authorized internal users.",
        },
      });
    }

    if (!["accountant", "admin"].includes(role)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: "FINANCE_ACCESS_DENIED",
          message: "Finance access is restricted to Accountant and Admin roles.",
        },
      });
    }

    const result = await query(
      `
      SELECT permission_item->'permissions' AS permissions
      FROM permissions p
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.permissionset, '[]'::jsonb)
      ) permission_item
      WHERE LOWER(p.role) = $1
        AND permission_item->>'objectAPI' = $2
      LIMIT 1
      `,
      [role, resource]
    );
    const permissions = result.rows[0]?.permissions || {};
    if (permissions?.[permission] === true) return;

    return reply.status(403).send({
      success: false,
      error: {
        code: "FINANCE_ACCESS_DENIED",
        message: `You do not have ${permission} permission for ${resource === "chart_of_accounts" ? "Chart of Accounts" : "Cash and Bank Account"}.`,
      },
    });
  };
};
