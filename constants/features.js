/**
 * Centralized School Feature Constants and Definitions
 *
 * All feature keys, categories, default values, and dependency rules
 * are defined in this single source of truth.
 */

const FEATURES = Object.freeze({
  // Attendance
  ATTENDANCE: "ATTENDANCE",
  ATTENDANCE_MODE: "ATTENDANCE_MODE",

  // Academic
  ACADEMIC_YEAR_MANAGEMENT: "ACADEMIC_YEAR_MANAGEMENT",
  PRINCIPAL_CREATE_ACADEMIC_YEAR: "PRINCIPAL_CREATE_ACADEMIC_YEAR",
  STUDENT_PROMOTION: "STUDENT_PROMOTION",

  // Class Management
  CLASS_MENTOR: "CLASS_MENTOR",
  MENTOR_DASHBOARD: "MENTOR_DASHBOARD",
  MENTOR_EXPORT: "MENTOR_EXPORT",

  // Communication
  MENTOR_PARENT_CONTACT: "MENTOR_PARENT_CONTACT",
  AI_PARENT_CALLING: "AI_PARENT_CALLING",
  AI_ABSENCE_CALLING: "AI_ABSENCE_CALLING",
  AI_FEE_REMINDER_CALLING: "AI_FEE_REMINDER_CALLING",
  MENTOR_PARENT_COMMUNICATION: "MENTOR_PARENT_COMMUNICATION",
  CALL_ANALYTICS: "CALL_ANALYTICS",
  CALL_EXPORT: "CALL_EXPORT",

  // Finance
  MENTOR_FEE_VISIBILITY: "MENTOR_FEE_VISIBILITY",
  FEE_MENTOR_UPDATE_REQUEST: "FEE_MENTOR_UPDATE_REQUEST",
  FEE_AUDIT_APPROVAL: "FEE_AUDIT_APPROVAL",
});

const FEATURE_CATEGORIES = Object.freeze({
  ATTENDANCE: "Attendance",
  ACADEMIC: "Academic",
  CLASS_MANAGEMENT: "Class Management",
  COMMUNICATION: "Communication",
  FINANCE: "Finance",
});

const ATTENDANCE_MODES = Object.freeze({
  PERIOD_BY_PERIOD: "PERIOD_BY_PERIOD",
  TWO_TIMES_PER_DAY: "TWO_TIMES_PER_DAY",
  ONCE_DAILY: "ONCE_DAILY",
});

/**
 * Metadata definitions for all configurable features
 */
const FEATURE_DEFINITIONS = Object.freeze({
  [FEATURES.ATTENDANCE]: {
    key: FEATURES.ATTENDANCE,
    name: "Attendance System",
    description: "Controls whether the school's attendance recording and tracking functionality is enabled.",
    category: FEATURE_CATEGORIES.ATTENDANCE,
    type: "boolean",
    defaultValue: true,
    dependsOn: null,
  },
  [FEATURES.ATTENDANCE_MODE]: {
    key: FEATURES.ATTENDANCE_MODE,
    name: "Attendance Mode",
    description: "Determines how teachers submit attendance (Period-by-Period vs. Twice-Daily AM/PM vs. Once Daily).",
    category: FEATURE_CATEGORIES.ATTENDANCE,
    type: "select",
    defaultValue: ATTENDANCE_MODES.TWO_TIMES_PER_DAY,
    options: [
      { value: "TWO_TIMES_PER_DAY", label: "Twice Per Day (AM / PM)" },
      { value: "PERIOD_BY_PERIOD", label: "Period by Period" },
      { value: "ONCE_DAILY", label: "Once Daily" },
    ],
    dependsOn: FEATURES.ATTENDANCE,
  },
  [FEATURES.ACADEMIC_YEAR_MANAGEMENT]: {
    key: FEATURES.ACADEMIC_YEAR_MANAGEMENT,
    name: "Academic Year Management",
    description: "Enables managing school academic sessions, dates, and active/completed year states.",
    category: FEATURE_CATEGORIES.ACADEMIC,
    type: "boolean",
    defaultValue: true,
    dependsOn: null,
  },
  [FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR]: {
    key: FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR,
    name: "Principal New Academic Year Creation",
    description: "Controls whether the School Principal is permitted to create a new academic year session.",
    category: FEATURE_CATEGORIES.ACADEMIC,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.ACADEMIC_YEAR_MANAGEMENT,
  },
  [FEATURES.STUDENT_PROMOTION]: {
    key: FEATURES.STUDENT_PROMOTION,
    name: "Student Promotion",
    description: "Enables bulk student promotion between classes and academic years.",
    category: FEATURE_CATEGORIES.ACADEMIC,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.ACADEMIC_YEAR_MANAGEMENT,
  },
  [FEATURES.CLASS_MENTOR]: {
    key: FEATURES.CLASS_MENTOR,
    name: "Class Mentor System",
    description: "Enables faculty assignment as Class Mentors for dedicated class/student oversight.",
    category: FEATURE_CATEGORIES.CLASS_MANAGEMENT,
    type: "boolean",
    defaultValue: true,
    dependsOn: null,
  },
  [FEATURES.MENTOR_DASHBOARD]: {
    key: FEATURES.MENTOR_DASHBOARD,
    name: "Mentor Dashboard",
    description: "Allows assigned mentors to view their designated class overview, attendance, and student list.",
    category: FEATURE_CATEGORIES.CLASS_MANAGEMENT,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.CLASS_MENTOR,
  },
  [FEATURES.MENTOR_EXPORT]: {
    key: FEATURES.MENTOR_EXPORT,
    name: "Mentor Export",
    description: "Permits mentors to download/export class records and performance reports.",
    category: FEATURE_CATEGORIES.CLASS_MANAGEMENT,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.CLASS_MENTOR,
  },
  [FEATURES.MENTOR_PARENT_CONTACT]: {
    key: FEATURES.MENTOR_PARENT_CONTACT,
    name: "Parent Contact Access for Mentors",
    description: "Controls whether mentors can view and call parent phone numbers and contact details.",
    category: FEATURE_CATEGORIES.COMMUNICATION,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.CLASS_MENTOR,
  },
  [FEATURES.MENTOR_FEE_VISIBILITY]: {
    key: FEATURES.MENTOR_FEE_VISIBILITY,
    name: "Fee Visibility for Mentor",
    description: "Controls whether mentors can view student fee payment status, pending amounts, and balances.",
    category: FEATURE_CATEGORIES.FINANCE,
    type: "boolean",
    defaultValue: false,
    dependsOn: FEATURES.CLASS_MENTOR,
  },
  [FEATURES.AI_PARENT_CALLING]: {
    key: FEATURES.AI_PARENT_CALLING,
    name: "AI Parent Calling Agent",
    description: "Master toggle for AI-driven automated voice calls to parents for school events.",
    category: FEATURE_CATEGORIES.COMMUNICATION,
    type: "boolean",
    defaultValue: true,
    dependsOn: null,
  },
  [FEATURES.AI_ABSENCE_CALLING]: {
    key: FEATURES.AI_ABSENCE_CALLING,
    name: "AI Absence Calling",
    description: "Automatically calls parents when students are marked absent.",
    category: FEATURE_CATEGORIES.COMMUNICATION,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.AI_PARENT_CALLING,
  },
  [FEATURES.AI_FEE_REMINDER_CALLING]: {
    key: FEATURES.AI_FEE_REMINDER_CALLING,
    name: "AI Fee Reminder Calling",
    description: "Automatically calls parents when fee payments become overdue.",
    category: FEATURE_CATEGORIES.COMMUNICATION,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.AI_PARENT_CALLING,
  },
  [FEATURES.MENTOR_PARENT_COMMUNICATION]: {
    key: FEATURES.MENTOR_PARENT_COMMUNICATION,
    name: "Mentor Parent Communication & Calling",
    description: "Enables the Mentor Calling Dashboard and manual call triggers for assigned class/section.",
    category: FEATURE_CATEGORIES.COMMUNICATION,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.CLASS_MENTOR,
  },
  [FEATURES.CALL_ANALYTICS]: {
    key: FEATURES.CALL_ANALYTICS,
    name: "Call Analytics & Visual Trends",
    description: "Enables call duration analytics, trend charts, and school/mentor distribution reports.",
    category: FEATURE_CATEGORIES.COMMUNICATION,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.AI_PARENT_CALLING,
  },
  [FEATURES.CALL_EXPORT]: {
    key: FEATURES.CALL_EXPORT,
    name: "Call Records Export",
    description: "Allows exporting call logs, durations, and summaries to Excel/CSV.",
    category: FEATURE_CATEGORIES.COMMUNICATION,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.CALL_ANALYTICS,
  },
  [FEATURES.FEE_MENTOR_UPDATE_REQUEST]: {
    key: FEATURES.FEE_MENTOR_UPDATE_REQUEST,
    name: "Mentor Fee Update Requests",
    description: "Allows Class Mentors to submit fee update, correction, or waiver proposals for their students.",
    category: FEATURE_CATEGORIES.FINANCE,
    type: "boolean",
    defaultValue: true,
    dependsOn: FEATURES.CLASS_MENTOR,
  },
  [FEATURES.FEE_AUDIT_APPROVAL]: {
    key: FEATURES.FEE_AUDIT_APPROVAL,
    name: "Fee Audit & Approval Workflow",
    description: "Requires Fee Auditor verification and approval before any mentor-submitted fee change is applied to the ledger.",
    category: FEATURE_CATEGORIES.FINANCE,
    type: "boolean",
    defaultValue: true,
    dependsOn: null,
  },
});

module.exports = {
  FEATURES,
  FEATURE_CATEGORIES,
  ATTENDANCE_MODES,
  FEATURE_DEFINITIONS,
};
