/**
 * Comprehensive Test Suite for Production Features:
 * 1. Fee Auditor Role & Mentor Fee Update Approval Workflow
 * 2. AI Parent Calling Telephony Lifecycle & Outcome Detection
 * 3. Duplicate Call Idempotency Protection
 * 4. Authoritative Fee Information in Calling
 * 5. Phone Number Masking & Data Privacy
 * 6. Mentor Parent Communication Dashboard
 * 7. Super Admin Cross-School Analytics & Usage
 */

const prisma = require("./config/prisma");
const feeAuditService = require("./modules/feeAudit/feeAudit.service");
const callingService = require("./modules/calling/calling.service");

async function withRetry(fn, retries = 3, delay = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries || !err.message?.includes("Can't reach database server")) throw err;
      console.log(`   [Retry attempt ${attempt}] Transient DB connection error, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function runTests() {
  console.log("================================================================");
  console.log("🚀 STARTING PRODUCTION FEATURE VERIFICATION TEST SUITE");
  console.log("================================================================\n");

  let testSchool;
  let testClass;
  let testTeacher;
  let testTeacherUser;
  let testAuditorUser;
  let testStudent;
  let testStudentUser;
  let testFee;
  let testAcademicYear;

  try {
    // ── Setup Test Data ──────────────────────────────────────────────────────
    console.log("1. Setting up test environment...");
    testSchool = await prisma.school.findFirst({ where: { status: "ACTIVE" } });
    if (!testSchool) {
      testSchool = await prisma.school.create({
        data: {
          name: "St. Xavier's International",
          code: "STXAV_" + Date.now(),
          location: "Hyderabad"
        }
      });
    }

    testAcademicYear = await prisma.academicYear.findFirst({
      where: { schoolId: testSchool.id, status: "ACTIVE" }
    });
    if (!testAcademicYear) {
      testAcademicYear = await prisma.academicYear.create({
        data: {
          schoolId: testSchool.id,
          name: "2026-2027",
          startDate: new Date("2026-04-01"),
          endDate: new Date("2027-03-31"),
          status: "ACTIVE"
        }
      });
    }

    testClass = await prisma.classConfig.findFirst({
      where: { schoolId: testSchool.id }
    });
    if (!testClass) {
      testClass = await prisma.classConfig.create({
        data: {
          schoolId: testSchool.id,
          className: "Grade 10",
          section: "A"
        }
      });
    }

    // Teacher & Mentor
    const ts = Date.now();
    testTeacherUser = await prisma.user.create({
      data: {
        schoolId: testSchool.id,
        email: `mentor_${ts}@school.com`,
        password: "hashed_password",
        role: "teacher",
        name: "Professor Sharma",
        userCode: `TEA_${ts}`
      }
    });

    testTeacher = await prisma.teacher.create({
      data: {
        userId: testTeacherUser.id,
        schoolId: testSchool.id,
        phone: "9876543210",
        qualification: "M.Sc B.Ed",
        subjects: "Mathematics"
      }
    });

    // Assign as Class Mentor
    await prisma.classMentor.create({
      data: {
        schoolId: testSchool.id,
        academicYearId: testAcademicYear.id,
        classId: testClass.id,
        teacherId: testTeacher.id,
        isActive: true
      }
    });

    // Auditor User
    testAuditorUser = await prisma.user.create({
      data: {
        schoolId: testSchool.id,
        email: `auditor_${ts}@school.com`,
        password: "hashed_password",
        role: "fee_auditor",
        name: "Auditor Ramanathan",
        userCode: `AUD_${ts}`
      }
    });

    // Student & Parent
    testStudentUser = await prisma.user.create({
      data: {
        schoolId: testSchool.id,
        email: `student_${ts}@school.com`,
        password: "hashed_password",
        role: "student",
        name: "Arjun Verma",
        userCode: `STU_${ts}`
      }
    });

    testStudent = await prisma.student.create({
      data: {
        userId: testStudentUser.id,
        schoolId: testSchool.id,
        classId: testClass.id,
        dob: new Date("2011-05-15"),
        fatherName: "Rajesh Verma",
        motherName: "Sunita Verma",
        phone: "+91 98765 43210"
      }
    });

    // Student Fee
    testFee = await prisma.fee.create({
      data: {
        schoolId: testSchool.id,
        studentId: testStudent.id,
        studentName: "Arjun Verma",
        classId: testClass.id,
        totalFee: 50000,
        paidAmount: 20000,
        pendingAmount: 30000,
        paymentStatus: "PARTIAL",
        feeType: "Tuition Fee",
        dueDate: new Date("2026-10-15")
      }
    });

    console.log("   ✓ Test environment initialized successfully.");

    // ── Test 1: Mentor Submits Fee Update Request ─────────────────────────────
    console.log("\n2. Testing Mentor Fee Update Request Workflow...");
    const feeRequest = await feeAuditService.createFeeUpdateRequest(
      {
        studentId: testStudent.id,
        feeId: testFee.id,
        requestType: "DISCOUNT",
        amount: 5000,
        reason: "Merit scholarship discount recommended by Principal",
        notes: "Student secured rank 1 in Olympiad"
      },
      testTeacherUser
    );

    console.log(`   ✓ Request #${feeRequest.id} created with status: ${feeRequest.status}`);
    if (feeRequest.status !== "PENDING") throw new Error("Expected status PENDING");

    // Verify Fee record is NOT yet touched
    const feeBeforeApproval = await withRetry(() => prisma.fee.findUnique({ where: { id: testFee.id } }));
    if (feeBeforeApproval.totalFee !== 50000 || feeBeforeApproval.pendingAmount !== 30000) {
      throw new Error("Fee record was modified prematurely before audit approval!");
    }
    console.log("   ✓ Fee record remained protected and unmutated prior to approval.");

    // ── Test 2: Fee Auditor Reviews & Approves Request ────────────────────────
    console.log("\n3. Testing Fee Auditor Approval...");
    const approvalResult = await withRetry(() => feeAuditService.resolveFeeUpdateRequest(
      feeRequest.id,
      {
        status: "APPROVED",
        reviewComment: "Approved merit scholarship as per documentation."
      },
      testAuditorUser
    ));

    console.log(`   ✓ Request resolved: ${approvalResult.status}`);
    if (approvalResult.status !== "APPROVED") throw new Error("Expected status APPROVED");

    // Verify atomic fee update inside transaction
    const feeAfterApproval = await withRetry(() => prisma.fee.findUnique({ where: { id: testFee.id } }));
    console.log(`   ✓ Updated Fee: Total=${feeAfterApproval.totalFee}, Paid=${feeAfterApproval.paidAmount}, Pending=${feeAfterApproval.pendingAmount}`);
    if (feeAfterApproval.totalFee !== 45000 || feeAfterApproval.pendingAmount !== 25000) {
      throw new Error("Fee ledger was not correctly recalculated on approval!");
    }

    // ── Test 3: AI Calling Absence Notification ──────────────────────────────
    console.log("\n4. Testing AI Parent Calling (Absence Notification)...");
    const call1 = await callingService.initiateCall({
      schoolId: testSchool.id,
      studentId: testStudent.id,
      callPurpose: "ABSENCE_NOTIFICATION",
      initiatedByUserId: testTeacherUser.id
    });

    console.log(`   ✓ Call status: ${call1.callRecord?.callStatus}, outcome: ${call1.callRecord?.outcome}`);
    console.log(`   ✓ Call duration: ${call1.callRecord?.duration}s, cost: ₹${call1.callRecord?.cost}`);
    if (call1.isQueued) {
      console.log("   ✓ Call queued outside calling hours (after 18:00) as expected by policy.");
    } else if (!call1.callRecord?.transcript?.includes("Arjun Verma")) {
      throw new Error("Transcript missing student context!");
    } else {
      console.log("   ✓ Realistic multi-turn AI transcript generated successfully.");
    }

    // ── Test 4: Duplicate Call Protection (Idempotency) ───────────────────────
    console.log("\n5. Testing Duplicate Call Protection...");
    const callDuplicate = await callingService.initiateCall({
      schoolId: testSchool.id,
      studentId: testStudent.id,
      callPurpose: "ABSENCE_NOTIFICATION",
      initiatedByUserId: testTeacherUser.id
    });

    console.log(`   ✓ Duplicate detected: ${callDuplicate.isDuplicate}`);
    console.log(`   ✓ Message: ${callDuplicate.message}`);
    if (!callDuplicate.isDuplicate) {
      throw new Error("Duplicate call was NOT prevented!");
    }

    // ── Test 5: AI Fee Reminder Calling ──────────────────────────────────────
    console.log("\n6. Testing Authoritative Fee Reminder Calling...");
    const feeCall = await callingService.initiateCall({
      schoolId: testSchool.id,
      studentId: testStudent.id,
      callPurpose: "FEE_PAYMENT_REMINDER",
      metadata: {
        feeId: testFee.id,
        pendingAmount: feeAfterApproval.pendingAmount,
        dueDate: testFee.dueDate
      },
      initiatedByUserId: testTeacherUser.id
    });

    console.log(`   ✓ Fee Call Status: ${feeCall.callRecord?.callStatus}, Outcome: ${feeCall.callRecord?.outcome}`);
    if (feeCall.isQueued) {
      console.log("   ✓ Fee call queued outside calling hours (after 18:00) as expected by policy.");
    } else if (!feeCall.callRecord?.transcript?.includes("₹25,000")) {
      throw new Error("Fee call transcript did not use authoritative pending balance!");
    } else {
      console.log("   ✓ Authoritative fee balance retrieved and articulated in call.");
    }

    // ── Test 6: Phone Number Masking & Privacy ───────────────────────────────
    console.log("\n7. Testing Data Privacy & Phone Masking...");
    const masked = callingService.maskPhoneNumber("+91 98765 43210");
    console.log(`   ✓ Raw: +91 98765 43210  -->  Masked: ${masked}`);
    if (masked.includes("765") || masked.includes("432")) {
      throw new Error("Phone number was not properly masked!");
    }

    // ── Test 7: Mentor Parent Communication Dashboard ────────────────────────
    console.log("\n8. Testing Mentor Communication Dashboard...");
    const mentorDash = await callingService.getMentorCommunicationDashboard(testTeacherUser.id, testSchool.id);
    console.log("   ✓ Mentor assigned classes:", mentorDash.assignedClasses);
    console.log("   ✓ Mentor stats:", mentorDash.stats);
    if (!mentorDash.isMentor) throw new Error("Expected isMentor to be true");

    // ── Test 8: Super Admin Cross-School Analytics ───────────────────────────
    console.log("\n9. Testing Super Admin Cross-School Analytics...");
    const superAdminUsage = await callingService.getSuperAdminCallUsage({ schoolId: testSchool.id });
    console.log("   ✓ Super Admin Overview:", superAdminUsage.overview);
    console.log(`   ✓ School rows found: ${superAdminUsage.schools.length}`);
    if (superAdminUsage.schools.length === 0) throw new Error("Expected at least 1 school in usage stats");

    console.log("\n================================================================");
    console.log("🎉 ALL PRODUCTION FEATURE TESTS PASSED SUCCESSFULLY!");
    console.log("================================================================\n");
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  } finally {
    // Cleanup temporary test records
    try {
      if (testFee) await prisma.callRecord.deleteMany({ where: { studentId: testStudent.id } });
      if (testFee) await prisma.feeUpdateRequest.deleteMany({ where: { studentId: testStudent.id } });
      if (testFee) await prisma.paymentHistory.deleteMany({ where: { feeId: testFee.id } });
      if (testFee) await prisma.fee.delete({ where: { id: testFee.id } }).catch(() => {});
      if (testStudent) await prisma.student.delete({ where: { id: testStudent.id } }).catch(() => {});
      if (testStudentUser) await prisma.user.delete({ where: { id: testStudentUser.id } }).catch(() => {});
      if (testTeacher) await prisma.classMentor.deleteMany({ where: { teacherId: testTeacher.id } });
      if (testTeacher) await prisma.teacher.delete({ where: { id: testTeacher.id } }).catch(() => {});
      if (testTeacherUser) await prisma.user.delete({ where: { id: testTeacherUser.id } }).catch(() => {});
      if (testAuditorUser) await prisma.user.delete({ where: { id: testAuditorUser.id } }).catch(() => {});
    } catch {
      // Ignore cleanup error
    }
    await prisma.$disconnect();
  }
}

runTests();
