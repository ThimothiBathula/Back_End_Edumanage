const prisma = require("../../config/prisma");
const featureService = require("../feature/feature.service");
const { FEATURES } = require("../../constants/features");

/**
 * Resolve active academic year for a school.
 */
async function getActiveAcademicYear(schoolId, tx = prisma) {
  return tx.academicYear.findFirst({
    where: { schoolId: Number(schoolId), status: "ACTIVE" },
    select: { id: true, name: true }
  });
}

/**
 * Mentor submits a request to update or correct a student's fee.
 * Mentors CANNOT directly alter fees; it must pass through the Fee Auditor.
 *
 * @param {object} data - { studentId, feeId, requestType, amount, proposedTotalFee, reason, notes }
 * @param {object} user - Authenticated mentor user
 */
async function createFeeUpdateRequest(data, user) {
  const schoolId = user.schoolId;
  const { studentId, feeId, requestType = "CORRECTION", amount, proposedTotalFee, reason, notes } = data;

  if (!studentId) throw new Error("studentId is required");
  if (!reason || !reason.trim()) throw new Error("A clear reason for the fee update is required");

  // 1. Feature Check: FEE_MENTOR_UPDATE_REQUEST
  const isFeatureOn = await featureService.isEnabled(schoolId, FEATURES.FEE_MENTOR_UPDATE_REQUEST);
  if (!isFeatureOn) {
    const err = new Error("Mentor fee update requests are currently disabled for your school.");
    err.status = 403;
    err.code = "FEATURE_DISABLED";
    throw err;
  }

  // 2. Fetch student and verify school tenant isolation
  const student = await prisma.student.findFirst({
    where: { id: Number(studentId), schoolId, isDeleted: false },
    include: {
      user: { select: { id: true, name: true, userCode: true } },
      class: { select: { id: true, name: true } }
    }
  });

  if (!student) {
    const err = new Error("Student not found in your school");
    err.status = 404;
    throw err;
  }

  // 3. Resolve active academic year
  const activeYear = await getActiveAcademicYear(schoolId);

  // 4. If user is a teacher, verify mentor assignment
  let mentorTeacherId = null;
  if (user.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.id }
    });
    if (!teacher || teacher.schoolId !== schoolId) {
      const err = new Error("Faculty profile not found");
      err.status = 403;
      throw err;
    }
    mentorTeacherId = teacher.id;

    const assignment = await prisma.classMentor.findFirst({
      where: {
        schoolId,
        classId: student.classId,
        teacherId: teacher.id,
        isActive: true,
        ...(activeYear && { academicYearId: activeYear.id })
      }
    });

    if (!assignment) {
      const err = new Error("Forbidden: You are only permitted to submit fee requests for students in your assigned mentored class.");
      err.status = 403;
      throw err;
    }
  }

  // 5. Fetch linked fee record if specified or find current active fee for student
  let feeRecord = null;
  if (feeId) {
    feeRecord = await prisma.fee.findFirst({
      where: { id: Number(feeId), studentId: student.id, schoolId, isDeleted: false }
    });
  } else {
    feeRecord = await prisma.fee.findFirst({
      where: { studentId: student.id, schoolId, isDeleted: false },
      orderBy: { createdAt: "desc" }
    });
  }

  if (!feeRecord) {
    const err = new Error("No active fee record found for this student");
    err.status = 404;
    throw err;
  }

  // 6. Snapshot current value and build proposed new value
  const oldValue = {
    feeId: feeRecord.id,
    totalFee: feeRecord.totalFee,
    paidAmount: feeRecord.paidAmount,
    pendingAmount: feeRecord.pendingAmount,
    paymentStatus: feeRecord.paymentStatus,
    feeType: feeRecord.feeType,
    dueDate: feeRecord.dueDate
  };

  const parsedAmount = amount !== undefined && amount !== null && amount !== "" ? Number(amount) : null;
  const parsedTotal = proposedTotalFee !== undefined && proposedTotalFee !== null && proposedTotalFee !== "" ? Number(proposedTotalFee) : null;

  const newValue = {
    requestType,
    amount: parsedAmount,
    proposedTotalFee: parsedTotal,
    reason,
    notes: notes || null
  };

  // 7. Create FeeUpdateRequest
  const newRequest = await prisma.feeUpdateRequest.create({
    data: {
      schoolId,
      academicYearId: activeYear ? activeYear.id : null,
      studentId: student.id,
      mentorId: mentorTeacherId,
      feeRecordId: feeRecord.id,
      requestType,
      oldValue,
      newValue,
      amount: parsedAmount,
      reason,
      notes: notes || null,
      status: "PENDING",
      requestedBy: user.id
    },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } },
          class: { select: { name: true } }
        }
      },
      fee: true,
      requester: { select: { id: true, name: true, role: true, email: true } }
    }
  });

  // 8. Capture Audit Log
  prisma.auditLog.create({
    data: {
      schoolId,
      module: "FEE",
      actionType: "CREATE",
      entityId: newRequest.id,
      entityType: "FeeUpdateRequest",
      oldData: null,
      newData: {
        requestId: newRequest.id,
        studentId: student.id,
        studentName: student.user.name,
        amount: parsedAmount,
        reason,
        status: "PENDING"
      },
      changedBy: user.id,
      changedByRole: user.role,
      revokeExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  }).catch(err => console.error("[AuditLog Error]", err.message));

  return newRequest;
}

/**
 * Fee Auditor / Principal retrieves all fee update requests with filtering.
 */
async function getFeeUpdateRequests(schoolId, filters = {}) {
  const sid = Number(schoolId);
  const where = { schoolId: sid };

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }
  if (filters.academicYearId) {
    where.academicYearId = Number(filters.academicYearId);
  }
  if (filters.classId) {
    where.student = { classId: Number(filters.classId) };
  }
  if (filters.studentId) {
    where.studentId = Number(filters.studentId);
  }
  if (filters.mentorId) {
    where.mentorId = Number(filters.mentorId);
  }

  const requests = await prisma.feeUpdateRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true, userCode: true } },
          class: { select: { id: true, name: true } }
        }
      },
      fee: true,
      mentor: {
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      },
      requester: { select: { id: true, name: true, role: true, email: true } },
      reviewer: { select: { id: true, name: true, role: true, email: true } }
    }
  });

  return requests;
}

/**
 * Mentor views their own submitted fee update requests.
 */
async function getMyFeeUpdateRequests(user) {
  const requests = await prisma.feeUpdateRequest.findMany({
    where: {
      schoolId: user.schoolId,
      requestedBy: user.id
    },
    orderBy: { createdAt: "desc" },
    include: {
      student: {
        include: {
          user: { select: { id: true, name: true, userCode: true } },
          class: { select: { id: true, name: true } }
        }
      },
      fee: true,
      reviewer: { select: { id: true, name: true, role: true, email: true } }
    }
  });

  return requests;
}

/**
 * Summary metrics for the Fee Auditor Dashboard.
 */
async function getFeeAuditStats(schoolId) {
  const sid = Number(schoolId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [pendingCount, approvedTodayCount, rejectedTodayCount, pendingRequests] = await Promise.all([
    prisma.feeUpdateRequest.count({
      where: { schoolId: sid, status: "PENDING" }
    }),
    prisma.feeUpdateRequest.count({
      where: {
        schoolId: sid,
        status: "APPROVED",
        reviewedAt: { gte: today }
      }
    }),
    prisma.feeUpdateRequest.count({
      where: {
        schoolId: sid,
        status: "REJECTED",
        reviewedAt: { gte: today }
      }
    }),
    prisma.feeUpdateRequest.findMany({
      where: { schoolId: sid, status: "PENDING" },
      select: { amount: true, oldValue: true, newValue: true }
    })
  ]);

  // Calculate total pending amount adjustments
  let pendingAmountChanges = 0;
  pendingRequests.forEach(r => {
    if (r.amount) {
      pendingAmountChanges += Math.abs(Number(r.amount));
    }
  });

  // Recent requests for quick dashboard feed
  const recentRequests = await prisma.feeUpdateRequest.findMany({
    where: { schoolId: sid },
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      student: {
        include: {
          user: { select: { name: true, userCode: true } },
          class: { select: { name: true } }
        }
      },
      requester: { select: { name: true } },
      reviewer: { select: { name: true } }
    }
  });

  return {
    pendingCount,
    approvedTodayCount,
    rejectedTodayCount,
    pendingAmountChanges,
    recentRequests
  };
}

/**
 * Fee Auditor / Principal approves or rejects a Mentor Fee Update Request.
 *
 * Runs inside a database $transaction:
 * - If APPROVED: updates the authoritative Fee ledger and logs PaymentHistory.
 * - If REJECTED: records reason and reviewer, leaving Fee record untouched.
 *
 * @param {number} requestId
 * @param {object} resolution - { status: "APPROVED"|"REJECTED", reviewComment: string }
 * @param {object} user - Authenticated fee auditor or principal
 */
async function resolveFeeUpdateRequest(requestId, resolution, user) {
  const schoolId = user.schoolId;
  const { status, reviewComment } = resolution;

  if (!["APPROVED", "REJECTED"].includes(status)) {
    throw new Error("Resolution status must be either APPROVED or REJECTED");
  }

  // Feature Check: FEE_AUDIT_APPROVAL
  const isFeatureOn = await featureService.isEnabled(schoolId, FEATURES.FEE_AUDIT_APPROVAL);
  if (!isFeatureOn) {
    const err = new Error("Fee audit approval workflow is currently disabled for your school.");
    err.status = 403;
    err.code = "FEATURE_DISABLED";
    throw err;
  }

  // BOLA & status verification
  const request = await prisma.feeUpdateRequest.findFirst({
    where: { id: Number(requestId), schoolId },
    include: {
      student: { include: { user: true } },
      fee: true
    }
  });

  if (!request) {
    const err = new Error("Fee update request not found in your school");
    err.status = 404;
    throw err;
  }

  if (request.status !== "PENDING") {
    const err = new Error(`Request has already been resolved with status: ${request.status}`);
    err.status = 400;
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    const reviewedAt = new Date();

    // 1. If REJECTED: Simply update the request and create audit log
    if (status === "REJECTED") {
      const updatedReq = await tx.feeUpdateRequest.update({
        where: { id: request.id },
        data: {
          status: "REJECTED",
          reviewedBy: user.id,
          reviewedAt,
          reviewComment: reviewComment || "Rejected by Fee Auditor"
        },
        include: {
          student: { include: { user: true } },
          requester: { select: { name: true, email: true } },
          reviewer: { select: { name: true, email: true } }
        }
      });

      prisma.auditLog.create({
        data: {
          schoolId,
          module: "FEE",
          actionType: "UPDATE",
          entityId: request.id,
          entityType: "FeeUpdateRequest",
          oldData: { status: "PENDING" },
          newData: { status: "REJECTED", reviewedBy: user.id, reason: reviewComment },
          changedBy: user.id,
          changedByRole: user.role,
          revokeExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      }).catch(err => console.error("[AuditLog Error]", err.message));

      return updatedReq;
    }

    // 2. If APPROVED: Atomically apply changes to the authoritative Fee record
    if (!request.feeRecordId) {
      throw new Error("Cannot approve request: No fee record linked to this request");
    }

    const currentFee = await tx.fee.findUnique({
      where: { id: request.feeRecordId }
    });

    if (!currentFee || currentFee.schoolId !== schoolId || currentFee.isDeleted) {
      throw new Error("Linked fee record is no longer available in this school");
    }

    let newTotalFee = currentFee.totalFee;
    let newPaidAmount = currentFee.paidAmount;
    const correctionAmount = request.amount ? Number(request.amount) : 0;
    const proposedTotal = request.newValue?.proposedTotalFee ? Number(request.newValue.proposedTotalFee) : null;

    if (request.requestType === "WAIVER" || request.requestType === "DISCOUNT") {
      // Waiver reduces total fee
      if (proposedTotal !== null && proposedTotal > 0) {
        newTotalFee = proposedTotal;
      } else if (correctionAmount > 0) {
        newTotalFee = Math.max(0, currentFee.totalFee - correctionAmount);
      }
    } else {
      // CORRECTION: adds or adjusts paidAmount
      newPaidAmount = Math.max(0, currentFee.paidAmount + correctionAmount);
      if (proposedTotal !== null && proposedTotal > 0) {
        newTotalFee = proposedTotal;
      }
    }

    const newPendingAmount = Math.max(0, newTotalFee - newPaidAmount);
    const newPaymentStatus =
      newPendingAmount === 0 ? "PAID" :
      newPaidAmount > 0 ? "PARTIAL" : "PENDING";

    // Update Fee ledger
    await tx.fee.update({
      where: { id: currentFee.id },
      data: {
        totalFee: newTotalFee,
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        paymentStatus: newPaymentStatus,
        updatedAt: new Date()
      }
    });

    // Record PaymentHistory entry for financial reconciliation
    await tx.paymentHistory.create({
      data: {
        feeId: currentFee.id,
        schoolId,
        amount: correctionAmount,
        updatedBy: user.id,
        paymentMode: "OFFLINE",
        remarks: `[Fee Audit Approved] Type: ${request.requestType}. Reason: ${request.reason}. Notes: ${reviewComment || "N/A"}`
      }
    });

    // Update FeeUpdateRequest status
    const updatedReq = await tx.feeUpdateRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedBy: user.id,
        reviewedAt,
        reviewComment: reviewComment || "Approved by Fee Auditor"
      },
      include: {
        student: { include: { user: true } },
        requester: { select: { name: true, email: true } },
        reviewer: { select: { name: true, email: true } }
      }
    });

    // Capture Audit Log
    prisma.auditLog.create({
      data: {
        schoolId,
        module: "FEE",
        actionType: "UPDATE",
        entityId: request.id,
        entityType: "FeeUpdateRequest",
        oldData: {
          status: "PENDING",
          feeState: {
            totalFee: currentFee.totalFee,
            paidAmount: currentFee.paidAmount,
            pendingAmount: currentFee.pendingAmount,
            paymentStatus: currentFee.paymentStatus
          }
        },
        newData: {
          status: "APPROVED",
          reviewedBy: user.id,
          feeState: {
            totalFee: newTotalFee,
            paidAmount: newPaidAmount,
            pendingAmount: newPendingAmount,
            paymentStatus: newPaymentStatus
          }
        },
        changedBy: user.id,
        changedByRole: user.role,
        revokeExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    }).catch(err => console.error("[AuditLog Error]", err.message));

    return updatedReq;
  });
}

module.exports = {
  createFeeUpdateRequest,
  getFeeUpdateRequests,
  getMyFeeUpdateRequests,
  getFeeAuditStats,
  resolveFeeUpdateRequest
};
