const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const generateUserCode = require("../../utils/generateUserCode");
const { buildQuery } = require("../../utils/queryHelper");
const sendSMS = require("../../utils/sendSMS");

// 🔐 Centralized password strength validation (MED-02)
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
function assertPasswordStrength(password) {
  if (!password || !PASSWORD_REGEX.test(password)) {
    throw new Error("Password must be at least 8 characters with uppercase, lowercase, and a number.");
  }
}

exports.createTeacher = async (data, user) => {
  return prisma.$transaction(async (tx) => {
    try {
      // 🔥 1. CHECK EMAIL
      const emailExists = await tx.user.findUnique({
        where: { email: data.email }
      });

      if (emailExists) throw new Error("Email already exists");

      // 🔥 2. GENERATE CODE
      const userCode = await generateUserCode(tx, user.schoolId, "teacher");

      // 🔥 3. VALIDATE + HASH PASSWORD
      assertPasswordStrength(data.password);
      const hashed = await bcrypt.hash(data.password, 10);

      // 🔥 4. CREATE USER
      const newUser = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashed,
          role: "teacher",
          schoolId: user.schoolId,
          userCode,
          // profileImage: data.profileImage || null
        }
      });

      // 🔥 5. HANDLE DOB PROPERLY
      let dob = null;

      if (data.dob) {
        const parsedDob = new Date(data.dob);

        if (isNaN(parsedDob.getTime())) {
          throw new Error("Invalid dob format");
        }

        dob = parsedDob;
      }

      // 🔥 6. CREATE TEACHER
      await tx.teacher.create({
        data: {
          userId: newUser.id,
          schoolId: user.schoolId,
          qualification: data.qualification,
          subjects: data.subjects,
          phone: data.phone,
          gender: data.gender || null,
          dob, // ✅ correct
          experience: data.experience || null
        }
      });

      return { userCode, userId: newUser.id };
    }
    catch (error) {
      console.error("CREATE TEACHER ERROR:", error);
      throw new Error(error.message || "Failed to create teacher");
    }
  });
};

exports.createStudent = async (data, user) => {
  return prisma.$transaction(async (tx) => {
    try {

      const {
        name,
        email,
        password,
        phone,
        dob,
        gender,
        fatherName,
        motherName,
        classId,   // ✅ NEW
        address,
        status
      } = data;

      // 🔒 Validate class belongs to school
      const classData = await tx.classConfig.findFirst({
        where: {
          id: classId,
          schoolId: user.schoolId,
          status: "ACTIVE"
        }
      });

      if (!classData) {
        throw new Error("Invalid class");
      }

      // 🔒 Email check
      const emailExists = await tx.user.findUnique({
        where: { email }
      });

      if (emailExists) {
        throw new Error("Email already exists");
      }

      // 🔢 Generate code
      const userCode = await generateUserCode(tx, user.schoolId, "student");

      assertPasswordStrength(password);
      const hashed = await bcrypt.hash(password, 10);

      // 👤 Create user
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashed,
          role: "student",
          schoolId: user.schoolId,
          userCode,
          // profileImage: data.profileImage || null
        }
      });

      // 🎓 Create student
      await tx.student.create({
        data: {
          userId: newUser.id,
          schoolId: user.schoolId,

          dob: new Date(dob),

          classId,   // 🔥 IMPORTANT

          fatherName,
          motherName,
          phone,

          gender,
          address: address || null,
          status: status || "ACTIVE",

        }
      });

      return {
        userCode,
        userId: newUser.id
      };

    } catch (error) {
      console.error("CREATE STUDENT ERROR:", error);
      throw new Error(error.message || "Failed to create student");
    }
  });
};
// GET ALL TEACHERS
exports.getTeachers = async (query = {}, user) => {

  const queryOptions = buildQuery(query);

  return prisma.teacher.findMany({
    where: {
      schoolId: user.schoolId,
      user: {
        name: {
          contains: query.search || "",
          mode: "insensitive"
        }
      }
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          userCode: true
        }
      }
    },
    ...queryOptions
  });
};

// UPDATE TEACHER
exports.updateTeacher = async (id, data, user) => {
  // 🔐 BOLA Fix: verify teacher belongs to this school
  const teacher = await prisma.teacher.findFirst({
    where: { id, schoolId: user.schoolId, isDeleted: false }
  });
  if (!teacher) throw new Error("Teacher not found");

  return prisma.teacher.update({
    where: { id },
    data: {
      qualification: data.qualification,
      subjects: data.subjects,
      phone: data.phone,
      gender: data.gender
    }
  });
};

// DELETE TEACHER (soft delete with audit)
exports.deleteTeacher = async (id, user) => {
  // 🔐 BOLA Fix: verify teacher belongs to this school
  const teacher = await prisma.teacher.findFirst({
    where: { id, schoolId: user.schoolId, isDeleted: false }
  });
  if (!teacher) throw new Error("Teacher not found");

  return prisma.$transaction(async (tx) => {
    await tx.teacher.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id, status: "DELETED" }
    });

    return tx.user.update({
      where: { id: teacher.userId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id, status: "DELETED" }
    });
  });
};


// GET ALL STUDENTS


exports.getStudents = async (user, query) => {

  const queryOptions = buildQuery(query);

  const students = await prisma.student.findMany({
    where: {
      schoolId: user.schoolId,
      isDeleted: false,

      ...(query.classId && {
        classId: Number(query.classId)
      }),

      user: {
        name: {
          contains: query.search || "",
          mode: "insensitive"
        }
      }
    },

    include: {
      user: {
        select: {
          name: true,
          email: true,
          userCode: true
        }
      },

      // 🔥 ADD THIS
      class: {
        select: {
          id: true,
          name: true
        }
      }
    },

    ...queryOptions
  });

  // Dynamically resolve active mentors for the classes in this student list
  const activeYear = await prisma.academicYear.findFirst({
    where: { schoolId: user.schoolId, status: "ACTIVE" },
    select: { id: true }
  });

  const classIds = [...new Set(students.map(s => s.classId).filter(Boolean))];
  const activeMentors = classIds.length > 0
    ? await prisma.classMentor.findMany({
        where: {
          schoolId: user.schoolId,
          classId: { in: classIds },
          isActive: true,
          ...(activeYear && { academicYearId: activeYear.id })
        },
        include: {
          teacher: {
            include: {
              user: { select: { name: true, email: true } }
            }
          }
        }
      })
    : [];

  const mentorMap = {};
  activeMentors.forEach(m => {
    mentorMap[m.classId] = {
      name: m.teacher?.user?.name || "Assigned Mentor",
      phone: m.teacher?.phone || "",
      email: m.teacher?.user?.email || "",
      assignmentType: m.assignmentType
    };
  });

  return students.map(s => ({
    ...s,
    mentor: mentorMap[s.classId] || null
  }));
};

// UPDATE STUDENT
exports.updateStudent = async (id, data, user) => {

  const student = await prisma.student.findFirst({
    where: {
      id,
      schoolId: user.schoolId,
      isDeleted: false
    }
  });

  if (!student) throw new Error("Student not found");

  // 🔥 validate class if provided
  if (data.classId) {

    const classExists = await prisma.classConfig.findFirst({
      where: {
        id: Number(data.classId),
        schoolId: user.schoolId,
        status: "ACTIVE"
      }
    });

    if (!classExists) {
      throw new Error("Invalid class");
    }
  }

  return prisma.student.update({
    where: { id },
    data: {
      ...(data.classId && { classId: Number(data.classId) }),

      phone: data.phone,
      fatherName: data.fatherName,
      gender: data.gender,
      address: data.address,
      status: data.status
    }
  });
};
// DELETE STUDENT
exports.deleteStudent = async (id, user) => {
  // 🔐 BOLA Fix: verify student belongs to this school
  const student = await prisma.student.findFirst({
    where: { id, schoolId: user.schoolId, isDeleted: false }
  });
  if (!student) throw new Error("Student not found");

  return prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id, status: "DELETED" }
    });

    return tx.user.update({
      where: { id: student.userId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id, status: "DELETED" }
    });
  });
};


exports.updateUserImage = async (userId, imageUrl, principal) => {

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      schoolId: principal.schoolId
    }
  });

  if (!user) {
    throw new Error("Unauthorized or user not found");
  }

  return prisma.user.update({
    where: { id: userId },
    data: { profileImage: imageUrl }
  });
};

exports.sendAbsentSMS = async (sessionId, user) => {

  // 1. Validate session
  const session = await prisma.attendanceSession.findFirst({
    where: {
      id: sessionId,
      schoolId: user.schoolId
    }
  });

  if (!session) throw new Error("Session not found");

  if (session.smsSent) {
    throw new Error("SMS already sent");
  }

  // 2. Check SMS enabled
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId }
  });

  if (!school.smsEnabled) {
    throw new Error("SMS feature disabled");
  }

  // 3. Check pending corrections
  const pending = await prisma.correctionRequest.count({
    where: {
      schoolId: user.schoolId,
      status: "PENDING"
    }
  });

  if (pending > 0) {
    throw new Error("Resolve correction requests first");
  }

  // 4. Get absentees
  const absentees = await prisma.attendance.findMany({
    where: {
      schoolId: user.schoolId,
      date: session.date,
      status: "ABSENT"
    },
    select: {
      student: {
        select: {
          phone: true,
          user: {
            select: { name: true }
          }
        }
      }
    }
  });

  if (!absentees.length) {
    throw new Error("No absentees found");
  }

  // 🔥 5. LIMIT CHECK (IMPORTANT)
  if (absentees.length > 200) {
    throw new Error("Too many SMS in one batch");
  }

  // 🔥 6. SEND SMS (CORRECT FORMAT + SAFE)
  const results = await Promise.all(
    absentees.map(a => {

      if (!a.student?.phone) return null; // skip invalid

      return sendSMS(a.student.phone, {
        name: a.student.user.name
      });

    })
  );

  // 🔥 7. MARK AS SENT ONLY IF SUCCESS
  await prisma.attendanceSession.update({
    where: { id: sessionId },
    data: { smsSent: true }
  });

  return true;
};

// ==========================================
// EXAM CONFIGURATIONS
// ==========================================
exports.createExamConfig = async (data, user) => {
  if (data.class === "ALL") {
    const classes = await prisma.classConfig.findMany({
      where: { schoolId: user.schoolId, status: "ACTIVE" }
    });

    const configs = classes.map(c => ({
      schoolId: user.schoolId,
      classId: c.id,
      examType: data.examType,
      maxMarks: Number(data.maxMarks),
      passMarks: Number(data.passMarks),
      isUploadEnabled: data.isUploadEnabled !== false,
    }));

    await prisma.examConfig.createMany({ data: configs, skipDuplicates: true });
    return { message: "Created for all classes" };
  } else {
    return prisma.examConfig.create({
      data: {
        schoolId: user.schoolId,
        classId: Number(data.class),
        examType: data.examType,
        maxMarks: Number(data.maxMarks),
        passMarks: Number(data.passMarks),
        isUploadEnabled: data.isUploadEnabled !== false,
      }
    });
  }
};

exports.getExamConfigs = async (query, user) => {
  const where = { schoolId: user.schoolId };
  if (query.class) where.classId = Number(query.class);
  if (query.examType) where.examType = query.examType;

  return prisma.examConfig.findMany({
    where,
    include: {
      class: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
};

exports.updateExamConfig = async (id, data, user) => {
  return prisma.examConfig.update({
    where: { id, schoolId: user.schoolId },
    data: {
      examType: data.examType,
      maxMarks: data.maxMarks ? Number(data.maxMarks) : undefined,
      passMarks: data.passMarks ? Number(data.passMarks) : undefined,
      isUploadEnabled: data.isUploadEnabled,
    }
  });
};

exports.deleteExamConfig = async (id, user) => {
  return prisma.examConfig.delete({
    where: { id, schoolId: user.schoolId }
  });
};

exports.getMarks = async (studentClass, user) => {
  return prisma.marks.findMany({
    where: {
      schoolId: user.schoolId,
      student: studentClass ? { class: { name: studentClass } } : undefined
    },
    select: {
      id:       true,
      examType: true,
      marks:    true,
      maxMarks: true,
      passMarks:true,
      date:     true,
      student: {
        select: {
          id:   true,
          user: { select: { name: true, userCode: true } },
          class:{ select: { name: true } }
        }
      },
      teacher: {
        select: {
          id:   true,
          user: { select: { name: true } }
        }
      },
      subject: { select: { id: true, name: true } }
    },
    orderBy: { date: 'desc' }
  });
};

exports.getTeacherAnalytics = async (user) => {
  const schoolId = user.schoolId;
  const teachers = await prisma.teacher.findMany({
    where: { schoolId, isDeleted: false },
    include: {
      user: { select: { name: true } },
      feedbacks: { select: { rating: true } },
      syllabusPlans: {
        select: {
          weeks: { select: { status: true } }
        }
      }
    }
  });

  return teachers.map(t => {
    // Flatten all SyllabusWeek entries across all plans for this teacher
    const allWeeks = t.syllabusPlans.flatMap(p => p.weeks);
    const totalWeeks = allWeeks.length;
    const completedWeeks = allWeeks.filter(w => w.status === "COMPLETED").length;
    const syllabusProgress = totalWeeks > 0
      ? Number(((completedWeeks / totalWeeks) * 100).toFixed(1))
      : 0;

    const totalRating = t.feedbacks.reduce((sum, f) => sum + f.rating, 0);
    const avgRating = t.feedbacks.length > 0
      ? Number((totalRating / t.feedbacks.length).toFixed(1))
      : 0;

    return {
      id: t.id,
      name: t.user.name,
      subjects: t.subjects,
      syllabusProgress,
      avgRating,
      totalFeedbacks: t.feedbacks.length
    };
  });
};

exports.getAttendance = async (query, user) => {
  const { class: studentClass, date } = query;
  
  const where = {
    schoolId: user.schoolId,
    isDeleted: false
  };

  if (studentClass) {
    where.student = { class: { name: studentClass } };
  }

  if (date) {
    const d = new Date(date);
    where.date = {
      gte: new Date(d.setHours(0, 0, 0, 0)),
      lte: new Date(d.setHours(23, 59, 59, 999))
    };
  }

  return prisma.attendance.findMany({
    where,
    include: {
      student: { include: { user: true, class: true } },
      teacher: { include: { user: true } }
    },
    orderBy: { date: 'desc' }
  });
};

exports.updateAttendance = async (id, status, user) => {
  return prisma.attendance.update({
    where: { id, schoolId: user.schoolId },
    data: { status }
  });
};

exports.deleteAttendance = async (id, user) => {
  return prisma.attendance.delete({
    where: { id, schoolId: user.schoolId }
  });
};

exports.getAllFeedback = async (user) => {
  const feedbacks = await prisma.teacherFeedback.findMany({
    where: { schoolId: user.schoolId },
    include: {
      campaign: true,
      teacher: { include: { user: true } },
      student: { include: { user: true, class: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return feedbacks.map(f => ({
    id: f.id,
    formTitle: f.campaign?.title || 'General Feedback',
    class: f.student?.class?.name || 'Unknown',
    subject: 'All Subjects', // Evaluated on the whole
    teacherId: f.teacherId,
    teacherName: f.teacher?.user?.name || 'Unknown',
    studentId: f.student?.userCode || f.studentId,
    rating: f.rating,
    comment: f.comment,
    date: f.createdAt
  }));
};

exports.createFeedbackForm = async (data, user) => {
  return prisma.feedbackCampaign.create({
    data: {
      schoolId: user.schoolId,
      title: data.title,
      description: data.description,
      targetClass: data.class || data.targetClass || 'ALL',
      campaignType: data.campaignType || 'SUBJECT_TEACHER', // 'SUBJECT_TEACHER' | 'MENTOR' | 'SCHOOL' | 'CUSTOM_TEACHER'
      status: 'ACTIVE',
      createdById: user.id
    }
  });
};

exports.getFeedbackForms = async (user) => {
  return prisma.feedbackCampaign.findMany({
    where: { schoolId: user.schoolId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { feedbacks: true }
      },
      createdBy: {
        select: { id: true, name: true }
      }
    }
  });
};

exports.updateFeedbackForm = async (id, data, user) => {
  return prisma.feedbackCampaign.update({
    where: { id: Number(id), schoolId: user.schoolId },
    data: {
      title: data.title,
      description: data.description,
      targetClass: data.class || data.targetClass,
      campaignType: data.campaignType,
      status: data.status
    }
  });
};

exports.deleteFeedbackForm = async (id, user, deleteReason = "Deleted by Principal") => {
  // Soft delete preserving audit history and responses
  return prisma.feedbackCampaign.update({
    where: { id: Number(id), schoolId: user.schoolId },
    data: {
      status: "DELETED",
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: user.id,
      deleteReason: typeof deleteReason === "string" ? deleteReason : "Deleted by Principal"
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTANT ASSIGNMENT (Base Role + Capability Model)
// ─────────────────────────────────────────────────────────────────────────────

exports.assignAccountant = async ({ schoolId, userId, notes, assignedByUserId }) => {
  const targetUser = await prisma.user.findFirst({
    where: { id: Number(userId), schoolId, isDeleted: false }
  });
  if (!targetUser) {
    const err = new Error("User not found in your school");
    err.status = 404;
    throw err;
  }

  // Check if target user is a teacher
  const teacher = await prisma.teacher.findUnique({
    where: { userId: targetUser.id }
  });

  return prisma.$transaction(async (tx) => {
    // 1. Deactivate existing active assignment for this school (Enforces only one active accountant per school)
    await tx.accountantAssignment.updateMany({
      where: { schoolId, isActive: true },
      data: { isActive: false, endDate: new Date() }
    });

    // 2. Create new active assignment
    const assignment = await tx.accountantAssignment.create({
      data: {
        schoolId,
        userId: targetUser.id,
        teacherId: teacher?.id || null,
        isActive: true,
        startDate: new Date(),
        assignedById: assignedByUserId,
        notes: notes || null
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, userCode: true } },
        teacher: { select: { id: true, subjects: true, phone: true } },
        assignedBy: { select: { id: true, name: true } }
      }
    });

    // 3. Log audit
    try {
      const { captureAuditLog } = require("../../utils/auditLogger");
      await captureAuditLog({
        modelName: "accountantAssignment",
        entityId: assignment.id,
        actionType: "ASSIGN",
        oldData: null,
        newData: { userId: targetUser.id, name: targetUser.name, role: targetUser.role },
        user: { id: assignedByUserId, schoolId },
        module: "USER_MODULE"
      });
    } catch (_) {}

    return assignment;
  });
};

exports.removeAccountant = async ({ schoolId, assignedByUserId, notes }) => {
  return prisma.$transaction(async (tx) => {
    const active = await tx.accountantAssignment.findFirst({
      where: { schoolId, isActive: true }
    });
    if (!active) {
      throw new Error("No active accountant assigned to remove");
    }

    await tx.accountantAssignment.update({
      where: { id: active.id },
      data: { isActive: false, endDate: new Date(), notes: notes || active.notes }
    });

    try {
      const { captureAuditLog } = require("../../utils/auditLogger");
      await captureAuditLog({
        modelName: "accountantAssignment",
        entityId: active.id,
        actionType: "REMOVE",
        oldData: { userId: active.userId },
        newData: null,
        user: { id: assignedByUserId, schoolId },
        module: "USER_MODULE"
      });
    } catch (_) {}

    return { message: "Accountant responsibility removed successfully" };
  });
};

exports.getCurrentAccountant = async (schoolId) => {
  const current = await prisma.accountantAssignment.findFirst({
    where: { schoolId, isActive: true },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, userCode: true } },
      teacher: { select: { id: true, subjects: true, phone: true } },
      assignedBy: { select: { id: true, name: true } }
    }
  });

  const history = await prisma.accountantAssignment.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      user: { select: { id: true, name: true, email: true, role: true, userCode: true } },
      assignedBy: { select: { id: true, name: true } }
    }
  });

  return { current, history };
};