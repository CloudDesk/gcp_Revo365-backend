import { rentalAgreementService } from "./rentalAgreement.service.js";

const CLOSED_TICKET_STATUS = "resolved_closed";
const TICKET_RENEWAL_ACTION_TYPE = "renewal";
const HISTORY_RENEWAL_ACTION_TYPE = "renewed";
const RENEWED_ACTION_STATUS = "renewed";
const RENTAL_CONTRACT_STATUS_ACTIVE = "active";

const normalizeText = (value: any) =>
  value == null ? null : String(value).trim();

const normalizeComparableText = (value: any) =>
  String(value ?? "").trim().toLowerCase();

const toOptionalEpoch = (value: any) => {
  if (value == null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return String(Math.trunc(numericValue)).length <= 10
      ? Math.trunc(numericValue)
      : Math.trunc(numericValue / 1000);
  }

  const parsedDate = new Date(value);
  if (!Number.isNaN(parsedDate.getTime())) {
    return Math.floor(parsedDate.getTime() / 1000);
  }

  throw new Error("A valid renewal date is required.");
};

const toEpochDate = (value: any) => {
  const parsedValue = toOptionalEpoch(value);
  if (!parsedValue) {
    throw new Error("A valid epoch value is required.");
  }

  return new Date(parsedValue * 1000);
};

const calculateMonthDelta = (currentEndDate: Date, renewedEndDate: Date) => {
  let monthDelta =
    (renewedEndDate.getUTCFullYear() - currentEndDate.getUTCFullYear()) * 12 +
    (renewedEndDate.getUTCMonth() - currentEndDate.getUTCMonth());

  if (renewedEndDate.getUTCDate() < currentEndDate.getUTCDate()) {
    monthDelta -= 1;
  }

  return Math.max(monthDelta, 0);
};

export type ProcessRentalRenewalOptions = {
  executor: any;
  context: any;
  ticketId: number;
  requestedRenewalDate: any;
  approvedRenewalDate?: any;
  remarks?: string | null;
  createdBy?: number | null;
};

export const processRentalRenewal = async ({
  executor,
  context,
  ticketId,
  requestedRenewalDate,
  approvedRenewalDate = null,
  remarks = null,
  createdBy = null,
}: ProcessRentalRenewalOptions) => {
  const linkedOrderline = context?.linkedorderline;
  if (!linkedOrderline) {
    throw new Error("Unable to resolve the active rental contract for this ticket.");
  }

  if (linkedOrderline?.isactivebillingline === false) {
    throw new Error("Only the active rental billing line can be renewed.");
  }

  const currentEndEpoch = toOptionalEpoch(linkedOrderline?.rentenddate);
  if (!currentEndEpoch) {
    throw new Error("The current contract end date could not be resolved.");
  }

  const requestedEpoch = toOptionalEpoch(requestedRenewalDate);
  const approvedEpoch = toOptionalEpoch(approvedRenewalDate) ?? requestedEpoch;

  if (!requestedEpoch || !approvedEpoch) {
    throw new Error("Renewal date is required.");
  }

  if (approvedEpoch < currentEndEpoch) {
    throw new Error(
      "Renewal date cannot be earlier than the current contract end date."
    );
  }

  const currentEndDate = toEpochDate(currentEndEpoch);
  const renewedEndDate = toEpochDate(approvedEpoch);
  const extensionMonths = calculateMonthDelta(currentEndDate, renewedEndDate);
  const currentRentalFor = Number(linkedOrderline?.rentalfor ?? 0);
  const renewedRentalFor = currentRentalFor + extensionMonths;
  const agreementId =
    linkedOrderline?.agreementid ?? context?.ticket?.agreementid ?? null;
  const customerId = linkedOrderline?.userid ?? context?.ticket?.userid ?? null;

  const historyInsertResult = await executor.query(
    `
      INSERT INTO rental_replacement_history (
        ticketid,
        ticketnumber,
        sourceorderlineid,
        uniqueorderid,
        agreementid,
        customerid,
        assetnumber,
        oldassetnumber,
        oldproductid,
        actiontype,
        actionstatus,
        effectivefrom,
        remainingmonths,
        revisedremainingmonths,
        remarks,
        createdby,
        metadatajson
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15, $16, $17::jsonb
      )
      RETURNING *
    `,
    [
      ticketId,
      context?.ticket?.ticketnumber ?? null,
      linkedOrderline.id,
      linkedOrderline.uniqueorderid,
      agreementId,
      customerId,
      normalizeText(linkedOrderline.assetnumber),
      normalizeText(linkedOrderline.assetnumber),
      linkedOrderline.productid ?? null,
      HISTORY_RENEWAL_ACTION_TYPE,
      RENEWED_ACTION_STATUS,
      approvedEpoch,
      Math.max(currentRentalFor - Number(linkedOrderline?.generatedmonthscount ?? 0), 0),
      Math.max(
        renewedRentalFor - Number(linkedOrderline?.generatedmonthscount ?? 0),
        0
      ),
      remarks,
      createdBy,
      JSON.stringify({
        previousAgreementEndDate: currentEndEpoch,
        requestedRenewalDate: requestedEpoch,
        approvedRenewalDate: approvedEpoch,
        previousRentalFor: currentRentalFor,
        renewedRentalFor,
        extensionMonths,
      }),
    ]
  );

  const historyRecord = historyInsertResult.rows[0] ?? null;
  const renewedEndDateIso = renewedEndDate.toISOString();

  const orderlineUpdateResult = await executor.query(
    `
      UPDATE orderline
      SET
        rentenddate = $1,
        rentalfor = $2,
        renewedthroughdate = $3,
        rentalcontractstatus = $4,
        lastlifecycleeventid = $5
      WHERE id = $6
      RETURNING *
    `,
    [
      renewedEndDateIso,
      renewedRentalFor,
      approvedEpoch,
      RENTAL_CONTRACT_STATUS_ACTIVE,
      historyRecord?.id ?? null,
      linkedOrderline.id,
    ]
  );

  let agreementSyncResult = {
    agreement: null,
    agreementAsset: null,
    contractRows: [],
  };

  if (agreementId != null) {
    agreementSyncResult = await rentalAgreementService.syncRenewalAgreement({
      executor,
      agreementId: Number(agreementId),
      uniqueOrderId: normalizeText(linkedOrderline.uniqueorderid),
      orderlineId: Number(linkedOrderline.id),
      assetNumber: normalizeText(linkedOrderline.assetnumber),
      renewedThroughEpoch: approvedEpoch,
      ticketId,
      modifiedBy: createdBy,
    });
  }

  const ticketUpdateResult = await executor.query(
    `
      UPDATE tickets
      SET
        agreementid = COALESCE($1, agreementid),
        rentalactiontype = $2,
        rentalactionstatus = $3,
        rentalactionreason = COALESCE($4, rentalactionreason),
        requestedrenewaldate = $5,
        approvedrenewaldate = $6,
        resolvedassetdate = $6,
        ticketstatus = $7,
        closeddate = $8
      WHERE id = $9
      RETURNING *
    `,
    [
      agreementId,
      TICKET_RENEWAL_ACTION_TYPE,
      RENEWED_ACTION_STATUS,
      remarks,
      requestedEpoch,
      approvedEpoch,
      CLOSED_TICKET_STATUS,
      approvedEpoch,
      ticketId,
    ]
  );

  return {
    history: historyRecord,
    ticket: ticketUpdateResult.rows[0] ?? null,
    orderline: orderlineUpdateResult.rows[0] ?? null,
    agreement: agreementSyncResult.agreement,
    agreementAsset: agreementSyncResult.agreementAsset,
    approvedRenewalDate: approvedEpoch,
    renewedRentalFor,
  };
};
