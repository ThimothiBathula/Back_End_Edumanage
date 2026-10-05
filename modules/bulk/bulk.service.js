const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const XLSX = require("xlsx");
const generateUserCode = require("../../utils/generateUserCode");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse DD-MM-YYYY or YYYY-MM-DD into a Date (or null if blank/invalid) */
function parseDateField(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  // DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00.000Z`);
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Resolve a class name string to its ClassConfig.id */
async function resolveClassId(tx, schoolId, className) {
  if (!className) return null;
  const cls = await tx.classConfig.findFirst({ where: { schoolId, name: className } });
  if (!cls) throw new Error(`Class "${className}" not found in this school`);
  return cls.id;
}

// 🔐 Excel formula injection sanitizer (HIGH-04)
function sanitizeCell(value) {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`; // Neutralize formula with leading apostrophe
  }
  return value ?? '';
}

// Max rows per sheet to prevent DoS (HIGH-06)
const MAX_ROWS_PER_SHEET = 1000;

// MAIN FUNCTION
exports.processWorkbook = async (workbook, user, schoolIdOverride, uploadType) => {

  if (uploadType) {
    const expectedSheetName = uploadType.charAt(0).toUpperCase() + uploadType.slice(1);
    const sheetNames = Object.keys(workbook.Sheets);
    if (!workbook.Sheets[expectedSheetName] && sheetNames.length === 1) {
      // Magic fallback: if the user uploaded a 1-sheet file named "Sheet1" but selected "Classes"
      workbook.Sheets[expectedSheetName] = workbook.Sheets[sheetNames[0]];
    }
  }

  const schoolId =
    user.role === "superadmin"
      ? Number(schoolIdOverride)
      : user.schoolId;

  return prisma.$transaction(async (tx) => {

    const result = {};

    if (workbook.Sheets["Students"]) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Students"]);
      if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Students sheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
      result.students = await handleStudents(rows, tx, schoolId);
    }

    if (workbook.Sheets["Teachers"]) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Teachers"]);
      if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Teachers sheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
      result.teachers = await handleTeachers(rows, tx, schoolId);
    }

    if (workbook.Sheets["Holidays"]) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Holidays"]);
      if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Holidays sheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
      result.holidays = await handleHolidays(rows, tx, schoolId);
    }

    if (workbook.Sheets["Schedule"]) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Schedule"]);
      if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Schedule sheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
      result.schedule = await handleSchedule(rows, tx, schoolId);
    }

    if (workbook.Sheets["Fees"]) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Fees"]);
      if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Fees sheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
      result.fees = await handleFees(rows, tx, schoolId);
    }

    if (workbook.Sheets["Schools"] && user.role === "superadmin") {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Schools"]);
      if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Schools sheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
      result.schools = await handleSchools(rows, tx);
    }

    if (workbook.Sheets["Classes"]) {
      // Read as Array of Arrays ({ header: 1 }) to handle files with NO headers
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets["Classes"], { header: 1 });
      if (rows.length > MAX_ROWS_PER_SHEET) throw new Error(`Classes sheet exceeds ${MAX_ROWS_PER_SHEET} row limit`);
      result.classes = await handleClasses(rows, tx, schoolId);
    }

    if (Object.keys(result).length === 0) {
      throw new Error("No valid sheets found. Please use the official template and do NOT rename the sheet tabs (e.g., keep 'Classes' instead of 'Sheet1').");
    }

    return result;
  });
};


async function handleStudents(rows, tx, schoolId) {
    const errors = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.email || !r.name) {
          throw new Error("Missing required fields: name, email");
        }

        const exists = await tx.user.findUnique({ where: { email: r.email } });
        if (exists) {
          throw new Error(`Email ${r.email} already exists`);
        }

        // Require explicit password — no silent defaults
        if (!r.password) throw new Error(`Row ${i + 2}: password is required`);
        const rawPassword = String(r.password).trim();
        const hashed = await bcrypt.hash(rawPassword, 10);

        const user = await tx.user.create({
          data: {
            name: String(r.name).trim(),
            email: String(r.email).trim().toLowerCase(),
            password: hashed,
            role: "student",
            schoolId
          }
        });

        const code = await generateUserCode(tx, schoolId, "student");

        // Parse DD-MM-YYYY or YYYY-MM-DD date
        const parsedDob = parseDateField(r.dob);

        await tx.student.create({
          data: {
            userId: user.id,
            schoolId,
            classId: await resolveClassId(tx, schoolId, String(r.class || "").trim()),
            phone: String(r.phone || "").trim(),
            dob: parsedDob,
            fatherName: String(r.fatherName || "").trim(),
            motherName: String(r.motherName || "").trim(),
            gender: r.gender ? String(r.gender).trim().toUpperCase() : null,
            address: r.address ? String(r.address).trim() : null,
            status: r.status ? String(r.status).trim().toUpperCase() : "ACTIVE",
          }
        });

        await tx.user.update({
          where: { id: user.id },
          data: { userCode: code }
        });

        success++;
      } catch (err) {
        errors.push({ row: i + 2, error: err.message }); // +2 = header row + 1-indexed
      }
    }

    return { success, failed: errors.length, errors };
  }


async function handleTeachers(rows, tx, schoolId) {
    const errors = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.email || !r.name || !r.subjects) {
          throw new Error("Missing required fields: name, email, subjects");
        }

        const exists = await tx.user.findUnique({ where: { email: r.email } });
        if (exists) {
          throw new Error(`Email ${r.email} already exists`);
        }

        if (!r.password) throw new Error(`Row ${i + 2}: password is required`);
        const rawPassword = String(r.password).trim();
        const hashed = await bcrypt.hash(rawPassword, 10);

        const user = await tx.user.create({
          data: {
            name: String(r.name).trim(),
            email: String(r.email).trim().toLowerCase(),
            password: hashed,
            role: "teacher",
            schoolId
          }
        });

        const code = await generateUserCode(tx, schoolId, "teacher");
        const parsedDob = parseDateField(r.dob);

        await tx.teacher.create({
          data: {
            userId: user.id,
            schoolId,
            subjects: String(r.subjects).trim(),
            qualification: r.qualification ? String(r.qualification).trim() : "N/A",
            phone: r.phone ? String(r.phone).trim() : "N/A",
            dob: parsedDob,
            experience: r.experience ? Number(r.experience) : 0,
            gender: r.gender ? String(r.gender).trim().toUpperCase() : null,
          }
        });

        await tx.user.update({
          where: { id: user.id },
          data: { userCode: code }
        });

        success++;
      } catch (err) {
        errors.push({ row: i + 2, error: err.message });
      }
    }

    return { success, failed: errors.length, errors };
  }

  async function handleHolidays(rows, tx, schoolId) {
    const errors = [];
    let success = 0;
  
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.date || !r.title) throw new Error("Missing date or title");

        const date = new Date(r.date);
        date.setHours(0,0,0,0);
    
        const exists = await tx.holiday.findFirst({
          where: { schoolId, date, title: r.title }
        });
    
        if (exists) {
          throw new Error(`Holiday ${r.title} already exists on this date`);
        }
    
        await tx.holiday.create({
          data: {
            schoolId,
            title: r.title,
            description: r.description,
            date
          }
        });
    
        if (r.sendNotification !== false) {
          await tx.notification.create({
            data: {
              schoolId,
              role: "ALL",
              title: "Holiday Declared",
              message: `${r.title} on ${date.toDateString()}`,
              type: "HOLIDAY"
            }
          });
        }
    
        success++;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }
  
    return { success, failed: errors.length, errors };
  }



exports.exportWorkbook = async (user) => {

  const schoolId =
    user.role === "superadmin"
      ? Number(user.schoolId || 0)
      : user.schoolId;

  const workbook = XLSX.utils.book_new();

  // STUDENTS
  const students = await prisma.student.findMany({
    where: { schoolId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          userCode: true
        }
      }
    }
  });

  const studentData = students.map(s => ({
    userCode: sanitizeCell(s.user.userCode),
    name:     sanitizeCell(s.user.name),
    email:    sanitizeCell(s.user.email),
    phone:    sanitizeCell(s.phone),
  }));

  const studentSheet = XLSX.utils.json_to_sheet(studentData);
  XLSX.utils.book_append_sheet(workbook, studentSheet, "Students");

  // TEACHERS
  const teachers = await prisma.teacher.findMany({
    where: { schoolId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          userCode: true
        }
      }
    }
  });

  const teacherData = teachers.map(t => ({
    userCode:  sanitizeCell(t.user.userCode),
    name:      sanitizeCell(t.user.name),
    email:     sanitizeCell(t.user.email),
    subjects:  sanitizeCell(t.subjects),
    phone:     sanitizeCell(t.phone),
  }));

  const teacherSheet = XLSX.utils.json_to_sheet(teacherData);
  XLSX.utils.book_append_sheet(workbook, teacherSheet, "Teachers");

  // HOLIDAYS
  const holidays = await prisma.holiday.findMany({
    where: { schoolId }
  });

  const holidaySheet = XLSX.utils.json_to_sheet(holidays);
  XLSX.utils.book_append_sheet(workbook, holidaySheet, "Holidays");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx"
  });
};

// ─── Classes ──────────────────────────────────────────────────────────────────
async function handleClasses(rows, tx, schoolId) {
  let success = 0;
  const errors = [];

  // Determine if the first row is a header row by checking if column A contains "class"
  let startIndex = 0;
  if (rows.length > 0 && rows[0][0] && String(rows[0][0]).toLowerCase().includes("class")) {
    startIndex = 1;
  }

  for (let i = startIndex; i < rows.length; i++) {
    const r = rows[i];
    try {
      // ── 1. Skip completely empty rows ────────────────────────────────────
      const rawName     = r[0]; // Column A
      const rawPeriods  = r[1]; // Column B
      const rawSubjects = r[2]; // Column C

      if (rawName === undefined && rawPeriods === undefined && rawSubjects === undefined) continue;

      // ── 2. Normalise values ──────────────────────────────────────────────
      const className   = rawName    !== undefined ? String(rawName).trim()   : "";
      const periodsRaw  = rawPeriods !== undefined ? String(rawPeriods).trim() : "";
      const subjectsRaw = rawSubjects !== undefined ? String(rawSubjects).trim() : "";

      // ── 3. Validate required fields ──────────────────────────────────────
      if (!className)   throw new Error("Class Name is required");
      if (!periodsRaw)  throw new Error("Periods / Day is required");
      if (!subjectsRaw) throw new Error("Subjects are required");

      const periodsPerDay = Number(periodsRaw);
      if (!Number.isInteger(periodsPerDay) || periodsPerDay < 1 || periodsPerDay > 20) {
        throw new Error(`Periods / Day must be a whole number between 1 and 20 (got: ${periodsRaw})`);
      }

      // ── 4. Parse subjects — comma-separated, trim & dedupe ───────────────
      const subjects = [...new Set(
        subjectsRaw.split(",").map(s => s.trim()).filter(Boolean)
      )];

      if (subjects.length === 0) throw new Error("At least one valid subject is required");

      // ── 5. Duplicate class name check (within this school) ───────────────
      const existing = await tx.classConfig.findFirst({
        where: { schoolId, name: className }
      });
      if (existing) throw new Error(`Class "${className}" already exists`);

      // ── 6. Create class ──────────────────────────────────────────────────
      const newClass = await tx.classConfig.create({
        data: { schoolId, name: className, periodsPerDay }
      });

      // ── 7. Create subjects (relational, same as class.service.js) ────────
      await tx.subject.createMany({
        data: subjects.map(name => ({ name, classId: newClass.id }))
      });

      success++;
    } catch (err) {
      errors.push({ row: i + 2, error: err.message }); // +2 = header + 1-index
    }
  }

  if (success === 0 && errors.length === 0 && rows.length > 0) {
    throw new Error("No valid data found. Did you forget the column headers (Class Name, Periods / Day, Subjects)?");
  }

  return { success, failed: errors.length, errors };
}

async function handleSchools(rows, tx) {
  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.name || !r.code || !r.email || !r.password) {
        throw new Error("Missing required fields: name, code, email, password");
      }

      // Check if school code or email already exists
      const existingSchool = await tx.school.findUnique({ where: { code: r.code } });
      if (existingSchool) throw new Error(`School code ${r.code} already exists`);

      const existingUser = await tx.user.findUnique({ where: { email: r.email } });
      if (existingUser) throw new Error(`Email ${r.email} already exists`);

      // 1. Create School
      const school = await tx.school.create({
        data: {
          name: r.name,
          code: r.code,
          location: r.location || '-',
          status: 'ACTIVE'
        }
      });

      // 2. Create Principal User
      const hashed = await bcrypt.hash(String(r.password), 10);
      await tx.user.create({
        data: {
          name: r.principalName || 'Principal',
          email: r.email,
          password: hashed,
          role: 'principal',
          schoolId: school.id,
          userCode: `${r.code}-PR-001`
        }
      });

      success++;
    } catch (err) {
      failed++;
      errors.push({ row: i + 1, error: err.message });
    }
  }

  return { success, failed, errors };
}

async function handleSchedule(rows, tx, schoolId) {
  let success = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.class || !r.subject || !r.teacherEmail || !r.day || !r.startTime || !r.endTime) {
        throw new Error("Missing required fields");
      }

      // Find teacher
      const teacherUser = await tx.user.findFirst({
        where: { email: r.teacherEmail, role: "teacher", schoolId }
      });

      if (!teacherUser) throw new Error(`Teacher email ${r.teacherEmail} not found`);

      const teacher = await tx.teacher.findUnique({
        where: { userId: teacherUser.id }
      });

      if (!teacher) throw new Error("Teacher record not found");

      // Check teacher conflict
      const teacherConflict = await tx.schedule.findFirst({
        where: {
          schoolId,
          teacherId: teacher.id,
          day: r.day,
          startTime: r.startTime
        }
      });

      if (teacherConflict) throw new Error(`Teacher already has a class on ${r.day} at ${r.startTime}`);

      // Check class conflict
      const classConflict = await tx.schedule.findFirst({
        where: {
          schoolId,
          class: String(r.class),
          day: r.day,
          startTime: r.startTime
        }
      });

      if (classConflict) throw new Error(`Class ${r.class} already has a subject on ${r.day} at ${r.startTime}`);

      await tx.schedule.create({
        data: {
          schoolId,
          class: String(r.class),
          subject: r.subject,
          teacherId: teacher.id,
          day: r.day,
          startTime: r.startTime,
          endTime: r.endTime
        }
      });

      success++;
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }

  return { success, failed: errors.length, errors };
}

async function handleFees(rows, tx, schoolId) {
  let success = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.studentEmail || !r.class || !r.totalFee || !r.dueDate) {
        throw new Error("Missing required fields");
      }

      // Find student
      const studentUser = await tx.user.findFirst({
        where: { email: r.studentEmail, role: "student", schoolId }
      });

      if (!studentUser) throw new Error(`Student email ${r.studentEmail} not found`);

      const student = await tx.student.findUnique({
        where: { userId: studentUser.id }
      });

      if (!student) throw new Error("Student record not found");

      const totalFee = Number(r.totalFee);
      const paidAmount = Number(r.paidAmount) || 0;
      
      if (isNaN(totalFee) || isNaN(paidAmount)) {
        throw new Error("totalFee and paidAmount must be valid numbers");
      }

      const pendingAmount = totalFee - paidAmount;
      const paymentStatus = pendingAmount <= 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "PENDING";

      await tx.fee.create({
        data: {
          schoolId,
          studentId: student.id,
          studentName: studentUser.name,
          class: String(r.class),
          totalFee,
          paidAmount,
          pendingAmount,
          paymentStatus,
          feeType: r.feeType || "Tuition",
          dueDate: new Date(r.dueDate)
        }
      });

      success++;
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }

  return { success, failed: errors.length, errors };
}