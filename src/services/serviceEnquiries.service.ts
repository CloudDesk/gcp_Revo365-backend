import { query } from "../database/postgres.js";

export const SERVICE_ENQUIRY_STATUSES = [
  "Open",
  "Contacted",
  "Quoted",
  "Converted",
  "Closed",
] as const;

export type ServiceEnquiryStatus = (typeof SERVICE_ENQUIRY_STATUSES)[number];

export interface ServiceEnquiryPayload {
  customer_name: string;
  phone: string;
  email: string;
  device_type: string;
  device_model: string;
  status?: ServiceEnquiryStatus;
  issue_description: string;
  notes?: string | null;
}

const buildFilterClause = (
  search: string = "",
  status: string = "",
  queryParams: any[] = []
) => {
  const clauses: string[] = [];
  let paramIndex = queryParams.length + 1;

  if (search) {
    clauses.push(`
      (
        customer_name ILIKE $${paramIndex}
        OR email ILIKE $${paramIndex}
        OR phone ILIKE $${paramIndex}
        OR device_type ILIKE $${paramIndex}
        OR device_model ILIKE $${paramIndex}
        OR status ILIKE $${paramIndex}
        OR issue_description ILIKE $${paramIndex}
        OR notes ILIKE $${paramIndex}
      )
    `);
    queryParams.push(`%${search}%`);
    paramIndex++;
  }

  if (status) {
    clauses.push(`status = $${paramIndex}`);
    queryParams.push(status);
  }

  return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
};

export module serviceEnquiriesService {
  export const createEnquiry = async (data: ServiceEnquiryPayload) => {
    const queryText = `
      INSERT INTO service_enquiries (
        customer_name,
        phone,
        email,
        device_type,
        device_model,
        status,
        issue_description,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const result = await query(queryText, [
      data.customer_name,
      data.phone,
      data.email,
      data.device_type,
      data.device_model,
      data.status || "Open",
      data.issue_description,
      data.notes || null,
    ]);

    return result.rows[0];
  };

  export const getAllEnquiries = async (
    pageNumber: number,
    recordCount: number,
    search: string = "",
    status: string = ""
  ) => {
    const offset = (pageNumber - 1) * recordCount;
    const queryParams: any[] = [];
    let queryText = `SELECT * FROM service_enquiries`;

    queryText += buildFilterClause(search, status, queryParams);

    const limitParam = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;
    queryText += ` ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam};`;
    queryParams.push(recordCount, offset);

    const result = await query(queryText, queryParams);
    return result.rows;
  };

  export const getEnquiryById = async (id: number) => {
    const result = await query(`SELECT * FROM service_enquiries WHERE id = $1;`, [id]);
    return result.rows[0];
  };

  export const updateEnquiry = async (id: number, data: ServiceEnquiryPayload) => {
    const queryText = `
      UPDATE service_enquiries
      SET
        customer_name = $1,
        phone = $2,
        email = $3,
        device_type = $4,
        device_model = $5,
        status = $6,
        issue_description = $7,
        notes = $8,
        modified_at = NOW()
      WHERE id = $9
      RETURNING *;
    `;

    const result = await query(queryText, [
      data.customer_name,
      data.phone,
      data.email,
      data.device_type,
      data.device_model,
      data.status || "Open",
      data.issue_description,
      data.notes || null,
      id,
    ]);

    return result.rows[0];
  };

  export const getCount = async (search: string = "", status: string = "") => {
    const queryParams: any[] = [];
    let queryText = `SELECT count(*) FROM service_enquiries`;
    queryText += buildFilterClause(search, status, queryParams);

    const result = await query(queryText, queryParams);
    return result.rows[0].count;
  };
}
