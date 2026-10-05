const express = require("express");
const router = express.Router();

const controller = require("./teacher.controller");
const dashboardService = require("./teacher.dashboard.service");

const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const featureGuard = require("../../middlewares/featureGuard");

// students
router.get("/students", auth, role(["teacher"]), controller.getStudents);

// profile
router.get("/profile", auth, role(["teacher"]), controller.getProfile);

// schedule
router.get("/schedule", auth, role(["teacher"]), controller.getSchedule);

// syllabus
router.patch("/syllabus/:id", auth, role(["teacher"]), controller.completeSyllabus);

// feedback
router.get("/feedback", auth, role(["teacher"]), controller.getFeedbackSummary);

// exam configs
router.get("/exam-configs", auth, role(["teacher"]), controller.getExamConfigs);

// dashboard
router.get("/dashboard", auth, role(["teacher"]), async (req, res) => {
  const data = await dashboardService.getDashboard(req.user);
  res.json(data);
});

// reuse existing modules (Attendance requires ATTENDANCE feature)
router.get("/attendance/today", auth, role(["teacher"]), featureGuard("ATTENDANCE"), require("../attendance/attendance.controller").getTodayAttendance);
router.post("/attendance", auth, role(["teacher"]), featureGuard("ATTENDANCE"), require("../attendance/attendance.controller").markAttendance);

router.post("/marks", auth, role(["teacher"]), require("../marks/marks.controller").addMarks);
router.get("/marks", auth, role(["teacher"]), require("../marks/marks.controller").getMarks);

router.post("/correction", auth, role(["teacher"]), require("../correction/correction.controller").createRequest);

router.get("/correction/my-requests", auth, role(["teacher"]), require("../correction/correction.controller").getMyRequestsTeacher);

// GET /teacher/school-info — returns attendanceMode so UI can adapt
const prisma = require("../../config/prisma");
router.get("/school-info", auth, role(["teacher"]), async (req, res) => {
  try {
    const school = await prisma.school.findUnique({
      where: { id: req.user.schoolId },
      select: { attendanceMode: true, name: true }
    });
    if (!school) return res.status(404).json({ message: "School not found" });
    res.json(school);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;