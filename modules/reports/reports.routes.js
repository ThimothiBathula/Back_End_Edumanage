const express = require("express");
const router = express.Router();

const controller = require("./reports.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// 🔐 Role guards added — previously unprotected
router.get("/attendance", auth, role(["principal", "teacher", "superadmin"]), controller.attendanceReport);
router.get("/top-students", auth, role(["principal", "superadmin"]), controller.topStudents);
router.get("/marks", auth, role(["principal", "teacher", "superadmin"]), controller.studentMarksReport);

module.exports = router;