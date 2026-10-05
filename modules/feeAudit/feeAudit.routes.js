const express = require("express");
const router = express.Router();
const controller = require("./feeAudit.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const featureGuard = require("../../middlewares/featureGuard");

// ─────────────────────────────────────────────────────────────────────────────
// MENTOR FEE UPDATE REQUESTS
// Protected by FEE_MENTOR_UPDATE_REQUEST feature toggle
// ─────────────────────────────────────────────────────────────────────────────

// Mentor submits fee update request
router.post(
  "/request",
  auth,
  role(["teacher", "principal", "superadmin"]),
  featureGuard("FEE_MENTOR_UPDATE_REQUEST"),
  controller.createUpdateRequest
);

// Mentor views their own requests
router.get(
  "/my-requests",
  auth,
  role(["teacher", "principal", "superadmin"]),
  featureGuard("FEE_MENTOR_UPDATE_REQUEST"),
  controller.getMyUpdateRequests
);

// ─────────────────────────────────────────────────────────────────────────────
// FEE AUDITOR DASHBOARD & REVIEW ROUTES
// Protected by FEE_AUDIT_APPROVAL feature toggle
// Accessible by fee_auditor, auditor, principal, and superadmin
// ─────────────────────────────────────────────────────────────────────────────

// Dashboard statistics
router.get(
  "/stats",
  auth,
  role(["fee_auditor", "auditor", "principal", "superadmin"]),
  featureGuard("FEE_AUDIT_APPROVAL"),
  controller.getFeeAuditStats
);

// List all requests with filters
router.get(
  "/requests",
  auth,
  role(["fee_auditor", "auditor", "principal", "superadmin"]),
  featureGuard("FEE_AUDIT_APPROVAL"),
  controller.getUpdateRequests
);

// Resolve request (Approve / Reject)
router.patch(
  "/request/:id/resolve",
  auth,
  role(["fee_auditor", "auditor", "principal", "superadmin"]),
  featureGuard("FEE_AUDIT_APPROVAL"),
  controller.resolveUpdateRequest
);

module.exports = router;
