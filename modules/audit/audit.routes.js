const express = require("express");
const router = express.Router();

const controller = require("./audit.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// ─── Existing: AuditLog routes (UNCHANGED) ───────────────────────────────────
router.get("/", auth, role(["principal", "superadmin"]), controller.getAuditLogs);
router.post("/restore/:id", auth, role(["principal"]), controller.restoreLog);

// ─── Fee Correction Request routes (Auditor & Accountant capability) ─────────

// POST /api/audit/fee-corrections — Auditor or Accountant raises a correction request
router.post("/fee-corrections", auth, role(["auditor", "accountant", "fee_auditor"]), controller.raiseFeeCorrection);

// GET /api/audit/fee-corrections — Auditor or Accountant views their own requests
router.get("/fee-corrections", auth, role(["auditor", "accountant", "fee_auditor"]), controller.getMyFeeCorrections);

module.exports = router;
