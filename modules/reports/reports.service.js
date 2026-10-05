const prisma = require("../../config/prisma");

// 🎯 Attendance %
exports.getAttendanceReport = async (studentId, user) => {

  const total = await prisma.attendance.count({
    where: {
      studentId,
      schoolId: user.schoolId
    }
  });

  const present = await prisma.attendance.count({
    where: {
      studentId,
      schoolId: user.schoolId,
      status: "PRESENT"
    }
  });

  return {
    studentId,
    totalDays: total,
    presentDays: present,
    percentage: total ? ((present / total) * 100).toFixed(2) : 0
  };
};


// 🎯 Top Students
exports.getTopStudents = async (user) => {

  return prisma.marks.groupBy({
    by: ["studentId"],
    _avg: { marks: true },
    orderBy: {
      _avg: { marks: "desc" }
    },
    take: 5
  });
};


// 🎯 Student Report (Marks Summary)
exports.getStudentMarksReport = async (studentId, user) => {

  return prisma.marks.findMany({
    where: {
      studentId,
      schoolId: user.schoolId
    },
    select: {
      subject: true,
      examType: true,
      marks: true
    }
  });
};