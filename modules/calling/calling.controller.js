/**
 * AI Calling Controller
 */

const callingService = require("./calling.service");

// Trigger a single call
exports.triggerSingleCall = async (req, res, next) => {
  try {
    const { studentId, callPurpose, metadata } = req.body;
    const schoolId = req.user.role === "superadmin" && req.body.schoolId ? Number(req.body.schoolId) : req.user.schoolId;

    if (!studentId || !callPurpose) {
      return res.status(400).json({ success: false, message: "studentId and callPurpose are required." });
    }

    const result = await callingService.initiateCall({
      schoolId,
      studentId: Number(studentId),
      callPurpose,
      metadata: metadata || {},
      initiatedByUserId: req.user.id
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// Batch trigger absence calls
exports.triggerAbsenceCalls = async (req, res, next) => {
  try {
    const { classId, date } = req.body;
    const schoolId = req.user.role === "superadmin" && req.body.schoolId ? Number(req.body.schoolId) : req.user.schoolId;

    const result = await callingService.triggerAbsenceCallsForClass({
      schoolId,
      classId: classId ? Number(classId) : null,
      date: date ? new Date(date) : new Date(),
      triggeredByUserId: req.user.id
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// Batch trigger fee reminder calls
exports.triggerFeeReminderCalls = async (req, res, next) => {
  try {
    const { classId } = req.body;
    const schoolId = req.user.role === "superadmin" && req.body.schoolId ? Number(req.body.schoolId) : req.user.schoolId;

    const result = await callingService.triggerFeeReminderCalls({
      schoolId,
      classId: classId ? Number(classId) : null,
      triggeredByUserId: req.user.id
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// Webhook endpoint for external telephony events
exports.handleWebhook = async (req, res, next) => {
  try {
    const result = await callingService.handleCallWebhook(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[CallingController Webhook Error]", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
};

// Mentor Communication Dashboard
exports.getMentorDashboard = async (req, res, next) => {
  try {
    const schoolId = req.user.schoolId;
    const result = await callingService.getMentorCommunicationDashboard(req.user.id, schoolId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// School-level Call Analytics
exports.getSchoolAnalytics = async (req, res, next) => {
  try {
    const schoolId = req.user.role === "superadmin" && req.query.schoolId ? Number(req.query.schoolId) : req.user.schoolId;
    const { startDate, endDate, mentorId, purpose } = req.query;

    const result = await callingService.getSchoolCallAnalytics(schoolId, {
      startDate,
      endDate,
      mentorId,
      purpose
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// Super Admin Cross-School Usage
exports.getSuperAdminUsage = async (req, res, next) => {
  try {
    const { startDate, endDate, schoolId } = req.query;
    const result = await callingService.getSuperAdminCallUsage({
      startDate,
      endDate,
      schoolId
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// Student Call History
exports.getStudentHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const schoolId = req.user.role === "superadmin" && req.query.schoolId ? Number(req.query.schoolId) : req.user.schoolId;

    const result = await callingService.getStudentCallHistory(Number(id), schoolId, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
