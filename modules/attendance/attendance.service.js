const prisma = require("../../config/prisma");
const { isHoliday } = require("../../utils/holidayHelper");

// ─── Helper: consecutive absence SMS check ────────────────────────────────────
async function shouldSendSMS(tx, studentId, schoolId) {
  const lastTwo = await tx.attendance.findMany({
    where: { studentId, schoolId },
    orderBy: { date: "desc" },
    take: 2
  });
  return lastTwo.length === 2 && lastTwo.every(a => a.status === "ABSENT");
}

// ─── Helper: validate period value against school's attendanceMode ─────────────
function validatePeriod(period, attendanceMode) {
  if (attendanceMode === "ONCE_DAILY") {
    if (period !== null && period !== undefined && period !== "") {
      throw new Error("ONCE_DAILY mode does not use period — omit the period field");
    }
    return null;  // period stored as null for ONCE_DAILY
  }

  if (attendanceMode === "TWICE_DAILY") {
    if (!["AM", "PM"].includes(period)) {
      throw new Error("TWICE_DAILY mode requires period to be 'AM' or 'PM'");
    }
    return period;
  }

  if (attendanceMode === "PERIOD_WISE") {
    const p = String(period).trim();
    if (!p || isNaN(Number(p))) {
      throw new Error("PERIOD_WISE mode requires period to be a numeric string (e.g. '1', '2')");
    }
    return p;
  }

  throw new Error(`Unknown attendanceMode: ${attendanceMode}`);
}

// ─── Main: Mark Attendance ────────────────────────────────────────────────────

exports.markAttendance = async (records, user) => {
  if (!records || !Array.isArray(records) || records.length === 0) {
    throw new Error("Invalid attendance data");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Holiday check
  const holiday = await isHoliday(user.schoolId, today);
  if (holiday) throw new Error("Cannot mark attendance on a holiday");

  // Resolve teacher record from userId
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) throw new Error("Teacher profile not found");

  // 🔒 Fetch school to get attendanceMode + active academic year
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { attendanceMode: true }
  });
  if (!school) throw new Error("School not found");

  const { attendanceMode } = school;

  // Validate and normalize period from the first record (all records share same period)
  const rawPeriod = records[0]?.period;
  const normalizedPeriod = validatePeriod(rawPeriod, attendanceMode);

  // Fetch active academic year (optional — only linked if one exists)
  const activeYear = await prisma.academicYear.findFirst({
    where: { schoolId: user.schoolId, status: "ACTIVE" },
    select: { id: true }
  });

  return prisma.$transaction(async (tx) => {
    const studentIds = records.map(r => r.studentId);

    // 🔒 Block if this teacher already submitted attendance for these students today (same period)
    const teacherAlreadyMarked = await tx.attendance.findFirst({
      where: {
        teacherId: teacher.id,
        date: today,
        isDeleted: false,
        period: normalizedPeriod,
        studentId: { in: studentIds }
      }
    });
    if (teacherAlreadyMarked) {
      throw new Error("Attendance already submitted for this class today" +
        (normalizedPeriod ? ` (period: ${normalizedPeriod})` : ""));
    }

    // 🔒 Block if any other teacher already marked these students (same date + period)
    const existingAny = await tx.attendance.findFirst({
      where: {
        studentId: { in: studentIds },
        date: today,
        isDeleted: false,
        period: normalizedPeriod
      }
    });
    if (existingAny) throw new Error("Attendance already marked for some students today");

    // Bulk insert with period + academicYearId
    await tx.attendance.createMany({
      data: records.map(r => ({
        schoolId: user.schoolId,
        studentId: r.studentId,
        teacherId: teacher.id,
        status: r.status,
        date: today,
        period: normalizedPeriod,
        academicYearId: activeYear?.id ?? null
      }))
    });

    // ── EOD Call Queue trigger (best-effort inside transaction) ───────────────
    // Identify classId from the first student's record
    const firstStudent = await tx.student.findUnique({
      where: { id: studentIds[0] },
      select: { classId: true }
    });

    if (firstStudent) {
      // Upsert AttendanceSession as completed for this class + date + period
      await tx.attendanceSession.upsert({
        where: {
          // Use a composite — find existing session for class+date+period
          // (No @@unique on AttendanceSession, so we do findFirst + create)
          id: (await tx.attendanceSession.findFirst({
            where: {
              schoolId: user.schoolId,
              classId: firstStudent.classId,
              date: today,
              period: normalizedPeriod
            }
          }))?.id ?? -1   // -1 forces creation branch
        },
        create: {
          schoolId: user.schoolId,
          classId: firstStudent.classId,
          date: today,
          period: normalizedPeriod,
          completed: true
        },
        update: { completed: true }
      }).catch(async () => {
        // If upsert fails (id=-1 not found), just create
        await tx.attendanceSession.create({
          data: {
            schoolId: user.schoolId,
            classId: firstStudent.classId,
            date: today,
            period: normalizedPeriod,
            completed: true
          }
        }).catch(() => {}); // silently ignore duplicate
      });

      // Check if all class sessions for today are complete → trigger EOD queue
      await triggerEODCallQueue(tx, user.schoolId, today, attendanceMode, activeYear?.id);
    }

    // ── SMS for 2 consecutive absences (best-effort, non-blocking) ────────────
    await Promise.allSettled(
      records
        .filter(r => r.status === "ABSENT")
        .map(async (r) => {
          const send = await shouldSendSMS(tx, r.studentId, user.schoolId);
          if (!send) return;
          const student = await tx.student.findUnique({
            where: { id: r.studentId },
            select: { phone: true }
          });
          if (student?.phone) {
            try {
              const { sendSMS } = require("../sms/sms.service");
              await sendSMS(student.phone, "Your child was absent for 2 consecutive days. Please contact the school.");
            } catch { /* SMS failure should not block attendance */ }
          }
        })
    );

    // ── Non-blocking Automated AI Absence Calling (Feature-Guarded) ───────────
    setImmediate(async () => {
      try {
        const { isEnabled } = require("../feature/feature.service");
        const aiAbsenceEnabled = await isEnabled(user.schoolId, "AI_ABSENCE_CALLING");
        if (aiAbsenceEnabled) {
          const { triggerAbsenceCallsForClass } = require("../calling/calling.service");
          const firstStudent = await prisma.student.findUnique({
            where: { id: records[0]?.studentId },
            select: { classId: true }
          });
          if (firstStudent?.classId) {
            await triggerAbsenceCallsForClass({
              schoolId: user.schoolId,
              classId: firstStudent.classId,
              date: today,
              triggeredByUserId: user.id
            });
          }
        }
      } catch (callingErr) {
        console.error("[Automated AI Absence Calling Error]", callingErr.message);
      }
    });

    return true;
  });
};

// ─── EOD Call Queue trigger ───────────────────────────────────────────────────

/**
 * Called after every attendance submission.
 * Checks if ALL active classes have completed attendance for today.
 * If yes: inserts absent students into DailyAbsenteeCallQueue and notifies principal.
 *
 * For TWICE_DAILY: "complete" means BOTH AM and PM sessions are done for ALL classes.
 */
async function triggerEODCallQueue(tx, schoolId, date, attendanceMode, academicYearId) {
  try {
    // Count total active classes for this school
    const totalClasses = await tx.classConfig.count({
      where: { schoolId, status: "ACTIVE" }
    });
    if (totalClasses === 0) return;

    // Determine how many completed sessions we expect
    let expectedSessions = totalClasses;
    if (attendanceMode === "TWICE_DAILY") expectedSessions = totalClasses * 2; // AM + PM

    // Count distinct completed sessions for today
    const completedSessions = await tx.attendanceSession.count({
      where: { schoolId, date, completed: true }
    });

    if (completedSessions < expectedSessions) return; // Not all classes done yet

    // Check if call queue already seeded for today (idempotency guard)
    const alreadySeeded = await tx.dailyAbsenteeCallQueue.findFirst({
      where: { schoolId, date }
    });
    if (alreadySeeded) return;

    // Gather all ABSENT records for today
    const absentRecords = await tx.attendance.findMany({
      where: { schoolId, date, status: "ABSENT", isDeleted: false },
      select: {
        studentId: true,
        student: { select: { phone: true, altPhone: true } }
      },
      distinct: ["studentId"]  // one entry per student even in multi-period
    });

    if (absentRecords.length === 0) return;

    // Bulk insert call queue entries
    await tx.dailyAbsenteeCallQueue.createMany({
      data: absentRecords.map(r => ({
        schoolId,
        studentId: r.studentId,
        date,
        parentPhone: r.student.phone || r.student.altPhone || "N/A",
        academicYearId: academicYearId ?? null
      })),
      skipDuplicates: true
    });

    // Notify the principal
    const principal = await tx.principal.findFirst({
      where: { schoolId },
      select: { userId: true }
    });
    if (principal) {
      await tx.notification.create({
        data: {
          schoolId,
          userId: principal.userId,
          role: "principal",
          title: "📋 Attendance Complete — Call Queue Ready",
          message: `All class attendance submitted. ${absentRecords.length} absent student(s) added to parent call queue.`,
          type: "ATTENDANCE_COMPLETE"
        }
      });
    }
  } catch (err) {
    // Non-blocking: log but don't fail the attendance submission
    console.error("[EOD Call Queue Error]", err.message);
  }
}

// ─── Get today's attendance ───────────────────────────────────────────────────

exports.getTodayAttendance = async (classId, user) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.attendance.findMany({
    where: {
      schoolId: user.schoolId,
      date: today,
      isDeleted: false,
      ...(classId && { student: { classId: Number(classId) } })
    },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } },
          class: { select: { name: true } }
        }
      },
      teacher: {
        include: { user: { select: { name: true } } }
      }
    },
    orderBy: { createdAt: "asc" }
  });
};

// ─── Principal: Get Call Queue ────────────────────────────────────────────────

/**
 * Get the absentee call queue for a specific date.
 * Optionally filter by callStatus.
 *
 * @param {number} schoolId
 * @param {string} dateStr - ISO date string e.g. "2026-08-29"
 * @param {string?} statusFilter - "PENDING" | "FAILED" | "EXHAUSTED" etc.
 */
exports.getCallQueue = async (schoolId, dateStr, statusFilter) => {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  const where = { schoolId, date };
  if (statusFilter) where.callStatus = statusFilter;

  return prisma.dailyAbsenteeCallQueue.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } },
          class: { select: { name: true } }
        }
      }
    }
  });
};

// ─── Principal: Update Call Queue Entry ──────────────────────────────────────

/**
 * Log a call outcome for a single parent call queue entry.
 *
 * Retry logic:
 * - "CALLED"  → callStatus = CALLED
 * - "EXCUSED" → callStatus = EXCUSED
 * - "FAILED"  → retryCount++; if retryCount >= maxRetries → EXHAUSTED; else FAILED
 *
 * @param {number} id - DailyAbsenteeCallQueue id
 * @param {string} callOutcome - "CALLED" | "FAILED" | "EXCUSED"
 * @param {string?} notes
 * @param {number} schoolId - tenant isolation (BOLA guard)
 */
exports.updateCallQueueEntry = async (id, callOutcome, notes, schoolId) => {
  // 🔒 BOLA: verify entry belongs to principal's school
  const entry = await prisma.dailyAbsenteeCallQueue.findFirst({
    where: { id: Number(id), schoolId }
  });
  if (!entry) throw new Error("Call queue entry not found");

  if (entry.callStatus === "EXHAUSTED") {
    throw new Error("Maximum retries reached. No further calls can be logged.");
  }
  if (entry.callStatus === "CALLED" || entry.callStatus === "EXCUSED") {
    throw new Error("This entry has already been resolved.");
  }

  let updateData = {
    lastAttemptAt: new Date(),
    notes: notes || entry.notes
  };

  if (callOutcome === "CALLED") {
    updateData.callStatus = "CALLED";
  } else if (callOutcome === "EXCUSED") {
    updateData.callStatus = "EXCUSED";
  } else if (callOutcome === "FAILED") {
    const newRetryCount = entry.retryCount + 1;
    updateData.retryCount = newRetryCount;
    updateData.callStatus = newRetryCount >= entry.maxRetries ? "EXHAUSTED" : "FAILED";
  } else {
    throw new Error("callOutcome must be one of: CALLED, FAILED, EXCUSED");
  }

  return prisma.dailyAbsenteeCallQueue.update({
    where: { id: Number(id) },
    data: updateData
  });
};