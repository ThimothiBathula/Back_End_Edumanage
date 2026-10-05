const prisma = require("../../config/prisma");
const { isHoliday } = require("../../utils/holidayHelper");

// ✅ CREATE SCHEDULE
exports.createSchedule = async (data, user) => {

  // 🔹 1. Validate class
  const classData = await prisma.classConfig.findFirst({
    where: {
      id: data.classId,
      schoolId: user.schoolId,
      status: "ACTIVE"
    }
  });

  if (!classData) throw new Error("Invalid class");

  // 🔹 2. Validate subject belongs to class
  const subject = await prisma.subject.findFirst({
    where: {
      id: data.subjectId,
      classId: data.classId
    }
  });

  if (!subject) throw new Error("Invalid subject for class");

  // 🔹 3. Validate teacher
  const teacher = await prisma.teacher.findFirst({
    where: {
      id: data.teacherId,
      schoolId: user.schoolId
    }
  });

  if (!teacher) throw new Error("Teacher not found");

  // 🔹 4. Validate period range
  if (data.period > classData.periodsPerDay) {
    throw new Error(`Max periods allowed: ${classData.periodsPerDay}`);
  }

  // 🔹 5. Prevent class exact period conflict
  const classConflict = await prisma.schedule.findFirst({
    where: {
      schoolId: user.schoolId,
      classId: data.classId,
      day: data.day,
      period: data.period
    }
  });

  if (classConflict) {
    throw new Error("Class already has this period assigned");
  }

  // 🔹 6. Prevent teacher exact period conflict
  const teacherConflict = await prisma.schedule.findFirst({
    where: {
      teacherId: data.teacherId,
      day: data.day,
      period: data.period
    }
  });

  if (teacherConflict) {
    throw new Error("Teacher already assigned at this period");
  }

  // 🔹 6.5 Advanced Time Overlap Detection
  const existingDaySchedules = await prisma.schedule.findMany({
    where: {
      schoolId: user.schoolId,
      day: data.day,
      OR: [
        { classId: data.classId },
        { teacherId: data.teacherId }
      ]
    }
  });

  const toMin = (t) => { if (!t) return 0; const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const newStart = toMin(data.startTime);
  const newEnd = toMin(data.endTime);

  if (newStart > 0 && newEnd > 0) {
    for (const s of existingDaySchedules) {
      const sStart = toMin(s.startTime);
      const sEnd = toMin(s.endTime);
      if (sStart > 0 && sEnd > 0) {
        if (Math.max(newStart, sStart) < Math.min(newEnd, sEnd)) {
          if (s.classId === data.classId) throw new Error("Time overlap with existing class schedule");
          if (s.teacherId === data.teacherId) throw new Error(`Teacher is already busy from ${s.startTime} to ${s.endTime}`);
        }
      }
    }
  }

  // 🔹 7. Create schedule
  const created = await prisma.schedule.create({
    data: {
      schoolId: user.schoolId,
      classId: data.classId,
      subjectId: data.subjectId,
      teacherId: data.teacherId,
      day: data.day,
      period: data.period,
      startTime: data.startTime,
      endTime: data.endTime
    }
  });

  // If period 1, sync default mentor if class is using FIRST_PERIOD_DEFAULT (MANUAL is never modified)
  if (data.period === 1) {
    syncDefaultMentorIfApplicable(user.schoolId, data.classId, data.teacherId).catch(() => {});
  }

  return created;
};

// ─── Helper: sync FIRST_PERIOD_DEFAULT mentor on timetable changes ──────────
async function syncDefaultMentorIfApplicable(schoolId, classId, teacherId) {
  try {
    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!activeYear) return;

    const currentMentor = await prisma.classMentor.findFirst({
      where: {
        schoolId,
        classId: Number(classId),
        academicYearId: activeYear.id,
        isActive: true
      }
    });

    if (currentMentor && currentMentor.assignmentType === "FIRST_PERIOD_DEFAULT" && currentMentor.teacherId !== Number(teacherId)) {
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.classMentor.update({
          where: { id: currentMentor.id },
          data: { isActive: false, endDate: now }
        });
        await tx.classMentor.create({
          data: {
            schoolId,
            academicYearId: activeYear.id,
            classId: Number(classId),
            teacherId: Number(teacherId),
            assignmentType: "FIRST_PERIOD_DEFAULT",
            isActive: true,
            startDate: now,
            assignedById: null
          }
        });
      });
    }
  } catch (err) {
    console.error("syncDefaultMentor error:", err);
  }
}


// ✅ UPDATE SCHEDULE
exports.updateSchedule = async (id, data, user) => {

  const existing = await prisma.schedule.findFirst({
    where: {
      id: Number(id),
      schoolId: user.schoolId
    }
  });

  if (!existing) throw new Error("Schedule not found");

  // 🔹 Reuse same validations
  const classData = await prisma.classConfig.findUnique({
    where: { id: data.classId }
  });

  if (!classData) throw new Error("Invalid class");

  if (data.period > classData.periodsPerDay) {
    throw new Error("Invalid period");
  }

  // 🔹 exact period conflict check (exclude current)
  const conflict = await prisma.schedule.findFirst({
    where: {
      schoolId: user.schoolId,
      day: data.day,
      period: data.period,
      NOT: { id: Number(id) },
      OR: [
        { classId: data.classId },
        { teacherId: data.teacherId }
      ]
    }
  });

  if (conflict) {
    if (conflict.classId === data.classId) throw new Error("Time slot already exists for this class");
    if (conflict.teacherId === data.teacherId) throw new Error("Teacher is already assigned at this period");
  }

  // 🔹 Advanced Time Overlap Detection (exclude current)
  const existingDaySchedules = await prisma.schedule.findMany({
    where: {
      schoolId: user.schoolId,
      day: data.day,
      NOT: { id: Number(id) },
      OR: [
        { classId: data.classId },
        { teacherId: data.teacherId }
      ]
    }
  });

  const toMin = (t) => { if (!t) return 0; const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const newStart = toMin(data.startTime);
  const newEnd = toMin(data.endTime);

  if (newStart > 0 && newEnd > 0) {
    for (const s of existingDaySchedules) {
      const sStart = toMin(s.startTime);
      const sEnd = toMin(s.endTime);
      if (sStart > 0 && sEnd > 0) {
        if (Math.max(newStart, sStart) < Math.min(newEnd, sEnd)) {
          if (s.classId === data.classId) throw new Error("Time overlap with existing class schedule");
          if (s.teacherId === data.teacherId) throw new Error(`Teacher is already busy from ${s.startTime} to ${s.endTime}`);
        }
      }
    }
  }

  const updated = await prisma.schedule.update({
    where: { id: Number(id) },
    data
  });

  if (updated.period === 1) {
    syncDefaultMentorIfApplicable(user.schoolId, updated.classId, updated.teacherId).catch(() => {});
  }

  return updated;
};


// ✅ DELETE
exports.deleteSchedule = async (id, user) => {

  const existing = await prisma.schedule.findFirst({
    where: {
      id: Number(id),
      schoolId: user.schoolId
    }
  });

  if (!existing) throw new Error("Schedule not found");

  return prisma.schedule.delete({
    where: { id: Number(id) }
  });
};


// ✅ PRINCIPAL VIEW
exports.getPrincipalSchedule = async (user, query) => {

  const { classId, teacherId, day } = query;

  return prisma.schedule.findMany({
    where: {
      schoolId: user.schoolId,
      ...(classId && { classId: Number(classId) }),
      ...(teacherId && { teacherId: Number(teacherId) }),
      ...(day && { day })
    },
    include: {
      class: true,
      subject: true,
      teacher: {
        include: {
          user: {
            select: { name: true }
          }
        }
      }
    },
    orderBy: [
      { classId: "asc" },
      { day: "asc" },
      { period: "asc" }
    ]
  });
};


// ✅ STUDENT SCHEDULE
exports.getStudentSchedule = async (user) => {

  const today = new Date();

  const holiday = await isHoliday(user.schoolId, today);

  if (holiday) {
    return {
      message: "Holiday - No classes today",
      data: []
    };
  }

  const student = await prisma.student.findUnique({
    where: { userId: user.id }
  });

  if (!student) throw new Error("Student not found");

  return prisma.schedule.findMany({
    where: {
      schoolId: user.schoolId,
      classId: student.classId
    },
    include: {
      class: true,
      subject: true,
      teacher: {
        include: {
          user: { select: { name: true } }
        }
      }
    },
    orderBy: [
      { day: "asc" },
      { period: "asc" }
    ]
  });
};


// ✅ TEACHER SCHEDULE
exports.getTeacherSchedule = async (user) => {

  const today = new Date();

  const holiday = await isHoliday(user.schoolId, today);

  if (holiday) {
    return {
      message: "Holiday - No classes today",
      data: []
    };
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id }
  });

  if (!teacher) throw new Error("Teacher not found");

  return prisma.schedule.findMany({
    where: { teacherId: teacher.id },
    include: {
      class: true,
      subject: true
    },
    orderBy: [{ day: "asc" }, { period: "asc" }]
  });
};

// ✅ TEACHER WORKLOAD ANALYTICS
exports.getAnalytics = async (user) => {
  const schedules = await prisma.schedule.findMany({
    where: { schoolId: user.schoolId },
    include: {
      teacher: { include: { user: { select: { name: true } } } },
      class: { select: { name: true } },
      subject: { select: { name: true } }
    }
  });

  const teacherMap = {};
  schedules.forEach(s => {
    const tid = s.teacherId;
    const name = s.teacher?.user?.name || "Unknown";
    if (!teacherMap[tid]) {
      teacherMap[tid] = { id: tid, name, periods: 0, classes: new Set(), subjects: new Set() };
    }
    teacherMap[tid].periods++;
    teacherMap[tid].classes.add(s.class?.name);
    teacherMap[tid].subjects.add(s.subject?.name);
  });

  const totalPeriods = schedules.length;
  const totalClasses = await prisma.classConfig.count({ where: { schoolId: user.schoolId, status: "ACTIVE" } });

  return {
    totalPeriods,
    totalClasses,
    teacherWorkload: Object.values(teacherMap).map(t => ({
      id: t.id,
      name: t.name,
      periods: t.periods,
      classes: Array.from(t.classes),
      subjects: Array.from(t.subjects)
    })).sort((a, b) => b.periods - a.periods)
  };
};

// ✅ CREATE BREAK
exports.createBreak = async (data, user) => {
  const classData = await prisma.classConfig.findFirst({
    where: { id: data.classId, schoolId: user.schoolId }
  });
  if (!classData) throw new Error("Class not found");

  // Check overlap with existing breaks
  const existing = await prisma.scheduleBreak.findMany({
    where: { schoolId: user.schoolId, classId: data.classId }
  });
  const overlaps = existing.some(b =>
    data.startTime < b.endTime && data.endTime > b.startTime
  );
  if (overlaps) throw new Error("Break overlaps with an existing break");

  return prisma.scheduleBreak.create({
    data: {
      schoolId: user.schoolId,
      classId: data.classId,
      breakName: data.breakName,
      startTime: data.startTime,
      endTime: data.endTime
    }
  });
};

// ✅ GET BREAKS
exports.getBreaks = async (classId, user) => {
  return prisma.scheduleBreak.findMany({
    where: { schoolId: user.schoolId, classId: Number(classId) },
    orderBy: { startTime: "asc" }
  });
};

// ✅ DELETE BREAK
exports.deleteBreak = async (id, user) => {
  const existing = await prisma.scheduleBreak.findFirst({
    where: { id: Number(id), schoolId: user.schoolId }
  });
  if (!existing) throw new Error("Break not found");
  return prisma.scheduleBreak.delete({ where: { id: Number(id) } });
};