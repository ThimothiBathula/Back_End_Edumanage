const express = require("express");
const router = express.Router();

const controller = require("./correction.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// Teacher
router.post("/request", auth, role(["teacher"]), controller.createRequest);

// teacher routes
router.get("/my-requests", auth, role(['teacher']), controller.getMyRequestsTeacher);

// Principal
router.get("/requests", auth, role(["principal"]), controller.getRequests);

router.patch("/request/:id", auth, role(["principal"]), controller.updateRequest);

module.exports = router;