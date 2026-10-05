const prisma = require("../../config/prisma");
const { captureAuditLog } = require("../../utils/auditLogger");
const xlsx = require("xlsx");
const fs = require("fs");

// ─── BULK UPLOAD FEES ────────────────────────────────────────────────────────
exports.bulkUpload = async (file, user) => {

  const schoolId = user.schoolId;

  const workbook = xlsx.readFile(file.path);
  const sheetName = workbook.SheetNames[0];
  const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const results = {
    total: sheetData.length,
    success: 0,
    failed: 0,
    errors: []
  };

  // 🔥 OPTIMIZATION: Map students by userCode (O(1) lookup)
  const allStudents = await prisma.student.findMany({
    where: { schoolId, isDeleted: false },
    include: { user: true }
  });

  const studentMap = {};
  allStudents.forEach(s => {
    studentMap[String(s.user.userCode)] = s;
  });

  for (let i = 0; i < sheetData.length; i++) {

    const row = sheetData[i];
    const rowNum = i + 2;

    try {

      const { StudentCode, TotalFee, PaidAmount, DueDate } = row;

      // 🔹 Required validation
      if (!StudentCode || TotalFee === undefined || !DueDate) {
        throw new Error("Missing required fields");
      }

      const student = studentMap[String(StudentCode)];
      if (!student) {
        throw new Error(`Student ${StudentCode} not found`);
      }

      // 🔹 Numeric validation
      const total = Number(TotalFee);
      if (isNaN(total) || total <= 0) {
        throw new Error("Invalid TotalFee");
      }

      const paid = Number(PaidAmount) || 0;
      if (paid < 0) {
        throw new Error("Invalid PaidAmount");
      }

      if (paid > total) {
        throw new Error("PaidAmount cannot exceed TotalFee");
      }

      // 🔹 Date validation
      const due = new Date(DueDate);
      if (isNaN(due.getTime())) {
        throw new Error("Invalid DueDate");
      }

      // 🔹 Duplicate check
      const exists = await prisma.fee.findFirst({
        where: {
          studentId: student.id,
          schoolId,
          isDeleted: false
        }
      });

      if (exists) {
        throw new Error("Fee already exists");
      }

      const pending = total - paid;

      let status = "PENDING";
      if (pending <= 0) status = "PAID";
      else if (paid > 0) status = "PARTIAL";

      const feeData = {
        schoolId,
        studentId: student.id,
        studentName: student.user.name,

        // ✅ FIXED
        classId: student.classId,

        totalFee: total,
        paidAmount: paid,
        pendingAmount: pending,
        paymentStatus: status,
        dueDate: due
      };

      await captureAuditLog({
        modelName: "fee",
        entityId: 0,
        actionType: "CREATE",
        oldData: null,
        newData: feeData,
        user,
        module: "FEE_MODULE"
      });

      results.success++;

    } catch (err) {
      results.failed++;
      results.errors.push(`Row ${rowNum}: ${err.message}`);
    }
  }

  // 🔥 Safe cleanup
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (_) { }

  return results;
};

// ─── UPDATE PAYMENT MANUALLY ────────────────────────────────────────
exports.updatePayment = async (feeId, data, user) => {

  const schoolId = user.schoolId;

  return prisma.$transaction(async (tx) => {

    const fee = await tx.fee.findFirst({
      where: {
        id: Number(feeId),
        schoolId,
        isDeleted: false
      }
    });

    if (!fee) throw new Error("Fee record not found");

    const amount = Number(data.amount);

    if (isNaN(amount) || amount <= 0) {
      throw new Error("Invalid payment amount");
    }

    if (amount > fee.pendingAmount) {
      throw new Error("Amount exceeds pending");
    }

    // 🔹 Validate online / offline
    if (!["ONLINE", "OFFLINE"].includes(data.paymentMode)) {
      throw new Error("Invalid payment mode");
    }

    let utrNumber = null;
    let transactionId = null;

    if (data.paymentMode === "ONLINE") {
      if (!data.utrNumber) throw new Error("UTR Number is required for online payments");
      
      const utrExists = await tx.paymentHistory.findUnique({
        where: { utrNumber: data.utrNumber }
      });
      if (utrExists) throw new Error("UTR Number already used");
      
      utrNumber = data.utrNumber;
    } else {
      transactionId = "TXN" + Date.now() + Math.floor(Math.random() * 1000);
    }

    const newPaid = fee.paidAmount + amount;
    const newPending = fee.pendingAmount - amount;

    const newStatus =
      newPending <= 0 ? "PAID" :
        newPaid > 0 ? "PARTIAL" : "PENDING";

    const updatedFee = await tx.fee.update({
      where: { id: fee.id },
      data: {
        paidAmount: newPaid,
        pendingAmount: newPending,
        paymentStatus: newStatus
      }
    });

    await tx.paymentHistory.create({
      data: {
        feeId: fee.id,
        schoolId,
        amount,
        updatedBy: user.id,
        paymentMode: data.paymentMode,
        utrNumber,
        transactionId,
        remarks: data.remarks || "Fee payment"
      }
    });

    return updatedFee;
  });
};

// ─── GET ALL FEES (ANALYTICS & LIST) ────────────────────────────────────────
exports.getAllFees = async (schoolId, filters = {}) => {

  const where = {
    schoolId,
    isDeleted: false
  };

  if (filters.classId && filters.classId !== "All") {
    where.classId = Number(filters.classId);
  }

  if (filters.status && filters.status !== "All") {
    where.paymentStatus = filters.status;
  }

  if (filters.feeType && filters.feeType !== "All") {
    where.feeType = filters.feeType;
  }

  if (filters.minAmount !== undefined && filters.minAmount !== "") {
    where.totalFee = { ...where.totalFee, gte: Number(filters.minAmount) };
  }

  if (filters.maxAmount !== undefined && filters.maxAmount !== "") {
    where.totalFee = { ...where.totalFee, lte: Number(filters.maxAmount) };
  }

  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.max(1, parseInt(filters.limit) || 50);
  const skip = (page - 1) * limit;

  const [fees, totalCount, aggregations, overdueCount, statusGroups] =
    await Promise.all([

      prisma.fee.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,

        include: {
          // 🔥 ADD CLASS RELATION
          class: { select: { name: true } },

          payments: {
            where: { isDeleted: false },
            orderBy: { paymentDate: "desc" },
            take: 5,
            include: {
              user: { select: { name: true, role: true } }
            }
          }
        }
      }),

      prisma.fee.count({ where }),

      prisma.fee.aggregate({
        where,
        _sum: {
          paidAmount: true,
          pendingAmount: true
        }
      }),

      prisma.fee.count({
        where: {
          ...where,
          dueDate: { lt: new Date() },
          pendingAmount: { gt: 0 }
        }
      }),

      prisma.fee.groupBy({
        by: ["paymentStatus"],
        where,
        _count: { id: true }
      })
    ]);

  const statusMap = { PAID: 0, PARTIAL: 0, PENDING: 0 };

  statusGroups.forEach(g => {
    statusMap[g.paymentStatus] = g._count.id;
  });

  return {
    fees,
    analytics: {
      totalCollected: aggregations._sum.paidAmount || 0,
      totalPending: aggregations._sum.pendingAmount || 0,
      fullyPaid: statusMap.PAID,
      partiallyPaid: statusMap.PARTIAL,
      pending: statusMap.PENDING,
      overdue: overdueCount
    },
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit)
    }
  };
};

// ─── GET STUDENT FEES (STUDENT DASHBOARD) ──────────────────────────────────
exports.getMyFees = async (user) => {

  const student = await prisma.student.findFirst({
    where: {
      userId: user.id,
      isDeleted: false
    }
  });

  if (!student) throw new Error("Student profile not found");

  return prisma.fee.findMany({
    where: {
      studentId: student.id,
      schoolId: user.schoolId,   // 🔥 SECURITY FIX
      isDeleted: false
    },

    include: {
      // 🔥 ADD CLASS
      class: { select: { name: true } },

      payments: {
        where: { isDeleted: false },
        orderBy: { paymentDate: "desc" },
        include: {
          user: { select: { name: true } }
        }
      }
    },

    orderBy: { createdAt: "desc" }
  });
};
// ─── ASSIGN FEE (CLASS or STUDENT) ──────────────────────────────────────────
exports.assignFee = async (data, user) => {

  const { type, target, totalFee, feeType, dueDate } = data;

  const amount = Number(totalFee);
  if (isNaN(amount) || amount <= 0) {
    throw new Error("Invalid total fee");
  }

  const due = new Date(dueDate);
  if (isNaN(due.getTime())) {
    throw new Error("Invalid due date");
  }

  return prisma.$transaction(async (tx) => {
    let students = [];

    if (type === "CLASS") {
      const classId = Number(target);
      const classData = await tx.classConfig.findFirst({
        where: { id: classId, schoolId: user.schoolId, status: "ACTIVE" }
      });
      if (!classData) throw new Error("Invalid class");

      students = await tx.student.findMany({
        where: { schoolId: user.schoolId, classId, isDeleted: false },
        include: { user: true }
      });
      if (students.length === 0) throw new Error("No students found in this class");

    } else if (type === "SCHOOL") {
      students = await tx.student.findMany({
        where: { schoolId: user.schoolId, isDeleted: false },
        include: { user: true }
      });
      if (students.length === 0) throw new Error("No students found in this school");

    } else if (type === "STUDENT") {
      const student = await tx.student.findFirst({
        where: { id: Number(target), schoolId: user.schoolId, isDeleted: false },
        include: { user: true }
      });
      if (!student) throw new Error("Student not found");
      students = [student];
    } else {
      throw new Error("Invalid assignment type");
    }

    // 2. Fetch existing fees for these students
    const existingFees = await tx.fee.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: { in: students.map(s => s.id) },
        feeType: feeType || "Tuition",
        isDeleted: false
      }
    });

    const existingMap = new Map(existingFees.map(f => [f.studentId, f]));
    const newFeeRecords = [];

    // 3. Process each student
    for (const s of students) {
      const existing = existingMap.get(s.id);

      if (existing) {
        // INCREASE the existing fee instead of throwing duplicate error
        const newTotal = existing.totalFee + amount;
        const newPending = existing.pendingAmount + amount;
        const newStatus = existing.paidAmount >= newTotal ? "PAID" : existing.paidAmount > 0 ? "PARTIAL" : "PENDING";
        
        await tx.fee.update({
          where: { id: existing.id },
          data: {
            totalFee: newTotal,
            pendingAmount: newPending,
            paymentStatus: newStatus,
            dueDate: due // Extend due date
          }
        });
      } else {
        // CREATE new fee
        newFeeRecords.push({
          schoolId: user.schoolId,
          studentId: s.id,
          studentName: s.user.name,
          classId: s.classId,
          totalFee: amount,
          pendingAmount: amount,
          feeType: feeType || "Tuition",
          dueDate: due,
          paymentStatus: "PENDING"
        });
      }
    }

    // 4. Insert new records in bulk
    if (newFeeRecords.length > 0) {
      await tx.fee.createMany({
        data: newFeeRecords
      });
    }

    return true;
  });
};

// ─── GET RECEIPT ────────────────────────────────────────────────────────────
exports.getReceipt = async (paymentId, user) => {
  const payment = await prisma.paymentHistory.findFirst({
    where: {
      id: Number(paymentId),
      schoolId: user.schoolId,
      isDeleted: false
    },
    include: {
      fee: {
        include: {
          class: { select: { name: true } }
        }
      },
      school: { select: { name: true } }
    }
  });

  if (!payment) throw new Error("Payment record not found");

  return {
    studentName: payment.fee.studentName,
    className: payment.fee.class.name,
    feeType: payment.fee.feeType,
    totalFee: payment.fee.totalFee,
    paidAmount: payment.amount,
    paymentMode: payment.paymentMode,
    utrNumber: payment.utrNumber,
    transactionId: payment.transactionId,
    paymentDate: payment.paymentDate,
    schoolName: payment.school.name
  };
};
