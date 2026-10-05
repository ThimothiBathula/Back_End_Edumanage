const service = require("./syllabus.service");
const validator = require("./syllabus.validator");

exports.createPlan = async (req, res) => {
  try {
    const { error } = validator.createPlanSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const data = await service.createSyllabusPlan(req.body, req.user);
    res.status(201).json({ message: "Syllabus plan created", data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { error } = validator.createPlanSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const data = await service.updateSyllabusPlan(req.params.id, req.body, req.user);
    res.status(200).json({ message: "Syllabus plan updated", data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProgress = async (req, res) => {
  try {
    console.log(req.body)
    const weekId = Number(req.params.weekId);
    const { error } = validator.updateProgressSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const data = await service.updateTeacherProgress(weekId, req.body, req.user);
    res.json({ message: "Progress updated", data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addRemark = async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);
    const { error } = validator.addRemarkSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const data = await service.addRemark(weekId, req.body, req.user);
    res.json({ message: "Remark added", data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.principalView = async (req, res) => {
  try {
    const data = await service.getPrincipalSyllabus(req.user, req.query);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.teacherView = async (req, res) => {
  try {
    const data = await service.getTeacherSyllabus(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.studentView = async (req, res) => {
  try {
    const data = await service.getStudentSyllabus(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const data = await service.getProgressDashboard(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removePlan = async (req, res) => {
  try {
    await service.deleteSyllabusPlan(req.params.id, req.user);
    res.json({ message: "Syllabus plan deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};