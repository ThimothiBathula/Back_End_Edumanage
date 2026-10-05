const router = require("express").Router();
const controller = require("./syllabus.controller");

const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");

// Principal creates syllabus plan
router.post("/plan", auth, role("principal"), controller.createPlan);

// Principal updates syllabus plan
router.put("/plan/:id", auth, role("principal"), controller.updatePlan);

// Principal view
router.get("/principal", auth, role("principal"), controller.principalView);

// Principal dashboard
router.get("/dashboard", auth, role("principal"), controller.dashboard);

// Delete plan
router.delete("/plan/:id", auth, role("principal"), controller.removePlan);

// Teacher view
router.get("/teacher", auth, role("teacher"), controller.teacherView);

// Teacher updates week progress
router.put("/week/:weekId/progress", auth, role("teacher"), controller.updateProgress);

// Add remark (Teacher or Principal)
router.post("/week/:weekId/remark", auth, role("teacher", "principal"), controller.addRemark);

// Student view
router.get("/student", auth, role("student"), controller.studentView);

module.exports = router;