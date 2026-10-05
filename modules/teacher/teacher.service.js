const prisma = require("../../config/prisma");

// 🔹 GET STUDENTS (CLASS BASED)
exports.getStudents = async (user, query) => {
  const where = {
    schoolId: user.schoolId,
    isDeleted: false
  };

  if (query.class) {
    where.classId = Number(query.class);
  }

  return prisma.student.findMany({
    where,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          userCode: true
        }
      },
      class: { select: { name: true } }
    }
  });
};

// 🔹 GET PROFILE
exports.getProfile = async (user) => {
  return prisma.teacher.findFirst({
    where: { userId: user.id },
    include: {
      user: {
        select: { name: true, email: true, profileImage: true }
      }
    }
  });
};

// 🔹 GET SCHEDULE
exports.getSchedule = async (user) => {
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) return [];

  return prisma.schedule.findMany({
    where: {
      teacherId: teacher.id,
      schoolId: user.schoolId
    },
    include: {
      class: { select: { name: true } },
      subject: { select: { name: true } }
    }
  });
};

// 🔹 COMPLETE SYLLABUS
exports.completeSyllabus = async (id, user) => {
  return prisma.syllabus.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date()
    }
  });
};

// 🔹 FEEDBACK SUMMARY
exports.getFeedbackSummary = async (user) => {
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id }
  });

  if (!teacher) {
    return {
      averageRating: 0,
      totalReviews: 0,
      subjectTeaching: { averageRating: 0, totalReviews: 0, bySubject: [] },
      mentorFeedback: { averageRating: 0, totalReviews: 0, isMentor: false },
      anonymizedComments: []
    };
  }

  // 1. Subject Teaching aggregates (Non-mentor)
  const subjectAgg = await prisma.teacherFeedback.aggregate({
    where: {
      teacherId: teacher.id,
      feedbackType: { not: "MENTOR" },
      campaign: { isDeleted: false }
    },
    _avg: { rating: true },
    _count: true
  });

  // 2. Mentor aggregates (Distinct from Subject Teacher)
  const mentorAgg = await prisma.teacherFeedback.aggregate({
    where: {
      OR: [
        { teacherId: teacher.id, feedbackType: "MENTOR" },
        { mentorId: teacher.id }
      ],
      campaign: { isDeleted: false }
    },
    _avg: { rating: true },
    _count: true
  });

  // 3. Subject-wise breakdown for teaching
  const subjectFeedbacks = await prisma.teacherFeedback.findMany({
    where: {
      teacherId: teacher.id,
      feedbackType: { not: "MENTOR" },
      campaign: { isDeleted: false }
    },
    select: {
      rating: true,
      subject: { select: { id: true, name: true } }
    }
  });

  const subjectMap = {};
  subjectFeedbacks.forEach(f => {
    const sName = f.subject?.name || "General";
    if (!subjectMap[sName]) subjectMap[sName] = { ratings: [], count: 0 };
    subjectMap[sName].ratings.push(f.rating);
    subjectMap[sName].count++;
  });

  const bySubject = Object.entries(subjectMap).map(([subject, data]) => ({
    subject,
    totalReviews: data.count,
    averageRating: Number((data.ratings.reduce((a, b) => a + b, 0) / data.count).toFixed(2))
  }));

  // 4. Anonymized comments (NO student names or IDs)
  const recentComments = await prisma.teacherFeedback.findMany({
    where: {
      teacherId: teacher.id,
      comment: { not: null, not: "" },
      campaign: { isDeleted: false }
    },
    take: 15,
    orderBy: { createdAt: "desc" },
    select: {
      rating: true,
      comment: true,
      feedbackType: true,
      createdAt: true
    }
  });

  return {
    averageRating: Number((subjectAgg._avg.rating || 0).toFixed(2)),
    totalReviews: subjectAgg._count,
    subjectTeaching: {
      averageRating: Number((subjectAgg._avg.rating || 0).toFixed(2)),
      totalReviews: subjectAgg._count,
      bySubject
    },
    mentorFeedback: {
      averageRating: Number((mentorAgg._avg.rating || 0).toFixed(2)),
      totalReviews: mentorAgg._count,
      isMentor: mentorAgg._count > 0 || !!user.isMentor
    },
    anonymizedComments: recentComments.map(c => ({
      rating: c.rating,
      comment: c.comment,
      feedbackType: c.feedbackType,
      date: c.createdAt.toISOString().split("T")[0]
    }))
  };
};

// ✅ FIXED: was filtering by class.name but frontend sends classId (number)
exports.getExamConfigs = async (classId, user) => {
  return prisma.examConfig.findMany({
    where: {
      schoolId: user.schoolId,
      ...(classId && { classId: Number(classId) })
    },
    orderBy: { createdAt: 'desc' }
  });
};