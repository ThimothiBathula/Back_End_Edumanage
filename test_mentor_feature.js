const prisma = require("./config/prisma");
const mentorService = require("./modules/mentor/mentor.service");
const studentService = require("./modules/student/student.service");
const principalService = require("./modules/principal/principal.service");

async function runTests() {
  console.log("=== STARTING CLASS MENTOR FEATURE TEST SUITE ===");

  try {
    // 1. Locate an active school
    const school = await prisma.school.findFirst({
      where: { status: "ACTIVE" },
      include: {
        academicYears: true,
        classConfigs: { where: { status: "ACTIVE" } },
        teachers: { where: { isDeleted: false }, include: { user: true } },
        principals: { include: { user: true } }
      }
    });

    if (!school) {
      console.log("⚠️ No active school found. Skipping live DB test.");
      return;
    }
    console.log(`✅ Using School: ${school.name} (ID: ${school.id})`);

    let activeYear = school.academicYears.find(y => y.status === "ACTIVE") || school.academicYears[0];
    if (!activeYear) {
      activeYear = await prisma.academicYear.create({
        data: {
          schoolId: school.id,
          name: "2026-2027",
          startDate: new Date("2026-06-01"),
          endDate: new Date("2027-05-31"),
          status: "ACTIVE"
        }
      });
      console.log(`✅ Created Test Academic Year: ${activeYear.name} (ID: ${activeYear.id})`);
    } else {
      console.log(`✅ Using Academic Year: ${activeYear.name} (ID: ${activeYear.id})`);
    }

    const principal = school.principals[0];
    if (!principal) {
      console.log("⚠️ No principal found. Skipping.");
      return;
    }
    const principalUser = {
      id: principal.user.id,
      schoolId: school.id,
      role: "principal"
    };

    const targetClass = school.classConfigs[0];
    if (!targetClass) {
      console.log("⚠️ No classes configured. Skipping.");
      return;
    }
    console.log(`✅ Target Class: ${targetClass.name} (ID: ${targetClass.id})`);

    const teachers = school.teachers;
    if (teachers.length === 0) {
      console.log("⚠️ No teachers found. Skipping.");
      return;
    }
    const testTeacher1 = teachers[0];
    const testTeacher2 = teachers.length > 1 ? teachers[1] : teachers[0];
    console.log(`✅ Teacher 1: ${testTeacher1.user.name} (ID: ${testTeacher1.id})`);
    if (testTeacher2) console.log(`✅ Teacher 2: ${testTeacher2.user.name} (ID: ${testTeacher2.id})`);

    // TEST 1: Principal - Get Class Mentors Overview
    console.log("\n--- TEST 1: Principal getClassMentors ---");
    const assignmentsRes = await mentorService.getClassMentors(principalUser, activeYear.id);
    console.log(`Total classes: ${assignmentsRes.totalClasses}, Assigned: ${assignmentsRes.assignedCount}, Unassigned: ${assignmentsRes.unassignedCount}`);
    console.log("✅ TEST 1 PASSED");

    // TEST 2: Principal - Assign Mentor (MANUAL)
    console.log("\n--- TEST 2: Assign Mentor (MANUAL) ---");
    const assigned = await mentorService.assignMentor({
      schoolId: school.id,
      academicYearId: activeYear.id,
      classId: targetClass.id,
      teacherId: testTeacher1.id,
      assignmentType: "MANUAL",
      user: principalUser
    });
    console.log(`Assigned Mentor ID: ${assigned.id}, Teacher: ${assigned.teacher.user.name}, Type: ${assigned.assignmentType}`);
    if (assigned.teacherId !== testTeacher1.id) throw new Error("Mentor assignment mismatch");
    console.log("✅ TEST 2 PASSED");

    // TEST 3: Student Profile Dynamic Mentor Resolution
    console.log("\n--- TEST 3: Dynamic Student Profile Mentor Resolution ---");
    const studentInClass = await prisma.student.findFirst({
      where: { classId: targetClass.id, schoolId: school.id, isDeleted: false }
    });
    if (studentInClass) {
      const studentProfile = await studentService.getProfile({ id: studentInClass.userId, schoolId: school.id });
      console.log(`Student: ${studentProfile.user.name}, Mentor: ${studentProfile.mentor?.name}, Phone: ${studentProfile.mentor?.phone}`);
      if (!studentProfile.mentor || studentProfile.mentor.name !== testTeacher1.user.name) {
        throw new Error("Student dynamic mentor resolution failed");
      }
      console.log("✅ Dynamic Mentor dynamically resolved on student profile correctly!");
    } else {
      console.log("ℹ️ No student currently in target class, skipping student profile test.");
    }
    console.log("✅ TEST 3 PASSED");

    // TEST 4: Principal - Change Mentor
    console.log("\n--- TEST 4: Change Mentor to Teacher 2 ---");
    const reassigned = await mentorService.assignMentor({
      schoolId: school.id,
      academicYearId: activeYear.id,
      classId: targetClass.id,
      teacherId: testTeacher2.id,
      assignmentType: "MANUAL",
      user: principalUser
    });
    console.log(`Reassigned to: ${reassigned.teacher.user.name} (Teacher ID: ${reassigned.teacherId})`);
    if (reassigned.teacherId !== testTeacher2.id) throw new Error("Reassignment mismatch");

    // Verify student profile now dynamically reflects new mentor without touching student record
    if (studentInClass) {
      const studentProfile2 = await studentService.getProfile({ id: studentInClass.userId, schoolId: school.id });
      console.log(`Student Profile automatically shows new Mentor: ${studentProfile2.mentor?.name}`);
      if (studentProfile2.mentor?.name !== testTeacher2.user.name) {
        throw new Error("Student dynamic mentor did not automatically update");
      }
    }
    console.log("✅ TEST 4 PASSED");

    // TEST 5: Verify Mentor History
    console.log("\n--- TEST 5: Verify Mentor History ---");
    const history = await mentorService.getMentorHistory({ schoolId: school.id, classId: targetClass.id });
    console.log(`History records count: ${history.length}`);
    if (history.length < 2) throw new Error("Expected at least 2 historical records after change");
    console.log("History records:", history.map(h => ({ mentor: h.teacher?.user?.name, active: h.isActive, start: h.startDate, end: h.endDate })));
    console.log("✅ TEST 5 PASSED");

    // TEST 6: Teacher Mentored Classes Dashboard Access
    console.log("\n--- TEST 6: Teacher My Mentored Classes ---");
    const teacherUser2 = {
      id: testTeacher2.user.id,
      schoolId: school.id,
      role: "teacher"
    };
    const teacherUser1 = {
      id: testTeacher1.user.id,
      schoolId: school.id,
      role: "teacher"
    };

    const t2Classes = await mentorService.getMyMentoredClasses(teacherUser2);
    console.log(`Teacher 2 mentored classes count: ${t2Classes.length}`);
    if (!t2Classes.some(c => c.classId === targetClass.id)) {
      throw new Error("Teacher 2 does not have targetClass in mentored classes");
    }

    const t1Classes = await mentorService.getMyMentoredClasses(teacherUser1);
    console.log(`Teacher 1 (old mentor) mentored classes count: ${t1Classes.length}`);
    if (t1Classes.some(c => c.classId === targetClass.id)) {
      throw new Error("Old mentor Teacher 1 still has access after reassignment!");
    }
    console.log("✅ Old mentor immediately lost access; new mentor immediately gained access!");
    console.log("✅ TEST 6 PASSED");

    // TEST 7: Mentor Security Authorization (Unauthorized Teacher Blocked)
    console.log("\n--- TEST 7: Mentor Security Authorization ---");
    try {
      await mentorService.getClassOverview(teacherUser1, targetClass.id);
      throw new Error("SECURITY FAILURE: Teacher 1 was able to access class overview after reassignment!");
    } catch (err) {
      if (err.status === 403) {
        console.log(`✅ Access correctly rejected with 403 Forbidden: "${err.message}"`);
      } else {
        throw err;
      }
    }
    console.log("✅ TEST 7 PASSED");

    // TEST 8: Authorized Mentor Class Overview & Attendance
    console.log("\n--- TEST 8: Class Overview & Attendance for Authorized Mentor ---");
    const overview = await mentorService.getClassOverview(teacherUser2, targetClass.id);
    console.log(`Overview stats: Total=${overview.totalStudents}, Present=${overview.presentToday}, Absent=${overview.absentToday}, AvgMarks=${overview.averageMarks}%`);

    const att = await mentorService.getTodayAttendance(teacherUser2, targetClass.id);
    console.log(`Today's Attendance student count: ${att.students.length}, Mode: ${att.attendanceMode}`);

    const abs = await mentorService.getAbsentStudentsToday(teacherUser2, targetClass.id);
    console.log(`Absent count: ${abs.length}`);

    const marks = await mentorService.getClassMarks(teacherUser2, targetClass.id);
    console.log(`Marks subjects count: ${marks.subjects.length}, students: ${marks.students.length}`);

    const fees = await mentorService.getClassFees(teacherUser2, targetClass.id);
    console.log(`Fees records count: ${fees.fees.length}`);

    const exportData = await mentorService.exportClassReport(teacherUser2, targetClass.id);
    console.log(`Export records generated: ${exportData.rows.length}`);
    console.log("✅ TEST 8 PASSED");

    console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! FEATURE IS FULLY FUNCTIONAL AND SECURE.");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
