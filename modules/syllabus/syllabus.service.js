const prisma = require("../../config/prisma");

exports.createSyllabusPlan = async (data, user) => {
  return prisma.$transaction(async (tx) => {
    // Validate class
    const classData = await tx.classConfig.findFirst({
      where: { id: data.classId, schoolId: user.schoolId, status: "ACTIVE" }
    });
    if (!classData) throw new Error("Invalid class");

    // Validate subject belongs to class
    const subject = await tx.subject.findFirst({
      where: { id: data.subjectId, classId: data.classId }
    });
    if (!subject) throw new Error("Invalid subject for class");

    // Validate teacher
    const teacher = await tx.teacher.findFirst({
      where: { id: data.teacherId, schoolId: user.schoolId }
    });
    if (!teacher) throw new Error("Teacher not found");

    // Check existing plan
    const existingPlan = await tx.syllabusPlan.findUnique({
      where: {
        schoolId_classId_subjectId_academicYear: {
          schoolId: user.schoolId,
          classId: data.classId,
          subjectId: data.subjectId,
          academicYear: data.academicYear
        }
      }
    });

    if (existingPlan) throw new Error("Syllabus plan already exists for this class, subject and academic year");

    // Create plan
    const plan = await tx.syllabusPlan.create({
      data: {
        schoolId: user.schoolId,
        academicYear: data.academicYear,
        classId: data.classId,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        weeks: {
          create: data.weeks.map(w => ({
            weekNumber: w.weekNumber,
            startDate: w.startDate ? new Date(w.startDate) : null,
            endDate: w.endDate ? new Date(w.endDate) : null,
            topics: {
              create: w.topics.map(t => ({ topicName: t }))
            }
          }))
        }
      },
      include: {
        weeks: { include: { topics: true } }
      }
    });

    return plan;
  });
};

exports.updateSyllabusPlan = async (id, data, user) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.syllabusPlan.findFirst({
      where: { id: Number(id), schoolId: user.schoolId }
    });
    if (!existing) throw new Error("Syllabus plan not found");

    // We can delete existing weeks and recreate them for simplicity
    await tx.syllabusWeek.deleteMany({
      where: { planId: Number(id) }
    });

    const plan = await tx.syllabusPlan.update({
      where: { id: Number(id) },
      data: {
        academicYear: data.academicYear,
        classId: data.classId,
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        weeks: {
          create: data.weeks.map(w => ({
            weekNumber: w.weekNumber,
            startDate: w.startDate ? new Date(w.startDate) : null,
            endDate: w.endDate ? new Date(w.endDate) : null,
            topics: {
              create: w.topics.map(t => ({ topicName: t }))
            }
          }))
        }
      },
      include: {
        weeks: { include: { topics: true } }
      }
    });
    return plan;
  });
};

exports.updateTeacherProgress = async (weekId, data, user) => {
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) throw new Error("Teacher not found");

  const week = await prisma.syllabusWeek.findUnique({
    where: { id: weekId },
    include: { plan: true, topics: true }
  });

  if (!week) throw new Error("Week not found");
  if (week.plan.teacherId !== teacher.id) throw new Error("Not authorized to update this syllabus");

  return prisma.$transaction(async (tx) => {
    // Update topic completion statuses
    if (data.completedTopics && data.completedTopics.length > 0) {
      await tx.syllabusTopic.updateMany({
        where: { id: { in: data.completedTopics }, weekId },
        data: { isCompleted: true }
      });
    }

    // Add update entry
    await tx.teacherSyllabusUpdate.create({
      data: {
        weekId,
        teacherId: teacher.id,
        progressPercentage: data.progressPercentage,
        status: data.status,
        completionNote: data.completionNote,
        delayReason: data.delayReason,
        fileUrl: data.fileUrl
      }
    });

    // Update week stats
    return tx.syllabusWeek.update({
      where: { id: weekId },
      data: {
        completionPercentage: data.progressPercentage,
        status: data.status
      }
    });
  });
};

exports.addRemark = async (weekId, data, user) => {
  let principalId = null;
  let teacherId = null;

  if (user.role === "principal") {
    const principal = await prisma.principal.findUnique({ where: { userId: user.id } });
    if (principal) principalId = principal.id;
  } else if (user.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
    if (teacher) teacherId = teacher.id;
  }

  return prisma.syllabusRemark.create({
    data: {
      weekId,
      principalId,
      teacherId,
      remark: data.remark
    }
  });
};

exports.getPrincipalSyllabus = async (user, query) => {
  const { classId, subjectId, teacherId, academicYear } = query;

  return prisma.syllabusPlan.findMany({
    where: {
      schoolId: user.schoolId,
      ...(classId && { classId: Number(classId) }),
      ...(subjectId && { subjectId: Number(subjectId) }),
      ...(teacherId && { teacherId: Number(teacherId) }),
      ...(academicYear && { academicYear })
    },
    include: {
      class: { select: { name: true } },
      subject: { select: { name: true } },
      teacher: { include: { user: { select: { name: true } } } },
      weeks: {
        include: {
          topics: true,
          updates: { orderBy: { createdAt: 'desc' }, take: 1 },
          remarks: true
        },
        orderBy: { weekNumber: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

exports.getTeacherSyllabus = async (user) => {
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) throw new Error("Teacher not found");

  return prisma.syllabusPlan.findMany({
    where: {
      schoolId: user.schoolId,
      teacherId: teacher.id
    },
    include: {
      class: { select: { name: true } },
      subject: { select: { name: true } },
      weeks: {
        include: {
          topics: true,
          updates: { orderBy: { createdAt: 'desc' }, take: 5 },
          remarks: true
        },
        orderBy: { weekNumber: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

exports.getStudentSyllabus = async (user) => {
  const student = await prisma.student.findUnique({ where: { userId: user.id } });
  if (!student) throw new Error("Student not found");

  return prisma.syllabusPlan.findMany({
    where: {
      schoolId: user.schoolId,
      classId: student.classId
    },
    include: {
      subject: { select: { name: true } },
      teacher: { include: { user: { select: { name: true } } } },
      weeks: {
        include: {
          topics: true,
          remarks: true
        },
        orderBy: { weekNumber: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

exports.getProgressDashboard = async (user) => {
  const schoolId = user.schoolId;

  const plans = await prisma.syllabusPlan.findMany({
    where: { schoolId },
    include: {
      weeks: true,
      class: { select: { name: true } },
      teacher: { include: { user: { select: { name: true } } } }
    }
  });

  let totalWeeks = 0;
  let completedWeeks = 0;
  let delayedWeeks = 0;

  const classMap = {};
  const teacherMap = {};

  plans.forEach(plan => {
    const cls = plan.class.name;
    const teacherName = plan.teacher?.user?.name || "Unknown";

    if (!classMap[cls]) classMap[cls] = { total: 0, completed: 0 };
    if (!teacherMap[teacherName]) teacherMap[teacherName] = { total: 0, completed: 0 };

    plan.weeks.forEach(w => {
      totalWeeks++;
      classMap[cls].total++;
      teacherMap[teacherName].total++;

      if (w.status === "COMPLETED") {
        completedWeeks++;
        classMap[cls].completed++;
        teacherMap[teacherName].completed++;
      } else if (w.status === "DELAYED") {
        delayedWeeks++;
      }
    });
  });

  const overallPercentage = totalWeeks === 0 ? 0 : Math.round((completedWeeks / totalWeeks) * 100);

  return {
    overallPercentage,
    totalTopics: totalWeeks, // Representing total weeks planned
    completedTopics: completedWeeks,
    delayedWeeks,
    teacherProgress: Object.entries(teacherMap).map(([name, stats]) => ({
      name,
      total: stats.total,
      completed: stats.completed,
      percentage: stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100)
    })),
    classProgress: Object.entries(classMap).map(([name, stats]) => ({
      class: name,
      total: stats.total,
      completed: stats.completed,
      percentage: stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100)
    }))
  };
};

exports.deleteSyllabusPlan = async (id, user) => {
  return prisma.syllabusPlan.delete({
    where: { id: Number(id), schoolId: user.schoolId }
  });
};
