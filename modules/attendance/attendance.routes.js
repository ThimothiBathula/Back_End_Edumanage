const express = require("express");
const router = express.Router();

const controller = require("./attendance.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const featureGuard = require("../../middlewares/featureGuard");

// Teacher marks attendance (Requires ATTENDANCE feature)
router.post(
  "/mark",
  auth,
  role(["teacher"]),
  featureGuard("ATTENDANCE"),
  controller.markAttendance
);

module.exports = router;