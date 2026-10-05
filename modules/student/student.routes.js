const express = require("express");
const router = express.Router();

const controller = require("./student.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const featureGuard = require("../../middlewares/featureGuard");

router.get("/profile", auth, role(["student"]), controller.getProfile);
router.get("/attendance", auth, role(["student"]), featureGuard("ATTENDANCE"), controller.getAttendance);
router.get("/marks", auth, role(["student"]), controller.getMarks);
router.get("/schedule", auth, role(["student"]), controller.getSchedule);
router.get("/syllabus", auth, role(["student"]), controller.getSyllabus);

router.get("/feedback/forms", auth, role(["student"]), controller.getFeedbackForms);
router.post("/feedback", auth, role(["student"]), controller.submitFeedback);

router.get("/teachers", auth, role(["student"]), controller.getTeachers);

module.exports = router;