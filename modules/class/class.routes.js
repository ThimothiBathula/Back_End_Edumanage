const router = require("express").Router();
const controller = require("./class.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const feature = require("../../middlewares/feature");

// Only Principal (and optionally Super Admin)

router.post("/", auth, role(["principal"]), feature("enableClassConfig"), controller.createClass);

router.get("/", auth, role(["principal"]), controller.getClasses);

router.get("/:id", auth, role(["principal"]), controller.getClassById);

router.put("/:id", auth, role(["principal"]), feature("enableClassConfig"), controller.updateClass);

router.delete("/:id", auth, role(["principal"]), feature("enableClassConfig"), controller.deleteClass);

module.exports = router;