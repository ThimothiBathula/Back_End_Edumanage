const router = require("express").Router();
const controller = require("./holiday.controller");

const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// Principal CRUD
router.post("/", auth, role("principal"), controller.create);
router.put("/:id", auth, role("principal"), controller.update);
router.delete("/:id", auth, role("principal"), controller.remove);

// All users can view
router.get("/", auth, controller.getAll);

module.exports = router;