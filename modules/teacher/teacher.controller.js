const service = require("./teacher.service");

// 🔹 STUDENTS
exports.getStudents = async (req, res) => {
  try {

    if (req.query.classId) {
      req.query.classId = Number(req.query.classId);
    }

    const data = await service.getStudents(req.user, req.query);

    res.json(data);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// 🔹 PROFILE
exports.getProfile = async (req, res) => {
  try {

    const data = await service.getProfile(req.user);

    res.json(data);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// 🔹 SCHEDULE
exports.getSchedule = async (req, res) => {
  try {

    const data = await service.getSchedule(req.user);

    res.json(data);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// 🔹 COMPLETE SYLLABUS
exports.completeSyllabus = async (req, res) => {
  try {

    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "Invalid syllabus ID" });
    }

    await service.completeSyllabus(id, req.user);

    res.json({ message: "Syllabus updated successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// 🔹 FEEDBACK SUMMARY
exports.getFeedbackSummary = async (req, res) => {
  try {

    const data = await service.getFeedbackSummary(req.user);

    res.json(data);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// 🔹 EXAM CONFIGS (🔥 FIXED)
exports.getExamConfigs = async (req, res) => {
  try {
    const studentClass = req.query.class || null;
    const data = await service.getExamConfigs(studentClass, req.user);
    res.json(data);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};