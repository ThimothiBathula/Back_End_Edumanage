const service = require("./principal.service");
const { createTeacherSchema, createStudentSchema } = require("./principal.validation");
const dashboardService = require("./principal.dashboard.service");
const prisma = require("../../config/prisma");

exports.createTeacher = async (req, res) => {
  try {
    const result = await service.createTeacher(req.body, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const result = await service.createStudent(req.body, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getTeachers = async (req, res) => {
  const data = await service.getTeachers(req.query, req.user);;
  res.json(data);
};

exports.updateTeacher = async (req, res) => {
  try {
    await service.updateTeacher(Number(req.params.id), req.body, req.user);
    res.json({ message: "Teacher updated" });
  } catch (err) {
    res.status(err.message === "Teacher not found" ? 404 : 500).json({ message: err.message === "Teacher not found" ? err.message : "Operation failed" });
  }
};

exports.deleteTeacher = async (req, res) => {
  try {
    await service.deleteTeacher(Number(req.params.id), req.user);
    res.json({ message: "Teacher removed" });
  } catch (err) {
    res.status(err.message === "Teacher not found" ? 404 : 500).json({ message: err.message === "Teacher not found" ? err.message : "Operation failed" });
  }
};



exports.getStudents = async (req, res) => {
  const data = await service.getStudents(req.user, req.query);
  res.json(data);
};

exports.updateStudent = async (req, res) => {
  try {

    if (req.body.classId) {
      req.body.classId = Number(req.body.classId);
    }

    await service.updateStudent(
      Number(req.params.id),
      req.body,
      req.user
    );

    res.json({ message: "Student updated" });

  } catch (err) {
    res.status(
      err.message === "Student not found" ? 404 : 500
    ).json({
      message:
        err.message === "Student not found"
          ? err.message
          : err.message
    });
  }
};
exports.deleteStudent = async (req, res) => {
  try {
    await service.deleteStudent(Number(req.params.id), req.user);
    res.json({ message: "Student removed" });
  } catch (err) {
    res.status(err.message === "Student not found" ? 404 : 500).json({ message: err.message === "Student not found" ? err.message : "Operation failed" });
  }
};


exports.dashboard = async (req, res) => {
  try {
    const data = await dashboardService.getDashboard(req.user);
    res.json(data);
  } catch (err) {
    console.error("[DASHBOARD ERROR]", err.message);
    res.status(500).json({ message: err.message || "Failed to load dashboard" });
  }
};


exports.uploadUserImage = async (req, res) => {
  try {

    const userId = Number(req.params.userId);

    const imageUrl = req.file.path;

    await service.updateUserImage(
      userId,
      imageUrl,
      req.user
    );

    res.json({
      message: "Profile image updated",
      url: imageUrl
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.sendAbsentSMS = async (req, res) => {
  try {

    const sessionId = Number(req.params.sessionId);

    await service.sendAbsentSMS(sessionId, req.user);

    res.json({ message: "SMS sent successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllFeedback = async (req, res) => {
  try {
    const { class: className, teacherId } = req.query;

    const whereClause = {
      schoolId: req.user.schoolId,
    };

    if (teacherId) {
      whereClause.teacherId = Number(teacherId);
    }

    if (className) {
      whereClause.student = { class: className };
    }

    const feedbacks = await prisma.teacherFeedback.findMany({
      where: whereClause,
      include: {
        student: {
          select: { user: { select: { name: true } }, class: true }
        },
        teacher: {
          select: { user: { select: { name: true } }, subjects: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const formattedData = feedbacks.map(f => ({
      id: f.id,
      campaignId: f.campaignId,
      studentId: f.studentId,
      studentName: f.student.user.name,
      class: f.student.class?.name || f.student.class,
      teacherName: f.teacher.user.name,
      teacherId: f.teacherId,
      subject: f.teacher.subjects,
      rating: f.rating,
      comment: f.comment,
      isSensitive: f.isSensitive,
      date: f.createdAt.toISOString().split('T')[0]
    }));

    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Exam Configs
exports.createExamConfig = async (req, res) => {
  try {
    const data = await service.createExamConfig(req.body, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getExamConfigs = async (req, res) => {
  try {
    const data = await service.getExamConfigs(req.query, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateExamConfig = async (req, res) => {
  try {
    const data = await service.updateExamConfig(Number(req.params.id), req.body, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteExamConfig = async (req, res) => {
  try {
    await service.deleteExamConfig(Number(req.params.id), req.user);
    res.json({ message: "Exam configuration deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMarks = async (req, res) => {
  try {
    const data = await service.getMarks(req.query.class, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTeacherAnalytics = async (req, res) => {
  try {
    const data = await service.getTeacherAnalytics(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const data = await service.getAttendance(req.query, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const data = await service.updateAttendance(Number(req.params.id), req.body.status, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    await service.deleteAttendance(Number(req.params.id), req.user);
    res.json({ message: "Attendance record deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllFeedback = async (req, res) => {
  try {
    const data = await service.getAllFeedback(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createFeedbackForm = async (req, res) => {
  try {
    const data = await service.createFeedbackForm(req.body, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.dashboard = async (req, res) => {
  try {
    const data = await dashboardService.getDashboard(req.user);
    res.json(data);
  } catch (err) {
    console.error("[DASHBOARD ERROR]", err.message);
    res.status(500).json({ message: err.message || "Failed to load dashboard" });
  }
};


exports.uploadUserImage = async (req, res) => {
  try {

    const userId = Number(req.params.userId);

    const imageUrl = req.file.path;

    await service.updateUserImage(
      userId,
      imageUrl,
      req.user
    );

    res.json({
      message: "Profile image updated",
      url: imageUrl
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.sendAbsentSMS = async (req, res) => {
  try {

    const sessionId = Number(req.params.sessionId);

    await service.sendAbsentSMS(sessionId, req.user);

    res.json({ message: "SMS sent successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllFeedback = async (req, res) => {
  try {
    const { class: className, teacherId } = req.query;

    const whereClause = {
      schoolId: req.user.schoolId,
    };

    if (teacherId) {
      whereClause.teacherId = Number(teacherId);
    }

    if (className) {
      whereClause.student = { class: className };
    }

    const feedbacks = await prisma.teacherFeedback.findMany({
      where: whereClause,
      include: {
        student: {
          select: { user: { select: { name: true } }, class: true }
        },
        teacher: {
          select: { user: { select: { name: true } }, subjects: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const formattedData = feedbacks.map(f => ({
      id: f.id,
      studentName: f.student.user.name,
      class: f.student.class,
      teacherName: f.teacher.user.name,
      teacherId: f.teacherId,
      subject: f.teacher.subjects,
      rating: f.rating,
      comment: f.comment,
      isSensitive: f.isSensitive,
      date: f.createdAt.toISOString().split('T')[0]
    }));

    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Exam Configs
exports.createExamConfig = async (req, res) => {
  try {
    const data = await service.createExamConfig(req.body, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getExamConfigs = async (req, res) => {
  try {
    const data = await service.getExamConfigs(req.query, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateExamConfig = async (req, res) => {
  try {
    const data = await service.updateExamConfig(Number(req.params.id), req.body, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteExamConfig = async (req, res) => {
  try {
    await service.deleteExamConfig(Number(req.params.id), req.user);
    res.json({ message: "Exam configuration deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMarks = async (req, res) => {
  try {
    const data = await service.getMarks(req.query.class, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTeacherAnalytics = async (req, res) => {
  try {
    const data = await service.getTeacherAnalytics(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const data = await service.getAttendance(req.query, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const data = await service.updateAttendance(Number(req.params.id), req.body.status, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    await service.deleteAttendance(Number(req.params.id), req.user);
    res.json({ message: "Attendance record deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllFeedback = async (req, res) => {
  try {
    const data = await service.getAllFeedback(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createFeedbackForm = async (req, res) => {
  try {
    const data = await service.createFeedbackForm(req.body, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getFeedbackForms = async (req, res) => {
  try {
    const data = await service.getFeedbackForms(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFeedbackForm = async (req, res) => {
  try {
    const data = await service.updateFeedbackForm(Number(req.params.id), req.body, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteFeedbackForm = async (req, res) => {
  try {
    await service.deleteFeedbackForm(Number(req.params.id), req.user);
    res.json({ message: "Feedback Campaign deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🔐 HIGH-07: Profile fetched from API on demand — not stored in localStorage
exports.getProfile = async (req, res) => {
  try {
    const principal = await prisma.principal.findFirst({
      where: { userId: req.user.id },
      select: {
        phone:         true,
        dob:           true,
        qualification: true,
        user: {
          select: {
            name:         true,
            email:        true,
            userCode:     true,
            profileImage: true,
            role:         true,
          }
        }
      }
    });

    if (!principal) return res.status(404).json({ message: "Principal profile not found" });

    res.json({
      name:         principal.user.name,
      email:        principal.user.email,
      userCode:     principal.user.userCode,
      profileImage: principal.user.profileImage,
      role:         principal.user.role,
      phone:        principal.phone,
      dob:          principal.dob,
      qualification:principal.qualification,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

// ─── NEW: Fee Correction Approvals ───────────────────────────────────────────
const auditService = require("../audit/audit.service");
const attendanceService = require("../attendance/attendance.service");

/**
 * GET /api/principal/fee-corrections
 * Principal views all fee correction requests for their school.
 * Query param: ?status=PENDING|APPROVED|REJECTED
 */
exports.getFeeCorrections = async (req, res) => {
  try {
    const data = await auditService.getPendingFeeCorrections(
      req.user.schoolId,
      req.query.status || undefined
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/principal/fee-corrections/:id/resolve
 * Body: { status: "APPROVED"|"REJECTED", notes?: string }
 */
exports.resolveFeeCorrection = async (req, res) => {
  try {
    const data = await auditService.resolveFeeCorrection(
      Number(req.params.id),
      req.body,
      req.user
    );
    res.json({ message: `Fee correction ${data.status.toLowerCase()}`, data });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 :
                   err.message.includes("already resolved") ? 409 : 400;
    res.status(status).json({ message: err.message });
  }
};

// ─── NEW: Absentee Parent Call Queue ─────────────────────────────────────────

/**
 * GET /api/principal/attendance/call-queue?date=YYYY-MM-DD&status=PENDING
 */
exports.getCallQueue = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const data = await attendanceService.getCallQueue(
      req.user.schoolId,
      date,
      req.query.status || undefined
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/principal/attendance/call-queue/:id
 * Body: { callOutcome: "CALLED"|"FAILED"|"EXCUSED", notes?: string }
 */
exports.updateCallQueueEntry = async (req, res) => {
  try {
    const { callOutcome, notes } = req.body;
    const data = await attendanceService.updateCallQueueEntry(
      Number(req.params.id),
      callOutcome,
      notes,
      req.user.schoolId
    );
    res.json({ message: "Call log updated", data });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 :
                   err.message.includes("Maximum retries") ? 409 : 400;
    res.status(status).json({ message: err.message });
  }
};

// ─── Accountant Assignment Controller ────────────────────────────────────────

exports.assignAccountant = async (req, res) => {
  try {
    const { userId, notes } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const assignment = await service.assignAccountant({
      schoolId: req.user.schoolId,
      userId,
      notes,
      assignedByUserId: req.user.id
    });
    res.status(201).json({ message: "Accountant assigned successfully", assignment });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  }
};

exports.removeAccountant = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await service.removeAccountant({
      schoolId: req.user.schoolId,
      assignedByUserId: req.user.id,
      notes
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message });
  }
};

exports.getCurrentAccountant = async (req, res) => {
  try {
    const data = await service.getCurrentAccountant(req.user.schoolId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
