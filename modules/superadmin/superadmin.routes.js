const express = require("express");
const router = express.Router();

const controller = require("./superadmin.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// ─── Existing routes (UNCHANGED) ─────────────────────────────────────────────
router.post("/school", auth, role(["superadmin"]), controller.createSchool);
router.get("/schools", auth, role(["superadmin"]), controller.getSchools);
router.patch("/school/status", auth, role(["superadmin"]), controller.updateSchoolStatus);
router.get("/school/:id", auth, role(["superadmin"]), controller.getSchoolById);
router.put("/school/:id", auth, role(["superadmin"]), controller.updateSchool);
router.delete("/school/:id", auth, role(["superadmin"]), controller.deleteSchool);
router.patch("/school/:schoolId/sms", auth, role(["superadmin"]), controller.updateSMS);
router.get("/dashboard", auth, role(["superadmin"]), controller.getDashboard);
router.put("/class-config-toggle", auth, role(["superadmin"]), controller.toggleClassConfig);

// ─── NEW routes ───────────────────────────────────────────────────────────────

// PATCH /api/superadmin/school/:id/services — toggle per-module kill-switches
router.patch("/school/:id/services", auth, role(["superadmin"]), controller.toggleServices);

// PATCH /api/superadmin/school/:id/grant-academic-year — re-enable year creation
router.patch("/school/:id/grant-academic-year", auth, role(["superadmin"]), controller.grantAcademicYear);

// ─── Per-School Feature Management ──────────────────────────────────────────
const featureController = require("../feature/feature.controller");
router.get("/school/:id/features", auth, role(["superadmin"]), featureController.getSchoolFeaturesForAdmin);
router.patch("/school/:id/features", auth, role(["superadmin"]), featureController.updateSchoolFeatures);
router.get("/features/definitions", auth, role(["superadmin"]), featureController.getFeatureDefinitions);

module.exports = router;