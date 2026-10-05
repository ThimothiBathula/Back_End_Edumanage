const router = require("express").Router();
const controller = require("./notification.controller");

const auth = require("../../middlewares/auth");

router.get("/", auth, controller.getMine);
router.patch("/:id/read", auth, controller.read);
const role = require("../../middlewares/role");

// 📢 Principal broadcast
router.post(
  "/broadcast",
  auth,
  role("principal"),
  controller.broadcast
);

// 📥 Get notifications
router.get("/", auth, controller.getMine);

// ✅ Mark read
router.patch("/:id/read", auth, controller.read);

module.exports = router;