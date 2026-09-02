import { query } from "../database/postgres.js";
export const requireFinancePermission = (permission) => {
    return async (request, reply) => {
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
        const result = await query(`
      SELECT permission_item->'permissions' AS permissions
      FROM permissions p
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.permissionset, '[]'::jsonb)
      ) permission_item
      WHERE LOWER(p.role) = $1
        AND permission_item->>'objectAPI' = 'cash_bank_account'
      LIMIT 1
      `, [role]);
        const permissions = result.rows[0]?.permissions || {};
        if (permissions?.[permission] === true)
            return;
        return reply.status(403).send({
            success: false,
            error: {
                code: "FINANCE_ACCESS_DENIED",
                message: `You do not have ${permission} permission for Cash and Bank Account.`,
            },
        });
    };
};
//# sourceMappingURL=financeAccess.service.js.map