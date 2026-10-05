const express = require("express");
const router = express.Router();

const controller = require("./promotion.controller");
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const featureGuard = require("../../middlewares/featureGuard");

// All promotion routes are principal-only and require STUDENT_PROMOTION feature
// These are mounted under /api/principal/promotions via principal.routes.js

// GET /principal/promotions/students?fromAcademicYearId=&fromClassId=
router.get("/students", auth, role(["principal"]), featureGuard("STUDENT_PROMOTION"), controller.getStudentsForPromotion);

// POST /principal/promotions/promote
router.post("/promote", auth, role(["principal"]), featureGuard("STUDENT_PROMOTION"), controller.promoteStudents);

// GET /principal/promotions/history
router.get("/history", auth, role(["principal"]), featureGuard("STUDENT_PROMOTION"), controller.getPromotionHistory);

module.exports = router;
