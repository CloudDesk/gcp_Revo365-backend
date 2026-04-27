import { PROTOCOL } from "../config/config.js";
import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import { sendTransactionalMail } from "../Gmail/gmail.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";

// ─── Email Helpers (Internal) ───────────────────────────────────────────────

const replaceTemplateTokens = (
  input: string,
  replacements: Record<string, string>
) => {
  let output = input || "";
  for (const [key, value] of Object.entries(replacements)) {
    const token = new RegExp(`\\{${key}\\}`, "g");
    output = output.replace(token, value ?? "");
  }
  return output;
};

const parseEmailList = (raw: any): string[] => {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
};

const getCustomerByUserId = async (userid: number) => {
  if (!userid) return null;
  const result = await query(
    `SELECT id, firstname, useremail FROM users WHERE id = $1 LIMIT 1`,
    [userid]
  );
  return result.rows[0] ?? null;
};

const getInventoryUserById = async (id: number) => {
  if (!id) return null;
  const result = await query(
    `SELECT id, firstname, useremail FROM inventoryusers WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
};

const fireAssignedEmail = async (assignedid: number, ticketnumber: string, productname: string, issuedescription: string) => {
    try {
        const tech = await getInventoryUserById(assignedid);
        if (tech && tech.useremail) {
            const t = emailTemplates.tickets.assigned;
            await sendTransactionalMail({
                to: tech.useremail,
                subject: t.subject.replace('{ticketNumber}', ticketnumber),
                text: t.text
                    .replace('{technicianName}', tech.firstname || 'Technician')
                    .replace('{ticketNumber}', ticketnumber)
                    .replace('{productName}', productname || 'your product')
                    .replace('{issueDescription}', issuedescription || 'N/A')
            });
        }
    } catch (e: any) {
        console.error('[fireAssignedEmail] Error:', e?.message || e);
    }
};

const fireReassignedEmail = async (
  newAssignedId: number,
  ticketnumber: string,
  productname: string,
  issuedescription: string,
  previousTechnicianName: string
) => {
  try {
    const tech = await getInventoryUserById(newAssignedId);
    if (!tech?.useremail) return;

    const subject = `Service Ticket Reassigned — #${ticketnumber}`;
    const text = `Hi ${tech.firstname || "Technician"},

This service ticket has been reassigned to you.

Ticket Number        : ${ticketnumber}
Product              : ${productname || "your product"}
Issue                : ${issuedescription || "N/A"}
Previously Assigned  : ${previousTechnicianName || "N/A"}

Please review the ticket and continue updates from the service portal.

Thank You,
Revo Service Team`;

    await sendTransactionalMail({
      to: tech.useremail,
      subject,
      text,
    });
  } catch (e: any) {
    console.error("[fireReassignedEmail] Error:", e?.message || e);
  }
};

const fireCustomerCreatedEmail = async (ticketRow: any, customer: any) => {
  try {
    if (!customer?.useremail) return;
    const t = emailTemplates.tickets.new;
    await sendTransactionalMail({
      to: customer.useremail,
      subject: replaceTemplateTokens(t.subject, {
        ticketNumber: ticketRow.ticketnumber || "N/A",
      }),
      text: replaceTemplateTokens(t.text, {
        ticketNumber: ticketRow.ticketnumber || "N/A",
      }),
    });
  } catch (e: any) {
    console.error("[fireCustomerCreatedEmail] Error:", e?.message || e);
  }
};

const fireAdminNewTicketEmail = async (ticketRow: any) => {
  try {
    const recipients = parseEmailList(ticketRow?.receiversemail);
    if (recipients.length === 0) return;
    const t = emailTemplates.tickets.admin_new_ticket;
    await sendTransactionalMail({
      to: recipients.join(","),
      subject: replaceTemplateTokens(t.subject, {
        ticketNumber: ticketRow.ticketnumber || "N/A",
      }),
      text: replaceTemplateTokens(t.text, {
        ticketNumber: ticketRow.ticketnumber || "N/A",
        productName: ticketRow.productname || "your product",
        issueDescription: ticketRow.issuedescription || "N/A",
        location: ticketRow.location || "N/A",
      }),
    });
  } catch (e: any) {
    console.error("[fireAdminNewTicketEmail] Error:", e?.message || e);
  }
};

const fireCustomerStatusEmail = async (ticketRow: any, customer: any) => {
  try {
    if (!customer?.useremail || !ticketRow?.ticketstatus) return;
    const t = emailTemplates.tickets[ticketRow.ticketstatus];
    const replacements = {
      ticketNumber: ticketRow.ticketnumber || "N/A",
      productName: ticketRow.productname || "your product",
      issueDescription: ticketRow.issuedescription || "N/A",
      totalPayable:
        ticketRow.totalpayableamount != null
          ? `\u20B9${ticketRow.totalpayableamount}`
          : "N/A",
      estimationUrl: ticketRow.estimationurl || "N/A",
      amount:
        ticketRow.amount != null ? `\u20B9${ticketRow.amount}` : "N/A",
      paymentMethod: ticketRow.paymentmethod || "N/A",
      invoiceUrl: ticketRow.invoiceurl || "N/A",
      location: ticketRow.location || "N/A",
      technicianName: ticketRow.assignedto || "Technician",
      status: ticketRow.ticketstatus || "N/A",
    };

    if (!t) {
      // Generic fallback for statuses that do not yet have dedicated templates.
      await sendTransactionalMail({
        to: customer.useremail,
        subject: `Service Request #${ticketRow.ticketnumber} Status Updated`,
        text: `Hi,

Your service request status has been updated.

Ticket Number : ${ticketRow.ticketnumber || "N/A"}
New Status    : ${ticketRow.ticketstatus || "N/A"}
Product       : ${ticketRow.productname || "your product"}

Thank You,
Revo Service Team`,
      });
      return;
    }

    await sendTransactionalMail({
      to: customer.useremail,
      subject: replaceTemplateTokens(t.subject, replacements),
      text: replaceTemplateTokens(t.text, replacements),
    });
  } catch (e: any) {
    console.error("[fireCustomerStatusEmail] Error:", e?.message || e);
  }
};

const firePaymentReceivedEmail = async (ticketnumber: string, amount: number, paymentmethod: string) => {
    try {
        const result = await query(`
            SELECT u.useremail 
            FROM tickets t
            JOIN users u ON t.userid = u.id
            WHERE t.ticketnumber = $1
            LIMIT 1
        `, [ticketnumber]);
        if (result.rows.length > 0 && result.rows[0].useremail) {
            const customer = result.rows[0];
            const t = emailTemplates.tickets.payment_received;
            await sendTransactionalMail({
                to: customer.useremail,
                subject: t.subject.replace('{ticketNumber}', ticketnumber),
                text: t.text
                    .replace('{ticketNumber}', ticketnumber)
                    .replace('{amount}', amount ? `\u20B9${amount}` : 'N/A')
                    .replace('{paymentMethod}', paymentmethod || 'N/A')
            });
        }
    } catch (e: any) {
         console.error('[firePaymentReceivedEmail] Error:', e?.message || e);
    }
};

const processTicketNotifications = async (
  previousTicket: any,
  currentTicket: any,
  isInsert: boolean
) => {
  if (!currentTicket) return;

  const customer = await getCustomerByUserId(currentTicket.userid);
  if (isInsert) {
    await fireCustomerCreatedEmail(currentTicket, customer);
    await fireAdminNewTicketEmail(currentTicket);
  }

  const prevAssignedId = previousTicket?.assignedid
    ? Number(previousTicket.assignedid)
    : null;
  const currAssignedId = currentTicket?.assignedid
    ? Number(currentTicket.assignedid)
    : null;
  const assignedChanged = prevAssignedId !== currAssignedId;

  if (currAssignedId && (isInsert || assignedChanged)) {
    if (!isInsert && prevAssignedId && prevAssignedId !== currAssignedId) {
      const prevTech = await getInventoryUserById(prevAssignedId);
      await fireReassignedEmail(
        currAssignedId,
        currentTicket.ticketnumber,
        currentTicket.productname,
        currentTicket.issuedescription,
        prevTech?.firstname || "Technician"
      );
    } else {
      await fireAssignedEmail(
        currAssignedId,
        currentTicket.ticketnumber,
        currentTicket.productname,
        currentTicket.issuedescription
      );
    }
  }

  const prevStatus = previousTicket?.ticketstatus || null;
  const currStatus = currentTicket?.ticketstatus || null;
  const statusChanged = !isInsert && !!currStatus && prevStatus !== currStatus;

  if (statusChanged) {
    await fireCustomerStatusEmail(currentTicket, customer);
  }
};

const TICKET_INTEGER_FIELDS = new Set([
  "id",
  "assignedto",
  "userid",
  "assignedid",
  "approvedcostestimationid",
  "addressid",
  "queuenumber",
  "createdbyid",
  "productid",
  "linkedorderlineid",
  "activereplacementid",
  "agreementid",
  "penaltyinvoiceid",
]);

const TICKET_BIGINT_FIELDS = new Set([
  "createddate",
  "modifieddate",
  "transactiondate",
  "purchasedate",
  "closeddate",
  "assigneddate",
  "productdelivereddate",
  "requestedrenewaldate",
  "requestedstopdate",
  "approvedrenewaldate",
  "receivedassetdate",
  "resolvedassetdate",
]);

const TICKET_NUMERIC_FIELDS = new Set(["amount"]);

const TICKET_BOOLEAN_FIELDS = new Set([
  "proceedwithvalueservice",
  "underwarranty",
  "istransferred",
  "isreopend",
  "typemanual",
  "replacementrequest",
  "stoprental",
]);

const isNullishStringLiteral = (value: any) =>
  typeof value === "string" &&
  ["null", "undefined"].includes(value.trim().toLowerCase());

const toNullableInteger = (value: any, fieldName: string) => {
  if (value == null || isNullishStringLiteral(value)) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  }

  throw new Error(
    `Invalid value for ticket field "${fieldName}". Expected an integer-compatible value or null.`
  );
};

const toNullableNumber = (value: any, fieldName: string) => {
  if (value == null || isNullishStringLiteral(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  }

  throw new Error(
    `Invalid value for ticket field "${fieldName}". Expected a numeric value or null.`
  );
};

const toNullableBoolean = (value: any, fieldName: string) => {
  if (value == null || isNullishStringLiteral(value)) return null;
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }

  throw new Error(
    `Invalid value for ticket field "${fieldName}". Expected a boolean value or null.`
  );
};

const normalizeTicketFieldValue = (fieldName: string, value: any) => {
  if (TICKET_INTEGER_FIELDS.has(fieldName) || TICKET_BIGINT_FIELDS.has(fieldName)) {
    return toNullableInteger(value, fieldName);
  }

  if (TICKET_NUMERIC_FIELDS.has(fieldName)) {
    return toNullableNumber(value, fieldName);
  }

  if (TICKET_BOOLEAN_FIELDS.has(fieldName)) {
    return toNullableBoolean(value, fieldName);
  }

  if (isNullishStringLiteral(value)) {
    return null;
  }

  return value;
};

const normalizeTicketPayload = (ticketData: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(ticketData).map(([fieldName, value]) => [
      fieldName,
      normalizeTicketFieldValue(fieldName, value),
    ])
  );

export module ticketService {
  export const getTicketDynamic = async (request) => {
    try {
      const userid = request.query.userid;
      const keys = Object.keys(request.query);
      const pageNumber = request.query.page;
      const recordCount = request.query.count;
      const queryParams = [];
      let whereClauses = [];
      let offset: any;
      let parameterIndex = 1;
      Object.entries(request.query).forEach(([key, value], index) => {
        if (key !== 'page' && key !== 'count') {
          const paramValues = Array.isArray(value) ? value : [value];
          if (key === "createddate" || key === "modifieddate") {
            let rangeWhereClause = paramValues
              .map((range) => {
                const [lowerBound, upperBound] = range.split("-");
                queryParams.push(lowerBound, upperBound);
                const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
                  })`;
                parameterIndex += 2;
                return clause;
              })
              .join(" OR ");
            whereClauses.push(`(${rangeWhereClause})`);

          }
          else {
            whereClauses.push(
              `(${paramValues.map((_, idx) => `${key} = $${parameterIndex}`).join(" OR ")})`
            );
            queryParams.push(...paramValues);
            parameterIndex += paramValues.length;
          }

        }

      });
      if (pageNumber && recordCount) {
        offset = (pageNumber - 1) * recordCount;
      }

      let querydata = `select * from tickets`
      if (whereClauses.length > 0) {
        querydata += ` WHERE ${whereClauses.join(" AND ")} ORDER BY modifieddate DESC`;
      }
      else {
        querydata += ` ORDER BY modifieddate DESC`;
      }

      if (offset != null && recordCount != null) {
        querydata += ` OFFSET $${queryParams.length + 1} LIMIT $${queryParams.length + 2}`;
        queryParams.push(offset, recordCount);
      }

      let data = await query(querydata, queryParams)

      if (keys.length == 1 && keys[0] == 'userid') {
        const invoiceQuery = `
                SELECT DISTINCT r.invoiceurl, t.ticketnumber, t.userid
                FROM revoinvoice AS r 
                JOIN tickets AS t ON r.ticketnumber = t.ticketnumber 
                WHERE t.userid = $1 AND r.invoicefor = 'service';
            `
        const invoiceurldata = await query(invoiceQuery, [userid])
        const invoiceMap = new Map(invoiceurldata.rows.map(row => [row.ticketnumber, row.invoiceurl]));

        data.rows = data.rows.map(row => ({
          ...row,
          invoiceurl: invoiceMap.get(row.ticketnumber) || null
        }));
      }
      else {
      }

      return data.rows
    } catch (error) {
      console.error("Query Execution Error: IN getTicketDynamic", error);
      let ErrorMessage = await ErrorHandler.handleQueryError(error)
      return ErrorMessage
    }
  }
  export const getTicketData = async (request) => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);
      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "t.modifieddate";
      let orderByDirection = "DESC";

      keys.forEach((key, index) => {
        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        if (key === "range") {
          const rangeClauses = paramValues.map((range) => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
              })`;
            parameterIndex += 2;
            return clause;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
        } else if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (paramValues[0].startsWith("NOT ")) {
          const cleanValue = paramValues[0].slice(4);
          whereClauses.push(`(${key} != $${parameterIndex})`);
          queryParams.push(cleanValue);
          parameterIndex++;
        } else if (key !== "page" && key !== "count") {
          const clauses = paramValues.map(
            (_, idx) => `${key} = $${parameterIndex + idx}`
          );
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });
      const offset = (pageNumber - 1) * recordCount;
      const baseConditions = `
      (isarchive = FALSE OR isarchive IS NULL) AND 
      (isdeleted = FALSE OR isdeleted IS NULL) AND  
      (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
      let queryText = `
      SELECT t.*, i.id as inventoryuserid,i.firstname as username,i.role as userrole,p.warranty AS product_warranty
      FROM tickets t
      LEFT JOIN (
    SELECT id,firstname,role
    FROM inventoryusers 
) AS i ON i.id = t.assignedid
   LEFT JOIN (
    SELECT id,warranty
    FROM product_revo p
) AS p ON p.id = t.productid
      ${whereClause} ${orderByClause}`;
      if (pageNumber && recordCount) {
        queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
      }
      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result);
      return datatypeCheckResult;
    } catch (error) {
      let ErrorData = ErrorHandler.handleQueryError(error);
      return ErrorData;
    }
  };

  export const getQueueTicketData = async (request) => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const keys = Object.keys(request.query);
      const values = Object.values(request.query);
      let whereClauses: string[] = [];
      let parameterIndex = 1;
      const queryParams: any[] = [];
      let orderByField = "t.queuenumber";
      let orderByDirection = "ASC";

      keys.forEach((key, index) => {
        const paramValues: any = Array.isArray(values[index])
          ? values[index]
          : [values[index]];
        if (key === "range") {
          const rangeClauses = paramValues.map((range) => {
            const [lowerBound, upperBound] = range.split("-");
            queryParams.push(lowerBound, upperBound);
            const clause = `(${key} BETWEEN $${parameterIndex} AND $${parameterIndex + 1
              })`;
            parameterIndex += 2;
            return clause;
          });
          whereClauses.push(`(${rangeClauses.join(" OR ")})`);
        } else if (key === "sortby") {
          const [fieldName, direction] = paramValues[0].split("-");
          orderByField = fieldName;
          orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
        } else if (paramValues[0].startsWith("NOT ")) {
          const cleanValue = paramValues[0].slice(4);
          whereClauses.push(`(${key} != $${parameterIndex})`);
          queryParams.push(cleanValue);
          parameterIndex++;
        } else if (key !== "page" && key !== "count") {
          const clauses = paramValues.map(
            (_, idx) => `${key} = $${parameterIndex + idx}`
          );
          whereClauses.push(`(${clauses.join(" OR ")})`);
          queryParams.push(...paramValues);
          parameterIndex += paramValues.length;
        }
      });
      const offset = (pageNumber - 1) * recordCount;
      const baseConditions = `(isarchive = FALSE OR isarchive IS NULL) AND (isdeleted = FALSE OR isdeleted IS NULL) AND  (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)`;
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ``;
      const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
      let queryText = `
       SELECT t.*, i.id as userid,i.firstname as username,i.role as userrole,i.location as userlocation
      FROM tickets t
      LEFT JOIN inventoryusers i ON t.assignedid = i.id
      ${whereClause} ${orderByClause}`;
      if (pageNumber && recordCount) {
        queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
      }
      const result = await query(queryText, queryParams);
      let datatypeCheckResult = await dataTypeCheck(result);
      return datatypeCheckResult;
    } catch (error) {
      let ErrorData = ErrorHandler.handleQueryError(error);
      return ErrorData;
    }
  };

export const upsertTickets = async (ticketData, files: any, host: string) => {
  try {
    let querydata: string;
    let params: any[];

    // ✅ KEEP normalization
    const normalizedTicketData = normalizeTicketPayload(ticketData);

    // ✅ KEEP notification tracking
    const { id, inventoryuserid, product_warranty, ...upsertFields } = normalizedTicketData;

    let previousTicket: any = null;
    if (id) {
      const prevResult = await query(`SELECT * FROM tickets WHERE id = $1 LIMIT 1`, [id]);
      previousTicket = prevResult.rows[0] ?? null;
    }

    if (files && files.length > 0) {
      for (const file of files) {
        upsertFields.recipturl =
          PROTOCOL + "://" + host + "/" + file.filename;
      }
    }

    const fieldNames = Object.keys(upsertFields);
    const fieldValues = Object.values(upsertFields);

    if (id) {
      querydata = `UPDATE tickets SET ${fieldNames
        .map((field, index) => `${field} = $${index + 1}`)
        .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
      params = [...fieldValues, id];
    } else {
      querydata = `INSERT INTO tickets (${fieldNames.join(", ")})
                   VALUES (${fieldNames.map((_, i) => `$${i + 1}`).join(", ")})
                   RETURNING *`;
      params = fieldValues;
    }

    const result = await query(querydata, params);

    // ✅ KEEP notifications
    if (result?.rows?.length > 0) {
      await processTicketNotifications(previousTicket, result.rows[0], !id);
    }

    return result;

  } catch (error) {
    console.error("Query Execution Error: IN upsertTickets", error);
    return await ErrorHandler.handleQueryError(error);
  }
};
export const upsertGcpTickets = async (ticketData) => {
  try {
    let querydata: string;
    let params: any[];

    const normalizedTicketData = normalizeTicketPayload(ticketData);
    const { id, ...upsertFields } = normalizedTicketData;

    let previousTicket: any = null;
    if (id) {
      const prevResult = await query(`SELECT * FROM tickets WHERE id = $1 LIMIT 1`, [id]);
      previousTicket = prevResult.rows[0] ?? null;
    }

    const fieldNames = Object.keys(upsertFields);
    const fieldValues = Object.values(upsertFields);

    if (id) {
      querydata = `UPDATE tickets SET ${fieldNames
        .map((f, i) => `${f} = $${i + 1}`)
        .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
      params = [...fieldValues, id];
    } else {
      querydata = `INSERT INTO tickets (${fieldNames.join(", ")})
                   VALUES (${fieldNames.map((_, i) => `$${i + 1}`).join(", ")})
                   RETURNING *`;
      params = fieldValues;
    }

    const result = await query(querydata, params);

    if (result?.rows?.length > 0) {
      await processTicketNotifications(previousTicket, result.rows[0], !id);
    }

    return result;

  } catch (error) {
    console.error("Query Execution Error: IN upsertGcpTickets", error);
    return await ErrorHandler.handleQueryError(error);
  }
};

  export const upsertTicketspayment = async (
    ticketData,
    files: any,
    host: string
  ) => {
    try {
      let querydata: string;
      let params: any[];
      const normalizedTicketData = normalizeTicketPayload(ticketData);
      const { id, ...upsertFields } = normalizedTicketData;
      if (files && files.length > 0) {
        for (const file of files) {
          upsertFields.recipturl =
            PROTOCOL + "://" + host + "/" + file.filename;
        }
      }
      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      if (id) {
        querydata = `UPDATE tickets SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
        params = [...fieldValues, id];
      } else {
        querydata = `INSERT INTO tickets (${fieldNames.join(
          ", "
        )}) VALUES (${fieldNames
          .map((_, index) => `$${index + 1}`)
          .join(", ")}) RETURNING *`;
        params = fieldValues;
      }
      const result = await query(querydata, params);
      if (result && result.rows.length > 0) {
          await firePaymentReceivedEmail(result.rows[0].ticketnumber, result.rows[0].amount, result.rows[0].paymentmethod);
      }
      return result;
    } catch (error) {
      console.error("Query Execution Error: IN upsertTicketspayment", error);
      let ErrorData = ErrorHandler.handleQueryError(error);
      return ErrorData;
    }
  };

  export const upsertTicketstatus = async (ticketdata) => {
    try {
      let querydata: string;
      let params: any[];
      const { ticketnumber, ...upsertFields } = ticketdata;

      const fieldNames = Object.keys(upsertFields);
      const fieldValues = Object.values(upsertFields);
      if (ticketnumber) {
        querydata = `UPDATE tickets SET ${fieldNames
          .map((field, index) => `${field} = $${index + 1}`)
          .join(", ")} WHERE ticketnumber = $${fieldNames.length + 1
          } RETURNING *`;
        params = [...fieldValues, ticketnumber];
      }
      const result = await query(querydata, params);
      return result;
    } catch (error) {
      console.error("Query Execution Error: IN upsertTicketstatus", error);
      let ErrorData = ErrorHandler.handleQueryError(error);
      return ErrorData;
    }
  };
}
