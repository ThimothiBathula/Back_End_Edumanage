const service = require("./academicYear.service");

exports.createAcademicYear = async (req, res) => {
  try {
    const result = await service.createAcademicYear(req.body, req.user);
    res.status(201).json({ message: "Academic year created", data: result });
  } catch (err) {
    const status = err.message.includes("locked") ? 403 :
                   err.message.includes("already exists") ? 409 : 400;
    res.status(status).json({ message: err.message });
  }
};

exports.listAcademicYears = async (req, res) => {
  try {
    const result = await service.listAcademicYears(req.user.schoolId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.setCurrentYear = async (req, res) => {
  try {
    const result = await service.setCurrentYear(Number(req.params.id), req.user.schoolId);
    res.json({ message: "Academic year set to ACTIVE", data: result });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
};

exports.completeYear = async (req, res) => {
  try {
    const result = await service.completeYear(Number(req.params.id), req.user.schoolId);
    res.json({ message: "Academic year completed", data: result });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
};
