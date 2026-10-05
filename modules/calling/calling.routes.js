const express = require("express");
const router = express.Router();
const controller = require("./calling.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const featureGuard = require("../../middlewares/featureGuard");

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC / WEBHOOK ROUTES (External telephony providers)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/webhook", controller.handleWebhook);

// ─────────────────────────────────────────────────────────────────────────────
// MENTOR & CALL TRIGGER ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Single call trigger (absentee, fee reminder, followup)
router.post(
  "/trigger/single",
  auth,
  role(["teacher", "principal", "superadmin"]),
  featureGuard("AI_PARENT_CALLING"),
  controller.triggerSingleCall
);

// Batch trigger absence calls
router.post(
  "/trigger/absence",
  auth,
  role(["teacher", "principal", "superadmin"]),
  featureGuard("AI_ABSENCE_CALLING"),
  controller.triggerAbsenceCalls
);

// Batch trigger fee reminder calls
router.post(
  "/trigger/fee-reminder",
  auth,
  role(["teacher", "principal", "superadmin"]),
  featureGuard("AI_FEE_REMINDER_CALLING"),
  controller.triggerFeeReminderCalls
);

// Mentor parent communication dashboard
router.get(
  "/mentor/dashboard",
  auth,
  role(["teacher", "principal", "superadmin"]),
  featureGuard("MENTOR_PARENT_COMMUNICATION"),
  controller.getMentorDashboard
);

// Student call communication history
router.get(
  "/student/:id/history",
  auth,
  role(["teacher", "principal", "superadmin"]),
  featureGuard("AI_PARENT_CALLING"),
  controller.getStudentHistory
);

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// School-level call analytics & trend charts
router.get(
  "/analytics",
  auth,
  role(["principal", "superadmin"]),
  featureGuard("CALL_ANALYTICS"),
  controller.getSchoolAnalytics
);

// Super Admin multi-school call usage & accounting
router.get(
  "/superadmin-usage",
  auth,
  role(["superadmin"]),
  controller.getSuperAdminUsage
);

module.exports = router;
