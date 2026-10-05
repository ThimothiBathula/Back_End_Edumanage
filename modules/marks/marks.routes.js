const express = require("express");
const router = express.Router();

const controller = require("./marks.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

router.post(
  "/add",
  auth,
  role(["teacher"]),
  controller.addMarks
);

module.exports = router;