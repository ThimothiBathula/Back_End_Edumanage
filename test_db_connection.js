const prisma = require('./config/prisma');

prisma.school.count()
  .then(n => {
    console.log('DB_OK schools=' + n);
    return prisma.user.count();
  })
  .then(u => {
    console.log('DB_OK users=' + u);
    return prisma.school.findMany({
      select: { id: true, name: true, code: true, status: true, canCreateAcademicYear: true, activeServices: true, attendanceMode: true },
      where: { isDeleted: false },
      take: 10
    });
  })
  .then(schools => {
    console.log('SCHOOLS:', JSON.stringify(schools, null, 2));
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, schoolId: true },
      where: { isDeleted: false, role: 'superadmin' }
    });
  })
  .then(admins => {
    console.log('SUPERADMINS:', JSON.stringify(admins, null, 2));
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, schoolId: true, userCode: true },
      where: { isDeleted: false, role: 'principal' }
    });
  })
  .then(principals => {
    console.log('PRINCIPALS:', JSON.stringify(principals, null, 2));
    return prisma.academicYear.findMany({
      select: { id: true, schoolId: true, name: true, status: true },
      take: 10
    });
  })
  .then(years => {
    console.log('ACADEMIC_YEARS:', JSON.stringify(years, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('DB_ERROR:', err.message);
    process.exit(1);
  });
