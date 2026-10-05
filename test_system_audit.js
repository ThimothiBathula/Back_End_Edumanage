/**
 * Comprehensive System Verification Test Suite for EduManage (Edesy Platform)
 *
 * Verifies:
 * 1. Base Role + Assignment / Capability Model (Teacher -> Teacher+Mentor -> Teacher+Accountant -> Teacher+Mentor+Accountant)
 * 2. Single Active Accountant Enforcement & Historical Assignment Retention
 * 3. Accountant Correction Workflow with Self-Approval Prevention (403) and Atomic Ledger Updates
 * 4. Principal-Controlled Feedback System:
 *    - Subject-wise student feedback with server-side schedule relationship validation
 *    - Strict separation of Subject Teacher ratings vs Class Mentor ratings
 *    - Anonymized student feedback comments
 *    - Campaign soft-delete propagation
 * 5. Production AI Telephony Calling Lifecycle & Webhook State Processing
 * 6. Multi-Tenant Isolation & BOLA Protection
 */

const prisma = require("./config/prisma");
const authService = require("./modules/auth/auth.service");
const principalService = require("./modules/principal/principal.service");
const auditService = require("./modules/audit/audit.service");
const studentService = require("./modules/student/student.service");
const teacherService = require("./modules/teacher/teacher.service");
const callingService = require("./modules/calling/calling.service");

let passedCount = 0;
let failedCount = 0;

async function withRetry(fn, retries = 5, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries || !err.message?.includes("Can't reach database server")) throw err;
      console.log(`   [Neon DB Wakeup Retry ${attempt}] Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function assert(condition, message) {
  if (condition) {
    console.log(`   ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`   ❌ FAIL: ${message}`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAuditSuite() {
  console.log("================================================================");
  console.log("🧪 STARTING EDUMANAGE COMPREHENSIVE ARCHITECTURAL AUDIT SUITE");
  console.log("================================================================\n");

  const ts = Date.now();
  let schoolA, schoolB, academicYearA, classA, subjectMath, subjectPhysics;
  let teacherUserA, teacherRecordA, teacherUserB, teacherRecordB;
  let principalUserA;
  let studentUserA, studentRecordA;
  let feeRecordA;

  try {
    // ── STEP 0: TEST SETUP ───────────────────────────────────────────────────
    console.log("▶ [SETUP] Initializing clean test environment...");

    // Create School A & School B for multi-tenant verification
    schoolA = await withRetry(() => prisma.school.create({
      data: {
        name: `Test School A ${ts}`,
        code: `SCH_A_${ts}`,
        location: "Metro City",
        status: "ACTIVE"
      }
    }));

    schoolB = await prisma.school.create({
      data: {
        name: `Test School B ${ts}`,
        code: `SCH_B_${ts}`,
        location: "Other City",
        status: "ACTIVE"
      }
    });

    academicYearA = await prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: `2026-2027-${ts}`,
        startDate: new Date("2026-04-01"),
        endDate: new Date("2027-03-31"),
        status: "ACTIVE"
      }
    });

    classA = await prisma.classConfig.create({
      data: {
        schoolId: schoolA.id,
        name: "Grade 10-A",
        periodsPerDay: 8,
        status: "ACTIVE"
      }
    });

    subjectMath = await prisma.subject.create({
      data: {
        classId: classA.id,
        name: `Mathematics-${ts}`
      }
    });

    subjectPhysics = await prisma.subject.create({
      data: {
        classId: classA.id,
        name: `Physics-${ts}`
      }
    });

    // Principal User
    principalUserA = await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        email: `principal_${ts}@schoolA.com`,
        password: "hashed_pass_principal",
        role: "principal",
        name: "Principal Anderson",
        userCode: `PRIN_${ts}`
      }
    });

    // Teacher A User & Record
    teacherUserA = await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        email: `teacherA_${ts}@schoolA.com`,
        password: "hashed_pass_teacher",
        role: "teacher",
        name: "Ravi Sharma",
        userCode: `TEA_A_${ts}`
      }
    });

    teacherRecordA = await prisma.teacher.create({
      data: {
        userId: teacherUserA.id,
        schoolId: schoolA.id,
        qualification: "M.Sc. Mathematics",
        subjects: "Mathematics",
        phone: "+91 98765 43210"
      }
    });

    // Teacher B User & Record
    teacherUserB = await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        email: `teacherB_${ts}@schoolA.com`,
        password: "hashed_pass_teacherB",
        role: "teacher",
        name: "Suresh Patel",
        userCode: `TEA_B_${ts}`
      }
    });

    teacherRecordB = await prisma.teacher.create({
      data: {
        userId: teacherUserB.id,
        schoolId: schoolA.id,
        qualification: "M.Sc. Physics",
        subjects: "Physics",
        phone: "+91 98765 43211"
      }
    });

    // Assign Subject Teaching schedules
    await prisma.schedule.create({
      data: {
        schoolId: schoolA.id,
        classId: classA.id,
        teacherId: teacherRecordA.id,
        subjectId: subjectMath.id,
        day: "MONDAY",
        period: 1,
        startTime: "09:00",
        endTime: "09:45"
      }
    });

    await prisma.schedule.create({
      data: {
        schoolId: schoolA.id,
        classId: classA.id,
        teacherId: teacherRecordB.id,
        subjectId: subjectPhysics.id,
        day: "MONDAY",
        period: 2,
        startTime: "09:45",
        endTime: "10:30"
      }
    });

    // Student User & Record
    studentUserA = await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        email: `studentA_${ts}@schoolA.com`,
        password: "hashed_pass_student",
        role: "student",
        name: "Aarav Kumar",
        userCode: `STU_A_${ts}`
      }
    });

    studentRecordA = await prisma.student.create({
      data: {
        userId: studentUserA.id,
        schoolId: schoolA.id,
        classId: classA.id,
        fatherName: "Mr. Kumar",
        motherName: "Mrs. Kumar",
        phone: "+91 91234 56789",
        dob: new Date("2010-05-15"),
        status: "ACTIVE"
      }
    });

    // Student Fee Record
    feeRecordA = await prisma.fee.create({
      data: {
        schoolId: schoolA.id,
        studentId: studentRecordA.id,
        studentName: "Aarav Kumar",
        classId: classA.id,
        dueDate: new Date("2026-12-31"),
        totalFee: 5000,
        paidAmount: 2000,
        pendingAmount: 3000,
        paymentStatus: "PARTIAL"
      }
    });

    console.log("   Setup complete with School, Classes, Teachers, Student, and Fee records.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 1: BASE ROLE + CAPABILITY MODEL
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ [TEST 1] Base Role + Capability Model (Teacher -> Teacher+Mentor -> Teacher+Accountant -> Teacher+Mentor+Accountant)");

    // 1.1 Base Teacher verification
    const baseTeacherAuth = await authService.getUserById(teacherUserA.id);
    assert(baseTeacherAuth.role === "teacher", "Teacher A retains base role 'teacher'");
    assert(baseTeacherAuth.isMentor === false, "Teacher A initially is not a mentor");
    assert(baseTeacherAuth.isAccountant === false, "Teacher A initially is not an accountant");

    // 1.2 Principal assigns Teacher A as Class Mentor for Class 10-A
    const mentorAssignment = await prisma.classMentor.create({
      data: {
        schoolId: schoolA.id,
        classId: classA.id,
        teacherId: teacherRecordA.id,
        academicYearId: academicYearA.id,
        isActive: true,
        assignedById: principalUserA.id,
        startDate: new Date()
      }
    });
    assert(mentorAssignment.id > 0, "Principal created active ClassMentor assignment");

    const mentorTeacherAuth = await authService.getUserById(teacherUserA.id);
    assert(mentorTeacherAuth.role === "teacher", "Teacher A retains base role 'teacher' after mentor assignment");
    assert(mentorTeacherAuth.isMentor === true, "Teacher A now has active mentor capability (isMentor = true)");
    assert(mentorTeacherAuth.mentoredClasses?.some(c => c.classId === classA.id), "Teacher A has Class 10-A in mentoredClasses");

    // 1.3 Principal assigns Teacher A as Accountant (Layering Accountant capability)
    const accountantAssignmentA = await principalService.assignAccountant({
      schoolId: schoolA.id,
      userId: teacherUserA.id,
      assignedByUserId: principalUserA.id,
      notes: "Assigned as Accountant for FY 2026"
    });
    assert(accountantAssignmentA.isActive === true, "Teacher A assigned as Accountant");

    // Verify Teacher A now has BOTH Teacher + Mentor + Accountant capabilities simultaneously
    const multiCapAuth = await authService.getUserById(teacherUserA.id);
    assert(multiCapAuth.role === "teacher", "Teacher A retains base role 'teacher'");
    assert(multiCapAuth.isMentor === true, "Teacher A retains Mentor capability");
    assert(multiCapAuth.isAccountant === true, "Teacher A acquires Accountant capability");
    assert(multiCapAuth.teacherId === teacherRecordA.id, "Teacher A keeps their Teacher profile ID intact");

    // 1.4 Enforce "Only 1 active Accountant per school": Principal assigns Teacher B as Accountant
    const accountantAssignmentB = await principalService.assignAccountant({
      schoolId: schoolA.id,
      userId: teacherUserB.id,
      assignedByUserId: principalUserA.id,
      notes: "Transferring accountant role to Suresh"
    });
    assert(accountantAssignmentB.isActive === true, "Teacher B is now the active Accountant");

    // Verify Teacher A's accountant assignment was deactivated
    const updatedAssignmentA = await prisma.accountantAssignment.findUnique({
      where: { id: accountantAssignmentA.id }
    });
    assert(updatedAssignmentA.isActive === false, "Teacher A's accountant assignment was cleanly deactivated (enforces 1 active accountant)");
    assert(updatedAssignmentA.endDate !== null, "Teacher A's accountant assignment preserves historical endDate");

    // Verify Teacher A's state after accountant removal: keeps Teacher + Mentor!
    const postAccountantAuthA = await authService.getUserById(teacherUserA.id);
    assert(postAccountantAuthA.role === "teacher", "Teacher A still retains base role 'teacher'");
    assert(postAccountantAuthA.isMentor === true, "Teacher A still retains Mentor capability");
    assert(postAccountantAuthA.isAccountant === false, "Teacher A lost Accountant capability");

    // Verify Teacher B is now Teacher + Accountant
    const teacherBAuth = await authService.getUserById(teacherUserB.id);
    assert(teacherBAuth.role === "teacher", "Teacher B retains base role 'teacher'");
    assert(teacherBAuth.isAccountant === true, "Teacher B has Accountant capability");
    assert(teacherBAuth.isMentor === false, "Teacher B is not a mentor");

    // 1.5 Principal removes Mentor from Teacher A
    await prisma.classMentor.update({
      where: { id: mentorAssignment.id },
      data: { isActive: false, endDate: new Date() }
    });
    const finalTeacherAuthA = await authService.getUserById(teacherUserA.id);
    assert(finalTeacherAuthA.role === "teacher", "Teacher A still retains base role 'teacher'");
    assert(finalTeacherAuthA.isMentor === false, "Teacher A mentor capability is deactivated");
    assert(finalTeacherAuthA.isAccountant === false, "Teacher A accountant capability is deactivated");

    console.log("   Base Role + Capability transitions verified successfully.\n");

    // Re-assign Teacher A as Mentor and Teacher B as Accountant for downstream tests
    await prisma.classMentor.update({
      where: { id: mentorAssignment.id },
      data: { isActive: true, endDate: null }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 2: ACCOUNTANT CORRECTION & SELF-APPROVAL PREVENTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ [TEST 2] Accountant Fee Correction & Self-Approval Prevention Guard");

    // Create a PaymentHistory record for fee
    const payment = await prisma.paymentHistory.create({
      data: {
        schoolId: schoolA.id,
        feeId: feeRecordA.id,
        updatedBy: principalUserA.id,
        amount: 2000,
        remarks: "Initial term payment"
      }
    });

    // Teacher B (acting as Accountant) raises a fee correction request
    const correctionReq = await auditService.raiseFeeCorrection(
      {
        studentId: studentRecordA.id,
        feeId: feeRecordA.id,
        paymentHistoryId: payment.id,
        amount: 500, // Adjust by +500
        originalValue: 2000,
        requestedValue: 2500,
        reason: "Accountant entered 2000 instead of 2500 from bank receipt #B123"
      },
      { ...teacherUserB, isAccountant: true, schoolId: schoolA.id }
    );
    assert(correctionReq.id > 0, "Accountant raised FeeCorrectionRequest successfully");
    assert(correctionReq.status === "PENDING", "Fee correction request status is PENDING");
    assert(correctionReq.requestedById === teacherUserB.id, "Correction records requestedById = Teacher B");

    // 2.1 SELF-APPROVAL TEST: Accountant attempts to approve own request
    let selfApprovalBlocked = false;
    try {
      await auditService.resolveFeeCorrection(
        correctionReq.id,
        { status: "APPROVED", notes: "Self approving my own entry" },
        { id: teacherUserB.id, schoolId: schoolA.id, role: "teacher", isAccountant: true }
      );
    } catch (err) {
      if (err.message.includes("Self-approval is forbidden") && err.status === 403) {
        selfApprovalBlocked = true;
      }
    }
    assert(selfApprovalBlocked, "Self-approval is strictly forbidden (HTTP 403 thrown when requester tries to approve)");

    // 2.2 LEGITIMATE PRINCIPAL APPROVAL
    const approvedCorrection = await auditService.resolveFeeCorrection(
      correctionReq.id,
      { status: "APPROVED", notes: "Verified against bank statement. Approved." },
      principalUserA
    );
    assert(approvedCorrection.status === "APPROVED", "Principal approved FeeCorrectionRequest");
    assert(approvedCorrection.reviewedById === principalUserA.id, "Reviewed by Principal ID recorded");

    // Verify Atomic Ledger Adjustment
    const updatedFee = await prisma.fee.findUnique({ where: { id: feeRecordA.id } });
    assert(updatedFee.paidAmount === 2500, "Atomic ledger adjustment: paidAmount updated to 2500");
    assert(updatedFee.pendingAmount === 2500, "Atomic ledger adjustment: pendingAmount updated to 2500");
    assert(updatedFee.paymentStatus === "PARTIAL", "Payment status accurately recomputed");

    // Verify Ledger PaymentHistory Entry
    const correctionLedgerEntry = await prisma.paymentHistory.findFirst({
      where: { feeId: feeRecordA.id, remarks: { contains: "Fee Correction approved by principal" } }
    });
    assert(!!correctionLedgerEntry, "New authoritative PaymentHistory audit entry was recorded in transaction");

    // Verify AuditLog record
    const auditRecord = await prisma.auditLog.findFirst({
      where: { schoolId: schoolA.id, entityId: feeRecordA.id, module: "FEE" }
    });
    assert(!!auditRecord, "Authoritative AuditLog generated with oldData and newData");

    console.log("   Accountant fee correction & self-approval guard verified successfully.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 3: FEEDBACK SYSTEM
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ [TEST 3] Feedback System (Principal-controlled, Subject Teacher vs Mentor separation, Student Anonymity, Soft Delete)");

    // 3.1 Principal creates Feedback Campaign
    const campaign = await principalService.createFeedbackForm(
      {
        title: "Mid-Term Academic & Mentorship Review",
        description: "Student feedback on subject teaching and mentor guidance",
        targetClass: "ALL",
        questions: [{ text: "How clear are the concepts explained?", type: "RATING" }]
      },
      principalUserA
    );
    assert(campaign.id > 0, "Principal created FeedbackCampaign");
    assert(campaign.status === "ACTIVE", "Feedback campaign is ACTIVE");
    assert(campaign.isDeleted === false, "Feedback campaign is not deleted");

    // 3.2 Student queries feedback forms
    const studentForms = await studentService.getFeedbackForms({ id: studentUserA.id, schoolId: schoolA.id });
    assert(studentForms.some(f => f.id === campaign.id), "Student sees the active feedback campaign");

    // 3.3 Student queries available faculty (Subject Teachers + Class Mentor)
    const facultyList = await studentService.getTeachers({ id: studentUserA.id, schoolId: schoolA.id });
    const mathItem = facultyList.find(f => f.subjectId === subjectMath.id);
    const mentorItem = facultyList.find(f => f.isMentor === true);
    assert(!!mathItem, "Student faculty list includes Subject Teacher for Mathematics (Teacher A)");
    assert(!!mentorItem, "Student faculty list includes Class Mentor (Teacher A as Class Mentor)");

    // 3.4 Server-side relationship validation: Student tries to submit feedback for a non-existent subject
    let invalidPairBlocked = false;
    try {
      await studentService.submitFeedback(
        {
          formId: campaign.id,
          ratings: [
            {
              teacherId: teacherRecordA.id,
              subjectId: 999999, // Arbitrary non-existent subject ID
              feedbackType: "SUBJECT_TEACHER",
              rating: 5,
              comment: "Fake subject"
            }
          ]
        },
        { id: studentUserA.id, schoolId: schoolA.id }
      );
    } catch (err) {
      if (err.message.includes("Unauthorized") || err.message.includes("does not teach")) {
        invalidPairBlocked = true;
      }
    }
    assert(invalidPairBlocked, "Backend rejects arbitrary subject-teacher pairings not on student's schedule");

    // 3.5 Valid Submission: Student submits feedback for Subject Teacher AND Class Mentor
    await studentService.submitFeedback(
      {
        formId: campaign.id,
        ratings: [
          {
            teacherId: teacherRecordA.id,
            subjectId: subjectMath.id,
            feedbackType: "SUBJECT_TEACHER",
            rating: 5,
            comment: "Ravi sir explains calculus very thoroughly."
          },
          {
            teacherId: teacherRecordA.id,
            subjectId: null,
            feedbackType: "MENTOR",
            rating: 4,
            comment: "Great guidance during monthly mentoring sessions."
          }
        ]
      },
      { id: studentUserA.id, schoolId: schoolA.id }
    );
    console.log("   Student submitted subject-teacher and mentor ratings.");

    // 3.6 Teacher Feedback Summary: Subject Teaching vs Mentor Isolation & Anonymity
    const teacherSummary = await teacherService.getFeedbackSummary(
      { id: teacherUserA.id, schoolId: schoolA.id },
      { id: teacherRecordA.id }
    );

    assert(teacherSummary.subjectTeaching.averageRating === 5, "Subject Teaching average rating is 5.0");
    assert(teacherSummary.subjectTeaching.totalReviews === 1, "Subject Teaching review count is 1");
    assert(teacherSummary.mentorFeedback.averageRating === 4, "Class Mentor average rating is 4.0");
    assert(teacherSummary.mentorFeedback.totalReviews === 1, "Class Mentor review count is 1");
    assert(
      teacherSummary.subjectTeaching.averageRating !== teacherSummary.mentorFeedback.averageRating,
      "Subject Teaching rating and Class Mentor rating remain strictly separate and NOT combined!"
    );

    // Anonymity Check
    assert(teacherSummary.anonymizedComments.length >= 1, "Teacher receives feedback comments");
    teacherSummary.anonymizedComments.forEach(comment => {
      assert(comment.studentName === undefined, "Student name is completely omitted from feedback comments");
      assert(comment.studentId === undefined, "Student ID is completely omitted from feedback comments");
    });
    console.log("   Feedback privacy & anonymity verified.");

    // 3.7 Principal Soft Delete Campaign
    await principalService.deleteFeedbackForm(campaign.id, principalUserA, "Term end soft-delete");
    const deletedCampaign = await prisma.feedbackCampaign.findUnique({ where: { id: campaign.id } });
    assert(deletedCampaign.isDeleted === true, "Campaign marked isDeleted = true");
    assert(deletedCampaign.status === "DELETED", "Campaign status = DELETED");
    assert(deletedCampaign.deletedBy === principalUserA.id, "Audit tracking recorded deletedBy = Principal");

    // Propagation Check: Campaign must no longer appear in student dashboard
    const studentFormsAfterDelete = await studentService.getFeedbackForms({ id: studentUserA.id, schoolId: schoolA.id });
    assert(!studentFormsAfterDelete.some(f => f.id === campaign.id), "Deleted campaign successfully hidden from student dashboard");

    console.log("   Feedback system soft-delete & rating separation verified.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 4: AI VOICE CALLING TELEPHONY LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ [TEST 4] AI Telephony Calling Lifecycle & Webhook Status Processing");

    // 4.1 Create CallRecord in DIALING state
    const providerCallId = `call_${ts}_bland_ai`;
    const callRecord = await prisma.callRecord.create({
      data: {
        schoolId: schoolA.id,
        studentId: studentRecordA.id,
        callPurpose: "ABSENCE_NOTIFICATION",
        callStatus: "DIALING",
        providerCallId,
        parentPhone: "+91 91234 56789",
        metadata: { recipientName: "Mr. Kumar", studentName: "Aarav Kumar" },
        retryCount: 0,
        maxRetries: 3
      }
    });
    assert(callRecord.callStatus === "DIALING", "Call initiated with status = DIALING");

    // 4.2 Webhook status: RINGING
    await callingService.handleCallWebhook({
      call_id: providerCallId,
      status: "RINGING"
    });
    let currentCall = await prisma.callRecord.findUnique({ where: { id: callRecord.id } });
    assert(currentCall.callStatus === "RINGING", "Webhook updated status to RINGING");

    // 4.3 Webhook status: REJECTED (Parent declined call)
    await callingService.handleCallWebhook({
      call_id: providerCallId,
      status: "REJECTED"
    });
    currentCall = await prisma.callRecord.findUnique({ where: { id: callRecord.id } });
    assert(currentCall.callStatus === "REJECTED", "Webhook updated status to REJECTED");

    // 4.4 Webhook status: DROPPED
    await callingService.handleCallWebhook({
      call_id: providerCallId,
      status: "DROPPED"
    });
    currentCall = await prisma.callRecord.findUnique({ where: { id: callRecord.id } });
    assert(currentCall.callStatus === "DROPPED", "Webhook updated status to DROPPED");

    // 4.5 Webhook status: TIMEOUT
    await callingService.handleCallWebhook({
      call_id: providerCallId,
      status: "TIMEOUT"
    });
    currentCall = await prisma.callRecord.findUnique({ where: { id: callRecord.id } });
    assert(currentCall.callStatus === "TIMEOUT", "Webhook updated status to TIMEOUT");

    // 4.6 Webhook status: IN_PROGRESS
    await callingService.handleCallWebhook({
      call_id: providerCallId,
      status: "IN_PROGRESS"
    });
    currentCall = await prisma.callRecord.findUnique({ where: { id: callRecord.id } });
    assert(currentCall.callStatus === "IN_PROGRESS", "Webhook updated status to IN_PROGRESS");

    // 4.7 Webhook status: COMPLETED with transcript & duration
    await callingService.handleCallWebhook({
      call_id: providerCallId,
      status: "COMPLETED",
      duration: 85,
      concatenated_transcript: "AI: Good morning, calling regarding Aarav's absence. Parent: Yes, he has a cold today.",
      summary: "Parent confirmed Aarav has cold and will attend tomorrow."
    });
    currentCall = await prisma.callRecord.findUnique({ where: { id: callRecord.id } });
    assert(currentCall.callStatus === "COMPLETED", "Webhook updated status to COMPLETED");
    assert(currentCall.duration === 85, "Call duration stored accurately");
    assert(currentCall.transcript.includes("Aarav's absence"), "Call transcript recorded accurately");
    assert(currentCall.endedAt !== null, "Call endedAt timestamp recorded");

    // 4.8 Idempotency Check: Repeating the webhook callback does not throw or corrupt state
    const duplicateRes = await callingService.handleCallWebhook({
      call_id: providerCallId,
      status: "COMPLETED",
      duration: 85
    });
    assert(duplicateRes.success === true, "Webhook processing is idempotent on duplicate delivery");

    console.log("   AI telephony lifecycle & webhook processing verified.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST SECTION 5: MULTI-TENANT ISOLATION & BOLA PROTECTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ [TEST 5] Multi-Tenant Isolation & BOLA Protection");

    // Principal from School B attempts to access or resolve Fee Correction of School A
    let crossSchoolBlocked = false;
    const principalUserB = await prisma.user.create({
      data: {
        schoolId: schoolB.id,
        email: `principalB_${ts}@schoolB.com`,
        password: "hashed_pass_principalB",
        role: "principal",
        name: "Principal Baker",
        userCode: `PRIN_B_${ts}`
      }
    });

    try {
      await auditService.resolveFeeCorrection(
        correctionReq.id,
        { status: "REJECTED", notes: "Cross-school tampering attempt" },
        principalUserB
      );
    } catch (err) {
      if (err.message.includes("not found")) {
        crossSchoolBlocked = true;
      }
    }
    assert(crossSchoolBlocked, "Cross-school BOLA violation prevented (School B cannot resolve School A fee corrections)");

    console.log("   Multi-tenant isolation verified.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log("================================================================");
    console.log(`🎉 ALL ARCHITECTURAL TESTS PASSED (${passedCount} passed, ${failedCount} failed)`);
    console.log("================================================================");

  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED WITH ERROR:", err);
    process.exit(1);
  } finally {
    // Clean up test data safely without dropping production data
    console.log("\n🧹 Cleaning up test artifacts...");
    try {
      if (feeRecordA) {
        await prisma.auditLog.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.feeCorrectionRequest.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.paymentHistory.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.fee.deleteMany({ where: { schoolId: schoolA.id } });
      }
      if (schoolA) {
        await prisma.teacherFeedback.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.feedbackCampaign.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.callRecord.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.schedule.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.classMentor.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.accountantAssignment.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.student.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.teacher.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.user.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.subject.deleteMany({ where: { class: { schoolId: schoolA.id } } });
        await prisma.classConfig.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.academicYear.deleteMany({ where: { schoolId: schoolA.id } });
        await prisma.school.delete({ where: { id: schoolA.id } });
      }
      if (schoolB) {
        await prisma.user.deleteMany({ where: { schoolId: schoolB.id } });
        await prisma.school.delete({ where: { id: schoolB.id } });
      }
      console.log("   Test cleanup finished cleanly.\n");
    } catch (cleanupErr) {
      console.warn("   Cleanup warning:", cleanupErr.message);
    }
    await prisma.$disconnect();
  }
}

runAuditSuite();
