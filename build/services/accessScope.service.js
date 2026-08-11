import { query } from "../database/postgres.js";
import { redisClient } from "../database/redis.session.js";
const VENDOR_ROLE = "vendor";
const vendorPermissionScopes = {
    users: {
        moduleLabel: "Business Customers",
        customerType: "business",
        assignment: "assigned_to_me",
        allowedPaths: ["/customer"],
        menuLabels: { "/customer": "Business Customers" },
        relatedModules: [
            "detail",
            "rental_products",
            "rental_agreements",
            "rental_service_requests",
            "rental_invoices",
            "purchases",
        ],
        forceBusinessCustomerFilter: true,
    },
    tickets: {
        moduleLabel: "Rental Service Requests",
        customerType: "business",
        assignment: "assigned_to_me",
        ticketType: "rental_only",
        allowedPaths: ["/service-request"],
        menuLabels: { "/service-request": "Rental Service Requests" },
        forceRentalTicketType: true,
    },
    revoinvoice: {
        assignment: "assigned_to_me",
        customerType: "business",
        invoiceFor: ["rental", "service"],
        allowedPaths: ["/manual-invoice"],
    },
    rental_agreement: {
        assignment: "assigned_to_me",
        customerType: "business",
        allowedPaths: [],
    },
    orders: {
        assignment: "assigned_to_me",
        customerType: "business",
    },
};
const normalizeText = (value) => String(value ?? "")
    .trim()
    .toLowerCase();
const getAuthorizationSession = async (request) => {
    const sessionId = request?.headers?.authorization;
    if (!sessionId) {
        return null;
    }
    const sessionData = await redisClient.get(sessionId);
    return sessionData ? JSON.parse(sessionData) : null;
};
const getRequestSession = async (request) => {
    if (request?.session) {
        return request.session;
    }
    return getAuthorizationSession(request);
};
const pushFalseScope = (whereClauses) => {
    whereClauses.push("(1 = 0)");
};
const getScopedVendorCustomerCondition = ({ customerExpression, vendorParamRef, }) => `
  EXISTS (
    SELECT 1
    FROM users scoped_customer
    JOIN business_customer_vendor_assignments scoped_assignment
      ON scoped_assignment.customerid = scoped_customer.id
     AND scoped_assignment.isactive = TRUE
    WHERE scoped_customer.id = ${customerExpression}
      AND scoped_customer.isbusinessuser = TRUE
      AND scoped_assignment.vendoruserid = ${vendorParamRef}
  )
`;
export var accessScopeService;
(function (accessScopeService) {
    accessScopeService.normalizeRole = normalizeText;
    accessScopeService.applyRoleScopes = (role, permissionset = []) => {
        if (normalizeText(role) !== VENDOR_ROLE || !Array.isArray(permissionset)) {
            return permissionset;
        }
        return permissionset.map((permission) => {
            const defaultScope = vendorPermissionScopes[permission?.objectAPI];
            if (!defaultScope) {
                return permission;
            }
            const storedScope = { ...(permission?.scope || {}) };
            ["allowedPaths", "menuLabels", "moduleLabel"].forEach((navigationKey) => {
                if (!Object.prototype.hasOwnProperty.call(defaultScope, navigationKey)) {
                    delete storedScope[navigationKey];
                }
            });
            return {
                ...permission,
                scope: {
                    ...storedScope,
                    ...defaultScope,
                },
            };
        });
    };
    accessScopeService.getSession = getRequestSession;
    accessScopeService.isVendorRequest = async (request) => {
        const session = await getRequestSession(request);
        return normalizeText(session?.role) === VENDOR_ROLE;
    };
    accessScopeService.getVendorUserId = async (request) => {
        const session = await getRequestSession(request);
        return Number(session?.id || 0);
    };
    accessScopeService.appendVendorBusinessCustomerScope = async (request, whereClauses, queryParams, parameterIndex, options = {}) => {
        if (!(await accessScopeService.isVendorRequest(request))) {
            return parameterIndex;
        }
        const vendorUserId = await accessScopeService.getVendorUserId(request);
        if (!vendorUserId) {
            pushFalseScope(whereClauses);
            return parameterIndex;
        }
        const customerAlias = options.customerAlias || "u";
        const customerIdColumn = options.customerIdColumn || "id";
        const customerExpression = `${customerAlias}.${customerIdColumn}`;
        whereClauses.push(`${customerAlias}.isbusinessuser = TRUE`);
        whereClauses.push(getScopedVendorCustomerCondition({
            customerExpression,
            vendorParamRef: `$${parameterIndex}`,
        }));
        queryParams.push(vendorUserId);
        return parameterIndex + 1;
    };
    accessScopeService.appendVendorCustomerColumnScope = async (request, whereClauses, queryParams, parameterIndex, options) => {
        if (!(await accessScopeService.isVendorRequest(request))) {
            return parameterIndex;
        }
        const vendorUserId = await accessScopeService.getVendorUserId(request);
        if (!vendorUserId) {
            pushFalseScope(whereClauses);
            return parameterIndex;
        }
        const customerExpression = `${options.tableAlias}.${options.customerColumn}`;
        whereClauses.push(getScopedVendorCustomerCondition({
            customerExpression,
            vendorParamRef: `$${parameterIndex}`,
        }));
        queryParams.push(vendorUserId);
        return parameterIndex + 1;
    };
    accessScopeService.getRentalTicketPredicate = (ticketAlias = "t") => `(
    LOWER(COALESCE(${ticketAlias}.tickettype, '')) = 'repair rental'
    OR ${ticketAlias}.rentalactiontype IS NOT NULL
    OR COALESCE(${ticketAlias}.stoprental, FALSE) = TRUE
    OR EXISTS (
      SELECT 1
      FROM orderline rental_scope_orderline
      WHERE rental_scope_orderline.id = ${ticketAlias}.linkedorderlineid
        AND LOWER(COALESCE(rental_scope_orderline.ordername, '')) = 'rental'
    )
  )`;
    accessScopeService.appendVendorTicketScope = async (request, whereClauses, queryParams, parameterIndex, options = {}) => {
        if (!(await accessScopeService.isVendorRequest(request))) {
            return parameterIndex;
        }
        const ticketAlias = options.ticketAlias || "t";
        const nextParameterIndex = await accessScopeService.appendVendorCustomerColumnScope(request, whereClauses, queryParams, parameterIndex, {
            tableAlias: ticketAlias,
            customerColumn: options.customerColumn || "userid",
        });
        whereClauses.push(accessScopeService.getRentalTicketPredicate(ticketAlias));
        return nextParameterIndex;
    };
    accessScopeService.canVendorAccessCustomer = async (request, customerId) => {
        if (!(await accessScopeService.isVendorRequest(request))) {
            return true;
        }
        const vendorUserId = await accessScopeService.getVendorUserId(request);
        const parsedCustomerId = Number(customerId || 0);
        if (!vendorUserId || !parsedCustomerId) {
            return false;
        }
        const result = await query(`
        SELECT 1
        FROM users u
        JOIN business_customer_vendor_assignments a
          ON a.customerid = u.id
         AND a.isactive = TRUE
        WHERE u.id = $1
          AND u.isbusinessuser = TRUE
          AND a.vendoruserid = $2
        LIMIT 1
      `, [parsedCustomerId, vendorUserId]);
        return result.rows.length > 0;
    };
    accessScopeService.canVendorAccessTicket = async (request, ticketId) => {
        if (!(await accessScopeService.isVendorRequest(request))) {
            return true;
        }
        const whereClauses = ["t.id = $1"];
        const queryParams = [Number(ticketId || 0)];
        await accessScopeService.appendVendorTicketScope(request, whereClauses, queryParams, 2, {
            ticketAlias: "t",
        });
        const result = await query(`
        SELECT t.id
        FROM tickets t
        WHERE ${whereClauses.join(" AND ")}
        LIMIT 1
      `, queryParams);
        return result.rows.length > 0;
    };
    accessScopeService.isRentalTicketPayload = async (payload) => {
        if (normalizeText(payload?.tickettype) === "repair rental") {
            return true;
        }
        if (payload?.rentalactiontype || payload?.stoprental === true) {
            return true;
        }
        const linkedOrderLineId = Number(payload?.linkedorderlineid || 0);
        if (!linkedOrderLineId) {
            return false;
        }
        const result = await query(`
        SELECT 1
        FROM orderline
        WHERE id = $1
          AND LOWER(COALESCE(ordername, '')) = 'rental'
        LIMIT 1
      `, [linkedOrderLineId]);
        return result.rows.length > 0;
    };
    accessScopeService.getPermissionsForRole = async (role) => {
        const result = await query(`SELECT * FROM permissions WHERE LOWER(role) = LOWER($1) LIMIT 1`, [role]);
        return result.rows[0] ?? null;
    };
    accessScopeService.getAccessForRequest = async (request) => {
        const session = await getRequestSession(request);
        if (!session?.role) {
            return null;
        }
        const permissionRow = await accessScopeService.getPermissionsForRole(session.role);
        return {
            actor: session,
            role: session.role,
            permissionset: accessScopeService.applyRoleScopes(session.role, permissionRow?.permissionset || []),
            permission: permissionRow || null,
        };
    };
})(accessScopeService || (accessScopeService = {}));
//# sourceMappingURL=accessScope.service.js.map