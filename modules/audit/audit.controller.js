const service = require("./audit.service");

// ─── Existing: AuditLog controller (UNCHANGED) ───────────────────────────────

exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await service.getAuditLogs(req.user.schoolId, req.query);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.restoreLog = async (req, res) => {
  try {
    const result = await service.restoreLog(req.params.id, req.user);
    res.json({ message: "Action reverted successfully", data: result });
  } catch (err) {
    const status =
      err.message.includes("not found") ? 404 :
      err.message.includes("expired") ? 410 : 400;
    res.status(status).json({ message: err.message });
  }
};

// ─── NEW: Fee Correction Request handlers (Auditor role) ─────────────────────

/**
 * POST /api/audit/fee-corrections
 * Auditor raises a fee correction request.
 */
exports.raiseFeeCorrection = async (req, res) => {
  try {
    const result = await service.raiseFeeCorrection(req.body, req.user);
    res.status(201).json({ message: "Correction request submitted", data: result });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
};

/**
 * GET /api/audit/fee-corrections
 * Auditor views their own submitted requests.
 */
exports.getMyFeeCorrections = async (req, res) => {
  try {
    const result = await service.getMyFeeCorrections(req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
