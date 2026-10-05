const express = require("express");
const router = express.Router();
const controller = require("./mentor.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const featureGuard = require("../../middlewares/featureGuard");

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPAL MANAGEMENT ROUTES (Require CLASS_MENTOR feature)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/mentor/assignments?academicYearId=
router.get("/assignments", auth, role(["principal", "superadmin"]), featureGuard("CLASS_MENTOR"), controller.getClassMentors);

// POST /api/mentor/assign
router.post("/assign", auth, role(["principal", "superadmin"]), featureGuard("CLASS_MENTOR"), controller.assignMentor);

// DELETE /api/mentor/remove/:classId
router.delete("/remove/:classId", auth, role(["principal", "superadmin"]), featureGuard("CLASS_MENTOR"), controller.removeMentor);

// GET /api/mentor/history/:classId
router.get("/history/:classId", auth, role(["principal", "superadmin"]), featureGuard("CLASS_MENTOR"), controller.getMentorHistory);

// POST /api/mentor/sync-default
router.post("/sync-default", auth, role(["principal", "superadmin"]), featureGuard("CLASS_MENTOR"), controller.syncDefaultMentors);

// ─────────────────────────────────────────────────────────────────────────────
// MENTOR DASHBOARD ROUTES (Require CLASS_MENTOR + MENTOR_DASHBOARD features)
// Tenant & class assignment authorization enforced in service logic
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/mentor/my-classes
router.get("/my-classes", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_DASHBOARD"), controller.getMyMentoredClasses);

// GET /api/mentor/class/:classId/overview?date=
router.get("/class/:classId/overview", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_DASHBOARD"), controller.getClassOverview);

// GET /api/mentor/class/:classId/attendance-today?date=
router.get("/class/:classId/attendance-today", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_DASHBOARD"), controller.getTodayAttendance);

// GET /api/mentor/class/:classId/absent-today?date=
router.get("/class/:classId/absent-today", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_DASHBOARD"), controller.getAbsentStudentsToday);

// GET /api/mentor/class/:classId/marks?examType=&subjectId=
router.get("/class/:classId/marks", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_DASHBOARD"), controller.getClassMarks);

// GET /api/mentor/class/:classId/fees (Requires CLASS_MENTOR + MENTOR_DASHBOARD + MENTOR_FEE_VISIBILITY)
router.get("/class/:classId/fees", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_DASHBOARD"), featureGuard("MENTOR_FEE_VISIBILITY"), controller.getClassFees);

// GET /api/mentor/class/:classId/export?type=&examType=&subjectId= (Requires CLASS_MENTOR + MENTOR_EXPORT)
router.get("/class/:classId/export", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_EXPORT"), controller.exportClassReport);

// GET /api/mentor/student/:studentId/summary
router.get("/student/:studentId/summary", auth, role(["teacher", "principal", "superadmin"]), featureGuard("CLASS_MENTOR"), featureGuard("MENTOR_DASHBOARD"), controller.getStudentSummary);

module.exports = router;
