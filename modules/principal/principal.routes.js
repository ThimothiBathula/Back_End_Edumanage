const express = require("express");
const router = express.Router();

const controller = require("./principal.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const upload = require("../../middlewares/upload");
const academicYearController = require("../academicYear/academicYear.controller");
const auditService = require("../audit/audit.service");
const promotionRouter = require("../promotion/promotion.routes");
const featureGuard = require("../../middlewares/featureGuard");

router.post("/teacher", auth, role(["principal"]), controller.createTeacher);
router.post("/student", auth, role(["principal"]), controller.createStudent);
router.get("/teachers", auth, role(["principal"]), controller.getTeachers);
router.get("/teacher-analytics", auth, role(["principal"]), controller.getTeacherAnalytics);

router.put("/teacher/:id", auth, role(["principal"]), controller.updateTeacher);

router.delete("/teacher/:id", auth, role(["principal"]), controller.deleteTeacher);

router.get("/students", auth, role(["principal"]), controller.getStudents);

router.put("/student/:id", auth, role(["principal"]), controller.updateStudent);

router.delete("/student/:id", auth, role(["principal"]), controller.deleteStudent);

router.get("/dashboard", auth, role(["principal"]), controller.dashboard);

router.post("/upload-user-image/:userId", auth, role(["principal"]), upload.single("image"), controller.uploadUserImage);

router.post("/attendance/send-sms/:sessionId", auth, role(["principal"]), featureGuard("ATTENDANCE"), controller.sendAbsentSMS);

// Principal Attendance Routes (Require ATTENDANCE feature)
router.get("/attendance", auth, role(["principal"]), featureGuard("ATTENDANCE"), controller.getAttendance);
router.put("/attendance/:id", auth, role(["principal"]), featureGuard("ATTENDANCE"), controller.updateAttendance);
router.delete("/attendance/:id", auth, role(["principal"]), featureGuard("ATTENDANCE"), controller.deleteAttendance);

// Principal Feedback Routes
router.get("/feedback", auth, role(["principal"]), controller.getAllFeedback);
router.post("/feedback/form", auth, role(["principal"]), controller.createFeedbackForm);
router.get("/feedback/forms", auth, role(["principal"]), controller.getFeedbackForms);
router.put("/feedback/form/:id", auth, role(["principal"]), controller.updateFeedbackForm);
router.delete("/feedback/form/:id", auth, role(["principal"]), controller.deleteFeedbackForm);

// Exam Configurations
router.post("/exam-config", auth, role(["principal"]), controller.createExamConfig);
router.get("/exam-config", auth, role(["principal"]), controller.getExamConfigs);
router.put("/exam-config/:id", auth, role(["principal"]), controller.updateExamConfig);
router.delete("/exam-config/:id", auth, role(["principal"]), controller.deleteExamConfig);

// Marks overview for Principal
router.get("/marks", auth, role(["principal"]), controller.getMarks);

// Principal own profile (fetched on demand — not stored in localStorage)
router.get("/profile", auth, role(["principal"]), controller.getProfile);

// --- Academic Year Management (Require ACADEMIC_YEAR_MANAGEMENT feature) ---------
router.post("/academic-years", auth, role(["principal"]), featureGuard("ACADEMIC_YEAR_MANAGEMENT"), academicYearController.createAcademicYear);
router.get("/academic-years", auth, role(["principal"]), featureGuard("ACADEMIC_YEAR_MANAGEMENT"), academicYearController.listAcademicYears);
router.patch("/academic-years/:id/set-current", auth, role(["principal"]), featureGuard("ACADEMIC_YEAR_MANAGEMENT"), academicYearController.setCurrentYear);
router.patch("/academic-years/:id/complete", auth, role(["principal"]), featureGuard("ACADEMIC_YEAR_MANAGEMENT"), academicYearController.completeYear);

// --- Student Promotion (Require STUDENT_PROMOTION feature) -----------------------
router.use("/promotions", featureGuard("STUDENT_PROMOTION"), promotionRouter);

// --- Fee Correction Approvals (Principal reviews Auditor requests) ------------
router.get("/fee-corrections", auth, role(["principal"]), controller.getFeeCorrections);
router.patch("/fee-corrections/:id/resolve", auth, role(["principal"]), controller.resolveFeeCorrection);

// --- Absentee Parent Call Queue (Require ATTENDANCE feature) -------------------
router.get("/attendance/call-queue", auth, role(["principal"]), featureGuard("ATTENDANCE"), controller.getCallQueue);
router.patch("/attendance/call-queue/:id", auth, role(["principal"]), featureGuard("ATTENDANCE"), controller.updateCallQueueEntry);

// --- Accountant Assignment Management -----------------------------------------
router.post("/accountant/assign", auth, role(["principal"]), controller.assignAccountant);
router.post("/accountant/remove", auth, role(["principal"]), controller.removeAccountant);
router.get("/accountant/current", auth, role(["principal", "superadmin"]), controller.getCurrentAccountant);

module.exports = router;
