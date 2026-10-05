const prisma = require("../../config/prisma");
const { isHoliday } = require("../../utils/holidayHelper");

exports.addMarks = async (records, user) => {
  // 🔥 1. VALIDATION
  if (!records || !Array.isArray(records) || records.length === 0) {
    throw new Error("Invalid marks data");
  }

  // 🔥 2. ADD DATE (IMPORTANT)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 🔥 3. HOLIDAY CHECK
  const holiday = await isHoliday(user.schoolId, today);
  if (holiday) {
    throw new Error("Cannot add marks on holiday");
  }

  // 🔥 RESOLVE TEACHER PROFILE
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) throw new Error("Teacher profile not found");

  return prisma.$transaction(async (tx) => {
    // 🔥 4. GET EXAM CONFIGURATIONS & ENFORCE RULES
    const enrichedRecords = [];

    for (const r of records) {

      // Get student
      const student = await tx.student.findUnique({
        where: { id: r.studentId }
      });

      if (!student) {
        throw new Error(`Student ${r.studentId} not found`);
      }

      // 🔥 Find subject
      const subject = await tx.subject.findFirst({
        where: {
          name: r.subject,
          classId: student.classId
        }
      });

      if (!subject) {
        throw new Error(`Subject ${r.subject} not found for class`);
      }

      // Prevent duplicates
      const exists = await tx.marks.findFirst({
        where: {
          studentId: r.studentId,
          subjectId: subject.id,
          examType: r.examType,
          schoolId: user.schoolId,
          date: today
        }
      });

      if (exists) {
        throw new Error(
          `Marks already added for student ${r.studentId} (${r.subject})`
        );
      }

      // Exam config
      const examConfig = await tx.examConfig.findUnique({
        where: {
          schoolId_classId_examType: {
            schoolId: user.schoolId,
            classId: student.classId,
            examType: r.examType
          }
        }
      });

      if (!examConfig) {
        throw new Error(
          `Exam configuration for ${r.examType} in class ${student.class} not found`
        );
      }

      if (!examConfig.isUploadEnabled) {
        throw new Error(
          `Marks upload for ${r.examType} is disabled`
        );
      }

      if (r.marks > examConfig.maxMarks) {
        throw new Error(
          `Marks cannot exceed ${examConfig.maxMarks}`
        );
      }

      enrichedRecords.push({
        schoolId: user.schoolId,
        studentId: r.studentId,
        teacherId: teacher.id, // ✅ FIXED: use teacher.id, not user.id
        subjectId: subject.id,
        examType: r.examType,
        marks: r.marks,
        maxMarks: examConfig.maxMarks,
        passMarks: examConfig.passMarks,
        date: today
      });
    }
    // 🔥 5. INSERT BULK
    return tx.marks.createMany({
      data: enrichedRecords
    });
  });
};

exports.getMarks = async (query, user) => {
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) throw new Error("Teacher profile not found");

  const { classId, examType } = query;

  return prisma.marks.findMany({
    where: {
      schoolId: user.schoolId,
      teacherId: teacher.id,
      ...(examType && { examType }),
      ...(classId && {
        student: { classId: Number(classId) }
      }),
      isDeleted: false
    },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } }
        }
      },
      subject: { select: { name: true } }
    }
  });
};