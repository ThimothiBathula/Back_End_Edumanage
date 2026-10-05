const service = require("./student.service");

// profile
exports.getProfile = async (req, res) => {
  const data = await service.getProfile(req.user);
  res.json(data);
};

// attendance
exports.getAttendance = async (req, res) => {
  const data = await service.getAttendance(req.user);
  res.json(data);
};

// marks
exports.getMarks = async (req, res) => {
  const data = await service.getMarks(req.user);
  res.json(data);
};

// schedule
exports.getSchedule = async (req, res) => {
  const data = await service.getSchedule(req.user);
  res.json(data);
};

// syllabus
exports.getSyllabus = async (req, res) => {
  const data = await service.getSyllabus(req.user);
  res.json(data);
};

// feedback
exports.getFeedbackForms = async (req, res) => {
  const data = await service.getFeedbackForms(req.user);
  res.json(data);
};

exports.submitFeedback = async (req, res) => {
  await service.submitFeedback(req.body, req.user);
  res.json({ message: "Feedback submitted" });
};

// teachers
exports.getTeachers = async (req, res) => {
  const data = await service.getTeachers(req.user);
  res.json(data);
};