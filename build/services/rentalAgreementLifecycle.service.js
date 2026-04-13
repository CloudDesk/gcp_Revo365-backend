const TERMINAL_ASSET_STATUSES = new Set([
    "returned",
    "lost",
    "damaged_non_returnable",
]);
const TERMINATION_TRIGGER_ASSET_STATUSES = new Set([
    "lost",
    "damaged_non_returnable",
]);
const AGREEMENT_STATUS_COMPLETED = "completed";
const AGREEMENT_STATUS_TERMINATED = "terminated";
const normalizeText = (value) => value == null ? null : String(value).trim();
const normalizeComparableText = (value) => String(value ?? "").trim().toLowerCase();
const resolveAgreementClosureStatus = async (executor, agreementId) => {
    const activeAgreementAssetResult = await executor.query(`
      SELECT 1
      FROM rental_agreement_asset
      WHERE agreementid = $1
        AND COALESCE(iscurrentasset, TRUE) = TRUE
        AND LOWER(COALESCE(assetstatus, '')) NOT IN ('returned', 'lost', 'damaged_non_returnable')
      LIMIT 1
    `, [agreementId]);
    if (activeAgreementAssetResult.rowCount > 0) {
        return null;
    }
    const terminationTriggerResult = await executor.query(`
      SELECT 1
      FROM rental_agreement_asset
      WHERE agreementid = $1
        AND LOWER(COALESCE(assetstatus, '')) IN ('lost', 'damaged_non_returnable')
      LIMIT 1
    `, [agreementId]);
    return terminationTriggerResult.rowCount > 0
        ? AGREEMENT_STATUS_TERMINATED
        : AGREEMENT_STATUS_COMPLETED;
};
export const updateAgreementAssetLifecycleState = async ({ executor, agreementId, orderlineId, assetNumber = null, assetStatus, actionEpoch, ticketId, modifiedBy = null, deactivateAsset = true, }) => {
    if (agreementId == null || orderlineId == null) {
        return {
            agreementAsset: null,
            agreement: null,
        };
    }
    const normalizedAssetNumber = normalizeText(assetNumber);
    const normalizedAssetStatus = normalizeComparableText(assetStatus);
    if (!TERMINAL_ASSET_STATUSES.has(normalizedAssetStatus)) {
        throw new Error("Agreement asset lifecycle supports terminal rental states only.");
    }
    const agreementAssetUpdateResult = await executor.query(`
      WITH target_asset AS (
        SELECT id
        FROM rental_agreement_asset
        WHERE agreementid = $1
          AND orderlineid = $2
          AND COALESCE(iscurrentasset, TRUE) = TRUE
          AND (
            $3::text IS NULL
            OR CAST(assetnumber AS TEXT) = $3
          )
        ORDER BY
          CASE
            WHEN $3::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $3 THEN 0
            ELSE 1
          END,
          id DESC
        LIMIT 1
      )
      UPDATE rental_agreement_asset
      SET
        assetstatus = $4,
        iscurrentasset = CASE WHEN $5 THEN FALSE ELSE COALESCE(iscurrentasset, TRUE) END,
        allocatedto = COALESCE($6, allocatedto),
        linkedticketid = $7
      WHERE id IN (SELECT id FROM target_asset)
      RETURNING *
    `, [
        agreementId,
        orderlineId,
        normalizedAssetNumber,
        normalizedAssetStatus,
        deactivateAsset,
        actionEpoch,
        ticketId,
    ]);
    const closureStatus = await resolveAgreementClosureStatus(executor, Number(agreementId));
    let updatedAgreement = null;
    if (closureStatus) {
        const agreementUpdateResult = closureStatus === AGREEMENT_STATUS_COMPLETED
            ? await executor.query(`
              UPDATE rental_agreement
              SET
                agreementstatus = 'completed',
                completeddate = COALESCE($1, completeddate),
                modifiedby = COALESCE($2, modifiedby)
              WHERE id = $3
              RETURNING *
            `, [actionEpoch, modifiedBy, agreementId])
            : await executor.query(`
              UPDATE rental_agreement
              SET
                agreementstatus = 'terminated',
                terminateddate = COALESCE($1, terminateddate),
                modifiedby = COALESCE($2, modifiedby)
              WHERE id = $3
              RETURNING *
            `, [actionEpoch, modifiedBy, agreementId]);
        updatedAgreement = agreementUpdateResult.rows[0] ?? null;
    }
    return {
        agreementAsset: agreementAssetUpdateResult.rows[0] ?? null,
        agreement: updatedAgreement,
    };
};
//# sourceMappingURL=rentalAgreementLifecycle.service.js.map