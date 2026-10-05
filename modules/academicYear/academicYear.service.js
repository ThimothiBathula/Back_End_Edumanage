const prisma = require("../../config/prisma");

/**
 * Create a new academic year for a school.
 *
 * Guards:
 * 1. school.canCreateAcademicYear must be true
 * 2. No existing ACTIVE year for this school
 *
 * On success, atomically sets canCreateAcademicYear = false.
 */
exports.createAcademicYear = async (data, user) => {
  const { name, startDate, endDate } = data;
  const schoolId = user.schoolId;

  if (!name || !startDate || !endDate) {
    throw new Error("name, startDate, and endDate are required");
  }

  // Validate date range
  if (new Date(startDate) >= new Date(endDate)) {
    throw new Error("startDate must be before endDate");
  }

  // 🔒 Fetch school with canCreateAcademicYear flag
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { canCreateAcademicYear: true }
  });
  if (!school) throw new Error("School not found");

  // 🔒 Feature Toggle: PRINCIPAL_CREATE_ACADEMIC_YEAR
  const featureService = require("../feature/feature.service");
  const isCreationEnabled = await featureService.isEnabled(schoolId, "PRINCIPAL_CREATE_ACADEMIC_YEAR");
  if (!isCreationEnabled || !school.canCreateAcademicYear) {
    const err = new Error(
      "Year creation locked. Request SuperAdmin permission to create a new academic year."
    );
    err.status = 403;
    err.code = "FEATURE_DISABLED";
    throw err;
  }

  // 🔒 Check no existing ACTIVE year
  const activeYear = await prisma.academicYear.findFirst({
    where: { schoolId, status: "ACTIVE" }
  });
  if (activeYear) {
    throw new Error(
      `An active academic year already exists: ${activeYear.name}. Complete it before creating a new one.`
    );
  }

  // Atomic: create year + lock canCreateAcademicYear
  const yearResult = await prisma.$transaction(async (tx) => {
    const year = await tx.academicYear.create({
      data: {
        schoolId,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: "DRAFT"
      }
    });

    // Lock further creation until SuperAdmin re-grants
    await tx.school.update({
      where: { id: schoolId },
      data: { canCreateAcademicYear: false }
    });

    await tx.schoolFeature.upsert({
      where: {
        schoolId_featureKey: {
          schoolId,
          featureKey: "PRINCIPAL_CREATE_ACADEMIC_YEAR",
        },
      },
      update: { enabled: false },
      create: {
        schoolId,
        featureKey: "PRINCIPAL_CREATE_ACADEMIC_YEAR",
        enabled: false,
      },
    });

    return year;
  });

  featureService.invalidateCache(schoolId);
  return yearResult;
};

/**
 * List all academic years for a school, ordered newest first.
 * Includes school-level flags (canCreateAcademicYear) so the frontend
 * can correctly enable/disable the "Create New Year" button.
 */
exports.listAcademicYears = async (schoolId) => {
  const [years, school] = await Promise.all([
    prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" }
    }),
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { canCreateAcademicYear: true, attendanceMode: true }
    })
  ]);

  // Attach school metadata to each year so the frontend has a single source of truth
  return years.map(y => ({ ...y, school }));
};


/**
 * Set a DRAFT academic year to ACTIVE.
 *
 * Atomically:
 * 1. Sets all other ACTIVE years for the school to COMPLETED
 * 2. Sets the target year to ACTIVE
 *
 * @param {number} id - AcademicYear id
 * @param {number} schoolId - tenant isolation
 */
exports.setCurrentYear = async (id, schoolId) => {
  // 🔒 BOLA: verify year belongs to school
  const year = await prisma.academicYear.findFirst({
    where: { id, schoolId }
  });
  if (!year) throw new Error("Academic year not found");
  if (year.status === "COMPLETED") {
    throw new Error("Cannot activate a completed academic year");
  }

  return prisma.$transaction(async (tx) => {
    // Complete any currently ACTIVE year
    await tx.academicYear.updateMany({
      where: { schoolId, status: "ACTIVE" },
      data: { status: "COMPLETED" }
    });

    // Activate the target year
    return tx.academicYear.update({
      where: { id },
      data: { status: "ACTIVE" }
    });
  });
};

/**
 * Mark an ACTIVE academic year as COMPLETED and re-enable year creation.
 *
 * @param {number} id - AcademicYear id
 * @param {number} schoolId - tenant isolation
 */
exports.completeYear = async (id, schoolId) => {
  // 🔒 BOLA: verify year belongs to school
  const year = await prisma.academicYear.findFirst({
    where: { id, schoolId }
  });
  if (!year) throw new Error("Academic year not found");
  if (year.status !== "ACTIVE") {
    throw new Error("Only an ACTIVE year can be completed");
  }

  return prisma.$transaction(async (tx) => {
    const completed = await tx.academicYear.update({
      where: { id },
      data: { status: "COMPLETED" }
    });

    // Re-enable year creation so Principal can start next year
    await tx.school.update({
      where: { id: schoolId },
      data: { canCreateAcademicYear: true }
    });

    return completed;
  });
};
