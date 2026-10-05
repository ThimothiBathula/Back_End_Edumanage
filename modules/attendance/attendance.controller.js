const service = require("./attendance.service");
const { markAttendanceSchema } = require("./attendance.validation");

exports.markAttendance = async (req, res) => {
  try {
    const { error } = markAttendanceSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message
      });
    }

    await service.markAttendance(req.body.records, req.user);

    res.json({ message: "Attendance marked successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTodayAttendance = async (req, res) => {
  try {
    // ✅ Fixed: was using req.query.class (name string), now uses classId (number)
    const classId = req.query.classId || req.query.class || null;
    const data = await service.getTodayAttendance(classId, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};