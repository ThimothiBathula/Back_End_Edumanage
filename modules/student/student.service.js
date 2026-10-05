const prisma = require("../../config/prisma");

async function getStudent(userId) {
  const student = await prisma.student.findFirst({
    where: { userId, isDeleted: false },
    include: { class: true }
  });

  if (!student) throw new Error("Student not found");

  return student;
}
// 🔹 PROFILE
exports.getProfile = async (user) => {
  const student = await prisma.student.findFirst({
    where: { userId: user.id, isDeleted: false },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          userCode: true,
          profileImage: true
        }
      },
      class: {
        select: { id: true, name: true }
      }
    }
  });

  if (!student) return null;

  // Dynamically resolve active mentor for student's class and active academic year
  const activeYear = await prisma.academicYear.findFirst({
    where: { schoolId: user.schoolId, status: "ACTIVE" },
    select: { id: true }
  });

  const mentorAssignment = await prisma.classMentor.findFirst({
    where: {
      schoolId: user.schoolId,
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

  const mentor = mentorAssignment
    ? {
        name: mentorAssignment.teacher?.user?.name || "Assigned Mentor",
        phone: mentorAssignment.teacher?.phone || "",
        email: mentorAssignment.teacher?.user?.email || "",
        assignmentType: mentorAssignment.assignmentType
      }
    : null;

  return {
    ...student,
    mentor
  };
};

// 🔹 ATTENDANCE REPORT
exports.getAttendance = async (user) => {

  const student = await getStudent(user.id);

  const total = await prisma.attendance.count({
    where: { studentId: student.id }
  });

  const present = await prisma.attendance.count({
    where: {
      studentId: student.id,
      status: "PRESENT"
    }
  });

  const records = await prisma.attendance.findMany({
    where: { studentId: student.id },
    include: {
      teacher: {
        include: { user: { select: { name: true } } }
      }
    },
    orderBy: { date: "desc" },
    take: 30
  });

  return {
    total,
    present,
    percentage: total ? ((present / total) * 100).toFixed(2) : 0,
    records
  };
};

// 🔹 MARKS
exports.getMarks = async (user) => {

  const student = await prisma.student.findFirst({
    where: { userId: user.id, isDeleted: false }
  });

  if (!student) throw new Error("Student not found");

  const marks = await prisma.marks.findMany({
    where: { studentId: student.id, isDeleted: false },
    include: {
      subject: { select: { name: true } }
    },
    orderBy: { date: "desc" }
  });

  return marks.map(m => {
    const isPass = m.marks >= m.passMarks;
    return {
      id: m.id,
      subject: m.subject?.name,
      examType: m.examType,
      marks: m.marks,
      maxMarks: m.maxMarks,
      passMarks: m.passMarks,
      date: m.date,
      status: isPass ? "PASS" : "FAIL"
    };
  });
};

// 🔹 TIMETABLE
exports.getSchedule = async (user) => {

  const student = await getStudent(user.id);

  return prisma.schedule.findMany({
    where: {
      schoolId: student.schoolId,
      classId: student.classId   // ✅ FIXED
    },
    include: {
      subject: { select: { name: true } },
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

// 🔹 SYLLABUS — uses new SyllabusPlan model
exports.getSyllabus = async (user) => {
  const student = await getStudent(user.id);

  return prisma.syllabusPlan.findMany({
    where: {
      schoolId: student.schoolId,
      classId: student.classId
    },
    include: {
      subject: { select: { name: true } },
      teacher: { include: { user: { select: { name: true } } } },
      weeks: {
        include: { topics: true, remarks: true },
        orderBy: { weekNumber: "asc" }
      }
    },
    orderBy: { createdAt: "desc" }
  });
};

// 🔹 GET FEEDBACK FORMS
exports.getFeedbackForms = async (user) => {
  const student = await getStudent(user.id);
  
  const campaigns = await prisma.feedbackCampaign.findMany({
    where: {
      schoolId: student.schoolId,
      status: 'ACTIVE',
      isDeleted: false,
      OR: [
        { targetClass: 'ALL' },
        { targetClass: student.class.name }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });

  const submissions = await prisma.teacherFeedback.findMany({
    where: {
      studentId: student.id,
      campaignId: { in: campaigns.map(c => c.id) }
    },
    select: { campaignId: true }
  });

  const submittedCampaignIds = new Set(submissions.map(s => s.campaignId));

  return campaigns.map(c => ({
    id: c.id,
    title: c.title,
    description: c.description,
    campaignType: c.campaignType,
    isSubmitted: submittedCampaignIds.has(c.id),
  }));
};

// 🔹 SUBMIT FEEDBACK (Subject-wise & Mentor feedback with relationship validation)
exports.submitFeedback = async (data, user) => {
  const student = await getStudent(user.id);

  if (!data.ratings || !Array.isArray(data.ratings) || data.ratings.length === 0) {
    throw new Error("Invalid ratings format");
  }

  if (!data.formId) throw new Error("Campaign ID (formId) is required");

  // Verify campaign exists, is active, and is not deleted
  const campaign = await prisma.feedbackCampaign.findFirst({
    where: { id: Number(data.formId), schoolId: student.schoolId, isDeleted: false, status: 'ACTIVE' }
  });
  if (!campaign) {
    throw new Error("Feedback campaign not found or is closed");
  }

  // 🔐 Server-side duplicate guard
  const alreadySubmitted = await prisma.teacherFeedback.findFirst({
    where: {
      studentId:  student.id,
      campaignId: Number(data.formId),
    }
  });
  if (alreadySubmitted) {
    throw new Error("Feedback already submitted for this campaign.");
  }

  // Query valid schedules for this student's class to validate subject-teacher pairs
  const validSchedules = await prisma.schedule.findMany({
    where: { schoolId: student.schoolId, classId: student.classId },
    select: { teacherId: true, subjectId: true }
  });
  const validPairSet = new Set(validSchedules.map(s => `${s.teacherId}_${s.subjectId}`));

  // Query active mentor for this student's class
  const activeMentor = await prisma.classMentor.findFirst({
    where: { schoolId: student.schoolId, classId: student.classId, isActive: true },
    select: { teacherId: true }
  });

  const feedbacks = [];
  for (const r of data.ratings) {
    const teacherId = Number(r.teacherId);
    const subjectId = r.subjectId ? Number(r.subjectId) : null;
    const isMentorFeedback = r.feedbackType === "MENTOR" || (activeMentor && activeMentor.teacherId === teacherId && !subjectId);

    // Validate relationship
    if (isMentorFeedback) {
      if (!activeMentor || activeMentor.teacherId !== teacherId) {
        throw new Error(`Unauthorized: Teacher is not the active Class Mentor for your section.`);
      }
    } else if (subjectId) {
      if (!validPairSet.has(`${teacherId}_${subjectId}`)) {
        // Fallback: verify teacher teaches subject in general if schedule didn't capture period
        const hasSubject = await prisma.teacherSubject.findFirst({
          where: { teacherId, subjectId }
        });
        if (!hasSubject) {
          throw new Error(`Unauthorized: Teacher does not teach the specified subject to your class.`);
        }
      }
    }

    feedbacks.push({
      schoolId:   student.schoolId,
      teacherId,
      studentId:  student.id,
      campaignId: Number(data.formId),
      subjectId:  isMentorFeedback ? null : subjectId,
      classId:    student.classId,
      mentorId:   isMentorFeedback ? teacherId : null,
      feedbackType: isMentorFeedback ? "MENTOR" : "SUBJECT_TEACHER",
      rating:     Math.min(5, Math.max(1, Number(r.rating))),
      comment:    r.comment ? String(r.comment).slice(0, 500) : '',
      isSensitive: false
    });
  }

  return prisma.teacherFeedback.createMany({
    data: feedbacks
  });
};

// 🔹 GET TEACHERS (Subject-wise combinations + Class Mentor)
exports.getTeachers = async (user) => {
  const student = await getStudent(user.id);

  // 1. Fetch class schedule to build subject-teacher pairs
  const schedules = await prisma.schedule.findMany({
    where: { schoolId: student.schoolId, classId: student.classId },
    include: {
      teacher: { include: { user: { select: { id: true, name: true } } } },
      subject: true
    }
  });

  const items = [];
  const seenPair = new Set();

  schedules.forEach(s => {
    if (!s.teacher || !s.subject) return;
    const key = `${s.teacherId}_${s.subjectId}`;
    if (!seenPair.has(key)) {
      seenPair.add(key);
      items.push({
        id: s.teacher.id,
        teacherId: s.teacher.id,
        name: s.teacher.user?.name || "Teacher",
        subjectId: s.subject.id,
        subject: s.subject.name,
        subjects: s.subject.name,
        feedbackType: "SUBJECT_TEACHER",
        isMentor: false
      });
    }
  });

  // 2. Fetch active Class Mentor
  const activeMentor = await prisma.classMentor.findFirst({
    where: { schoolId: student.schoolId, classId: student.classId, isActive: true },
    include: {
      teacher: { include: { user: { select: { id: true, name: true } } } },
      class: { select: { name: true } }
    }
  });

  if (activeMentor && activeMentor.teacher) {
    items.push({
      id: activeMentor.teacher.id,
      teacherId: activeMentor.teacher.id,
      name: activeMentor.teacher.user?.name || "Class Mentor",
      subjectId: null,
      subject: `Class Mentor (${activeMentor.class?.name || "My Section"})`,
      subjects: `Class Mentor (${activeMentor.class?.name || "My Section"})`,
      feedbackType: "MENTOR",
      isMentor: true
    });
  }

  return items;
};