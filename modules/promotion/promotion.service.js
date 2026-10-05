const prisma = require("../../config/prisma");

/**
 * Get a list of students eligible for promotion from a given class + year.
 * Returns each student with a flag indicating if they are already promoted.
 *
 * @param {number} schoolId
 * @param {number} fromAcademicYearId
 * @param {number} fromClassId
 */
exports.getStudentsForPromotion = async (schoolId, fromAcademicYearId, fromClassId) => {
  // Verify academic year belongs to school
  const fromYear = await prisma.academicYear.findFirst({
    where: { id: fromAcademicYearId, schoolId }
  });
  if (!fromYear) throw new Error("Source academic year not found for this school");

  // Verify class belongs to school
  const fromClass = await prisma.classConfig.findFirst({
    where: { id: fromClassId, schoolId }
  });
  if (!fromClass) throw new Error("Source class not found for this school");

  // Get students in this class
  const students = await prisma.student.findMany({
    where: {
      classId: fromClassId,
      schoolId,
      isDeleted: false,
      status: "ACTIVE"
    },
    include: {
      user: { select: { name: true, userCode: true, email: true } },
      class: { select: { name: true } },
      promotions: {
        where: { fromAcademicYearId, schoolId },
        select: {
          id: true,
          toAcademicYearId: true,
          toClassId: true,
          status: true,
          toClass: { select: { name: true } },
          toAcademicYear: { select: { name: true } }
        }
      }
    },
    orderBy: { user: { name: "asc" } }
  });

  return students.map(s => ({
    id: s.id,
    userId: s.userId,
    name: s.user.name,
    userCode: s.user.userCode,
    email: s.user.email,
    className: s.class?.name,
    phone: s.phone,
    gender: s.gender,
    promotionRecord: s.promotions[0] || null,
    alreadyPromoted: s.promotions.length > 0
  }));
};

/**
 * Promote a batch of students from one class/year to another.
 * Fully transactional — all succeed or all fail.
 */
exports.promoteStudents = async ({
  schoolId,
  fromAcademicYearId,
  toAcademicYearId,
  fromClassId,
  toClassId,
  studentIds,
  promotedBy,
  notes
}) => {
  if (!studentIds || studentIds.length === 0) {
    throw new Error("No students selected for promotion");
  }

  return prisma.$transaction(async (tx) => {
    // Validate years
    const [fromYear, toYear] = await Promise.all([
      tx.academicYear.findFirst({ where: { id: fromAcademicYearId, schoolId } }),
      tx.academicYear.findFirst({ where: { id: toAcademicYearId, schoolId } })
    ]);
    if (!fromYear) throw new Error("Source academic year not found for this school");
    if (!toYear)   throw new Error("Target academic year not found for this school");
    if (fromAcademicYearId === toAcademicYearId) {
      throw new Error("Source and target academic years must be different");
    }

    // Validate classes
    const [fromClass, toClass] = await Promise.all([
      tx.classConfig.findFirst({ where: { id: fromClassId, schoolId } }),
      tx.classConfig.findFirst({ where: { id: toClassId, schoolId } })
    ]);
    if (!fromClass) throw new Error("Source class not found for this school");
    if (!toClass)   throw new Error("Target class not found for this school");

    // Validate all students belong to this school + source class
    const students = await tx.student.findMany({
      where: { id: { in: studentIds }, schoolId, classId: fromClassId, isDeleted: false },
      select: { id: true }
    });

    if (students.length !== studentIds.length) {
      const foundIds = new Set(students.map(s => s.id));
      const missing = studentIds.filter(id => !foundIds.has(id));
      throw new Error(
        "Some students do not belong to this school/class: " + missing.join(", ")
      );
    }

    // Check for duplicate promotions into the same target year
    const existing = await tx.studentPromotion.findMany({
      where: { studentId: { in: studentIds }, toAcademicYearId },
      select: { studentId: true }
    });

    if (existing.length > 0) {
      const ids = existing.map(p => p.studentId);
      throw new Error(
        ids.length + " student(s) already promoted to the target year. " +
        "Please deselect them: " + ids.join(", ")
      );
    }

    // Create promotion records
    await tx.studentPromotion.createMany({
      data: studentIds.map(studentId => ({
        schoolId,
        studentId,
        fromAcademicYearId,
        toAcademicYearId,
        fromClassId,
        toClassId,
        status: "PROMOTED",
        promotedBy,
        notes: notes || null
      })),
      skipDuplicates: true
    });

    // Update student.classId to the target class
    await tx.student.updateMany({
      where: { id: { in: studentIds }, schoolId },
      data: { classId: toClassId }
    });

    return {
      promoted: studentIds.length,
      fromYear: fromYear.name,
      toYear: toYear.name,
      fromClass: fromClass.name,
      toClass: toClass.name
    };
  });
};

/**
 * Get promotion history for a school.
 */
exports.getPromotionHistory = async (schoolId, filters = {}) => {
  const where = { schoolId };
  if (filters.fromAcademicYearId) where.fromAcademicYearId = Number(filters.fromAcademicYearId);
  if (filters.toAcademicYearId)   where.toAcademicYearId   = Number(filters.toAcademicYearId);
  if (filters.fromClassId)        where.fromClassId         = Number(filters.fromClassId);

  return prisma.studentPromotion.findMany({
    where,
    include: {
      student:          { include: { user: { select: { name: true, userCode: true } } } },
      fromAcademicYear: { select: { name: true } },
      toAcademicYear:   { select: { name: true } },
      fromClass:        { select: { name: true } },
      toClass:          { select: { name: true } },
      promoter:         { select: { name: true } }
    },
    orderBy: { createdAt: "desc" }
  });
};
