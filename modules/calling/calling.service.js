/**
 * AI Parent Calling Service
 *
 * Implements:
 * - Production-ready telephony lifecycle management (PENDING -> QUEUED -> RINGING -> IN_PROGRESS -> COMPLETED / FAILED / NO_ANSWER)
 * - Per-school Feature Toggle verification (AI_PARENT_CALLING, AI_ABSENCE_CALLING, AI_FEE_REMINDER_CALLING)
 * - School calling hours enforcement (09:00 - 18:00 school local time)
 * - Duplicate call protection (deterministic idempotency keys)
 * - Configurable retry policies for NO_ANSWER / FAILED attempts
 * - Authoritative dynamic mentor resolution (ClassMentor assignment)
 * - Parent phone number data privacy & masking
 * - Multi-tenant isolation & BOLA security
 * - Comprehensive call counting & analytics across School, Mentor, Student, and Super Admin levels
 */

const prisma = require("../../config/prisma");
const { isEnabled } = require("../feature/feature.service");
const { dispatchCall } = require("./callingProvider");

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mask a phone number for data privacy (e.g. "+91 98*** **321" or "98****3210")
 */
function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== "string") return "N/A";
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return "****";
  const start = cleaned.slice(0, 2);
  const end = cleaned.slice(-2);
  const maskedLength = Math.max(cleaned.length - 4, 3);
  return `${start}${"*".repeat(maskedLength)}${end}`;
}

/**
 * Check if the current time is within school allowed calling hours (09:00 to 18:00)
 */
function isWithinCallingHours() {
  const now = new Date();
  const currentHour = now.getHours(); // 0 - 23
  return currentHour >= 9 && currentHour < 18;
}

/**
 * Resolve the current active Class Mentor (Teacher profile) for a student's class
 */
async function resolveActiveMentor(schoolId, classId, academicYearId = null) {
  let targetYearId = academicYearId;
  if (!targetYearId) {
    const activeYear = await prisma.academicYear.findFirst({
      where: { schoolId, status: "ACTIVE" },
      select: { id: true }
    });
    targetYearId = activeYear?.id || null;
  }

  const mentorAssignment = await prisma.classMentor.findFirst({
    where: {
      schoolId,
      classId,
      ...(targetYearId && { academicYearId: targetYearId }),
      isActive: true
    },
    include: {
      teacher: {
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });

  return {
    mentorId: mentorAssignment?.teacherId || null,
    mentorUserId: mentorAssignment?.teacher?.userId || null,
    mentorName: mentorAssignment?.teacher?.user?.name || "Class Mentor"
  };
}

/**
 * Audit Log helper
 */
async function createAuditLog({ schoolId, userId, action, details }) {
  try {
    if (!userId) return;
    await prisma.auditLog.create({
      data: {
        schoolId,
        module: "COMMUNICATION",
        actionType: action.includes("CREATE") ? "CREATE" : "UPDATE",
        entityId: details.callId || 0,
        entityType: "CallRecord",
        oldData: null,
        newData: details,
        changedBy: userId,
        changedByRole: "system",
        revokeExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  } catch (err) {
    console.error("[CallingService AuditLog Error]", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE CALL INITIATION / RETRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiate an AI phone call to a parent with idempotency and feature guards.
 */
async function initiateCall({
  schoolId,
  studentId,
  callPurpose,
  metadata = {},
  customIdempotencyKey = null,
  initiatedByUserId = null
}) {
  // 1. Feature Toggle Verification
  const aiCallingEnabled = await isEnabled(schoolId, "AI_PARENT_CALLING");
  if (!aiCallingEnabled) {
    throw new Error("AI Parent Calling is disabled for this school.");
  }

  if (callPurpose === "ABSENCE_NOTIFICATION") {
    const absenceCalling = await isEnabled(schoolId, "AI_ABSENCE_CALLING");
    if (!absenceCalling) {
      throw new Error("AI Absence Calling is disabled for this school.");
    }
  } else if (callPurpose === "FEE_PAYMENT_REMINDER") {
    const feeCalling = await isEnabled(schoolId, "AI_FEE_REMINDER_CALLING");
    if (!feeCalling) {
      throw new Error("AI Fee Reminder Calling is disabled for this school.");
    }
  }

  // 2. Fetch authoritative student & parent contact
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId, isDeleted: false },
    include: {
      user: { select: { name: true, userCode: true } },
      class: { select: { id: true, name: true } }
    }
  });

  if (!student) {
    throw new Error("Student not found or does not belong to this school.");
  }

  if (!student.phone && !metadata.parentPhone) {
    throw new Error("No registered parent phone number found for this student.");
  }

  const parentPhone = metadata.parentPhone || student.phone;
  const studentName = student.user?.name || "Student";
  const className = student.class?.name || "Class";

  // 3. Resolve active mentor
  const activeYear = await prisma.academicYear.findFirst({
    where: { schoolId, status: "ACTIVE" },
    select: { id: true }
  });
  const { mentorId, mentorName } = await resolveActiveMentor(schoolId, student.classId, activeYear?.id);

  // 4. Duplicate Call Protection (Deterministic Idempotency Key)
  const todayStr = new Date().toISOString().slice(0, 10);
  const idempotencyKey =
    customIdempotencyKey ||
    (callPurpose === "ABSENCE_NOTIFICATION"
      ? `absence_${schoolId}_${studentId}_${todayStr}_ABSENCE_NOTIFICATION`
      : callPurpose === "FEE_PAYMENT_REMINDER"
      ? `fee_${schoolId}_${studentId}_${metadata.feeId || todayStr.slice(0, 7)}_FEE_PAYMENT_REMINDER`
      : `call_${schoolId}_${studentId}_${callPurpose}_${Date.now()}`);

  const existingCall = await prisma.callRecord.findUnique({
    where: { idempotencyKey }
  });

  if (existingCall) {
    // If call already succeeded or is currently processing or queued, prevent duplicate
    if (["COMPLETED", "IN_PROGRESS", "RINGING", "QUEUED", "PENDING", "DIALING"].includes(existingCall.callStatus)) {
      return {
        isDuplicate: true,
        message: `A call for this event is already ${existingCall.callStatus.toLowerCase()}. Duplicate call prevented.`,
        callRecord: existingCall
      };
    }

    // If call failed or had no answer, evaluate retry policy
    if (["NO_ANSWER", "BUSY", "FAILED"].includes(existingCall.callStatus)) {
      if (existingCall.retryCount >= existingCall.maxRetries) {
        return {
          isDuplicate: true,
          message: `Maximum retries (${existingCall.maxRetries}) reached for this event today.`,
          callRecord: existingCall
        };
      }
    }
  }

  // 5. Calling Hours Guard
  const withinWindow = isWithinCallingHours();

  // Combine metadata
  const callMetadata = {
    ...metadata,
    studentName,
    className,
    mentorName,
    fatherName: student.fatherName,
    motherName: student.motherName,
    date: todayStr
  };

  let callRecord;

  if (existingCall && ["NO_ANSWER", "BUSY", "FAILED"].includes(existingCall.callStatus)) {
    // Increment retry count on existing record
    callRecord = await prisma.callRecord.update({
      where: { id: existingCall.id },
      data: {
        retryCount: existingCall.retryCount + 1,
        callStatus: withinWindow ? "RINGING" : "QUEUED",
        notes: withinWindow ? `Retry attempt #${existingCall.retryCount + 1}` : `Queued outside calling window (09:00 - 18:00)`
      }
    });
  } else {
    // Create new call record in PENDING / QUEUED state
    callRecord = await prisma.callRecord.create({
      data: {
        schoolId,
        academicYearId: activeYear?.id || null,
        mentorId,
        studentId,
        parentPhone,
        callPurpose,
        callStatus: withinWindow ? "RINGING" : "QUEUED",
        idempotencyKey,
        initiatedBy: initiatedByUserId,
        metadata: callMetadata,
        notes: withinWindow ? "Call queued and dispatched." : "Queued outside allowed calling window (09:00 - 18:00)."
      }
    });
  }

  await createAuditLog({
    schoolId,
    userId: initiatedByUserId,
    action: "CALL_CREATED",
    details: { callId: callRecord.id, studentId, purpose: callPurpose, status: callRecord.callStatus }
  });

  // If outside calling hours, leave as QUEUED
  if (!withinWindow) {
    return {
      isQueued: true,
      message: "Call queued. Current time is outside school calling hours (09:00 - 18:00). Call will be dialed during the next calling window.",
      callRecord
    };
  }

  // 6. Dispatch to Telephony Engine (Provider Adapter)
  try {
    const dispatchResult = await dispatchCall({
      schoolId,
      studentId,
      parentPhone,
      callPurpose,
      metadata: callMetadata
    });

    // Update call record with dispatch outcome
    const updatedRecord = await prisma.callRecord.update({
      where: { id: callRecord.id },
      data: {
        provider: dispatchResult.provider || "AI_VOICE_AGENT",
        providerCallId: dispatchResult.providerCallId,
        callStatus: dispatchResult.status || "COMPLETED",
        outcome: dispatchResult.outcome || null,
        startedAt: dispatchResult.startedAt || new Date(),
        answeredAt: dispatchResult.answeredAt || null,
        endedAt: dispatchResult.endedAt || new Date(),
        duration: dispatchResult.duration || 0,
        cost: dispatchResult.cost ? parseFloat(dispatchResult.cost) : 0,
        transcript: dispatchResult.transcript || null,
        summary: dispatchResult.summary || null
      }
    });

    await createAuditLog({
      schoolId,
      userId: initiatedByUserId,
      action: updatedRecord.callStatus === "COMPLETED" ? "CALL_COMPLETED" : "CALL_FAILED",
      details: { callId: updatedRecord.id, status: updatedRecord.callStatus, outcome: updatedRecord.outcome, duration: updatedRecord.duration }
    });

    return {
      success: true,
      callRecord: updatedRecord
    };
  } catch (dispatchErr) {
    console.error("[CallingService Dispatch Error]", dispatchErr);
    const failedRecord = await prisma.callRecord.update({
      where: { id: callRecord.id },
      data: {
        callStatus: "FAILED",
        outcome: "FAILED",
        notes: `Dispatch error: ${dispatchErr.message}`
      }
    });

    return {
      success: false,
      error: dispatchErr.message,
      callRecord: failedRecord
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH TRIGGERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger AI Absence Calls for absent students in a class or school for a given date.
 */
async function triggerAbsenceCallsForClass({
  schoolId,
  classId = null,
  date = new Date(),
  triggeredByUserId = null
}) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  // 1. Fetch absent attendance records
  const absentRecords = await prisma.attendance.findMany({
    where: {
      schoolId,
      date: targetDate,
      status: "ABSENT",
      isDeleted: false,
      ...(classId && { student: { classId: Number(classId) } })
    },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } },
          class: { select: { id: true, name: true } }
        }
      }
    }
  });

  const results = {
    totalEligible: absentRecords.length,
    callsInitiated: 0,
    duplicatesSkipped: 0,
    queuedOutsideWindow: 0,
    errors: []
  };

  const todayStr = targetDate.toISOString().slice(0, 10);

  for (const record of absentRecords) {
    if (!record.student || !record.student.phone) continue;

    try {
      const res = await initiateCall({
        schoolId,
        studentId: record.studentId,
        callPurpose: "ABSENCE_NOTIFICATION",
        metadata: {
          attendanceId: record.id,
          date: todayStr
        },
        customIdempotencyKey: `absence_${schoolId}_${record.studentId}_${todayStr}_ABSENCE_NOTIFICATION`,
        initiatedByUserId
      });

      if (res.isDuplicate) {
        results.duplicatesSkipped++;
      } else if (res.isQueued) {
        results.queuedOutsideWindow++;
      } else {
        results.callsInitiated++;
      }
    } catch (err) {
      results.errors.push({ studentId: record.studentId, error: err.message });
    }
  }

  return results;
}

/**
 * Trigger AI Fee Reminder Calls for students with overdue or pending fees.
 */
async function triggerFeeReminderCalls({
  schoolId,
  classId = null,
  triggeredByUserId = null
}) {
  // Query authoritative fee records that have pending balances
  const overdueFees = await prisma.fee.findMany({
    where: {
      schoolId,
      isDeleted: false,
      pendingAmount: { gt: 0 },
      paymentStatus: { in: ["PENDING", "PARTIAL"] },
      ...(classId && { classId: Number(classId) })
    },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } },
          class: { select: { id: true, name: true } }
        }
      }
    }
  });

  const currentMonthYear = new Date().toISOString().slice(0, 7); // e.g. "2026-09"

  const results = {
    totalEligible: overdueFees.length,
    callsInitiated: 0,
    duplicatesSkipped: 0,
    queuedOutsideWindow: 0,
    errors: []
  };

  for (const fee of overdueFees) {
    if (!fee.student || !fee.student.phone) continue;

    try {
      const res = await initiateCall({
        schoolId,
        studentId: fee.studentId,
        callPurpose: "FEE_PAYMENT_REMINDER",
        metadata: {
          feeId: fee.id,
          feeType: fee.feeType,
          totalFee: fee.totalFee,
          paidAmount: fee.paidAmount,
          pendingAmount: fee.pendingAmount,
          dueDate: fee.dueDate
        },
        customIdempotencyKey: `fee_${schoolId}_${fee.studentId}_${fee.id}_${currentMonthYear}_FEE_PAYMENT_REMINDER`,
        initiatedByUserId
      });

      if (res.isDuplicate) {
        results.duplicatesSkipped++;
      } else if (res.isQueued) {
        results.queuedOutsideWindow++;
      } else {
        results.callsInitiated++;
      }
    } catch (err) {
      results.errors.push({ studentId: fee.studentId, error: err.message });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle asynchronous webhook callback from telephony provider (Bland AI / Retell / Twilio).
 * Idempotently updates call status, duration, recording transcript, and structured outcome.
 */
async function handleCallWebhook(payload) {
  const providerCallId = payload.call_id || payload.providerCallId || payload.id;
  if (!providerCallId) {
    throw new Error("Missing providerCallId in webhook payload.");
  }

  const existingCall = await prisma.callRecord.findUnique({
    where: { providerCallId }
  });

  if (!existingCall) {
    console.warn(`[CallingService Webhook] Call record not found for providerCallId: ${providerCallId}`);
    return { ignored: true, reason: "Call record not found" };
  }

  // Normalize status
  const rawStatus = (payload.status || payload.call_status || "").toUpperCase();
  let finalStatus = existingCall.callStatus;
  if (["COMPLETED", "ENDED", "SUCCESS"].includes(rawStatus)) finalStatus = "COMPLETED";
  else if (["NO_ANSWER", "UNANSWERED"].includes(rawStatus)) finalStatus = "NO_ANSWER";
  else if (["TIMEOUT"].includes(rawStatus)) finalStatus = "TIMEOUT";
  else if (["REJECTED", "DECLINED"].includes(rawStatus)) finalStatus = "REJECTED";
  else if (["BUSY"].includes(rawStatus)) finalStatus = "BUSY";
  else if (["DROPPED"].includes(rawStatus)) finalStatus = "DROPPED";
  else if (["DIALING"].includes(rawStatus)) finalStatus = "DIALING";
  else if (["RINGING"].includes(rawStatus)) finalStatus = "RINGING";
  else if (["IN_PROGRESS", "ANSWERED", "IN-PROGRESS"].includes(rawStatus)) finalStatus = "IN_PROGRESS";
  else if (["PROVIDER_ERROR"].includes(rawStatus)) finalStatus = "PROVIDER_ERROR";
  else if (["FAILED", "ERROR"].includes(rawStatus)) finalStatus = "FAILED";

  const duration = typeof payload.duration === "number" ? Math.round(payload.duration) : existingCall.duration;
  const transcript = payload.concatenated_transcript || payload.transcript || existingCall.transcript;
  const summary = payload.summary || existingCall.summary;

  const updated = await prisma.callRecord.update({
    where: { id: existingCall.id },
    data: {
      callStatus: finalStatus,
      duration,
      transcript,
      summary,
      endedAt: new Date()
    }
  });

  return { success: true, callId: updated.id, status: updated.callStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS & DASHBOARD QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mentor Parent Communication Dashboard
 * Provides today's statistics: absent students, overdue fees, call counts by status.
 */
async function getMentorCommunicationDashboard(mentorUserId, schoolId) {
  // 1. Find teacher record
  const teacher = await prisma.teacher.findUnique({
    where: { userId: mentorUserId }
  });

  if (!teacher) {
    throw new Error("Teacher profile not found for this user.");
  }

  // 2. Find active mentor assignments for this teacher
  const assignments = await prisma.classMentor.findMany({
    where: {
      schoolId,
      teacherId: teacher.id,
      isActive: true
    },
    include: {
      class: { select: { id: true, name: true } }
    }
  });

  const assignedClassIds = assignments.map(a => a.classId);

  // If not assigned to any class as mentor
  if (assignedClassIds.length === 0) {
    return {
      isMentor: false,
      assignedClasses: [],
      stats: {
        absentStudents: 0,
        feeOverdue: 0,
        callsRequired: 0,
        completed: 0,
        noAnswer: 0,
        failed: 0,
        inProgress: 0,
        queued: 0
      },
      recentCalls: []
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 3. Count absent students today in mentor's assigned classes
  const absentCount = await prisma.attendance.count({
    where: {
      schoolId,
      date: today,
      status: "ABSENT",
      isDeleted: false,
      student: { classId: { in: assignedClassIds } }
    }
  });

  // 4. Count fee overdue students in mentor's assigned classes
  const feeOverdueCount = await prisma.fee.count({
    where: {
      schoolId,
      classId: { in: assignedClassIds },
      isDeleted: false,
      pendingAmount: { gt: 0 },
      paymentStatus: { in: ["PENDING", "PARTIAL"] }
    }
  });

  // 5. Query today's calls for mentor's students
  const todayCalls = await prisma.callRecord.findMany({
    where: {
      schoolId,
      createdAt: { gte: today },
      student: { classId: { in: assignedClassIds } }
    },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } },
          class: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const completed = todayCalls.filter(c => c.callStatus === "COMPLETED").length;
  const noAnswer = todayCalls.filter(c => ["NO_ANSWER", "BUSY"].includes(c.callStatus)).length;
  const failed = todayCalls.filter(c => c.callStatus === "FAILED").length;
  const inProgress = todayCalls.filter(c => ["IN_PROGRESS", "RINGING"].includes(c.callStatus)).length;
  const queued = todayCalls.filter(c => ["PENDING", "QUEUED"].includes(c.callStatus)).length;

  const totalCallsRequired = absentCount + feeOverdueCount;

  return {
    isMentor: true,
    assignedClasses: assignments.map(a => ({
      classId: a.classId,
      name: a.class?.name || `Class ${a.classId}`
    })),
    stats: {
      absentStudents: absentCount,
      feeOverdue: feeOverdueCount,
      callsRequired: totalCallsRequired,
      completed,
      noAnswer,
      failed,
      inProgress,
      queued
    },
    recentCalls: todayCalls.slice(0, 20).map(c => ({
      id: c.id,
      studentName: c.student?.user?.name || "Student",
      admissionNo: c.student?.user?.userCode || "N/A",
      className: c.student?.class?.name || "Class",
      purpose: c.callPurpose,
      status: c.callStatus,
      outcome: c.outcome,
      duration: c.duration,
      parentPhone: maskPhoneNumber(c.parentPhone),
      createdAt: c.createdAt
    }))
  };
}

/**
 * School-Level Call Analytics & Visual Chart Data
 */
async function getSchoolCallAnalytics(schoolId, { startDate, endDate, mentorId, purpose } = {}) {
  const where = { schoolId };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (mentorId) where.mentorId = Number(mentorId);
  if (purpose) where.callPurpose = purpose;

  const calls = await prisma.callRecord.findMany({
    where,
    include: {
      mentor: {
        include: {
          user: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  // Calculate high-level aggregates
  const totalCalls = calls.length;
  const completed = calls.filter(c => c.callStatus === "COMPLETED").length;
  const failed = calls.filter(c => c.callStatus === "FAILED").length;
  const noAnswer = calls.filter(c => ["NO_ANSWER", "BUSY"].includes(c.callStatus)).length;
  const inProgress = calls.filter(c => ["IN_PROGRESS", "RINGING"].includes(c.callStatus)).length;

  const totalDurationSeconds = calls.reduce((acc, c) => acc + (c.duration || 0), 0);
  const totalCost = calls.reduce((acc, c) => acc + (c.cost ? Number(c.cost) : 0), 0);

  // Group by Date for Chart Visualizations (Last 14 days default or filtered range)
  const dateMap = {};
  for (const c of calls) {
    const d = c.createdAt.toISOString().slice(0, 10);
    if (!dateMap[d]) {
      dateMap[d] = { date: d, absenceCalls: 0, feeCalls: 0, otherCalls: 0, completed: 0, failed: 0 };
    }
    if (c.callPurpose === "ABSENCE_NOTIFICATION") dateMap[d].absenceCalls++;
    else if (c.callPurpose === "FEE_PAYMENT_REMINDER") dateMap[d].feeCalls++;
    else dateMap[d].otherCalls++;

    if (c.callStatus === "COMPLETED") dateMap[d].completed++;
    else if (c.callStatus === "FAILED") dateMap[d].failed++;
  }

  const timeline = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

  // Mentor Call Distribution
  const mentorMap = {};
  for (const c of calls) {
    const mName = c.mentor?.user?.name || "Unassigned";
    if (!mentorMap[mName]) {
      mentorMap[mName] = { mentor: mName, calls: 0, completed: 0, duration: 0 };
    }
    mentorMap[mName].calls++;
    if (c.callStatus === "COMPLETED") mentorMap[mName].completed++;
    mentorMap[mName].duration += c.duration || 0;
  }

  return {
    summary: {
      totalCalls,
      completed,
      failed,
      noAnswer,
      inProgress,
      totalDurationSeconds,
      totalMinutes: Math.round(totalDurationSeconds / 60),
      averageDurationSeconds: totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0,
      totalCost: totalCost.toFixed(2)
    },
    timeline,
    mentorDistribution: Object.values(mentorMap)
  };
}

/**
 * Super Admin Multi-School Call Accounting & Usage
 */
async function getSuperAdminCallUsage({ startDate, endDate, schoolId } = {}) {
  const where = {};
  if (schoolId) where.schoolId = Number(schoolId);
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  // Get all active schools
  const schools = await prisma.school.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, code: true, location: true }
  });

  const calls = await prisma.callRecord.findMany({
    where,
    select: {
      schoolId: true,
      callPurpose: true,
      callStatus: true,
      duration: true,
      cost: true,
      createdAt: true
    }
  });

  const schoolStatsMap = {};
  for (const s of schools) {
    schoolStatsMap[s.id] = {
      schoolId: s.id,
      schoolName: s.name,
      schoolCode: s.code,
      location: s.location,
      totalCalls: 0,
      completed: 0,
      failed: 0,
      noAnswer: 0,
      durationSeconds: 0,
      totalCost: 0
    };
  }

  for (const c of calls) {
    if (!schoolStatsMap[c.schoolId]) continue;
    const item = schoolStatsMap[c.schoolId];
    item.totalCalls++;
    if (c.callStatus === "COMPLETED") item.completed++;
    else if (c.callStatus === "FAILED") item.failed++;
    else if (["NO_ANSWER", "BUSY"].includes(c.callStatus)) item.noAnswer++;
    item.durationSeconds += c.duration || 0;
    item.totalCost += c.cost ? Number(c.cost) : 0;
  }

  const schoolRows = Object.values(schoolStatsMap).map(s => ({
    ...s,
    totalMinutes: Math.round(s.durationSeconds / 60),
    formattedDuration: `${Math.floor(s.durationSeconds / 3600)}h ${Math.floor((s.durationSeconds % 3600) / 60)}m`,
    avgDurationSeconds: s.totalCalls > 0 ? Math.round(s.durationSeconds / s.totalCalls) : 0,
    totalCost: s.totalCost.toFixed(2)
  }));

  // Global totals
  const overallCalls = calls.length;
  const overallDuration = calls.reduce((acc, c) => acc + (c.duration || 0), 0);
  const overallCompleted = calls.filter(c => c.callStatus === "COMPLETED").length;
  const overallFailed = calls.filter(c => c.callStatus === "FAILED").length;
  const overallCost = calls.reduce((acc, c) => acc + (c.cost ? Number(c.cost) : 0), 0);

  return {
    overview: {
      totalSchools: schools.length,
      totalCalls: overallCalls,
      completedCalls: overallCompleted,
      failedCalls: overallFailed,
      totalMinutes: Math.round(overallDuration / 60),
      totalCost: overallCost.toFixed(2),
      completionRate: overallCalls > 0 ? `${((overallCompleted / overallCalls) * 100).toFixed(1)}%` : "0%"
    },
    schools: schoolRows
  };
}

/**
 * Student Parent Communication History (with authorized phone masking)
 */
async function getStudentCallHistory(studentId, schoolId, requestingUser) {
  // Verify student belongs to school (tenant isolation)
  const student = await prisma.student.findFirst({
    where: { id: Number(studentId), schoolId, isDeleted: false },
    include: {
      user: { select: { name: true, userCode: true } },
      class: { select: { id: true, name: true } }
    }
  });

  if (!student) {
    throw new Error("Student not found or access denied.");
  }

  // Resolve dynamic mentor
  const { mentorName } = await resolveActiveMentor(schoolId, student.classId);

  // Check phone visibility authorization:
  // Superadmin, principal, or teacher who is the assigned class mentor
  let canViewUnmaskedPhone = ["superadmin", "principal"].includes(requestingUser.role);
  if (!canViewUnmaskedPhone && requestingUser.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({ where: { userId: requestingUser.id } });
    if (teacher) {
      const isAssignedMentor = await prisma.classMentor.findFirst({
        where: { schoolId, classId: student.classId, teacherId: teacher.id, isActive: true }
      });
      if (isAssignedMentor) {
        canViewUnmaskedPhone = await isEnabled(schoolId, "MENTOR_PARENT_CONTACT");
      }
    }
  }

  const calls = await prisma.callRecord.findMany({
    where: { studentId: Number(studentId), schoolId },
    include: {
      mentor: {
        include: {
          user: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return {
    student: {
      id: student.id,
      name: student.user?.name,
      admissionNo: student.user?.userCode,
      className: student.class?.name || "Class",
      mentorName,
      phone: canViewUnmaskedPhone ? student.phone : maskPhoneNumber(student.phone)
    },
    calls: calls.map(c => ({
      id: c.id,
      purpose: c.callPurpose,
      status: c.callStatus,
      outcome: c.outcome,
      mentorName: c.mentor?.user?.name || mentorName,
      duration: c.duration,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      parentPhone: canViewUnmaskedPhone ? c.parentPhone : maskPhoneNumber(c.parentPhone),
      transcript: c.transcript,
      summary: c.summary,
      createdAt: c.createdAt
    }))
  };
}

module.exports = {
  maskPhoneNumber,
  isWithinCallingHours,
  resolveActiveMentor,
  initiateCall,
  triggerAbsenceCallsForClass,
  triggerFeeReminderCalls,
  handleCallWebhook,
  getMentorCommunicationDashboard,
  getSchoolCallAnalytics,
  getSuperAdminCallUsage,
  getStudentCallHistory
};
