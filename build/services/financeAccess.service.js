import { query } from "../database/postgres.js";
export const requireFinanceModulePermission = (objectAPI, permission = "read") => {
    return async (request, reply) => {
        const role = String(request.session?.role || "").trim().toLowerCase();
        if (!role) {
            return reply.status(403).send({
                success: false,
                error: {
                    code: "FINANCE_MODULE_ACCESS_DENIED",
                    message: "Finance access is restricted to authorized internal users.",
                },
            });
        }
        const result = await query(`SELECT item->'permissions' AS permissions
       FROM permissions p
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
       WHERE LOWER(TRIM(p.role)) = $1
         AND item->>'objectAPI' = $2
       LIMIT 1`, [role, objectAPI]);
        if (result.rows[0]?.permissions?.[permission] === true)
            return;
        return reply.status(403).send({
            success: false,
            error: {
                code: "FINANCE_MODULE_ACCESS_DENIED",
                message: `You do not have ${permission} permission for this finance module.`,
            },
        });
    };
};
export const requireJournalPermission = (permission) => {
    return async (request, reply) => {
        const role = String(request.session?.role || "").trim().toLowerCase();
        if (!role) {
            return reply.status(403).send({
                success: false,
                error: {
                    code: "JOURNAL_ACCESS_DENIED",
                    message: "Journal access is restricted to authorized internal users.",
                },
            });
        }
        const result = await query(`SELECT item->'permissions' AS permissions
       FROM permissions p
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
       WHERE LOWER(TRIM(p.role)) = $1
         AND item->>'objectAPI' = 'journal'
       LIMIT 1`, [role]);
        if (result.rows[0]?.permissions?.[permission] === true)
            return;
        return reply.status(403).send({
            success: false,
            error: {
                code: "JOURNAL_ACCESS_DENIED",
                message: `You do not have ${permission} permission for Journals.`,
            },
        });
    };
};
export const requireFinancePermission = (permission, resource = "cash_bank_account") => {
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
        const result = await query(`
      SELECT permission_item->'permissions' AS permissions
      FROM permissions p
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.permissionset, '[]'::jsonb)
      ) permission_item
      WHERE LOWER(p.role) = $1
        AND permission_item->>'objectAPI' ${Array.isArray(resource) ? '= ANY($2::text[])' : '= $2'}
      `, [role, resource]);
        if (result.rows.some((row) => row.permissions?.[permission] === true))
            return;
        return reply.status(403).send({
            success: false,
            error: {
                code: "FINANCE_ACCESS_DENIED",
                message: `You do not have ${permission} permission for ${resource}.`,
            },
        });
    };
};
export const requireRevoInvoicePermission = (permission) => {
    return async (request, reply) => {
        const role = String(request.session?.role || "").trim().toLowerCase();
        if (!role) {
            return reply.status(403).send({
                success: false,
                error: { code: "FINANCE_ACCESS_DENIED", message: "Invoice access is restricted to authorized internal users." },
            });
        }
        const result = await query(`SELECT permission_item->'permissions' AS permissions
       FROM permissions p
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) permission_item
       WHERE LOWER(p.role) = $1 AND permission_item->>'objectAPI' = 'revoinvoice'
       LIMIT 1`, [role]);
        if (result.rows[0]?.permissions?.[permission] === true)
            return;
        return reply.status(403).send({
            success: false,
            error: {
                code: "FINANCE_ACCESS_DENIED",
                message: `You do not have ${permission} permission for Sales Invoices.`,
            },
        });
    };
};
export const requireDeliveryChallanPermission = (permission) => {
    return async (request, reply) => {
        const role = String(request.session?.role || "").trim().toLowerCase();
        if (!role) {
            return reply.status(403).send({ success: false, error: {
                    code: "FINANCE_ACCESS_DENIED",
                    message: "Delivery Challan access is restricted to authorized internal users.",
                } });
        }
        const result = await query(`SELECT item->>'objectAPI' AS objectapi, item->'permissions' AS permissions
       FROM permissions p
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
       WHERE LOWER(p.role) = $1
         AND item->>'objectAPI' IN ('delivery_challan', 'revoinvoice')
       ORDER BY CASE WHEN item->>'objectAPI' = 'delivery_challan' THEN 0 ELSE 1 END`, [role]);
        // revoinvoice is retained as a compatibility capability for environments
        // whose authenticated session predates the dedicated permission seed.
        if (result.rows.some((row) => row.permissions?.[permission] === true))
            return;
        return reply.status(403).send({ success: false, error: {
                code: "FINANCE_ACCESS_DENIED",
                message: `You do not have ${permission} permission for Delivery Challans.`,
            } });
    };
};
//# sourceMappingURL=financeAccess.service.js.map