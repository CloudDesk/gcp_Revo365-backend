import { query } from "../database/postgres.js";

export type FinancePermission =
  | "read"
  | "create"
  | "edit";

export const requireJournalPermission = (permission: FinancePermission) => {
  return async (request: any, reply: any) => {
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
    const result = await query(
      `SELECT permission_item->'permissions' AS permissions
       FROM permissions p
       CROSS JOIN LATERAL jsonb_array_elements(
         COALESCE(p.permissionset, '[]'::jsonb)
       ) permission_item
       WHERE LOWER(p.role) = $1
         AND permission_item->>'objectAPI' = 'journal'
       LIMIT 1`,
      [role]
    );
    if (result.rows[0]?.permissions?.[permission] === true) return;
    return reply.status(403).send({
      success: false,
      error: {
        code: "JOURNAL_ACCESS_DENIED",
        message: `You do not have ${permission} permission for Journals.`,
      },
    });
  };
};

export const requireFinancePermission = (permission: FinancePermission) => {
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
        AND permission_item->>'objectAPI' = 'cash_bank_account'
      LIMIT 1
      `,
      [role]
    );
    const permissions = result.rows[0]?.permissions || {};
    if (permissions?.[permission] === true) return;

    return reply.status(403).send({
      success: false,
      error: {
        code: "FINANCE_ACCESS_DENIED",
        message: `You do not have ${permission} permission for Cash and Bank Account.`,
      },
    });
  };
};

export const requireRevoInvoicePermission = (permission: FinancePermission) => {
  return async (request: any, reply: any) => {
    const role = String(request.session?.role || "").trim().toLowerCase();
    if (!role) {
      return reply.status(403).send({
        success: false,
        error: { code: "FINANCE_ACCESS_DENIED", message: "Invoice access is restricted to authorized internal users." },
      });
    }
    const result = await query(
      `SELECT permission_item->'permissions' AS permissions
       FROM permissions p
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) permission_item
       WHERE LOWER(p.role) = $1 AND permission_item->>'objectAPI' = 'revoinvoice'
       LIMIT 1`,
      [role]
    );
    if (result.rows[0]?.permissions?.[permission] === true) return;
    return reply.status(403).send({
      success: false,
      error: {
        code: "FINANCE_ACCESS_DENIED",
        message: `You do not have ${permission} permission for Sales Invoices.`,
      },
    });
  };
};

export const requireDeliveryChallanPermission = (permission: FinancePermission) => {
  return async (request: any, reply: any) => {
    const role = String(request.session?.role || "").trim().toLowerCase();
    if (!role) {
      return reply.status(403).send({ success: false, error: {
        code: "FINANCE_ACCESS_DENIED",
        message: "Delivery Challan access is restricted to authorized internal users.",
      }});
    }
    const result = await query(
      `SELECT item->>'objectAPI' AS objectapi, item->'permissions' AS permissions
       FROM permissions p
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
       WHERE LOWER(p.role) = $1
         AND item->>'objectAPI' IN ('delivery_challan', 'revoinvoice')
       ORDER BY CASE WHEN item->>'objectAPI' = 'delivery_challan' THEN 0 ELSE 1 END`,
      [role]
    );
    // revoinvoice is retained as a compatibility capability for environments
    // whose authenticated session predates the dedicated permission seed.
    if (result.rows.some((row: any) => row.permissions?.[permission] === true)) return;
    return reply.status(403).send({ success: false, error: {
      code: "FINANCE_ACCESS_DENIED",
      message: `You do not have ${permission} permission for Delivery Challans.`,
    }});
  };
};
