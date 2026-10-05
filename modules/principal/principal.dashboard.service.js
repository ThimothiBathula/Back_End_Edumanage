const prisma = require("../../config/prisma");

exports.getDashboard = async (user) => {
  const schoolId = user.schoolId;

  const [totalStudents, totalTeachers] = await Promise.all([
    prisma.student.count({ where: { schoolId, isDeleted: false } }),
    prisma.teacher.count({ where: { schoolId, isDeleted: false } })
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayAttendance = await prisma.attendance.count({
    where: { schoolId, date: today, status: "PRESENT", isDeleted: false }
  });

  // Syllabus completion % — status lives on SyllabusWeek, scoped via SyllabusPlan.schoolId
  const [totalWeeks, completedWeeks] = await Promise.all([
    prisma.syllabusWeek.count({
      where: { plan: { schoolId } }
    }),
    prisma.syllabusWeek.count({
      where: { plan: { schoolId }, status: "COMPLETED" }
    })
  ]);

  const syllabusCompletion = totalWeeks === 0 ? 0
    : Math.round((completedWeeks / totalWeeks) * 100);

  return {
    totalStudents,
    totalTeachers,
    todayAttendance,
    syllabusCompletion,
    avgAttendance: totalStudents === 0 ? 0
      : Math.round((todayAttendance / totalStudents) * 100)
  };
};