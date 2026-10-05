const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const generateUserCode = require("../../utils/generateUserCode");
const { buildQuery } = require("../../utils/queryHelper");

exports.createSchoolWithPrincipal = async (data) => {
  const {
    name,
    code,
    location,
    principalName,
    email,
    password,
    phone,
    attendanceMode,    // NEW: optional, defaults to TWICE_DAILY
    activeServices,    // NEW: optional JSON object
  } = data;

  // check school
  const schoolExists = await prisma.school.findUnique({ where: { code } });
  if (schoolExists) throw new Error("School already exists");

  // check email
  const emailExists = await prisma.user.findUnique({ where: { email } });
  if (emailExists) throw new Error("Email already exists");

  const result = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name,
        code,
        location,
        // Optional new fields — fall back to schema defaults if not provided
        ...(attendanceMode && { attendanceMode }),
        ...(activeServices && { activeServices }),
      },
    });

    const userCode = await generateUserCode(tx, school.id, "principal");

    const hashed = await bcrypt.hash(password, 10);

    const user = await tx.user.create({
      data: {
        name: principalName,
        email,
        password: hashed,
        role: "principal",
        schoolId: school.id,
        userCode,
      },
    });

    await tx.principal.create({
      data: {
        userId: user.id,
        schoolId: school.id,
        phone,
      },
    });

    return { school, userCode };
  });

  // Initialize SchoolFeature rows after transaction commits so new schools
  // have all feature flags correctly bootstrapped from creation.
  try {
    const featureService = require("../feature/feature.service");
    if (data.features && typeof data.features === 'object') {
      await featureService.updateSchoolFeatures(result.school.id, data.features, { id: 1, role: 'superadmin' });
    } else {
      await featureService.getStoredFeatures(result.school.id);
    }
  } catch (featureErr) {
    // Non-fatal: features will be bootstrapped on first access via getStoredFeatures
    console.error("[createSchoolWithPrincipal] Feature init warning:", featureErr.message);
  }

  return result;
};

exports.getSchools = async (query) => {
  const queryOptions = buildQuery(query);

  return prisma.school.findMany({
    where: {
      deletedAt: null,
      name: {
        contains: query.search || "",
        mode: "insensitive"
      }
    },
    ...queryOptions
  });
};

exports.getSchoolById = async (id) => {
  const school = await prisma.school.findFirst({
    where: {
      id,
      deletedAt: null
    }
  });

  if (!school) throw new Error("School not found");

  return school;
};

exports.updateSchool = async (id, data) => {
  return prisma.school.update({
    where: { id },
    data: {
      name: data.name,
      location: data.location,
      status: data.status,
      // NEW: allow updating attendanceMode
      ...(data.attendanceMode && { attendanceMode: data.attendanceMode }),
    }
  });
};

exports.deleteSchool = async (id) => {
  return prisma.school.update({
    where: { id },
    data: {
      deletedAt: new Date()
    }
  });
};

exports.updateSMSFeature = async (schoolId, data) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId }
  });

  if (!school) throw new Error("School not found");

  return prisma.school.update({
    where: { id: schoolId },
    data: {
      smsEnabled: data.smsEnabled,
      smsMode: data.smsMode || "MANUAL"
    }
  });
};

exports.getDashboard = async () => {
  const [schools, students, teachers] = await Promise.all([
    prisma.school.findMany({ where: { deletedAt: null } }),
    prisma.student.count(),
    prisma.teacher.count()
  ]);

  const totalSchools = schools.length;
  const activeSchools = schools.filter(s => s.status === 'ACTIVE').length;
  const suspendedSchools = schools.filter(s => s.status === 'SUSPENDED').length;

  // Generate 6 months of growth data
  const formattedGrowth = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthName = d.toISOString();

    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const count = schools.filter(s => new Date(s.createdAt) <= endOfMonth).length;

    formattedGrowth.push({ month: monthName, count });
  }

  // Get top schools by student count
  const schoolsWithCounts = await Promise.all(
    schools.map(async (school) => {
      const studentCount = await prisma.student.count({ where: { schoolId: school.id } });
      return { id: school.id, name: school.name, studentCount };
    })
  );

  const topSchools = schoolsWithCounts
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 5);

  return {
    totalSchools,
    activeSchools,
    suspendedSchools,
    totalStudents: students,
    totalTeachers: teachers,
    formattedGrowth,
    topSchools
  };
};

exports.toggleClassConfig = async (schoolId, enable) => {
  return prisma.school.update({
    where: { id: schoolId },
    data: { enableClassConfig: enable }
  });
};

/**
 * Toggle individual service modules for a school.
 * Accepts a partial services object and merges it into existing activeServices.
 *
 * @param {number} schoolId
 * @param {object} services - e.g. { "attendance": false, "fees": true }
 */
exports.toggleServices = async (schoolId, services) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeServices: true }
  });
  if (!school) throw new Error("School not found");

  // Parse existing services and merge — only update keys provided
  let current = school.activeServices;
  if (typeof current === "string") {
    try { current = JSON.parse(current); } catch { current = {}; }
  }

  const validKeys = ["attendance", "fees", "marks", "calls"];
  const merged = { ...current };
  for (const key of validKeys) {
    if (Object.prototype.hasOwnProperty.call(services, key)) {
      merged[key] = Boolean(services[key]);
    }
  }

  return prisma.school.update({
    where: { id: schoolId },
    data: { activeServices: merged }
  });
};

/**
 * Re-enable academic year creation for a school.
 * Only callable by SuperAdmin.
 *
 * @param {number} schoolId
 */
exports.grantAcademicYear = async (schoolId) => {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new Error("School not found");

  return prisma.school.update({
    where: { id: schoolId },
    data: { canCreateAcademicYear: true }
  });
};