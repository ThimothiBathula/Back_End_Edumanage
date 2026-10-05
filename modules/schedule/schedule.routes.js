const router = require("express").Router();
const controller = require("./schedule.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// Principal — CRUD
router.post("/", auth, role("principal"), controller.createSchedule);
router.put("/:id", auth, role("principal"), controller.updateSchedule);
router.delete("/:id", auth, role("principal"), controller.deleteSchedule);
router.get("/principal", auth, role("principal"), controller.getPrincipalSchedule);

// Analytics (principal only)
router.get("/analytics", auth, role("principal"), controller.getAnalytics);

// Breaks (principal manages, teachers/students read)
router.get("/breaks/:classId", auth, role("principal", "teacher", "student"), controller.getBreaks);
router.post("/breaks", auth, role("principal"), controller.createBreak);
router.delete("/breaks/:id", auth, role("principal"), controller.deleteBreak);

// Student & Teacher views
router.get("/student", auth, role("student"), controller.getStudentSchedule);
router.get("/teacher", auth, role("teacher"), controller.getTeacherSchedule);

module.exports = router;