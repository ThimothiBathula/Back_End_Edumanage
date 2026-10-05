const prisma = require("../../config/prisma");

// 🔹 MAIN DASHBOARD
exports.getDashboard = async () => {

  // 1. Total Schools
  const totalSchools = await prisma.school.count({
    where: { deletedAt: null }
  });

  // 2. Active vs Suspended
  const activeSchools = await prisma.school.count({
    where: { status: "ACTIVE", deletedAt: null }
  });

  const suspendedSchools = await prisma.school.count({
    where: { status: "SUSPENDED", deletedAt: null }
  });

  // 3. Total Students
  const totalStudents = await prisma.student.count();

  // 4. Total Teachers
  const totalTeachers = await prisma.teacher.count();

  // 5. Monthly School Growth (last 6 months)
  const growth = await prisma.$queryRaw`
  SELECT DATE_TRUNC('month', "createdAt") AS month,
         COUNT(*) AS count
  FROM "School"
  WHERE "deletedAt" IS NULL
  GROUP BY month
  ORDER BY month DESC
  LIMIT 6;
`;

  // ✅ FIX BigInt issue
  const formattedGrowth = growth.map(item => ({
    month: item.month,
    count: Number(item.count)
  }));

  // 6. Top Schools (by student count)
  const topSchoolsRaw = await prisma.student.groupBy({
    by: ["schoolId"],
    _count: { schoolId: true },
    orderBy: {
      _count: { schoolId: "desc" }
    },
    take: 5
  });

  // Get school names
  const topSchools = await Promise.all(
    topSchoolsRaw.map(async (item) => {
      const school = await prisma.school.findUnique({
        where: { id: item.schoolId }
      });

      return {
        id: school.id,
        name: school.name,
        studentCount: item._count.schoolId
      };
    })
  );

  // ✅ FIXED HERE
  const ranked = topSchools.map(s => ({
    id: s.id,
    name: s.name,
    studentCount: s.studentCount
  }));

  return {
    totalSchools,
    activeSchools,
    suspendedSchools,
    totalStudents,
    totalTeachers,
    formattedGrowth,
    topSchools: ranked
  };
};

