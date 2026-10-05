const prisma = require("../../config/prisma");

async function getTeacher(userId) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId }
  });

  if (!teacher) throw new Error("Teacher not found");

  return teacher;
}

exports.getDashboard = async (user) => {

  const teacher = await getTeacher(user.id);

  // 🔹 total students teacher actually teaches
  const schedules = await prisma.schedule.findMany({
    where: {
      teacherId: teacher.id
    },
    select: {
      classId: true
    }
  });

  const classIds = [...new Set(schedules.map(s => s.classId))];

  const totalStudents = await prisma.student.count({
    where: {
      schoolId: user.schoolId,
      classId: {
        in: classIds
      }
    }
  });

  // 🔹 today range
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  // 🔹 attendance count (correct teacherId)
  const presentToday = await prisma.attendance.count({
    where: {
      teacherId: teacher.id,   // ✅ FIXED
      date: {
        gte: start,
        lte: end
      },
      status: "PRESENT"
    }
  });

  // 🔹 feedback avg (bonus improvement)
  const feedback = await prisma.teacherFeedback.aggregate({
    where: {
      teacherId: teacher.id
    },
    _avg: { rating: true }
  });

  return {
    totalStudents,
    presentToday,
    averageRating: Number((feedback._avg.rating || 0).toFixed(2))
  };
};