const router = require("express").Router();

const controller = require("./bulk.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const uploadExcel = require("../../middlewares/uploadExcel");

// ✅ SUPER ADMIN
router.post(
  "/superadmin/upload",
  auth,
  role("superadmin"),
  uploadExcel.single("file"),
  controller.superAdminUpload
);

// ✅ PRINCIPAL
router.post(
  "/principal/upload",
  auth,
  role("principal"),
  uploadExcel.single("file"),
  controller.principalUpload
);

router.get(
    "/template",
    auth,
    role(["superadmin", "principal"]),
    controller.downloadTemplate
  );

  // EXPORT DATA
router.get(
    "/export",
    auth,
    role(["superadmin", "principal"]),
    controller.exportData
  );

module.exports = router;