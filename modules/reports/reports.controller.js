const service = require("./reports.service");

exports.attendanceReport = async (req, res) => {
  try {
    const { studentId } = req.query;

    const result = await service.getAttendanceReport(
      Number(studentId),
      req.user
    );

    res.json(result);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.topStudents = async (req, res) => {
  try {
    const result = await service.getTopStudents(req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.studentMarksReport = async (req, res) => {
  try {
    const { studentId } = req.query;

    const result = await service.getStudentMarksReport(
      Number(studentId),
      req.user
    );

    res.json(result);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};