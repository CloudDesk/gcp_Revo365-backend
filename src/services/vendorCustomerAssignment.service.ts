import { query } from "../database/postgres.js";
import { accessScopeService } from "./accessScope.service.js";

const normalizeRole = (value: any) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const parsePositiveIntegerArray = (values: any) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
};

const requireAdmin = async (request: any) => {
  const session = await accessScopeService.getSession(request);
  if (normalizeRole(session?.role) !== "admin") {
    const error: any = new Error("Only admin users can manage vendor customer assignments.");
    error.statusCode = 403;
    throw error;
  }
  return session;
};

export module vendorCustomerAssignmentService {
  export const getAssignments = async (request: any) => {
    const session = await accessScopeService.getSession(request);
    const isAdmin = normalizeRole(session?.role) === "admin";
    const isVendor = normalizeRole(session?.role) === "vendor";
    const requestedVendorUserId = Number(request.query?.vendoruserid || session?.id || 0);

    if (!requestedVendorUserId) {
      return [];
    }

    if (!isAdmin && (!isVendor || Number(session?.id) !== requestedVendorUserId)) {
      const error: any = new Error("You are not allowed to view these assignments.");
      error.statusCode = 403;
      throw error;
    }

    const result = await query(
      `
        SELECT
          a.*,
          u.firstname,
          u.lastname,
          u.useremail,
          u.usermobilenumber,
          u.gstnumber,
          u.isbusinessuser,
          latest_address.city,
          latest_address.state,
          latest_address.pincode
        FROM business_customer_vendor_assignments a
        JOIN users u
          ON u.id = a.customerid
        LEFT JOIN LATERAL (
          SELECT city, state, pincode
          FROM address addr
          WHERE addr.userid = u.id
          ORDER BY addr.modifieddate DESC NULLS LAST, addr.id DESC
          LIMIT 1
        ) latest_address ON TRUE
        WHERE a.vendoruserid = $1
          AND a.isactive = TRUE
        ORDER BY u.firstname ASC NULLS LAST, u.lastname ASC NULLS LAST, u.id ASC
      `,
      [requestedVendorUserId]
    );

    return result.rows;
  };

  export const replaceAssignments = async (request: any) => {
    const session = await requireAdmin(request);
    const vendorUserId = Number(request.body?.vendoruserid || 0);
    const customerIds = parsePositiveIntegerArray(request.body?.customerids);

    if (!vendorUserId) {
      const error: any = new Error("Vendor user id is required.");
      error.statusCode = 400;
      throw error;
    }

    const vendorResult = await query(
      `SELECT id, role FROM inventoryusers WHERE id = $1 LIMIT 1`,
      [vendorUserId]
    );
    const vendor = vendorResult.rows[0];
    if (!vendor || normalizeRole(vendor.role) !== "vendor") {
      const error: any = new Error("Selected inventory user must have the Vendor role.");
      error.statusCode = 400;
      throw error;
    }

    if (customerIds.length > 0) {
      const businessCustomersResult = await query(
        `
          SELECT id
          FROM users
          WHERE id = ANY($1::int[])
            AND isbusinessuser = TRUE
        `,
        [customerIds]
      );
      const validCustomerIds = new Set(
        businessCustomersResult.rows.map((row: any) => Number(row.id))
      );
      const invalidCustomerIds = customerIds.filter((id) => !validCustomerIds.has(id));

      if (invalidCustomerIds.length > 0) {
        const error: any = new Error("Assignments can include only business customers.");
        error.statusCode = 400;
        error.invalidCustomerIds = invalidCustomerIds;
        throw error;
      }
    }

    if (customerIds.length === 0) {
      await query(
        `
          UPDATE business_customer_vendor_assignments
          SET isactive = FALSE,
              modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
          WHERE vendoruserid = $1
            AND isactive = TRUE
        `,
        [vendorUserId]
      );
    } else {
      await query(
        `
          UPDATE business_customer_vendor_assignments
          SET isactive = FALSE,
              modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
          WHERE vendoruserid = $1
            AND isactive = TRUE
            AND NOT (customerid = ANY($2::int[]))
        `,
        [vendorUserId, customerIds]
      );

      for (const customerId of customerIds) {
        await query(
          `
            INSERT INTO business_customer_vendor_assignments (
              vendoruserid,
              customerid,
              isactive,
              assignedby,
              createddate,
              modifieddate
            )
            VALUES (
              $1,
              $2,
              TRUE,
              $3,
              EXTRACT(EPOCH FROM NOW())::BIGINT,
              EXTRACT(EPOCH FROM NOW())::BIGINT
            )
            ON CONFLICT (vendoruserid, customerid)
            DO UPDATE SET
              isactive = TRUE,
              assignedby = EXCLUDED.assignedby,
              modifieddate = EXCLUDED.modifieddate
          `,
          [vendorUserId, customerId, Number(session?.id || 0)]
        );
      }
    }

    return {
      message: "Vendor customer assignments updated successfully.",
      vendoruserid: vendorUserId,
      assignedcustomerids: customerIds,
    };
  };
}
