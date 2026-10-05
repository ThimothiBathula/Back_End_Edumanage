const express = require("express");
const router = express.Router();

const controller = require("./dashboard.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

router.get(
  "/dashboard",
  auth,
  role(["superadmin"]),
  controller.getDashboard
);

module.exports = router;