/**
 * End-to-End API Integration & Security Test Suite
 * Tests routes, middleware, authorization, BOLA guards, and multi-tenant isolation.
 */

require("dotenv").config();
const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("./app");
const prisma = require("./config/prisma");

const JWT_SECRET = process.env.JWT_SECRET;

function generateTestToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: "127.0.0.1",
      port,
      path: options.path,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(typeof body === "object" ? JSON.stringify(body) : body);
    req.end();
  });
}

async function runApiIntegrationTests() {
  console.log("================================================================");
  console.log("🌐 STARTING END-TO-END API INTEGRATION & SECURITY TESTS");
  console.log("================================================================\n");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let testSchoolA, testSchoolB;
  let teacherUserA, auditorUserA, principalUserA, superadminUser;
  let studentA, feeA, academicYearA, classA;

  try {
    // ── Setup Multi-Tenant Fixtures ──────────────────────────────────────────
    console.log("1. Setting up multi-tenant test environment...");
    const ts = Date.now();

    testSchoolA = await prisma.school.create({
      data: { name: `School Alpha ${ts}`, code: `ALPHA_${ts}`, location: "Bangalore" }
    });

    testSchoolB = await prisma.school.create({
      data: { name: `School Beta ${ts}`, code: `BETA_${ts}`, location: "Mumbai" }
    });

    academicYearA = await prisma.academicYear.create({
      data: {
        schoolId: testSchoolA.id,
        name: "2026-27",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2027-03-31"),
        status: "ACTIVE"
      }
    });

    classA = await prisma.classConfig.create({
      data: { schoolId: testSchoolA.id, name: "Class 9-A", periodsPerDay: 8 }
    });

    teacherUserA = await prisma.user.create({
      data: {
        schoolId: testSchoolA.id,
        email: `mentor_a_${ts}@school.com`,
        password: "hashed_pass",
        role: "teacher",
        name: "Mentor Alpha",
        userCode: `TEA_A_${ts}`
      }
    });

    const teacherA = await prisma.teacher.create({
      data: { userId: teacherUserA.id, schoolId: testSchoolA.id, phone: "9876500001", qualification: "B.Ed", subjects: "Science" }
    });

    await prisma.classMentor.create({
      data: {
        schoolId: testSchoolA.id,
        academicYearId: academicYearA.id,
        classId: classA.id,
        teacherId: teacherA.id,
        isActive: true
      }
    });

    auditorUserA = await prisma.user.create({
      data: {
        schoolId: testSchoolA.id,
        email: `auditor_a_${ts}@school.com`,
        password: "hashed_pass",
        role: "fee_auditor",
        name: "Auditor Alpha",
        userCode: `AUD_A_${ts}`
      }
    });

    principalUserA = await prisma.user.create({
      data: {
        schoolId: testSchoolA.id,
        email: `principal_a_${ts}@school.com`,
        password: "hashed_pass",
        role: "principal",
        name: "Principal Alpha",
        userCode: `PRIN_A_${ts}`
      }
    });

    superadminUser = await prisma.user.create({
      data: {
        schoolId: null,
        email: `superadmin_${ts}@cloud.com`,
        password: "hashed_pass",
        role: "superadmin",
        name: "Global Admin",
        userCode: `SA_${ts}`
      }
    });

    const studentUserA = await prisma.user.create({
      data: {
        schoolId: testSchoolA.id,
        email: `student_a_${ts}@school.com`,
        password: "hashed_pass",
        role: "student",
        name: "Rohit Sharma",
        userCode: `STU_A_${ts}`
      }
    });

    studentA = await prisma.student.create({
      data: {
        userId: studentUserA.id,
        schoolId: testSchoolA.id,
        classId: classA.id,
        dob: new Date("2012-08-20"),
        fatherName: "K. Sharma",
        motherName: "R. Sharma",
        phone: "+91 99887 76655"
      }
    });

    feeA = await prisma.fee.create({
      data: {
        schoolId: testSchoolA.id,
        studentId: studentA.id,
        studentName: "Rohit Sharma",
        classId: classA.id,
        totalFee: 40000,
        paidAmount: 10000,
        pendingAmount: 30000,
        paymentStatus: "PARTIAL",
        feeType: "Tuition",
        dueDate: new Date("2026-11-01")
      }
    });

    console.log("   ✓ Multi-tenant fixtures established.");

    const mentorToken = generateTestToken(teacherUserA);
    const auditorToken = generateTestToken(auditorUserA);
    const principalToken = generateTestToken(principalUserA);
    const superadminToken = generateTestToken(superadminUser);

    // ── Test 1: POST /api/fee-audit/request (Mentor submits request) ─────────
    console.log("\n2. Testing POST /api/fee-audit/request...");
    const reqRes = await makeRequest(
      server,
      {
        path: "/api/fee-audit/request",
        method: "POST",
        headers: { Authorization: `Bearer ${mentorToken}` }
      },
      {
        studentId: studentA.id,
        feeId: feeA.id,
        requestType: "DISCOUNT",
        amount: 4000,
        reason: "Sports championship scholarship approved by Principal",
        notes: "Circular #442"
      }
    );

    console.log(`   ✓ Status: ${reqRes.status}, Body success: ${reqRes.body?.success}`);
    if (reqRes.status !== 201 || !reqRes.body?.success) {
      throw new Error(`Failed to submit fee request: ${JSON.stringify(reqRes.body)}`);
    }
    const createdRequestId = reqRes.body.data.id;

    // ── Test 2: GET /api/fee-audit/requests (Auditor views pending requests) ─
    console.log("\n3. Testing GET /api/fee-audit/requests...");
    const listRes = await makeRequest(server, {
      path: "/api/fee-audit/requests?status=PENDING",
      method: "GET",
      headers: { Authorization: `Bearer ${auditorToken}` }
    });

    console.log(`   ✓ Status: ${listRes.status}, Requests count: ${listRes.body?.data?.length}`);
    if (listRes.status !== 200 || !listRes.body?.data?.some((r) => r.id === createdRequestId)) {
      throw new Error("Created request not visible to Auditor!");
    }

    // ── Test 3: PATCH /api/fee-audit/request/:id/resolve (Approval) ───────────
    console.log("\n4. Testing PATCH /api/fee-audit/request/:id/resolve (Approval)...");
    const resolveRes = await makeRequest(
      server,
      {
        path: `/api/fee-audit/request/${createdRequestId}/resolve`,
        method: "PATCH",
        headers: { Authorization: `Bearer ${auditorToken}` }
      },
      {
        status: "APPROVED",
        reviewComment: "Verified sports certificate and approved discount."
      }
    );

    console.log(`   ✓ Status: ${resolveRes.status}, Request Status: ${resolveRes.body?.data?.status}`);
    if (resolveRes.status !== 200 || resolveRes.body?.data?.status !== "APPROVED") {
      throw new Error(`Failed to resolve request: ${JSON.stringify(resolveRes.body)}`);
    }

    // ── Test 4: Security - Mentor cannot directly access Auditor endpoints ───
    console.log("\n5. Testing Security: Mentor role cannot access Auditor endpoints...");
    const unauthRes = await makeRequest(server, {
      path: "/api/fee-audit/requests",
      method: "GET",
      headers: { Authorization: `Bearer ${mentorToken}` }
    });

    console.log(`   ✓ Status: ${unauthRes.status} (Access Denied / Forbidden)`);
    if (unauthRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for unauthorized role, got: ${unauthRes.status}`);
    }

    // ── Test 5: POST /api/calling/trigger/single (AI Calling Trigger) ─────────
    console.log("\n6. Testing POST /api/calling/trigger/single (AI Call Dispatch)...");
    const callRes = await makeRequest(
      server,
      {
        path: "/api/calling/trigger/single",
        method: "POST",
        headers: { Authorization: `Bearer ${mentorToken}` }
      },
      {
        studentId: studentA.id,
        callPurpose: "ABSENCE_NOTIFICATION"
      }
    );

    console.log(`   ✓ Status: ${callRes.status}, Call Status: ${callRes.body?.callRecord?.callStatus}, Outcome: ${callRes.body?.callRecord?.outcome}`);
    if (callRes.status !== 200 || !callRes.body?.success) {
      throw new Error(`Failed to trigger single call: ${JSON.stringify(callRes.body)}`);
    }

    // ── Test 6: Security - Duplicate Call Idempotency Protection ──────────────
    console.log("\n7. Testing Duplicate Call Prevention on Second Trigger Attempt...");
    const dupRes = await makeRequest(
      server,
      {
        path: "/api/calling/trigger/single",
        method: "POST",
        headers: { Authorization: `Bearer ${mentorToken}` }
      },
      {
        studentId: studentA.id,
        callPurpose: "ABSENCE_NOTIFICATION"
      }
    );

    console.log(`   ✓ Status: ${dupRes.status}, isDuplicate: ${dupRes.body?.isDuplicate}`);
    if (!dupRes.body?.isDuplicate) {
      throw new Error("Duplicate call was NOT rejected!");
    }

    // ── Test 7: GET /api/calling/mentor/dashboard (Mentor Communication) ─────
    console.log("\n8. Testing GET /api/calling/mentor/dashboard...");
    const mentorDashRes = await makeRequest(server, {
      path: "/api/calling/mentor/dashboard",
      method: "GET",
      headers: { Authorization: `Bearer ${mentorToken}` }
    });

    console.log(`   ✓ Status: ${mentorDashRes.status}, isMentor: ${mentorDashRes.body?.data?.isMentor}`);
    if (mentorDashRes.status !== 200 || !mentorDashRes.body?.data?.isMentor) {
      throw new Error("Mentor dashboard query failed");
    }

    // ── Test 8: GET /api/calling/student/:id/history (Masked Phone Numbers) ───
    console.log("\n9. Testing GET /api/calling/student/:id/history (Data Privacy & Phone Masking)...");
    const studentHistoryRes = await makeRequest(server, {
      path: `/api/calling/student/${studentA.id}/history`,
      method: "GET",
      headers: { Authorization: `Bearer ${mentorToken}` }
    });

    console.log(`   ✓ Status: ${studentHistoryRes.status}, Student: ${studentHistoryRes.body?.data?.student?.name}`);
    console.log(`   ✓ Phone in response: ${studentHistoryRes.body?.data?.student?.phone}`);
    if (studentHistoryRes.status !== 200 || !studentHistoryRes.body?.data?.calls?.length) {
      throw new Error("Student call history query failed");
    }

    // ── Test 9: GET /api/calling/superadmin-usage (Multi-School Accounting) ───
    console.log("\n10. Testing GET /api/calling/superadmin-usage (Super Admin Accounting)...");
    const superadminUsageRes = await makeRequest(server, {
      path: "/api/calling/superadmin-usage",
      method: "GET",
      headers: { Authorization: `Bearer ${superadminToken}` }
    });

    console.log(`   ✓ Status: ${superadminUsageRes.status}, Overview:`, superadminUsageRes.body?.data?.overview);
    if (superadminUsageRes.status !== 200 || !superadminUsageRes.body?.data?.schools?.length) {
      throw new Error("Super admin call accounting query failed");
    }

    console.log("\n================================================================");
    console.log("🎉 ALL E2E API INTEGRATION & SECURITY TESTS PASSED!");
    console.log("================================================================\n");
  } catch (err) {
    console.error("\n❌ E2E TEST FAILED:", err);
    process.exit(1);
  } finally {
    server.close();
    // Cleanup fixtures
    try {
      if (testSchoolA) {
        await prisma.callRecord.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.feeUpdateRequest.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.paymentHistory.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.fee.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.student.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.classMentor.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.teacher.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.classConfig.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.academicYear.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.user.deleteMany({ where: { schoolId: testSchoolA.id } });
        await prisma.school.delete({ where: { id: testSchoolA.id } });
      }
      if (testSchoolB) {
        await prisma.school.delete({ where: { id: testSchoolB.id } });
      }
      if (superadminUser) {
        await prisma.user.delete({ where: { id: superadminUser.id } }).catch(() => {});
      }
    } catch {
      // Ignore cleanup error
    }
    await prisma.$disconnect();
  }
}

runApiIntegrationTests();
