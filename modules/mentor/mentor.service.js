const prisma = require("../../config/prisma");
const { captureAuditLog } = require("../../utils/auditLogger");
const featureService = require("../feature/feature.service");

/**
 * Resolve the active academic year for a school.
 */
async function getActiveAcademicYear(schoolId, tx = prisma) {
  const year = await tx.academicYear.findFirst({
    where: { schoolId, status: "ACTIVE" },
    select: { id: true, name: true, startDate: true, endDate: true }
  });
  return year;
}

/**
 * Helper to assert mentor or authorized administrator access.
 * Returns { teacher, classMentor } if authorized, or throws 403 error.
 */
async function assertMentorOrAdminAccess(user, classId, academicYearId = null) {
  const schoolId = user.schoolId;

  // Super Admin and Principal have full school-level oversight
  if (user.role === "superadmin" || user.role === "principal") {
    const classData = await prisma.classConfig.findFirst({
      where: { id: Number(classId), schoolId, status: "ACTIVE" }
    });
    if (!classData) {
      const err = new Error("Class not found in this school");
      err.status = 404;
      throw err;
    }
    return { isPrincipalOrAdmin: true, classData };
  }

  // If user is a teacher, verify they are the active mentor for this class
  if (user.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.id }
    });
    if (!teacher || teacher.schoolId !== schoolId) {
      const err = new Error("Unauthorized faculty profile");
      err.status = 403;
      throw err;
    }

    // Resolve target academic year
    let targetYearId = academicYearId ? Number(academicYearId) : null;
    if (!targetYearId) {
      const activeYear = await getActiveAcademicYear(schoolId);
      targetYearId = activeYear?.id || null;
    }

    const activeMentor = await prisma.classMentor.findFirst({
      where: {
        schoolId,
        classId: Number(classId),
        teacherId: teacher.id,
        isActive: true,
        ...(targetYearId && { academicYearId: targetYearId })
      }
    });

    if (!activeMentor) {
      const err = new Error("Forbidden: You are not assigned as the mentor for this class");
      err.status = 403;
      throw err;
    }

    const classData = await prisma.classConfig.findFirst({
      where: { id: Number(classId), schoolId, status: "ACTIVE" }
    });

    return { isPrincipalOrAdmin: false, teacher, classMentor: activeMentor, classData };
  }

  const err = new Error("Forbidden: Access restricted to assigned mentor or principal");
  err.status = 403;
  throw err;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. PRINCIPAL: Get all class mentors for an academic year
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getClassMentors = async (user, academicYearId = null) => {
  const schoolId = user.schoolId;

  // Resolve target academic year
  let targetYear = null;
  if (academicYearId) {
    targetYear = await prisma.academicYear.findFirst({
      where: { id: Number(academicYearId), schoolId }
    });
  }
  if (!targetYear) {
    targetYear = await getActiveAcademicYear(schoolId);
  }

  // Get all active classes for this school
  const classes = await prisma.classConfig.findMany({
    where: { schoolId, status: "ACTIVE" },
    include: {
      _count: {
        select: {
          students: {
            where: { isDeleted: false, status: "ACTIVE" }
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });

  // Get active mentor assignments for target academic year
  const activeAssignments = targetYear
    ? await prisma.classMentor.findMany({
        where: {
          schoolId,
          academicYearId: targetYear.id,
          isActive: true
        },
        include: {
          teacher: {
            include: {
              user: {
                select: { id: true, name: true, email: true, userCode: true, profileImage: true }
              }
            }
          },
          assignedBy: {
            select: { id: true, name: true, role: true }
          }
        }
      })
    : [];

  const assignmentByClassId = {};
  activeAssignments.forEach((a) => {
    assignmentByClassId[a.classId] = a;
  });

  // Query Schedule to detect Period 1 faculty for each class (Default Mentor candidate)
  const period1Schedules = await prisma.schedule.findMany({
    where: {
      schoolId,
      period: 1
    },
    include: {
      teacher: {
        include: {
          user: {
            select: { id: true, name: true, email: true, userCode: true }
          }
        }
      },
      subject: { select: { id: true, name: true } }
    },
    orderBy: [{ day: "asc" }, { id: "asc" }]
  });

  // Map first period teacher per class
  const defaultTeacherByClassId = {};
  period1Schedules.forEach((s) => {
    if (!defaultTeacherByClassId[s.classId]) {
      defaultTeacherByClassId[s.classId] = {
        teacherId: s.teacherId,
        name: s.teacher?.user?.name || "Unknown",
        email: s.teacher?.user?.email || "",
        phone: s.teacher?.phone || "",
        userCode: s.teacher?.user?.userCode || "",
        subject: s.subject?.name || "",
        day: s.day
      };
    }
  });

  // Build response array
  let assignedCount = 0;
  let unassignedCount = 0;

  const result = classes.map((cls) => {
    const active = assignmentByClassId[cls.id];
    const defaultCandidate = defaultTeacherByClassId[cls.id] || null;

    if (active) {
      assignedCount++;
      return {
        classId: cls.id,
        className: cls.name,
        periodsPerDay: cls.periodsPerDay,
        studentCount: cls._count.students,
        academicYearId: targetYear?.id || null,
        academicYearName: targetYear?.name || "N/A",
        assignmentType: active.assignmentType, // "MANUAL" | "FIRST_PERIOD_DEFAULT"
        startDate: active.startDate,
        mentor: {
          assignmentId: active.id,
          teacherId: active.teacherId,
          name: active.teacher?.user?.name || "Unknown",
          email: active.teacher?.user?.email || "",
          phone: active.teacher?.phone || "",
          qualification: active.teacher?.qualification || "",
          subjects: active.teacher?.subjects || "",
          userCode: active.teacher?.user?.userCode || "",
          profileImage: active.teacher?.user?.profileImage || null
        },
        defaultCandidate,
        assignedBy: active.assignedBy
      };
    } else {
      unassignedCount++;
      return {
        classId: cls.id,
        className: cls.name,
        periodsPerDay: cls.periodsPerDay,
        studentCount: cls._count.students,
        academicYearId: targetYear?.id || null,
        academicYearName: targetYear?.name || "N/A",
        assignmentType: "UNASSIGNED",
        startDate: null,
        mentor: null,
        defaultCandidate,
        assignedBy: null
      };
    }
  });

  return {
    academicYear: targetYear
      ? { id: targetYear.id, name: targetYear.name, status: targetYear.status }
      : null,
    totalClasses: classes.length,
    assignedCount,
    unassignedCount,
    classes: result
  };
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. PRINCIPAL: Assign or change mentor for a class
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.assignMentor = async ({
  schoolId,
  academicYearId,
  classId,
  teacherId,
  assignmentType = "MANUAL",
  user
}) => {
  if (!classId || !teacherId) {
    throw new Error("classId and teacherId are required");
  }

  // Validate tenant ownership
  let targetYearId = academicYearId ? Number(academicYearId) : null;
  if (!targetYearId) {
    const activeYear = await getActiveAcademicYear(schoolId);
    if (!activeYear) throw new Error("No active academic year found for this school");
    targetYearId = activeYear.id;
  }

  const [classData, teacherData, academicYearData] = await Promise.all([
    prisma.classConfig.findFirst({
      where: { id: Number(classId), schoolId, status: "ACTIVE" }
    }),
    prisma.teacher.findFirst({
      where: { id: Number(teacherId), schoolId, isDeleted: false },
      include: { user: { select: { id: true, name: true, email: true } } }
    }),
    prisma.academicYear.findFirst({
      where: { id: targetYearId, schoolId }
    })
  ]);

  if (!classData) throw new Error("Class not found in this school");
  if (!teacherData) throw new Error("Teacher not found in this school");
  if (!academicYearData) throw new Error("Academic year not found in this school");

  return prisma.$transaction(async (tx) => {
    // 1. Find existing active assignment for this class + academic year
    const existingActive = await tx.classMentor.findFirst({
      where: {
        schoolId,
        academicYearId: targetYearId,
        classId: Number(classId),
        isActive: true
      },
      include: {
        teacher: { include: { user: { select: { name: true } } } }
      }
    });

    const now = new Date();

    // 2. Deactivate previous active assignment if exists
    if (existingActive) {
      await tx.classMentor.update({
        where: { id: existingActive.id },
        data: {
          isActive: false,
          endDate: now
        }
      });
    }

    // 3. Create new active assignment
    const newAssignment = await tx.classMentor.create({
      data: {
        schoolId,
        academicYearId: targetYearId,
        classId: Number(classId),
        teacherId: Number(teacherId),
        assignmentType: assignmentType === "FIRST_PERIOD_DEFAULT" ? "FIRST_PERIOD_DEFAULT" : "MANUAL",
        isActive: true,
        startDate: now,
        assignedById: user.id
      },
      include: {
        teacher: {
          include: {
            user: {
              select: { id: true, name: true, email: true, userCode: true, profileImage: true }
            }
          }
        },
        class: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } }
      }
    });

    // 4. Capture Audit Log
    await tx.auditLog.create({
      data: {
        schoolId,
        module: "MENTOR",
        actionType: existingActive ? "UPDATE" : "CREATE",
        entityId: newAssignment.id,
        entityType: "ClassMentor",
        oldData: existingActive
          ? {
              previousTeacherId: existingActive.teacherId,
              previousTeacherName: existingActive.teacher?.user?.name,
              assignmentType: existingActive.assignmentType
            }
          : null,
        newData: {
          teacherId: newAssignment.teacherId,
          teacherName: teacherData.user.name,
          classId: newAssignment.classId,
          className: classData.name,
          academicYearId: targetYearId,
          academicYearName: academicYearData.name,
          assignmentType: newAssignment.assignmentType
        },
        changedBy: user.id,
        changedByRole: user.role,
        revokeExpiry: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return newAssignment;
  });
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. PRINCIPAL: Remove mentor from a class
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.removeMentor = async ({ schoolId, academicYearId, classId, user }) => {
  let targetYearId = academicYearId ? Number(academicYearId) : null;
  if (!targetYearId) {
    const activeYear = await getActiveAcademicYear(schoolId);
    targetYearId = activeYear?.id || null;
  }

  const existingActive = await prisma.classMentor.findFirst({
    where: {
      schoolId,
      classId: Number(classId),
      isActive: true,
      ...(targetYearId && { academicYearId: targetYearId })
    },
    include: {
      teacher: { include: { user: { select: { name: true } } } },
      class: { select: { name: true } }
    }
  });

  if (!existingActive) {
    throw new Error("No active mentor assigned to this class");
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.classMentor.update({
      where: { id: existingActive.id },
      data: {
        isActive: false,
        endDate: now
      }
    });

    await tx.auditLog.create({
      data: {
        schoolId,
        module: "MENTOR",
        actionType: "DELETE",
        entityId: existingActive.id,
        entityType: "ClassMentor",
        oldData: {
          teacherId: existingActive.teacherId,
          teacherName: existingActive.teacher?.user?.name,
          className: existingActive.class?.name
        },
        newData: { isActive: false, removedAt: now },
        changedBy: user.id,
        changedByRole: user.role,
        revokeExpiry: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return { message: "Mentor removed successfully", classId: Number(classId) };
  });
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 4. PRINCIPAL: View Mentor Assignment History for a Class
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getMentorHistory = async ({ schoolId, classId }) => {
  const history = await prisma.classMentor.findMany({
    where: {
      schoolId,
      classId: Number(classId)
    },
    include: {
      teacher: {
        include: {
          user: {
            select: { id: true, name: true, email: true, userCode: true }
          }
        }
      },
      academicYear: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true, role: true } }
    },
    orderBy: { startDate: "desc" }
  });

  return history;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 5. PRINCIPAL: Auto-Sync Default Mentors from Timetable (First Period)
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.syncDefaultMentors = async ({ schoolId, academicYearId, user }) => {
  let targetYearId = academicYearId ? Number(academicYearId) : null;
  if (!targetYearId) {
    const activeYear = await getActiveAcademicYear(schoolId);
    if (!activeYear) throw new Error("No active academic year found");
    targetYearId = activeYear.id;
  }

  // Get active classes
  const classes = await prisma.classConfig.findMany({
    where: { schoolId, status: "ACTIVE" }
  });

  // Get existing active assignments
  const existingActive = await prisma.classMentor.findMany({
    where: {
      schoolId,
      academicYearId: targetYearId,
      isActive: true
    }
  });

  const activeClassMap = {};
  existingActive.forEach(a => {
    activeClassMap[a.classId] = a;
  });

  // Period 1 schedules
  const p1Schedules = await prisma.schedule.findMany({
    where: { schoolId, period: 1 },
    orderBy: [{ day: "asc" }, { id: "asc" }]
  });

  const p1Map = {};
  p1Schedules.forEach(s => {
    if (!p1Map[s.classId]) {
      p1Map[s.classId] = s.teacherId;
    }
  });

  const created = [];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const cls of classes) {
      const current = activeClassMap[cls.id];
      const p1TeacherId = p1Map[cls.id];

      // If no current mentor, and p1 teacher exists: assign FIRST_PERIOD_DEFAULT
      if (!current && p1TeacherId) {
        const item = await tx.classMentor.create({
          data: {
            schoolId,
            academicYearId: targetYearId,
            classId: cls.id,
            teacherId: p1TeacherId,
            assignmentType: "FIRST_PERIOD_DEFAULT",
            isActive: true,
            startDate: now,
            assignedById: user.id
          }
        });
        created.push(item);
      }
    }
  });

  return {
    message: `Default mentors assigned for ${created.length} classes`,
    assignedCount: created.length
  };
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 6. MENTOR: Get teacher's mentored classes (My Mentored Classes)
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getMyMentoredClasses = async (user) => {
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id }
  });

  if (!teacher) return [];

  const activeYear = await getActiveAcademicYear(user.schoolId);

  const assignments = await prisma.classMentor.findMany({
    where: {
      schoolId: user.schoolId,
      teacherId: teacher.id,
      isActive: true,
      ...(activeYear && { academicYearId: activeYear.id })
    },
    include: {
      class: {
        include: {
          _count: {
            select: {
              students: { where: { isDeleted: false, status: "ACTIVE" } }
            }
          }
        }
      },
      academicYear: { select: { id: true, name: true } }
    },
    orderBy: { class: { name: "asc" } }
  });

  return assignments.map(a => ({
    assignmentId: a.id,
    classId: a.classId,
    className: a.class.name,
    periodsPerDay: a.class.periodsPerDay,
    studentCount: a.class._count.students,
    academicYearId: a.academicYearId,
    academicYearName: a.academicYear?.name || "N/A",
    assignmentType: a.assignmentType,
    startDate: a.startDate
  }));
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 7. MENTOR / PRINCIPAL: Class Overview Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getClassOverview = async (user, classId, queryDate = null) => {
  const { classData } = await assertMentorOrAdminAccess(user, classId);
  const schoolId = user.schoolId;

  const targetDate = queryDate ? new Date(queryDate) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  const activeYear = await getActiveAcademicYear(schoolId);

  // 1. Fetch all active students in class
  const students = await prisma.student.findMany({
    where: {
      classId: Number(classId),
      schoolId,
      isDeleted: false,
      status: "ACTIVE"
    },
    select: { id: true }
  });

  const studentIds = students.map(s => s.id);
  const totalStudents = studentIds.length;

  if (totalStudents === 0) {
    return {
      class: { id: classData.id, name: classData.name },
      academicYear: activeYear ? { id: activeYear.id, name: activeYear.name } : null,
      totalStudents: 0,
      presentToday: 0,
      absentToday: 0,
      attendancePercentage: 0,
      averageMarks: 0,
      pendingFeesCount: 0,
      totalPendingFees: 0,
      lowAttendanceCount: 0,
      academicConcernsCount: 0
    };
  }

  // 2. Today's Attendance breakdown
  const todayAttendanceRecords = await prisma.attendance.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      date: targetDate,
      isDeleted: false
    },
    select: { studentId: true, status: true }
  });

  // Calculate distinct student attendance today
  const studentTodayStatus = {};
  todayAttendanceRecords.forEach(r => {
    // If student has multiple periods and was present in any, or all absent
    if (!studentTodayStatus[r.studentId] || r.status === "PRESENT") {
      studentTodayStatus[r.studentId] = r.status;
    }
  });

  let presentToday = 0;
  let absentToday = 0;
  Object.values(studentTodayStatus).forEach(status => {
    if (status === "PRESENT") presentToday++;
    else if (status === "ABSENT") absentToday++;
  });

  const attendancePercentage = totalStudents > 0
    ? Number(((presentToday / totalStudents) * 100).toFixed(1))
    : 0;

  // 3. Students with Low Overall Attendance (< 75%)
  const allYearAttendance = await prisma.attendance.groupBy({
    by: ["studentId", "status"],
    where: {
      schoolId,
      studentId: { in: studentIds },
      isDeleted: false,
      ...(activeYear && { academicYearId: activeYear.id })
    },
    _count: { id: true }
  });

  const studentAttendanceStats = {};
  studentIds.forEach(id => {
    studentAttendanceStats[id] = { total: 0, present: 0 };
  });
  allYearAttendance.forEach(item => {
    if (studentAttendanceStats[item.studentId]) {
      studentAttendanceStats[item.studentId].total += item._count.id;
      if (item.status === "PRESENT") {
        studentAttendanceStats[item.studentId].present += item._count.id;
      }
    }
  });

  let lowAttendanceCount = 0;
  Object.values(studentAttendanceStats).forEach(s => {
    if (s.total > 0) {
      const pct = (s.present / s.total) * 100;
      if (pct < 75) lowAttendanceCount++;
    }
  });

  // 4. Marks and Academic Concerns (< 40% or failing)
  const allMarks = await prisma.marks.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      isDeleted: false,
      ...(activeYear && { academicYearId: activeYear.id })
    },
    select: {
      studentId: true,
      marks: true,
      maxMarks: true,
      passMarks: true
    }
  });

  let totalMarksSum = 0;
  let totalMaxMarksSum = 0;
  const studentMarksSummary = {};
  studentIds.forEach(id => {
    studentMarksSummary[id] = { total: 0, max: 0, failedCount: 0 };
  });

  allMarks.forEach(m => {
    totalMarksSum += m.marks;
    totalMaxMarksSum += m.maxMarks;

    if (studentMarksSummary[m.studentId]) {
      studentMarksSummary[m.studentId].total += m.marks;
      studentMarksSummary[m.studentId].max += m.maxMarks;
      if (m.marks < m.passMarks) {
        studentMarksSummary[m.studentId].failedCount++;
      }
    }
  });

  const averageMarks = totalMaxMarksSum > 0
    ? Number(((totalMarksSum / totalMaxMarksSum) * 100).toFixed(1))
    : 0;

  let academicConcernsCount = 0;
  Object.values(studentMarksSummary).forEach(s => {
    if (s.max > 0) {
      const pct = (s.total / s.max) * 100;
      if (pct < 40 || s.failedCount > 0) {
        academicConcernsCount++;
      }
    }
  });

  // 5. Fees Summary (read-only)
  const fees = await prisma.fee.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      isDeleted: false
    },
    select: {
      studentId: true,
      pendingAmount: true,
      paymentStatus: true
    }
  });

  let pendingFeesCount = 0;
  let totalPendingFees = 0;
  fees.forEach(f => {
    if (f.pendingAmount > 0 || f.paymentStatus !== "PAID") {
      pendingFeesCount++;
      totalPendingFees += f.pendingAmount;
    }
  });

  return {
    class: { id: classData.id, name: classData.name },
    academicYear: activeYear ? { id: activeYear.id, name: activeYear.name } : null,
    totalStudents,
    presentToday,
    absentToday,
    attendancePercentage,
    averageMarks,
    pendingFeesCount,
    totalPendingFees,
    lowAttendanceCount,
    academicConcernsCount
  };
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 8. MENTOR / PRINCIPAL: Today's Attendance Table
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getTodayAttendance = async (user, classId, dateString = null) => {
  await assertMentorOrAdminAccess(user, classId);
  const schoolId = user.schoolId;

  const targetDate = dateString ? new Date(dateString) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  // Fetch school attendanceMode
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { attendanceMode: true }
  });

  // Fetch students of class
  const students = await prisma.student.findMany({
    where: {
      classId: Number(classId),
      schoolId,
      isDeleted: false,
      status: "ACTIVE"
    },
    include: {
      user: { select: { id: true, name: true, userCode: true, profileImage: true } }
    },
    orderBy: { user: { name: "asc" } }
  });

  const studentIds = students.map(s => s.id);

  // Fetch attendance records for target date
  const records = await prisma.attendance.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      date: targetDate,
      isDeleted: false
    },
    include: {
      teacher: { include: { user: { select: { name: true } } } }
    },
    orderBy: [{ period: "asc" }]
  });

  // Group attendance records by studentId
  const attendanceByStudent = {};
  records.forEach(r => {
    if (!attendanceByStudent[r.studentId]) {
      attendanceByStudent[r.studentId] = [];
    }
    attendanceByStudent[r.studentId].push(r);
  });

  const result = students.map(s => {
    const studentRecords = attendanceByStudent[s.id] || [];

    let overallStatus = "NOT_MARKED";
    if (studentRecords.length > 0) {
      const hasPresent = studentRecords.some(r => r.status === "PRESENT");
      overallStatus = hasPresent ? "PRESENT" : "ABSENT";
    }

    return {
      studentId: s.id,
      userId: s.userId,
      name: s.user.name,
      userCode: s.user.userCode,
      phone: s.phone,
      fatherName: s.fatherName,
      motherName: s.motherName,
      status: overallStatus,
      periodDetails: studentRecords.map(r => ({
        id: r.id,
        period: r.period,
        status: r.status,
        markedBy: r.teacher?.user?.name || "Teacher"
      }))
    };
  });

  return {
    date: targetDate,
    attendanceMode: school?.attendanceMode || "ONCE_DAILY",
    students: result
  };
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 9. MENTOR / PRINCIPAL: Absent Students Today (Parent Communication)
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getAbsentStudentsToday = async (user, classId, dateString = null) => {
  await assertMentorOrAdminAccess(user, classId);
  const schoolId = user.schoolId;

  const targetDate = dateString ? new Date(dateString) : new Date();
  targetDate.setHours(0, 0, 0, 0);

  const students = await prisma.student.findMany({
    where: {
      classId: Number(classId),
      schoolId,
      isDeleted: false,
      status: "ACTIVE"
    },
    include: {
      user: { select: { id: true, name: true, userCode: true, profileImage: true } },
      class: { select: { name: true } }
    }
  });

  const studentIds = students.map(s => s.id);

  const records = await prisma.attendance.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      date: targetDate,
      isDeleted: false
    }
  });

  // Group by student
  const recMap = {};
  records.forEach(r => {
    if (!recMap[r.studentId]) recMap[r.studentId] = [];
    recMap[r.studentId].push(r);
  });

  const parentContactEnabled = await featureService.isEnabled(schoolId, "MENTOR_PARENT_CONTACT");

  const absentList = [];
  students.forEach(s => {
    const sRecords = recMap[s.id] || [];
    if (sRecords.length > 0 && sRecords.every(r => r.status === "ABSENT")) {
      absentList.push({
        studentId: s.id,
        userCode: s.user.userCode,
        name: s.user.name,
        className: s.class.name,
        fatherName: parentContactEnabled ? s.fatherName : undefined,
        motherName: parentContactEnabled ? s.motherName : undefined,
        parentPhone: parentContactEnabled ? (s.phone || s.altPhone || "N/A") : undefined,
        altPhone: parentContactEnabled ? s.altPhone : undefined,
        status: "ABSENT",
        date: targetDate,
        periods: sRecords.map(r => r.period).filter(Boolean)
      });
    }
  });

  return absentList;
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 10. MENTOR / PRINCIPAL: Class Marks Table (Subject-wise, Exam-wise)
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getClassMarks = async (user, classId, { examType, subjectId } = {}) => {
  await assertMentorOrAdminAccess(user, classId);
  const schoolId = user.schoolId;

  const activeYear = await getActiveAcademicYear(schoolId);

  // Fetch subjects of class
  const subjects = await prisma.subject.findMany({
    where: { classId: Number(classId) },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  // Fetch exam configurations for class
  const examConfigs = await prisma.examConfig.findMany({
    where: { schoolId, classId: Number(classId) },
    select: { examType: true, maxMarks: true, passMarks: true }
  });

  // Fetch all students in class
  const students = await prisma.student.findMany({
    where: {
      classId: Number(classId),
      schoolId,
      isDeleted: false,
      status: "ACTIVE"
    },
    include: {
      user: { select: { id: true, name: true, userCode: true } }
    },
    orderBy: { user: { name: "asc" } }
  });

  const studentIds = students.map(s => s.id);

  // Query Marks
  const marks = await prisma.marks.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      isDeleted: false,
      ...(examType && { examType }),
      ...(subjectId && { subjectId: Number(subjectId) }),
      ...(activeYear && { academicYearId: activeYear.id })
    },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { include: { user: { select: { name: true } } } }
    }
  });

  // Aggregate marks by student
  const studentMarksMap = {};
  students.forEach(s => {
    studentMarksMap[s.id] = {
      studentId: s.id,
      userCode: s.user.userCode,
      name: s.user.name,
      subjects: {},
      totalMarks: 0,
      maxMarks: 0,
      percentage: 0,
      passed: true
    };
  });

  marks.forEach(m => {
    const sObj = studentMarksMap[m.studentId];
    if (sObj) {
      sObj.subjects[m.subjectId] = {
        subjectName: m.subject.name,
        examType: m.examType,
        marks: m.marks,
        maxMarks: m.maxMarks,
        passMarks: m.passMarks,
        passed: m.marks >= m.passMarks
      };
      sObj.totalMarks += m.marks;
      sObj.maxMarks += m.maxMarks;
      if (m.marks < m.passMarks) {
        sObj.passed = false;
      }
    }
  });

  // Calculate percentage and grades
  const studentRows = Object.values(studentMarksMap).map(s => {
    const pct = s.maxMarks > 0 ? Number(((s.totalMarks / s.maxMarks) * 100).toFixed(1)) : 0;
    let grade = "F";
    if (pct >= 90) grade = "A+";
    else if (pct >= 80) grade = "A";
    else if (pct >= 70) grade = "B+";
    else if (pct >= 60) grade = "B";
    else if (pct >= 50) grade = "C";
    else if (pct >= 40) grade = "D";

    return {
      ...s,
      percentage: pct,
      grade: s.passed ? grade : "F"
    };
  });

  return {
    subjects,
    examConfigs,
    students: studentRows
  };
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 11. MENTOR / PRINCIPAL: Class Fees Status (Read-Only)
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getClassFees = async (user, classId) => {
  await assertMentorOrAdminAccess(user, classId);
  const schoolId = user.schoolId;

  // 🔒 Feature Toggle: MENTOR_FEE_VISIBILITY
  const feeVisibilityEnabled = await featureService.isEnabled(schoolId, "MENTOR_FEE_VISIBILITY");
  if (!feeVisibilityEnabled) {
    const err = new Error("This feature is currently disabled for your school. Please contact your school administrator.");
    err.status = 403;
    err.code = "FEATURE_DISABLED";
    throw err;
  }

  const fees = await prisma.fee.findMany({
    where: {
      schoolId,
      classId: Number(classId),
      isDeleted: false
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true, userCode: true } }
        }
      }
    },
    orderBy: { studentName: "asc" }
  });

  let totalDue = 0;
  let totalPaid = 0;
  let totalPending = 0;

  const records = fees.map(f => {
    totalDue += f.totalFee;
    totalPaid += f.paidAmount;
    totalPending += f.pendingAmount;

    const isOverdue = new Date(f.dueDate) < new Date() && f.pendingAmount > 0;

    return {
      feeId: f.id,
      studentId: f.studentId,
      userCode: f.student?.user?.userCode || "N/A",
      studentName: f.studentName || f.student?.user?.name || "Unknown",
      totalFee: f.totalFee,
      paidAmount: f.paidAmount,
      pendingAmount: f.pendingAmount,
      paymentStatus: isOverdue ? "OVERDUE" : f.paymentStatus,
      feeType: f.feeType,
      dueDate: f.dueDate
    };
  });

  return {
    summary: {
      totalFeeSum: totalDue,
      totalPaidSum: totalPaid,
      totalPendingSum: totalPending,
      count: fees.length
    },
    fees: records
  };
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 12. MENTOR / PRINCIPAL: Comprehensive Student Summary
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.getStudentSummary = async (user, studentId) => {
  const schoolId = user.schoolId;

  const student = await prisma.student.findFirst({
    where: { id: Number(studentId), schoolId, isDeleted: false },
    include: {
      user: { select: { name: true, email: true, userCode: true, profileImage: true } },
      class: { select: { id: true, name: true } }
    }
  });

  if (!student) throw new Error("Student not found");

  // Verify access for this student's class
  await assertMentorOrAdminAccess(user, student.classId);

  const activeYear = await getActiveAcademicYear(schoolId);

  // 1. Resolve Current Mentor for student's class
  const activeMentor = await prisma.classMentor.findFirst({
    where: {
      schoolId,
      classId: student.classId,
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
  });

  // 2. Attendance Summary
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      schoolId,
      studentId: student.id,
      isDeleted: false,
      ...(activeYear && { academicYearId: activeYear.id })
    },
    orderBy: { date: "desc" },
    take: 30
  });

  const totalAttendance = await prisma.attendance.count({
    where: {
      schoolId,
      studentId: student.id,
      isDeleted: false,
      ...(activeYear && { academicYearId: activeYear.id })
    }
  });

  const presentAttendance = await prisma.attendance.count({
    where: {
      schoolId,
      studentId: student.id,
      status: "PRESENT",
      isDeleted: false,
      ...(activeYear && { academicYearId: activeYear.id })
    }
  });

  const attendanceRate = totalAttendance > 0
    ? Number(((presentAttendance / totalAttendance) * 100).toFixed(1))
    : 100;

  // 3. Marks Summary
  const marks = await prisma.marks.findMany({
    where: {
      schoolId,
      studentId: student.id,
      isDeleted: false,
      ...(activeYear && { academicYearId: activeYear.id })
    },
    include: {
      subject: { select: { name: true } }
    },
    orderBy: { date: "desc" }
  });

  // 4. Fees Summary
  const fee = await prisma.fee.findFirst({
    where: {
      schoolId,
      studentId: student.id,
      isDeleted: false
    }
  });

  const parentContactEnabled = await featureService.isEnabled(schoolId, "MENTOR_PARENT_CONTACT");
  const feeVisibilityEnabled = await featureService.isEnabled(schoolId, "MENTOR_FEE_VISIBILITY");

  return {
    student: {
      id: student.id,
      userId: student.userId,
      userCode: student.user.userCode,
      name: student.user.name,
      email: student.user.email,
      phone: parentContactEnabled ? student.phone : undefined,
      altPhone: parentContactEnabled ? student.altPhone : undefined,
      gender: student.gender,
      dob: student.dob,
      address: student.address,
      fatherName: parentContactEnabled ? student.fatherName : undefined,
      motherName: parentContactEnabled ? student.motherName : undefined,
      status: student.status,
      className: student.class.name,
      classId: student.classId
    },
    mentor: activeMentor
      ? {
          name: activeMentor.teacher?.user?.name || "Assigned Mentor",
          phone: activeMentor.teacher?.phone || "",
          email: activeMentor.teacher?.user?.email || "",
          assignmentType: activeMentor.assignmentType
        }
      : null,
    attendance: {
      total: totalAttendance,
      present: presentAttendance,
      rate: attendanceRate,
      recent: attendanceRecords
    },
    marks,
    fee: (feeVisibilityEnabled && fee)
      ? {
          total: fee.totalFee,
          paid: fee.paidAmount,
          pending: fee.pendingAmount,
          status: fee.paymentStatus,
          dueDate: fee.dueDate
        }
      : null
  };
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 13. MENTOR / PRINCIPAL: Export Class Report Data
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.exportClassReport = async (user, classId, { type = "full", examType, subjectId } = {}) => {
  await assertMentorOrAdminAccess(user, classId);
  const schoolId = user.schoolId;

  // 🔒 Feature Toggle: MENTOR_EXPORT
  const exportEnabled = await featureService.isEnabled(schoolId, "MENTOR_EXPORT");
  if (!exportEnabled) {
    const err = new Error("This feature is currently disabled for your school. Please contact your school administrator.");
    err.status = 403;
    err.code = "FEATURE_DISABLED";
    throw err;
  }

  const { classData } = await assertMentorOrAdminAccess(user, classId);
  const activeYear = await getActiveAcademicYear(schoolId);

  // Active mentor for this class
  const activeMentor = await prisma.classMentor.findFirst({
    where: {
      schoolId,
      classId: Number(classId),
      isActive: true,
      ...(activeYear && { academicYearId: activeYear.id })
    },
    include: {
      teacher: { include: { user: { select: { name: true } } } }
    }
  });

  const mentorName = activeMentor?.teacher?.user?.name || "Not Assigned";
  const mentorPhone = activeMentor?.teacher?.phone || "N/A";

  const students = await prisma.student.findMany({
    where: {
      classId: Number(classId),
      schoolId,
      isDeleted: false,
      status: "ACTIVE"
    },
    include: {
      user: { select: { name: true, userCode: true, email: true } },
      class: { select: { name: true } }
    },
    orderBy: { user: { name: "asc" } }
  });

  const studentIds = students.map(s => s.id);

  // Today's attendance
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayRecords = await prisma.attendance.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      date: today,
      isDeleted: false
    }
  });

  const todayAttendanceMap = {};
  todayRecords.forEach(r => {
    if (!todayAttendanceMap[r.studentId] || r.status === "PRESENT") {
      todayAttendanceMap[r.studentId] = r.status;
    }
  });

  // Overall attendance
  const totalAtt = await prisma.attendance.groupBy({
    by: ["studentId", "status"],
    where: {
      schoolId,
      studentId: { in: studentIds },
      isDeleted: false,
      ...(activeYear && { academicYearId: activeYear.id })
    },
    _count: { id: true }
  });

  const attRateMap = {};
  studentIds.forEach(id => {
    attRateMap[id] = { total: 0, present: 0 };
  });
  totalAtt.forEach(item => {
    if (attRateMap[item.studentId]) {
      attRateMap[item.studentId].total += item._count.id;
      if (item.status === "PRESENT") {
        attRateMap[item.studentId].present += item._count.id;
      }
    }
  });

  // Marks
  const marks = await prisma.marks.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      isDeleted: false,
      ...(examType && { examType }),
      ...(subjectId && { subjectId: Number(subjectId) }),
      ...(activeYear && { academicYearId: activeYear.id })
    },
    include: { subject: { select: { name: true } } }
  });

  const marksByStudent = {};
  marks.forEach(m => {
    if (!marksByStudent[m.studentId]) marksByStudent[m.studentId] = [];
    marksByStudent[m.studentId].push(m);
  });

  // Fees
  const fees = await prisma.fee.findMany({
    where: { schoolId, studentId: { in: studentIds }, isDeleted: false }
  });
  const feeMap = {};
  fees.forEach(f => {
    feeMap[f.studentId] = f;
  });

  // Build rows
  const rows = students.map(s => {
    const attObj = attRateMap[s.id] || { total: 0, present: 0 };
    const attPct = attObj.total > 0 ? ((attObj.present / attObj.total) * 100).toFixed(1) + "%" : "N/A";
    const todayStatus = todayAttendanceMap[s.id] || "NOT_MARKED";

    const sMarks = marksByStudent[s.id] || [];
    const totalMarks = sMarks.reduce((acc, cur) => acc + cur.marks, 0);
    const maxMarks = sMarks.reduce((acc, cur) => acc + cur.maxMarks, 0);
    const marksPct = maxMarks > 0 ? ((totalMarks / maxMarks) * 100).toFixed(1) + "%" : "N/A";

    const sFee = feeMap[s.id];
    const feeStatus = sFee ? sFee.paymentStatus : "N/A";
    const pendingFee = sFee ? `₹${sFee.pendingAmount}` : "₹0";

    const row = {
      "Roll No / Code": s.user.userCode,
      "Student Name": s.user.name,
      "Class": classData.name,
      "Academic Year": activeYear?.name || "N/A",
      ...(parentContactEnabled ? {
        "Parent Name": s.fatherName || s.motherName || "N/A",
        "Parent Phone": s.phone || "N/A",
      } : {}),
      "Student Email": s.user.email,
      "Today Attendance": todayStatus,
      "Overall Attendance": attPct,
      "Average Marks %": marksPct,
      ...(feeVisibilityEnabled ? {
        "Fee Status": feeStatus,
        "Pending Fee": pendingFee,
      } : {}),
      "Mentor Name": mentorName,
      "Mentor Phone": mentorPhone
    };

    return row;
  });

  // Audit export generation
  await prisma.auditLog.create({
    data: {
      schoolId,
      module: "MENTOR",
      actionType: "CREATE",
      entityId: Number(classId),
      entityType: "ClassExport",
      oldData: null,
      newData: {
        classId: Number(classId),
        className: classData.name,
        type,
        recordsExported: rows.length
      },
      changedBy: user.id,
      changedByRole: user.role,
      revokeExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  return {
    className: classData.name,
    academicYear: activeYear?.name || "Current",
    rows
  };
};
