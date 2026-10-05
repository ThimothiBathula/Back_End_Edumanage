const service = require("./mentor.service");

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPAL CONTROLLER METHODS
// ─────────────────────────────────────────────────────────────────────────────

exports.getClassMentors = async (req, res, next) => {
  try {
    const { academicYearId } = req.query;
    const result = await service.getClassMentors(req.user, academicYearId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.assignMentor = async (req, res, next) => {
  try {
    const { academicYearId, classId, teacherId, assignmentType } = req.body;
    const result = await service.assignMentor({
      schoolId: req.user.schoolId,
      academicYearId,
      classId,
      teacherId,
      assignmentType,
      user: req.user
    });
    res.status(200).json({
      message: "Mentor assigned successfully",
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.removeMentor = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { academicYearId } = req.body;
    const result = await service.removeMentor({
      schoolId: req.user.schoolId,
      academicYearId,
      classId,
      user: req.user
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getMentorHistory = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const result = await service.getMentorHistory({
      schoolId: req.user.schoolId,
      classId
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.syncDefaultMentors = async (req, res, next) => {
  try {
    const { academicYearId } = req.body;
    const result = await service.syncDefaultMentors({
      schoolId: req.user.schoolId,
      academicYearId,
      user: req.user
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MENTOR CONTROLLER METHODS
// ─────────────────────────────────────────────────────────────────────────────

exports.getMyMentoredClasses = async (req, res, next) => {
  try {
    const result = await service.getMyMentoredClasses(req.user);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getClassOverview = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;
    const result = await service.getClassOverview(req.user, classId, date);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getTodayAttendance = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;
    const result = await service.getTodayAttendance(req.user, classId, date);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getAbsentStudentsToday = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;
    const result = await service.getAbsentStudentsToday(req.user, classId, date);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getClassMarks = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { examType, subjectId } = req.query;
    const result = await service.getClassMarks(req.user, classId, { examType, subjectId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getClassFees = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const result = await service.getClassFees(req.user, classId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.getStudentSummary = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const result = await service.getStudentSummary(req.user, studentId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.exportClassReport = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { type, examType, subjectId } = req.query;
    const result = await service.exportClassReport(req.user, classId, { type, examType, subjectId });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
