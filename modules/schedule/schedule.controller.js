const service = require("./schedule.service");
const { createScheduleSchema } = require("./schedule.validator");

// ✅ CREATE
exports.createSchedule = async (req, res) => {
  try {

    // 🔥 Convert to numbers
    req.body.teacherId = Number(req.body.teacherId);
    req.body.classId = Number(req.body.classId);
    req.body.subjectId = Number(req.body.subjectId);
    req.body.period = Number(req.body.period);

    const { error } = createScheduleSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message
      });
    }

    const result = await service.createSchedule(req.body, req.user);

    res.json({
      message: "Schedule created successfully",
      data: result
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ✅ UPDATE
exports.updateSchedule = async (req, res) => {
  try {

    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "Invalid schedule ID" });
    }

    // 🔥 convert fields
    if (req.body.teacherId) req.body.teacherId = Number(req.body.teacherId);
    if (req.body.classId) req.body.classId = Number(req.body.classId);
    if (req.body.subjectId) req.body.subjectId = Number(req.body.subjectId);
    if (req.body.period) req.body.period = Number(req.body.period);

    const data = await service.updateSchedule(id, req.body, req.user);

    res.json({
      message: "Schedule updated successfully",
      data
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ✅ DELETE
exports.deleteSchedule = async (req, res) => {
  try {

    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "Invalid schedule ID" });
    }

    await service.deleteSchedule(id, req.user);

    res.json({
      message: "Schedule deleted successfully"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ✅ PRINCIPAL VIEW
exports.getPrincipalSchedule = async (req, res) => {
  try {

    if (req.query.classId) req.query.classId = Number(req.query.classId);
    if (req.query.teacherId) req.query.teacherId = Number(req.query.teacherId);

    const data = await service.getPrincipalSchedule(req.user, req.query);

    res.json(data);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ✅ STUDENT VIEW
exports.getStudentSchedule = async (req, res) => {
  try {
    const data = await service.getStudentSchedule(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ✅ TEACHER VIEW
exports.getTeacherSchedule = async (req, res) => {
  try {
    const data = await service.getTeacherSchedule(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ ANALYTICS
exports.getAnalytics = async (req, res) => {
  try {
    const data = await service.getAnalytics(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET BREAKS
exports.getBreaks = async (req, res) => {
  try {
    const data = await service.getBreaks(req.params.classId, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ CREATE BREAK
exports.createBreak = async (req, res) => {
  try {
    req.body.classId = Number(req.body.classId);
    const data = await service.createBreak(req.body, req.user);
    res.status(201).json({ message: "Break created", data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ DELETE BREAK
exports.deleteBreak = async (req, res) => {
  try {
    await service.deleteBreak(req.params.id, req.user);
    res.json({ message: "Break deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};