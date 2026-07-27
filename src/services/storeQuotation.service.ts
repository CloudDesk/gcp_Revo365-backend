import pool, { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";

const nowEpoch = () => Math.floor(Date.now() / 1000);

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toJsonValue = (value: any, fallback: any) => {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const normalizeQuotationType = (value: any) => {
  const normalized = String(value || "").toLowerCase().trim();
  if (normalized === "rental") return "rental";
  return "sale";
};

const normalizeQuotationStatus = (value: any, fallback = "draft") => {
  const normalized = String(value || fallback).toLowerCase().trim();
  const allowed = new Set(["draft", "sent", "revised", "accepted", "rejected", "expired", "converted"]);
  return allowed.has(normalized) ? normalized : fallback;
};

const normalizeVersionStatus = (value: any, fallback = "draft") => {
  const normalized = String(value || fallback).toLowerCase().trim();
  const allowed = new Set(["draft", "sent", "revised", "accepted", "rejected", "expired"]);
  return allowed.has(normalized) ? normalized : fallback;
};

const buildQuotationNumber = (id: number) => `SQ-${String(id).padStart(6, "0")}`;

const normalizeVersionPayload = (data: any) => ({
  status: normalizeVersionStatus(data?.versionstatus || data?.status, "draft"),
  subtotalamount: toNumber(data?.subtotalamount ?? data?.subtotal),
  discountamount: toNumber(data?.discountamount ?? data?.discount),
  taxableamount: toNumber(data?.taxableamount),
  cgst: toNumber(data?.cgst),
  sgst: toNumber(data?.sgst),
  igst: toNumber(data?.igst),
  taxamount: toNumber(data?.taxamount),
  roundoffamount: toNumber(data?.roundoffamount),
  totalamount: toNumber(data?.totalamount ?? data?.grandtotal ?? data?.amount),
  validitydate: data?.validitydate ? Number(data.validitydate) : null,
  itemdata: toJsonValue(data?.itemdata ?? data?.items, []),
  quotationdata: toJsonValue(data?.quotationdata, {}),
  billingaddresssnapshot: toJsonValue(data?.billingaddresssnapshot, null),
  shippingaddresssnapshot: toJsonValue(data?.shippingaddresssnapshot, null),
  termsconditions: data?.termsconditions ?? null,
  notes: data?.notes ?? null,
  quoteurl: data?.quoteurl ?? null,
  createdby: data?.createdby ?? data?.modifiedby ?? null,
});

const formatWhereFilters = (queryParamsObject: any) => {
  const whereClauses = ["COALESCE(q.isdeleted, FALSE) = FALSE"];
  const params: any[] = [];
  let idx = 1;

  Object.entries(queryParamsObject || {}).forEach(([key, rawValue]) => {
    if (["page", "count", "sortby"].includes(key)) return;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (values.length === 0 || values[0] == null || values[0] === "") return;

    if (key === "createddate" || key === "modifieddate") {
      values.forEach((range: any) => {
        const [from, to] = String(range).split("-");
        if (from && to) {
          whereClauses.push(`q.${key} BETWEEN $${idx} AND $${idx + 1}`);
          params.push(Number(from), Number(to));
          idx += 2;
        }
      });
      return;
    }

    if (key === "search") {
      whereClauses.push(`(
        LOWER(COALESCE(q.quotationnumber, '')) LIKE $${idx}
        OR LOWER(COALESCE(q.customername, '')) LIKE $${idx}
        OR LOWER(COALESCE(q.customermobilenumber, '')) LIKE $${idx}
        OR LOWER(COALESCE(q.convertedorderid, '')) LIKE $${idx}
      )`);
      params.push(`%${String(values[0]).toLowerCase().trim()}%`);
      idx += 1;
      return;
    }

    const allowedColumns = new Set(["id", "customerid", "quotationnumber", "quotationtype", "status", "storelocation"]);
    if (!allowedColumns.has(key)) return;

    whereClauses.push(`(${values.map((_, valueIndex) => `q.${key} = $${idx + valueIndex}`).join(" OR ")})`);
    params.push(...values);
    idx += values.length;
  });

  return { whereClause: `WHERE ${whereClauses.join(" AND ")}`, params, nextIndex: idx };
};

export module storeQuotationService {
  export const getStoreQuotations = async (request: any) => {
    try {
      const pageNumber = parseInt(request.query.page) || 1;
      const recordCount = parseInt(request.query.count) || 5000;
      const offset = (pageNumber - 1) * recordCount;
      const { whereClause, params, nextIndex } = formatWhereFilters(request.query);
      let orderByField = "q.modifieddate";
      let orderByDirection = "DESC";

      if (request.query.sortby) {
        const [fieldName, direction] = String(request.query.sortby).split("-");
        const sortMap: Record<string, string> = {
          quotationnumber: "q.quotationnumber",
          createddate: "q.createddate",
          modifieddate: "q.modifieddate",
          totalamount: "COALESCE(fv.totalamount, lv.totalamount, 0)",
          status: "q.status",
        };
        orderByField = sortMap[fieldName] || orderByField;
        orderByDirection = direction?.toUpperCase() === "ASC" ? "ASC" : "DESC";
      }

      const result = await query(
        `
        SELECT
          q.*,
          COALESCE(fv.id, lv.id) AS activeversionid,
          COALESCE(fv.versionnumber, lv.versionnumber) AS activeversionnumber,
          COALESCE(fv.totalamount, lv.totalamount, 0) AS totalamount,
          COALESCE(fv.discountamount, lv.discountamount, 0) AS discountamount,
          COALESCE(fv.quoteurl, lv.quoteurl) AS quoteurl,
          COALESCE(fv.itemdata, lv.itemdata, '[]'::jsonb) AS itemdata,
          COALESCE(fv.quotationdata, lv.quotationdata, '{}'::jsonb) AS quotationdata
        FROM store_quotations q
        LEFT JOIN store_quotation_versions fv ON fv.id = q.finalversionid
        LEFT JOIN LATERAL (
          SELECT *
          FROM store_quotation_versions
          WHERE quotationid = q.id
          ORDER BY versionnumber DESC
          LIMIT 1
        ) lv ON TRUE
        ${whereClause}
        ORDER BY ${orderByField} ${orderByDirection}
        OFFSET $${nextIndex} LIMIT $${nextIndex + 1}
        `,
        [...params, offset, recordCount]
      );

      return await dataTypeCheck(result);
    } catch (error) {
      console.error("Query Execution Error: IN getStoreQuotations", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const getStoreQuotationVersions = async (request: any) => {
    try {
      const quotationId = request.params?.id || request.query?.quotationid;
      const result = await query(
        `SELECT * FROM store_quotation_versions WHERE quotationid = $1 ORDER BY versionnumber DESC`,
        [quotationId]
      );
      return await dataTypeCheck(result);
    } catch (error) {
      console.error("Query Execution Error: IN getStoreQuotationVersions", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const upsertStoreQuotation = async (quotationData: any) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const epoch = nowEpoch();
      const quotationType = normalizeQuotationType(quotationData?.quotationtype);
      const customerId = quotationData?.customerid ?? null;
      let quotationId = quotationData?.id ?? quotationData?.quotationid ?? null;
      let headerRow: any;

      if (quotationId) {
        const headerResult = await client.query(
          `
          UPDATE store_quotations
          SET customerid = COALESCE($1, customerid),
              customername = COALESCE($2, customername),
              customermobilenumber = COALESCE($3, customermobilenumber),
              quotationtype = COALESCE($4, quotationtype),
              status = CASE WHEN status IN ('accepted', 'converted') THEN status ELSE $5 END,
              storelocation = COALESCE($6, storelocation),
              modifiedby = COALESCE($7, modifiedby),
              modifieddate = $8
          WHERE id = $9
          RETURNING *
          `,
          [
            customerId,
            quotationData?.customername ?? null,
            quotationData?.customermobilenumber ?? null,
            quotationType,
            normalizeQuotationStatus(quotationData?.status, "revised"),
            quotationData?.storelocation ?? null,
            quotationData?.modifiedby ?? quotationData?.createdby ?? null,
            epoch,
            quotationId,
          ]
        );
        headerRow = headerResult.rows[0];
      } else {
        const headerResult = await client.query(
          `
          INSERT INTO store_quotations (
            customerid, customername, customermobilenumber, quotationtype,
            status, source, storelocation, createdby, modifiedby, createddate, modifieddate
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$9)
          RETURNING *
          `,
          [
            customerId,
            quotationData?.customername ?? null,
            quotationData?.customermobilenumber ?? null,
            quotationType,
            normalizeQuotationStatus(quotationData?.status, "draft"),
            quotationData?.source ?? "instore",
            quotationData?.storelocation ?? null,
            quotationData?.createdby ?? null,
            epoch,
          ]
        );
        headerRow = headerResult.rows[0];
        quotationId = headerRow.id;
        const quotationNumber = quotationData?.quotationnumber || buildQuotationNumber(Number(quotationId));
        const numberResult = await client.query(
          `UPDATE store_quotations SET quotationnumber = $1 WHERE id = $2 RETURNING *`,
          [quotationNumber, quotationId]
        );
        headerRow = numberResult.rows[0];
      }

      if (!headerRow) {
        throw new Error("Quotation not found");
      }

      const versionNumberResult = await client.query(
        `SELECT COALESCE(MAX(versionnumber), 0) + 1 AS nextversion FROM store_quotation_versions WHERE quotationid = $1`,
        [quotationId]
      );
      const versionNumber = Number(versionNumberResult.rows[0]?.nextversion || 1);
      const version = normalizeVersionPayload(quotationData);
      const versionResult = await client.query(
        `
        INSERT INTO store_quotation_versions (
          quotationid, versionnumber, status, subtotalamount, discountamount,
          taxableamount, cgst, sgst, igst, taxamount, roundoffamount, totalamount,
          validitydate, itemdata, quotationdata, billingaddresssnapshot,
          shippingaddresssnapshot, termsconditions, notes, quoteurl, createdby,
          createddate, modifieddate
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,
          $16::jsonb,$17::jsonb,$18,$19,$20,$21,$22,$22
        )
        RETURNING *
        `,
        [
          quotationId,
          versionNumber,
          version.status,
          version.subtotalamount,
          version.discountamount,
          version.taxableamount,
          version.cgst,
          version.sgst,
          version.igst,
          version.taxamount,
          version.roundoffamount,
          version.totalamount,
          version.validitydate,
          JSON.stringify(version.itemdata || []),
          JSON.stringify(version.quotationdata || {}),
          JSON.stringify(version.billingaddresssnapshot),
          JSON.stringify(version.shippingaddresssnapshot),
          version.termsconditions,
          version.notes,
          version.quoteurl,
          version.createdby,
          epoch,
        ]
      );

      const refreshedHeader = await client.query(
        `SELECT * FROM store_quotations WHERE id = $1`,
        [quotationId]
      );
      await client.query("COMMIT");
      return {
        command: quotationData?.id || quotationData?.quotationid ? "UPDATE" : "INSERT",
        rows: [{ ...refreshedHeader.rows[0], version: versionResult.rows[0] }],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Query Execution Error: IN upsertStoreQuotation", error);
      return await ErrorHandler.handleQueryError(error);
    } finally {
      client.release();
    }
  };

  export const finalizeStoreQuotation = async (request: any) => {
    try {
      const quotationId = request.params?.id || request.body?.quotationid;
      const versionId = request.body?.versionid || request.body?.quotationversionid;
      const epoch = nowEpoch();
      const versionResult = await query(
        `
        SELECT *
        FROM store_quotation_versions
        WHERE quotationid = $1
          AND ($2::integer IS NULL OR id = $2::integer)
        ORDER BY versionnumber DESC
        LIMIT 1
        `,
        [quotationId, versionId ? Number(versionId) : null]
      );

      const version = versionResult.rows[0];
      if (!version) {
        return { errorMessage: "Quotation version not found", statusCode: 404 };
      }

      await query(`UPDATE store_quotation_versions SET status = 'accepted', modifieddate = $1 WHERE id = $2`, [epoch, version.id]);
      const result = await query(
        `
        UPDATE store_quotations
        SET finalversionid = $1,
            status = 'accepted',
            modifieddate = $2,
            modifiedby = COALESCE($3, modifiedby)
        WHERE id = $4
        RETURNING *
        `,
        [version.id, epoch, request.body?.modifiedby ?? null, quotationId]
      );
      return { command: "UPDATE", rows: result.rows };
    } catch (error) {
      console.error("Query Execution Error: IN finalizeStoreQuotation", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };

  export const markStoreQuotationConverted = async (data: any) => {
    try {
      const quotationId = data?.quotationid || data?.id;
      if (!quotationId) {
        return { errorMessage: "Quotation id is mandatory", statusCode: 400 };
      }
      const result = await query(
        `
        UPDATE store_quotations
        SET status = 'converted',
            convertedorderid = COALESCE($1, convertedorderid),
            convertedinvoiceid = COALESCE($2, convertedinvoiceid),
            converteddate = $3,
            modifieddate = $3,
            modifiedby = COALESCE($4, modifiedby)
        WHERE id = $5
        RETURNING *
        `,
        [data?.convertedorderid ?? data?.orderid ?? null, data?.convertedinvoiceid ?? data?.invoiceid ?? null, nowEpoch(), data?.modifiedby ?? null, quotationId]
      );
      return { command: "UPDATE", rows: result.rows };
    } catch (error) {
      console.error("Query Execution Error: IN markStoreQuotationConverted", error);
      return await ErrorHandler.handleQueryError(error);
    }
  };
}
