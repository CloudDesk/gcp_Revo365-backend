import { query } from "../database/postgres.js";
import { redisClient } from "../database/redis.session.js";

const VENDOR_ROLE = "vendor";

const vendorPermissionScopes: Record<string, any> = {
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
    allowedPaths: [],
  },
  rental_agreement: {
    assignment: "assigned_to_me",
    customerType: "business",
    allowedPaths: [],
  },
  orders: {
    assignment: "assigned_to_me",
    customerType: "business",
    allowedPaths: [],
  },
};

const normalizeText = (value: any) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const getAuthorizationSession = async (request: any) => {
  const sessionId = request?.headers?.authorization;
  if (!sessionId) {
    return null;
  }

  const sessionData = await redisClient.get(sessionId);
  return sessionData ? JSON.parse(sessionData) : null;
};

const getRequestSession = async (request: any) => {
  if (request?.session) {
    return request.session;
  }

  return getAuthorizationSession(request);
};

const pushFalseScope = (whereClauses: string[]) => {
  whereClauses.push("(1 = 0)");
};

const getScopedVendorCustomerCondition = ({
  customerExpression,
  vendorParamRef,
}: {
  customerExpression: string;
  vendorParamRef: string;
}) => `
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

export module accessScopeService {
  export const normalizeRole = normalizeText;

  export const applyRoleScopes = (role: string, permissionset: any[] = []) => {
    if (normalizeText(role) !== VENDOR_ROLE || !Array.isArray(permissionset)) {
      return permissionset;
    }

    return permissionset.map((permission) => {
      const defaultScope = vendorPermissionScopes[permission?.objectAPI];
      if (!defaultScope) {
        return permission;
      }

      return {
        ...permission,
        scope: {
          ...defaultScope,
          ...(permission?.scope || {}),
        },
      };
    });
  };

  export const getSession = getRequestSession;

  export const isVendorRequest = async (request: any) => {
    const session = await getRequestSession(request);
    return normalizeText(session?.role) === VENDOR_ROLE;
  };

  export const getVendorUserId = async (request: any) => {
    const session = await getRequestSession(request);
    return Number(session?.id || 0);
  };

  export const appendVendorBusinessCustomerScope = async (
    request: any,
    whereClauses: string[],
    queryParams: any[],
    parameterIndex: number,
    options: { customerAlias?: string; customerIdColumn?: string } = {}
  ) => {
    if (!(await isVendorRequest(request))) {
      return parameterIndex;
    }

    const vendorUserId = await getVendorUserId(request);
    if (!vendorUserId) {
      pushFalseScope(whereClauses);
      return parameterIndex;
    }

    const customerAlias = options.customerAlias || "u";
    const customerIdColumn = options.customerIdColumn || "id";
    const customerExpression = `${customerAlias}.${customerIdColumn}`;

    whereClauses.push(`${customerAlias}.isbusinessuser = TRUE`);
    whereClauses.push(
      getScopedVendorCustomerCondition({
        customerExpression,
        vendorParamRef: `$${parameterIndex}`,
      })
    );
    queryParams.push(vendorUserId);
    return parameterIndex + 1;
  };

  export const appendVendorCustomerColumnScope = async (
    request: any,
    whereClauses: string[],
    queryParams: any[],
    parameterIndex: number,
    options: { tableAlias: string; customerColumn: string }
  ) => {
    if (!(await isVendorRequest(request))) {
      return parameterIndex;
    }

    const vendorUserId = await getVendorUserId(request);
    if (!vendorUserId) {
      pushFalseScope(whereClauses);
      return parameterIndex;
    }

    const customerExpression = `${options.tableAlias}.${options.customerColumn}`;
    whereClauses.push(
      getScopedVendorCustomerCondition({
        customerExpression,
        vendorParamRef: `$${parameterIndex}`,
      })
    );
    queryParams.push(vendorUserId);
    return parameterIndex + 1;
  };

  export const getRentalTicketPredicate = (ticketAlias = "t") => `(
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

  export const appendVendorTicketScope = async (
    request: any,
    whereClauses: string[],
    queryParams: any[],
    parameterIndex: number,
    options: { ticketAlias?: string; customerColumn?: string } = {}
  ) => {
    if (!(await isVendorRequest(request))) {
      return parameterIndex;
    }

    const ticketAlias = options.ticketAlias || "t";
    const nextParameterIndex = await appendVendorCustomerColumnScope(
      request,
      whereClauses,
      queryParams,
      parameterIndex,
      {
        tableAlias: ticketAlias,
        customerColumn: options.customerColumn || "userid",
      }
    );

    whereClauses.push(getRentalTicketPredicate(ticketAlias));
    return nextParameterIndex;
  };

  export const canVendorAccessCustomer = async (request: any, customerId: any) => {
    if (!(await isVendorRequest(request))) {
      return true;
    }

    const vendorUserId = await getVendorUserId(request);
    const parsedCustomerId = Number(customerId || 0);
    if (!vendorUserId || !parsedCustomerId) {
      return false;
    }

    const result = await query(
      `
        SELECT 1
        FROM users u
        JOIN business_customer_vendor_assignments a
          ON a.customerid = u.id
         AND a.isactive = TRUE
        WHERE u.id = $1
          AND u.isbusinessuser = TRUE
          AND a.vendoruserid = $2
        LIMIT 1
      `,
      [parsedCustomerId, vendorUserId]
    );

    return result.rows.length > 0;
  };

  export const canVendorAccessTicket = async (request: any, ticketId: any) => {
    if (!(await isVendorRequest(request))) {
      return true;
    }

    const whereClauses = ["t.id = $1"];
    const queryParams = [Number(ticketId || 0)];
    await appendVendorTicketScope(request, whereClauses, queryParams, 2, {
      ticketAlias: "t",
    });

    const result = await query(
      `
        SELECT t.id
        FROM tickets t
        WHERE ${whereClauses.join(" AND ")}
        LIMIT 1
      `,
      queryParams
    );

    return result.rows.length > 0;
  };

  export const isRentalTicketPayload = async (payload: any) => {
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

    const result = await query(
      `
        SELECT 1
        FROM orderline
        WHERE id = $1
          AND LOWER(COALESCE(ordername, '')) = 'rental'
        LIMIT 1
      `,
      [linkedOrderLineId]
    );

    return result.rows.length > 0;
  };

  export const getPermissionsForRole = async (role: string) => {
    const result = await query(
      `SELECT * FROM permissions WHERE LOWER(role) = LOWER($1) LIMIT 1`,
      [role]
    );

    return result.rows[0] ?? null;
  };

  export const getAccessForRequest = async (request: any) => {
    const session = await getRequestSession(request);
    if (!session?.role) {
      return null;
    }

    const permissionRow = await getPermissionsForRole(session.role);
    return {
      actor: session,
      role: session.role,
      permissionset: applyRoleScopes(session.role, permissionRow?.permissionset || []),
      permission: permissionRow || null,
    };
  };
}
