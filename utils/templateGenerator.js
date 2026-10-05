/**
 * Enterprise-grade Excel Template Generator
 * Field keys EXACTLY match what bulk.service.js reads from each row.
 */

const XLSX = require("xlsx");

// ─── Template definitions ─────────────────────────────────────────────────────
const TEMPLATE_DEFINITIONS = {

  // ──────────────────────────────────────────────────────────────────────────
  // STUDENTS
  // Backend reads: name, email, password, class, phone, dob, fatherName, motherName
  // ──────────────────────────────────────────────────────────────────────────
  students: {
    filename: "students_bulk_template.xlsx",
    sheetName: "Students",
    columns: [
      { key: "name",        label: "Full Name *",      required: true,  sample: "Rahul Kumar",        hint: "Full name of the student (required)" },
      { key: "email",       label: "Email *",          required: true,  sample: "rahul@school.edu",   hint: "Must be unique across the system. Used as login." },
      { key: "password",    label: "Password *",       required: true,  sample: "Rahul@123",          hint: "Min 6 characters. If blank, default is 'default123'" },
      { key: "phone",       label: "Phone *",          required: true,  sample: "9876543210",         hint: "10-digit mobile number only" },
      { key: "dob",         label: "Date of Birth *",  required: true,  sample: "15-08-2010",         hint: "Format: DD-MM-YYYY (e.g. 15-08-2010)" },
      { key: "gender",      label: "Gender",           required: false, sample: "MALE",               hint: "Allowed: MALE, FEMALE, OTHER" },
      { key: "class",       label: "Class *",          required: true,  sample: "10A",                hint: "Must exactly match an existing class name in the system" },
      { key: "fatherName",  label: "Father Name *",    required: true,  sample: "Ramesh Kumar",       hint: "Father or guardian name" },
      { key: "motherName",  label: "Mother Name *",    required: true,  sample: "Sita Devi",          hint: "Mother name" },
      { key: "address",     label: "Address",          required: false, sample: "Hyderabad",          hint: "Optional residential address" },
      { key: "status",      label: "Status",           required: false, sample: "ACTIVE",             hint: "Allowed: ACTIVE, INACTIVE. Default: ACTIVE" },
    ],
    instructions: [
      ["Field",         "Required?", "Rule / Allowed Values"],
      ["Full Name",     "YES",       "Full name of the student."],
      ["Email",         "YES",       "Must be unique. Will be the student's login email."],
      ["Password",      "YES",       "Min 6 characters. Recommended: include uppercase + number."],
      ["Phone",         "YES",       "10 digits only. No spaces, dashes, or country codes."],
      ["Date of Birth", "YES",       "Format: DD-MM-YYYY (e.g. 15-08-2010). Other formats will fail."],
      ["Gender",        "NO",        "Allowed values: MALE, FEMALE, OTHER (uppercase only)."],
      ["Class",         "YES",       "Must exactly match a class created in the system (e.g. 10A, not '10 A')."],
      ["Father Name",   "YES",       "Father or guardian's full name."],
      ["Mother Name",   "YES",       "Mother's full name."],
      ["Address",       "NO",        "Optional. Any free-form text."],
      ["Status",        "NO",        "Allowed: ACTIVE or INACTIVE. Defaults to ACTIVE if blank."],
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // TEACHERS
  // Backend reads: name, email, password, subjects, qualification, phone, dob, experience
  // ──────────────────────────────────────────────────────────────────────────
  teachers: {
    filename: "teachers_bulk_template.xlsx",
    sheetName: "Teachers",
    columns: [
      { key: "name",          label: "Full Name *",      required: true,  sample: "Rajesh Kumar",          hint: "Full name of the teacher (required)" },
      { key: "email",         label: "Email *",          required: true,  sample: "rajesh@school.edu",     hint: "Must be unique. Used as login email." },
      { key: "password",      label: "Password *",       required: true,  sample: "Rajesh@123",            hint: "Min 6 characters. If blank, default is 'default123'" },
      { key: "phone",         label: "Phone *",          required: true,  sample: "9876543210",            hint: "10-digit mobile number only" },
      { key: "subjects",      label: "Subject *",        required: true,  sample: "Mathematics",           hint: "Subject name(s). Separate multiple with comma: Math,Physics" },
      { key: "qualification", label: "Qualification *",  required: true,  sample: "M.Sc Mathematics",      hint: "Highest academic qualification" },
      { key: "experience",    label: "Experience (yrs)", required: false, sample: "5",                     hint: "Number of years of teaching experience" },
      { key: "dob",           label: "Date of Birth",   required: false, sample: "10-06-1990",            hint: "Format: DD-MM-YYYY (e.g. 10-06-1990)" },
      { key: "gender",        label: "Gender",          required: false, sample: "MALE",                  hint: "Allowed: MALE, FEMALE, OTHER" },
      { key: "status",        label: "Status",          required: false, sample: "ACTIVE",                hint: "Allowed: ACTIVE, INACTIVE. Default: ACTIVE" },
    ],
    instructions: [
      ["Field",            "Required?", "Rule / Allowed Values"],
      ["Full Name",        "YES",       "Full name of the teacher."],
      ["Email",            "YES",       "Must be unique. Will be the teacher's login email."],
      ["Password",         "YES",       "Min 6 characters. Recommended: include uppercase + number."],
      ["Phone",            "YES",       "10 digits only. No spaces, dashes, or country codes."],
      ["Subject",          "YES",       "One or more subjects. Separate with commas (e.g. Math,Physics). No leading spaces."],
      ["Qualification",    "YES",       "Highest academic qualification (e.g. M.Sc, B.Ed)."],
      ["Experience (yrs)", "NO",        "Whole number (e.g. 5). Leave blank for 0."],
      ["Date of Birth",    "NO",        "Format: DD-MM-YYYY (e.g. 10-06-1990)."],
      ["Gender",           "NO",        "Allowed values: MALE, FEMALE, OTHER (uppercase only)."],
      ["Status",           "NO",        "Allowed: ACTIVE or INACTIVE. Defaults to ACTIVE if blank."],
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // SCHEDULE
  // Backend reads: class, subject, teacherEmail, day, startTime, endTime
  // ──────────────────────────────────────────────────────────────────────────
  schedule: {
    filename: "schedule_bulk_template.xlsx",
    sheetName: "Schedule",
    columns: [
      { key: "class",        label: "Class *",         required: true, sample: "10A",              hint: "Must match existing class name exactly" },
      { key: "subject",      label: "Subject *",       required: true, sample: "Mathematics",      hint: "Must match a subject assigned to this class" },
      { key: "teacherEmail", label: "Teacher Email *", required: true, sample: "rajesh@school.edu",hint: "Must be an existing teacher email in the system" },
      { key: "day",          label: "Day *",           required: true, sample: "Monday",           hint: "Allowed: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday" },
      { key: "startTime",    label: "Start Time *",    required: true, sample: "09:00",            hint: "24-hour format HH:MM (e.g. 09:00, 14:30)" },
      { key: "endTime",      label: "End Time *",      required: true, sample: "09:45",            hint: "24-hour HH:MM. Must be after Start Time." },
    ],
    instructions: [
      ["Field",         "Required?", "Rule / Allowed Values"],
      ["Class",         "YES",       "Must exactly match an existing class (e.g. 10A)."],
      ["Subject",       "YES",       "Must match a subject assigned to the given class."],
      ["Teacher Email", "YES",       "Must be an existing teacher in the system."],
      ["Day",           "YES",       "Allowed: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday."],
      ["Start Time",    "YES",       "24-hour format HH:MM (e.g. 09:00, 13:30)."],
      ["End Time",      "YES",       "24-hour format HH:MM. Must be after Start Time."],
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // FEES
  // Backend reads: studentEmail, class, totalFee, paidAmount, feeType, dueDate
  // ──────────────────────────────────────────────────────────────────────────
  fees: {
    filename: "fees_bulk_template.xlsx",
    sheetName: "Fees",
    columns: [
      { key: "studentEmail", label: "Student Email *", required: true,  sample: "rahul@school.edu", hint: "Must match an existing student email" },
      { key: "class",        label: "Class *",         required: true,  sample: "10A",              hint: "Must match the student's class" },
      { key: "totalFee",     label: "Total Fee *",     required: true,  sample: "50000",            hint: "Numeric only — no ₹ or commas (e.g. 50000)" },
      { key: "paidAmount",   label: "Paid Amount *",   required: true,  sample: "10000",            hint: "Numeric. Can be 0 if no payment yet" },
      { key: "feeType",      label: "Fee Type *",      required: true,  sample: "Tuition",          hint: "E.g. Tuition, Transport, Hostel, Sports" },
      { key: "dueDate",      label: "Due Date *",      required: true,  sample: "2025-06-30",       hint: "Format: YYYY-MM-DD (e.g. 2025-06-30)" },
    ],
    instructions: [
      ["Field",        "Required?", "Rule / Allowed Values"],
      ["Student Email","YES",       "Must exactly match an existing student in the system."],
      ["Class",        "YES",       "Must match the student's enrolled class."],
      ["Total Fee",    "YES",       "Plain numbers — no ₹, commas, or spaces (e.g. 50000)."],
      ["Paid Amount",  "YES",       "Can be 0 if no payment yet. Must be ≤ Total Fee."],
      ["Fee Type",     "YES",       "Any label: Tuition, Transport, Hostel, Exam Fee, etc."],
      ["Due Date",     "YES",       "Format: YYYY-MM-DD. Other formats will be rejected."],
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // SCHOOLS
  // Backend reads: name, code, location, principalName, email, password, phone
  // ──────────────────────────────────────────────────────────────────────────
  schools: {
    filename: "schools_bulk_template.xlsx",
    sheetName: "Schools",
    columns: [
      { key: "name",          label: "School Name *",     required: true, sample: "Springfield High School", hint: "Full official name" },
      { key: "code",          label: "School Code *",     required: true, sample: "SHS-001",                 hint: "Unique code. 3-10 chars. No spaces." },
      { key: "location",      label: "Location *",        required: true, sample: "Mumbai, Maharashtra",     hint: "City or full address" },
      { key: "principalName", label: "Principal Name *",  required: true, sample: "Dr. Seymour Skinner",    hint: "Full name of the principal" },
      { key: "email",         label: "Principal Email *", required: true, sample: "principal@shs.edu",       hint: "Must be unique. Will be login email." },
      { key: "password",      label: "Initial Password *",required: true, sample: "School@2025",             hint: "Min 8 chars with uppercase + number" },
      { key: "phone",         label: "Phone *",           required: true, sample: "9876543210",              hint: "10-digit contact number" },
    ],
    instructions: [
      ["Field",           "Required?", "Rule / Allowed Values"],
      ["School Name",     "YES",       "Official school name."],
      ["School Code",     "YES",       "Must be globally unique. No spaces. Recommended: uppercase (e.g. SHS-001)."],
      ["Location",        "YES",       "City or full address."],
      ["Principal Name",  "YES",       "Principal's full name."],
      ["Principal Email", "YES",       "Must be globally unique. Will be used as login."],
      ["Initial Password","YES",       "Min 8 characters with uppercase, lowercase, and a number."],
      ["Phone",           "YES",       "10 digits, no dashes or spaces."],
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CLASSES
  // Backend reads: "Class Name", "Periods / Day", "Subjects"
  // ──────────────────────────────────────────────────────────────────────────
  classes: {
    filename: "classes_bulk_template.xlsx",
    sheetName: "Classes",
    columns: [
      { key: "Class Name",    label: "Class Name *",    required: true,  sample: "10A",                               hint: "Must be unique within the school (e.g. 1, 10A, XI-Science)" },
      { key: "Periods / Day", label: "Periods / Day *", required: true,  sample: "7",                                 hint: "Whole number between 1 and 20 (e.g. 7)" },
      { key: "Subjects",      label: "Subjects *",      required: true,  sample: "Maths,Science,English,Telugu,Hindi", hint: "Comma-separated list. No leading/trailing spaces (e.g. Maths,Science,English)" },
    ],
    instructions: [
      ["Field",          "Required?", "Rule / Allowed Values"],
      ["Class Name",     "YES",       "Must be unique within the school. Numeric values like 1, 2 are accepted."],
      ["Periods / Day",  "YES",       "Whole number between 1 and 20. Represents daily periods count."],
      ["Subjects",       "YES",       "Comma-separated. Spaces around commas are trimmed. Duplicates are removed."],
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // IMAGE GUIDE
  // ──────────────────────────────────────────────────────────────────────────
  "image-guide": {
    filename: "image_upload_guide.xlsx",
    sheetName: "Image Guide",
    columns: [
      { key: "step",    label: "Step",    required: false, sample: "1",                      hint: "" },
      { key: "topic",   label: "Topic",   required: false, sample: "Supported Formats",      hint: "" },
      { key: "details", label: "Details", required: false, sample: "JPG or PNG only, max 5MB", hint: "" },
    ],
    customRows: [
      ["1", "Supported Formats",      "JPG, JPEG, PNG only. WebP and HEIC are not supported."],
      ["2", "File Size",              "Maximum 5MB per image."],
      ["3", "Naming — by Email",      "Name file using user email: rahul@school.edu.jpg"],
      ["4", "Naming — by User Code",  "Or by user code: STU-1042.png or TCH-205.jpg"],
      ["5", "Upload Method",          "Use Student/Teacher profile in the portal — NOT this Excel uploader."],
      ["6", "Batch Upload",           "Use /api/media/batch-upload for bulk image ingestion."],
      ["7", "Common Mistake",         "Do NOT include spaces or special characters in filenames."],
    ],
    instructions: [
      ["Topic",          "Details"],
      ["Purpose",        "This guide explains how to correctly upload profile images in bulk."],
      ["Not an Upload",  "This file is for reference only. Do NOT upload it through the Bulk Upload page."],
      ["Formats",        "JPG, JPEG, PNG — max 5MB each."],
      ["Naming",         "Use user email OR user code as the filename (see main sheet for examples)."],
    ],
  },
};

// ─── Build Data Sheet ─────────────────────────────────────────────────────────
function buildDataSheet(definition) {
  const { columns, customRows } = definition;

  const headerRow = columns.map(c => c.label);
  const rows = customRows || [columns.map(c => c.sample)];
  const aoaData = [headerRow, ...rows];

  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  // Auto column widths
  ws["!cols"] = columns.map(c => ({ wch: Math.max(c.label.length + 4, 22) }));

  // Add cell comments on header row explaining each field
  columns.forEach((col, i) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
    if (!ws[cellRef]) return;
    const lines = [
      col.required ? "✅ REQUIRED" : "⬜ OPTIONAL",
    ];
    if (col.hint) lines.push(`ℹ️  ${col.hint}`);
    ws[cellRef].c = [{ a: "EduManage", t: lines.join("\n") }];
    ws[cellRef].c.hidden = false;
  });

  // Comment on first data cell: "this is a sample row — delete before uploading"
  const firstCell = XLSX.utils.encode_cell({ r: 1, c: 0 });
  if (ws[firstCell]) {
    ws[firstCell].c = [{ a: "EduManage", t: "⚠️ SAMPLE ROW — DELETE THIS ROW before uploading your real data." }];
  }

  return ws;
}

// ─── Build Instructions Sheet ─────────────────────────────────────────────────
function buildInstructionSheet(definition) {
  const rows = [
    ["📋 BULK UPLOAD INSTRUCTIONS — EduManage School Management System"],
    [],
    ["HOW TO USE THIS TEMPLATE"],
    ["1. Your data sheet is the first sheet (e.g. 'Students', 'Teachers')."],
    ["2. Do NOT change Column headers in Row 1."],
    ["3. Row 2 is a sample row — DELETE IT before uploading real data."],
    ["4. Fill your data from Row 3 onwards."],
    ["5. Save as .xlsx format only."],
    ["6. Upload via: Bulk Upload → Select Type → Upload File."],
    [],
    ["─────────────────────────────────────────────────────────────────"],
    ["FIELD REFERENCE"],
    ["─────────────────────────────────────────────────────────────────"],
    ["Field", "Required?", "Rule / Allowed Values"],
    ...definition.instructions,
    [],
    ["─────────────────────────────────────────────────────────────────"],
    ["LEGEND"],
    ["─────────────────────────────────────────────────────────────────"],
    ["* in column header", "→", "Required field. Every row must have a value."],
    ["No *",               "→", "Optional. Leave blank if not applicable."],
    [],
    ["─────────────────────────────────────────────────────────────────"],
    ["VALIDATION RULES"],
    ["─────────────────────────────────────────────────────────────────"],
    ["Gender",        "→", "MALE, FEMALE, OTHER (uppercase only)"],
    ["Status",        "→", "ACTIVE or INACTIVE (uppercase only). Default: ACTIVE"],
    ["Date of Birth", "→", "Format: DD-MM-YYYY (e.g. 15-08-2010)"],
    ["Due Date",      "→", "Format: YYYY-MM-DD (e.g. 2025-06-30)"],
    ["Phone",         "→", "10 digits only. No spaces, dashes, or country codes."],
    ["Email",         "→", "Must be valid and unique across the system."],
    ["Fee Amounts",   "→", "Plain numbers only — no ₹ symbol, no commas (e.g. 50000)."],
    [],
    ["─────────────────────────────────────────────────────────────────"],
    ["DO's AND DON'Ts"],
    ["─────────────────────────────────────────────────────────────────"],
    ["✅ DO",   "→", "Use exact class names as they appear in the system (e.g. '10A', not '10 A')."],
    ["✅ DO",   "→", "Delete the sample row (Row 2) before uploading."],
    ["✅ DO",   "→", "Keep all header names exactly as provided."],
    ["❌ DON'T","→", "Change or delete column headers."],
    ["❌ DON'T","→", "Add extra columns."],
    ["❌ DON'T","→", "Save in .csv or .xls format — use .xlsx only."],
    ["❌ DON'T","→", "Include currency symbols (₹, $) in fee fields."],
    [],
    ["─────────────────────────────────────────────────────────────────"],
    ["COMMON MISTAKES"],
    ["─────────────────────────────────────────────────────────────────"],
    ["1.", "Duplicate email → Each email must be unique. Row will be skipped if email already exists."],
    ["2.", "Wrong class name → 'Class 10A' will fail if system has '10A'. Use exact spelling."],
    ["3.", "Wrong date format → Use DD-MM-YYYY for Date of Birth, YYYY-MM-DD for Due Date."],
    ["4.", "Subject with spaces → 'Math, Physics' creates ' Physics' (leading space). Use 'Math,Physics'."],
    ["5.", "Missing required field → Any row missing a * field will fail with an error."],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 65 }];
  return ws;
}

// ─── Main export ──────────────────────────────────────────────────────────────
function generateTemplate(type) {
  const definition = TEMPLATE_DEFINITIONS[type];
  if (!definition) throw new Error(`Unknown template type: ${type}`);

  const wb = XLSX.utils.book_new();

  const dataSheet = buildDataSheet(definition);
  XLSX.utils.book_append_sheet(wb, dataSheet, definition.sheetName || "Template");

  const instrSheet = buildInstructionSheet(definition);
  XLSX.utils.book_append_sheet(wb, instrSheet, "📋 Instructions");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return { buffer, filename: definition.filename };
}

module.exports = { generateTemplate, TEMPLATE_DEFINITIONS };
