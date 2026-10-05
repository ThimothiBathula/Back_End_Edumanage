const prisma = require("../../config/prisma");

// ─── Existing: AuditLog queries (UNCHANGED) ───────────────────────────────────

// 🔐 Whitelist of valid models that can be restored — prevents prototype pollution
const SAFE_RESTORE_MODELS = ['student', 'teacher', 'fee', 'attendance', 'marks', 'syllabus', 'schedule'];

exports.getAuditLogs = async (schoolId, filters) => {
  const where = {};

  if (schoolId) where.schoolId = schoolId;
  if (filters.module) where.module = filters.module;
  if (filters.actionType) where.actionType = filters.actionType;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 100,
    include: {
      user: { select: { name: true, role: true } }
    }
  });

  return logs;
};

exports.restoreLog = async (logId, user) => {
  const schoolId = user.schoolId;

  const log = await prisma.auditLog.findFirst({
    where: { id: Number(logId), schoolId }
  });

  if (!log) throw new Error("Log not found");
  if (log.revoked) throw new Error("This action has already been revoked");
  if (new Date() > new Date(log.revokeExpiry)) {
    throw new Error("Cannot revoke action: 7-day period has expired");
  }

  // 🔐 CRITICAL: Whitelist the entity type — never allow arbitrary prisma model access
  const normalizedType = log.entityType?.toLowerCase();
  if (!SAFE_RESTORE_MODELS.includes(normalizedType)) {
    throw new Error("Restore not supported for this entity type");
  }

  let restoredEntity;

  if (log.actionType === "DELETE") {
    restoredEntity = await prisma[normalizedType].update({
      where: { id: log.entityId },
      data: { isDeleted: false, deletedAt: null, deletedBy: null }
    });
  } else if (log.actionType === "UPDATE") {
    if (!log.oldData) throw new Error("No previous state to revert to");

    // 🔐 Strip all relational/sensitive/immutable fields before applying revert
    const { id, createdAt, updatedAt, password, schoolId: _sid, userId, ...revertData } = log.oldData;

    restoredEntity = await prisma[normalizedType].update({
      where: { id: log.entityId },
      data: revertData
    });
  } else if (log.actionType === "CREATE") {
    restoredEntity = await prisma[normalizedType].update({
      where: { id: log.entityId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id }
    });
  }

  await prisma.auditLog.update({
    where: { id: log.id },
    data: { revoked: true, revokedAt: new Date() }
  });

  return restoredEntity;
};

// ─── NEW: Fee Correction Request (Auditor ↔ Principal workflow) ───────────────

/**
 * Auditor raises a fee correction request.
 * Scoped strictly to the auditor's schoolId.
 */
exports.raiseFeeCorrection = async (data, user) => {
  const { studentId, feeId, paymentHistoryId, amount, reason, originalValue, requestedValue } = data;
  const schoolId = user.schoolId;

  if (!studentId || !amount || !reason) {
    throw new Error("studentId, amount, and reason are required");
  }

  if (isNaN(Number(amount))) {
    throw new Error("amount must be a valid number");
  }

  // 🔒 BOLA: ensure student belongs to user's school
  const student = await prisma.student.findFirst({
    where: { id: Number(studentId), schoolId, isDeleted: false }
  });
  if (!student) throw new Error("Student not found in your school");

  // 🔒 If feeId provided, verify it belongs to same school
  if (feeId) {
    const fee = await prisma.fee.findFirst({
      where: { id: Number(feeId), schoolId, isDeleted: false }
    });
    if (!fee) throw new Error("Fee record not found in your school");
  }

  // 🔒 If paymentHistoryId provided, verify it belongs to same school
  if (paymentHistoryId) {
    const payment = await prisma.paymentHistory.findFirst({
      where: { id: Number(paymentHistoryId), schoolId, isDeleted: false }
    });
    if (!payment) throw new Error("Payment record not found in your school");
  }

  const requesterRole = user.isAccountant ? "ACCOUNTANT" : (user.role || "STAFF").toUpperCase();

  return prisma.feeCorrectionRequest.create({
    data: {
      schoolId,
      auditorId: user.id, // For backward compatibility
      requestedById: user.id,
      requestedByRole: requesterRole,
      studentId: Number(studentId),
      feeId: feeId ? Number(feeId) : null,
      paymentHistoryId: paymentHistoryId ? Number(paymentHistoryId) : null,
      amount: Number(amount),
      originalValue: originalValue || null,
      requestedValue: requestedValue || null,
      reason,
      status: "PENDING"
    },
    include: {
      student: { include: { user: { select: { name: true } } } }
    }
  });
};

/**
 * Auditor / Accountant views their own correction requests.
 */
exports.getMyFeeCorrections = async (user) => {
  return prisma.feeCorrectionRequest.findMany({
    where: {
      schoolId: user.schoolId,
      OR: [
        { auditorId: user.id },
        { requestedById: user.id }
      ]
    },
    orderBy: { createdAt: "desc" },
    include: {
      student: { include: { user: { select: { name: true } } } },
      reviewer: { select: { name: true } },
      fee: { select: { totalFee: true, paidAmount: true, pendingAmount: true, paymentStatus: true } },
      paymentHistory: true
    }
  });
};

/**
 * Principal views all PENDING / OPEN correction requests for their school.
 */
exports.getPendingFeeCorrections = async (schoolId, statusFilter) => {
  const where = { schoolId };
  if (statusFilter) where.status = statusFilter;

  return prisma.feeCorrectionRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      student: { include: { user: { select: { name: true } } } },
      auditor: { select: { name: true, role: true } },
      requestedBy: { select: { name: true, role: true } },
      reviewer: { select: { name: true } },
      fee: true,
      paymentHistory: true
    }
  });
};

/**
 * Principal resolves a correction request (APPROVED or REJECTED).
 *
 * Enforces:
 * - Requester cannot approve their own correction (self-approval forbidden).
 * - Multi-tenant isolation.
 * - Atomically updates Fee ledger, PaymentHistory, and logs AuditLog within a $transaction.
 */
exports.resolveFeeCorrection = async (id, resolution, user) => {
  const { status, notes } = resolution;
  const schoolId = user.schoolId;

  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw new Error("status must be APPROVED or REJECTED");
  }

  // 🔒 BOLA: verify request belongs to principal's school
  const request = await prisma.feeCorrectionRequest.findFirst({
    where: { id: Number(id), schoolId }
  });
  if (!request) throw new Error("Fee correction request not found");
  if (request.status !== "PENDING" && request.status !== "OPEN") {
    throw new Error("This request has already been resolved");
  }

  // 🔒 PREVENT SELF-APPROVAL: Requester cannot approve their own correction request
  if (request.auditorId === user.id || request.requestedById === user.id) {
    const err = new Error("Self-approval is forbidden: Requester cannot approve their own correction request");
    err.status = 403;
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    // 1. Update the correction request record
    const updated = await tx.feeCorrectionRequest.update({
      where: { id: Number(id) },
      data: {
        status,
        notes: notes || null,
        reviewedById: user.id,
        reviewedAt: new Date()
      }
    });

    // 2. If APPROVED and a fee record exists, adjust the ledger
    if (status === "APPROVED" && request.feeId) {
      const fee = await tx.fee.findUnique({ where: { id: request.feeId } });
      if (!fee) throw new Error("Linked fee record not found");

      const correctionAmount = Number(request.amount);
      const newPaidAmount = Math.max(0, fee.paidAmount + correctionAmount);
      const newPendingAmount = Math.max(0, fee.totalFee - newPaidAmount);
      const newStatus =
        newPendingAmount === 0 ? "PAID" :
        newPaidAmount > 0 ? "PARTIAL" : "PENDING";

      await tx.fee.update({
        where: { id: request.feeId },
        data: {
          paidAmount: newPaidAmount,
          pendingAmount: newPendingAmount,
          paymentStatus: newStatus,
          updatedAt: new Date()
        }
      });

      // Create a PaymentHistory record as a ledger entry
      await tx.paymentHistory.create({
        data: {
          feeId: request.feeId,
          schoolId,
          amount: correctionAmount,
          updatedBy: user.id,
          remarks: `Fee Correction approved by principal — Reason: ${request.reason}`
        }
      });

      // 3. Create AuditLog entry
      try {
        await tx.auditLog.create({
          data: {
            schoolId,
            module: "FEE",
            actionType: "UPDATE",
            entityId: fee.id,
            entityType: "Fee",
            oldData: { paidAmount: fee.paidAmount, pendingAmount: fee.pendingAmount, status: fee.paymentStatus },
            newData: { paidAmount: newPaidAmount, pendingAmount: newPendingAmount, status: newStatus },
            changedBy: user.id,
            changedByRole: user.role || "principal",
            revokeExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        });
      } catch (_) {}
    }

    return updated;
  });
};
