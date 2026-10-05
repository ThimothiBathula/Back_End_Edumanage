const express = require("express");
const router = express.Router();
const controller = require("./feature.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// Super Admin Feature Management routes
router.get(
  "/admin/school/:id",
  auth,
  role(["superadmin"]),
  controller.getSchoolFeaturesForAdmin
);

router.patch(
  "/admin/school/:id",
  auth,
  role(["superadmin"]),
  controller.updateSchoolFeatures
);

router.get(
  "/admin/definitions",
  auth,
  role(["superadmin"]),
  controller.getFeatureDefinitions
);

// Authenticated User: School Effective Features endpoint
router.get(
  "/school",
  auth,
  controller.getCurrentSchoolFeatures
);

module.exports = router;
