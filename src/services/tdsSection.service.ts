import { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  formatTdsSectionDisplayName,
  nowEpoch,
  resolveFinanceContext,
} from "../utils/finance/finance.utils.js";

const requiredText = (
  value: unknown,
  fieldName: string,
  maxLength: number
): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new FinanceValidationError(`${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new FinanceValidationError(
      `${fieldName} must not exceed ${maxLength} characters.`
    );
  }
  return normalized;
};

const normalizePayload = (body: any) => ({
  newcode: requiredText(body?.newcode, "newcode", 20),
  natureofpayment: requiredText(
    body?.natureofpayment,
    "natureofpayment",
    500
  ),
  rate: requiredText(body?.rate, "rate", 50),
});

const withDisplayName = (row: any) => ({
  ...row,
  displayname: formatTdsSectionDisplayName(
    row.natureofpayment,
    row.newcode,
    row.rate
  ),
});

const requireSectionId = (request: any): number => {
  const sectionId = Number(request.params?.sectionId);
  if (!Number.isSafeInteger(sectionId) || sectionId <= 0) {
    throw new FinanceValidationError("A valid sectionId is required.");
  }
  return sectionId;
};

export module tdsSectionService {
  export const list = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const search = String(request.query?.search ?? "").trim().toLowerCase();
    const params: any[] = [organizationId];
    let searchCondition = "";

    if (search) {
      params.push(`%${search}%`);
      searchCondition = `
        AND (
          LOWER(newcode) LIKE $2
          OR LOWER(natureofpayment) LIKE $2
          OR LOWER(rate) LIKE $2
        )
      `;
    }

    const result = await query(
      `
      SELECT
        id,
        newcode,
        natureofpayment,
        rate
      FROM tds_sections
      WHERE organizationid = $1
      ${searchCondition}
      ORDER BY newcode ASC
      `,
      params
    );

    return result.rows.map(withDisplayName);
  };

  export const getById = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const sectionId = requireSectionId(request);
    const result = await query(
      `
      SELECT
        id,
        newcode,
        natureofpayment,
        rate
      FROM tds_sections
      WHERE id = $1 AND organizationid = $2
      LIMIT 1
      `,
      [sectionId, organizationId]
    );

    if (!result.rows[0]) {
      throw new FinanceValidationError(
        "TDS section was not found.",
        404,
        "TDS_SECTION_NOT_FOUND"
      );
    }
    return withDisplayName(result.rows[0]);
  };

  export const create = async (request: any) => {
    const { actor, organizationId } = resolveFinanceContext(request);
    const data = normalizePayload(request.body || {});
    const epoch = nowEpoch();

    const result = await query(
      `
      INSERT INTO tds_sections (
        organizationid,
        newcode,
        natureofpayment,
        rate,
        createdby,
        modifiedby,
        createddate,
        modifieddate
      )
      VALUES ($1, $2, $3, $4, $5, $5, $6, $6)
      RETURNING id, newcode, natureofpayment, rate
      `,
      [
        organizationId,
        data.newcode,
        data.natureofpayment,
        data.rate,
        actor,
        epoch,
      ]
    );

    return withDisplayName(result.rows[0]);
  };

  export const update = async (request: any) => {
    const { actor, organizationId } = resolveFinanceContext(request);
    const sectionId = requireSectionId(request);
    const data = normalizePayload(request.body || {});

    const result = await query(
      `
      UPDATE tds_sections
      SET newcode = $1,
          natureofpayment = $2,
          rate = $3,
          modifiedby = $4,
          modifieddate = $5
      WHERE id = $6 AND organizationid = $7
      RETURNING id, newcode, natureofpayment, rate
      `,
      [
        data.newcode,
        data.natureofpayment,
        data.rate,
        actor,
        nowEpoch(),
        sectionId,
        organizationId,
      ]
    );

    if (!result.rows[0]) {
      throw new FinanceValidationError(
        "TDS section was not found.",
        404,
        "TDS_SECTION_NOT_FOUND"
      );
    }
    return withDisplayName(result.rows[0]);
  };
}
