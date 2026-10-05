const feeAuditService = require("./feeAudit.service");

/**
 * POST /api/fee-audit/request
 * Mentor submits a fee update proposal.
 */
exports.createUpdateRequest = async (req, res) => {
  try {
    const result = await feeAuditService.createFeeUpdateRequest(req.body, req.user);
    return res.status(201).json({
      success: true,
      message: "Fee update request submitted for auditor review",
      request: result,
      data: result
    });
  } catch (err) {
    console.error("createUpdateRequest error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to submit fee update request",
      code: err.code || "REQUEST_FAILED"
    });
  }
};

/**
 * GET /api/fee-audit/requests
 * Fee Auditor / Principal views fee update requests with filters.
 */
exports.getUpdateRequests = async (req, res) => {
  try {
    const requests = await feeAuditService.getFeeUpdateRequests(req.user.schoolId, req.query);
    return res.json({
      success: true,
      data: requests
    });
  } catch (err) {
    console.error("getUpdateRequests error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to retrieve fee update requests"
    });
  }
};

/**
 * GET /api/fee-audit/my-requests
 * Mentor views their own submitted fee update requests.
 */
exports.getMyUpdateRequests = async (req, res) => {
  try {
    const requests = await feeAuditService.getMyFeeUpdateRequests(req.user);
    return res.json({
      success: true,
      data: requests
    });
  } catch (err) {
    console.error("getMyUpdateRequests error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to retrieve your requests"
    });
  }
};

/**
 * GET /api/fee-audit/stats
 * Fee Auditor dashboard summary metrics.
 */
exports.getFeeAuditStats = async (req, res) => {
  try {
    const stats = await feeAuditService.getFeeAuditStats(req.user.schoolId);
    return res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error("getFeeAuditStats error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to load audit statistics"
    });
  }
};

/**
 * PATCH /api/fee-audit/request/:id/resolve
 * Fee Auditor / Principal approves or rejects a request.
 */
exports.resolveUpdateRequest = async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ success: false, message: "Invalid request ID" });
    }

    const { status, reviewComment } = req.body;
    if (!status || !["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be APPROVED or REJECTED" });
    }

    const result = await feeAuditService.resolveFeeUpdateRequest(
      requestId,
      { status, reviewComment },
      req.user
    );

    return res.json({
      success: true,
      message: `Fee update request ${status.toLowerCase()} successfully`,
      request: result,
      data: result
    });
  } catch (err) {
    console.error("resolveUpdateRequest error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || "Failed to resolve fee update request",
      code: err.code || "RESOLUTION_FAILED"
    });
  }
};
