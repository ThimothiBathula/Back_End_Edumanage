const prisma = require("../../config/prisma");
const {
  FEATURES,
  FEATURE_CATEGORIES,
  ATTENDANCE_MODES,
  FEATURE_DEFINITIONS,
} = require("../../constants/features");

// In-memory cache for fast authorization lookups
// Cache structure: Map<schoolId, { effective, stored, timestamp }>
const featureCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL

/**
 * Invalidate the cache for a specific school or all schools.
 */
function invalidateCache(schoolId = null) {
  if (schoolId) {
    featureCache.delete(Number(schoolId));
  } else {
    featureCache.clear();
  }
}

/**
 * Map between ATTENDANCE_MODE values and Prisma AttendanceMode enum values.
 */
function mapAttendanceModeToPrisma(mode) {
  if (mode === ATTENDANCE_MODES.PERIOD_BY_PERIOD || mode === "PERIOD_WISE") {
    return "PERIOD_WISE";
  }
  if (mode === ATTENDANCE_MODES.ONCE_DAILY) {
    return "ONCE_DAILY";
  }
  return "TWICE_DAILY";
}

function mapPrismaToAttendanceMode(enumVal) {
  if (enumVal === "PERIOD_WISE") return ATTENDANCE_MODES.PERIOD_BY_PERIOD;
  if (enumVal === "ONCE_DAILY") return ATTENDANCE_MODES.ONCE_DAILY;
  return ATTENDANCE_MODES.TWO_TIMES_PER_DAY;
}

/**
 * Ensure default feature rows exist for a school in the database.
 * Backward compatible with existing schools.
 */
async function ensureSchoolFeatureRows(schoolId, tx = prisma) {
  const school = await tx.school.findUnique({
    where: { id: Number(schoolId) },
    select: {
      id: true,
      canCreateAcademicYear: true,
      attendanceMode: true,
      activeServices: true,
    },
  });

  if (!school) throw new Error(`School with ID ${schoolId} not found`);

  // Parse activeServices if stored as string
  let parsedServices = school.activeServices;
  if (typeof parsedServices === "string") {
    try {
      parsedServices = JSON.parse(parsedServices);
    } catch {
      parsedServices = {};
    }
  }

  const existingFeatures = await tx.schoolFeature.findMany({
    where: { schoolId: Number(schoolId) },
  });

  const existingKeys = new Set(existingFeatures.map((f) => f.featureKey));
  const missingKeys = Object.keys(FEATURE_DEFINITIONS).filter((k) => !existingKeys.has(k));

  if (missingKeys.length > 0) {
    const toCreate = missingKeys.map((key) => {
      let enabled = FEATURE_DEFINITIONS[key].defaultValue;
      let configuration = null;

      // Migrate from existing school columns if present
      if (key === FEATURES.ATTENDANCE) {
        if (parsedServices && typeof parsedServices.attendance === "boolean") {
          enabled = parsedServices.attendance;
        } else {
          enabled = true;
        }
      } else if (key === FEATURES.ATTENDANCE_MODE) {
        const modeVal = mapPrismaToAttendanceMode(school.attendanceMode);
        enabled = true;
        configuration = { mode: modeVal };
      } else if (key === FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR) {
        enabled = school.canCreateAcademicYear !== false;
      }

      return {
        schoolId: Number(schoolId),
        featureKey: key,
        enabled: Boolean(enabled),
        configuration: configuration ? configuration : undefined,
      };
    });

    await tx.schoolFeature.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }
}

/**
 * Retrieve stored feature settings for a school from the database.
 * Automatically bootstraps defaults if missing.
 */
async function getStoredFeatures(schoolId) {
  const sid = Number(schoolId);
  await ensureSchoolFeatureRows(sid);

  const rows = await prisma.schoolFeature.findMany({
    where: { schoolId: sid },
  });

  const stored = {};
  for (const defKey of Object.keys(FEATURE_DEFINITIONS)) {
    const row = rows.find((r) => r.featureKey === defKey);
    const def = FEATURE_DEFINITIONS[defKey];

    if (row) {
      stored[defKey] = {
        enabled: row.enabled,
        configuration: row.configuration,
        value: def.type === "select" ? (row.configuration?.mode || def.defaultValue) : row.enabled,
        updatedAt: row.updatedAt,
      };
    } else {
      stored[defKey] = {
        enabled: def.defaultValue,
        configuration: def.type === "select" ? { mode: def.defaultValue } : null,
        value: def.defaultValue,
        updatedAt: null,
      };
    }
  }

  return stored;
}

/**
 * Calculate the effective feature states taking dependencies into account.
 *
 * Dependency rules:
 * - CLASS_MENTOR = OFF automatically disables:
 *   MENTOR_DASHBOARD, MENTOR_EXPORT, MENTOR_PARENT_CONTACT, MENTOR_FEE_VISIBILITY
 * - ATTENDANCE = OFF disables ATTENDANCE_MODE
 * - ACADEMIC_YEAR_MANAGEMENT = OFF disables:
 *   PRINCIPAL_CREATE_ACADEMIC_YEAR, STUDENT_PROMOTION
 */
function computeEffectiveFeatures(stored) {
  const effective = {};
  const dependencyInfo = {};

  // 1. Attendance
  const attendanceStored = stored[FEATURES.ATTENDANCE]?.enabled ?? true;
  effective[FEATURES.ATTENDANCE] = attendanceStored;
  dependencyInfo[FEATURES.ATTENDANCE] = {
    isEffective: attendanceStored,
    isDisabledByDependency: false,
    reason: null,
  };

  // Attendance Mode
  const attendanceModeVal = stored[FEATURES.ATTENDANCE_MODE]?.value || ATTENDANCE_MODES.TWO_TIMES_PER_DAY;
  effective[FEATURES.ATTENDANCE_MODE] = attendanceStored ? attendanceModeVal : null;
  dependencyInfo[FEATURES.ATTENDANCE_MODE] = {
    isEffective: attendanceStored,
    isDisabledByDependency: !attendanceStored,
    reason: !attendanceStored ? "Attendance System is disabled" : null,
  };

  // 2. Academic Year Management
  const academicYearStored = stored[FEATURES.ACADEMIC_YEAR_MANAGEMENT]?.enabled ?? true;
  effective[FEATURES.ACADEMIC_YEAR_MANAGEMENT] = academicYearStored;
  dependencyInfo[FEATURES.ACADEMIC_YEAR_MANAGEMENT] = {
    isEffective: academicYearStored,
    isDisabledByDependency: false,
    reason: null,
  };

  // Principal Create Academic Year
  const principalCreateStored = stored[FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR]?.enabled ?? true;
  const principalCreateEffective = academicYearStored && principalCreateStored;
  effective[FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR] = principalCreateEffective;
  dependencyInfo[FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR] = {
    isEffective: principalCreateEffective,
    isDisabledByDependency: !academicYearStored,
    reason: !academicYearStored ? "Academic Year Management is disabled" : null,
  };

  // Student Promotion
  const promotionStored = stored[FEATURES.STUDENT_PROMOTION]?.enabled ?? true;
  const promotionEffective = academicYearStored && promotionStored;
  effective[FEATURES.STUDENT_PROMOTION] = promotionEffective;
  dependencyInfo[FEATURES.STUDENT_PROMOTION] = {
    isEffective: promotionEffective,
    isDisabledByDependency: !academicYearStored,
    reason: !academicYearStored ? "Academic Year Management is disabled" : null,
  };

  // 3. Class Mentor System
  const classMentorStored = stored[FEATURES.CLASS_MENTOR]?.enabled ?? true;
  effective[FEATURES.CLASS_MENTOR] = classMentorStored;
  dependencyInfo[FEATURES.CLASS_MENTOR] = {
    isEffective: classMentorStored,
    isDisabledByDependency: false,
    reason: null,
  };

  // Mentor Dashboard
  const mentorDashboardStored = stored[FEATURES.MENTOR_DASHBOARD]?.enabled ?? true;
  const mentorDashboardEffective = classMentorStored && mentorDashboardStored;
  effective[FEATURES.MENTOR_DASHBOARD] = mentorDashboardEffective;
  dependencyInfo[FEATURES.MENTOR_DASHBOARD] = {
    isEffective: mentorDashboardEffective,
    isDisabledByDependency: !classMentorStored,
    reason: !classMentorStored ? "Class Mentor System is disabled" : null,
  };

  // Mentor Export
  const mentorExportStored = stored[FEATURES.MENTOR_EXPORT]?.enabled ?? true;
  const mentorExportEffective = classMentorStored && mentorExportStored;
  effective[FEATURES.MENTOR_EXPORT] = mentorExportEffective;
  dependencyInfo[FEATURES.MENTOR_EXPORT] = {
    isEffective: mentorExportEffective,
    isDisabledByDependency: !classMentorStored,
    reason: !classMentorStored ? "Class Mentor System is disabled" : null,
  };

  // Mentor Parent Contact
  const mentorContactStored = stored[FEATURES.MENTOR_PARENT_CONTACT]?.enabled ?? true;
  const mentorContactEffective = classMentorStored && mentorContactStored;
  effective[FEATURES.MENTOR_PARENT_CONTACT] = mentorContactEffective;
  dependencyInfo[FEATURES.MENTOR_PARENT_CONTACT] = {
    isEffective: mentorContactEffective,
    isDisabledByDependency: !classMentorStored,
    reason: !classMentorStored ? "Class Mentor System is disabled" : null,
  };

  // Mentor Fee Visibility
  const mentorFeeStored = stored[FEATURES.MENTOR_FEE_VISIBILITY]?.enabled ?? false;
  const mentorFeeEffective = classMentorStored && mentorFeeStored;
  effective[FEATURES.MENTOR_FEE_VISIBILITY] = mentorFeeEffective;
  dependencyInfo[FEATURES.MENTOR_FEE_VISIBILITY] = {
    isEffective: mentorFeeEffective,
    isDisabledByDependency: !classMentorStored,
    reason: !classMentorStored ? "Class Mentor System is disabled" : null,
  };

  // Mentor Parent Communication
  const mentorCommStored = stored[FEATURES.MENTOR_PARENT_COMMUNICATION]?.enabled ?? true;
  const mentorCommEffective = classMentorStored && mentorCommStored;
  effective[FEATURES.MENTOR_PARENT_COMMUNICATION] = mentorCommEffective;
  dependencyInfo[FEATURES.MENTOR_PARENT_COMMUNICATION] = {
    isEffective: mentorCommEffective,
    isDisabledByDependency: !classMentorStored,
    reason: !classMentorStored ? "Class Mentor System is disabled" : null,
  };

  // Mentor Fee Update Request
  const mentorFeeReqStored = stored[FEATURES.FEE_MENTOR_UPDATE_REQUEST]?.enabled ?? true;
  const mentorFeeReqEffective = classMentorStored && mentorFeeReqStored;
  effective[FEATURES.FEE_MENTOR_UPDATE_REQUEST] = mentorFeeReqEffective;
  dependencyInfo[FEATURES.FEE_MENTOR_UPDATE_REQUEST] = {
    isEffective: mentorFeeReqEffective,
    isDisabledByDependency: !classMentorStored,
    reason: !classMentorStored ? "Class Mentor System is disabled" : null,
  };

  // Fee Audit Approval
  const feeAuditStored = stored[FEATURES.FEE_AUDIT_APPROVAL]?.enabled ?? true;
  effective[FEATURES.FEE_AUDIT_APPROVAL] = feeAuditStored;
  dependencyInfo[FEATURES.FEE_AUDIT_APPROVAL] = {
    isEffective: feeAuditStored,
    isDisabledByDependency: false,
    reason: null,
  };

  // 4. AI Calling Agent
  const aiCallingStored = stored[FEATURES.AI_PARENT_CALLING]?.enabled ?? true;
  effective[FEATURES.AI_PARENT_CALLING] = aiCallingStored;
  dependencyInfo[FEATURES.AI_PARENT_CALLING] = {
    isEffective: aiCallingStored,
    isDisabledByDependency: false,
    reason: null,
  };

  // AI Absence Calling
  const absenceCallingStored = stored[FEATURES.AI_ABSENCE_CALLING]?.enabled ?? true;
  const absenceCallingEffective = aiCallingStored && attendanceStored && absenceCallingStored;
  effective[FEATURES.AI_ABSENCE_CALLING] = absenceCallingEffective;
  dependencyInfo[FEATURES.AI_ABSENCE_CALLING] = {
    isEffective: absenceCallingEffective,
    isDisabledByDependency: !aiCallingStored || !attendanceStored,
    reason: !aiCallingStored
      ? "AI Parent Calling is disabled"
      : !attendanceStored
      ? "Attendance System is disabled"
      : null,
  };

  // AI Fee Reminder Calling
  const feeReminderStored = stored[FEATURES.AI_FEE_REMINDER_CALLING]?.enabled ?? true;
  const feeReminderEffective = aiCallingStored && feeReminderStored;
  effective[FEATURES.AI_FEE_REMINDER_CALLING] = feeReminderEffective;
  dependencyInfo[FEATURES.AI_FEE_REMINDER_CALLING] = {
    isEffective: feeReminderEffective,
    isDisabledByDependency: !aiCallingStored,
    reason: !aiCallingStored ? "AI Parent Calling is disabled" : null,
  };

  // Call Analytics
  const callAnalyticsStored = stored[FEATURES.CALL_ANALYTICS]?.enabled ?? true;
  const callAnalyticsEffective = aiCallingStored && callAnalyticsStored;
  effective[FEATURES.CALL_ANALYTICS] = callAnalyticsEffective;
  dependencyInfo[FEATURES.CALL_ANALYTICS] = {
    isEffective: callAnalyticsEffective,
    isDisabledByDependency: !aiCallingStored,
    reason: !aiCallingStored ? "AI Parent Calling is disabled" : null,
  };

  // Call Export
  const callExportStored = stored[FEATURES.CALL_EXPORT]?.enabled ?? true;
  const callExportEffective = callAnalyticsEffective && callExportStored;
  effective[FEATURES.CALL_EXPORT] = callExportEffective;
  dependencyInfo[FEATURES.CALL_EXPORT] = {
    isEffective: callExportEffective,
    isDisabledByDependency: !callAnalyticsEffective,
    reason: !callAnalyticsEffective ? "Call Analytics is disabled" : null,
  };

  // CamelCase convenience aliases for frontend / backend code ergonomics
  const aliases = {
    attendance: effective[FEATURES.ATTENDANCE],
    attendanceMode: effective[FEATURES.ATTENDANCE_MODE],
    academicYearManagement: effective[FEATURES.ACADEMIC_YEAR_MANAGEMENT],
    principalCreateAcademicYear: effective[FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR],
    studentPromotion: effective[FEATURES.STUDENT_PROMOTION],
    classMentor: effective[FEATURES.CLASS_MENTOR],
    mentorDashboard: effective[FEATURES.MENTOR_DASHBOARD],
    mentorExport: effective[FEATURES.MENTOR_EXPORT],
    mentorParentContact: effective[FEATURES.MENTOR_PARENT_CONTACT],
    mentorFeeVisibility: effective[FEATURES.MENTOR_FEE_VISIBILITY],
    mentorParentCommunication: effective[FEATURES.MENTOR_PARENT_COMMUNICATION],
    mentorFeeUpdateRequest: effective[FEATURES.FEE_MENTOR_UPDATE_REQUEST],
    feeAuditApproval: effective[FEATURES.FEE_AUDIT_APPROVAL],
    aiParentCalling: effective[FEATURES.AI_PARENT_CALLING],
    aiAbsenceCalling: effective[FEATURES.AI_ABSENCE_CALLING],
    aiFeeReminderCalling: effective[FEATURES.AI_FEE_REMINDER_CALLING],
    callAnalytics: effective[FEATURES.CALL_ANALYTICS],
    callExport: effective[FEATURES.CALL_EXPORT],
  };

  return {
    ...effective,
    ...aliases,
    _dependencyInfo: dependencyInfo,
  };
}

/**
 * Get effective features for a school with caching.
 */
async function getEffectiveFeatures(schoolId) {
  const sid = Number(schoolId);
  const now = Date.now();

  const cached = featureCache.get(sid);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.effective;
  }

  const stored = await getStoredFeatures(sid);
  const effective = computeEffectiveFeatures(stored);

  featureCache.set(sid, {
    stored,
    effective,
    timestamp: now,
  });

  return effective;
}

/**
 * Check if a specific feature is enabled for a given school.
 * Returns a boolean.
 */
async function isEnabled(schoolId, featureKey) {
  if (!schoolId) return false;
  const effective = await getEffectiveFeatures(schoolId);
  return Boolean(effective[featureKey]);
}

/**
 * Get feature configuration value (e.g. attendance mode string).
 */
async function getFeatureConfig(schoolId, featureKey) {
  const effective = await getEffectiveFeatures(schoolId);
  return effective[featureKey];
}

/**
 * Get full feature administration payload for Super Admin UI.
 */
async function getSchoolFeaturesForAdmin(schoolId) {
  const sid = Number(schoolId);
  const school = await prisma.school.findUnique({
    where: { id: sid },
    select: { id: true, name: true, code: true, status: true },
  });

  if (!school) throw new Error("School not found");

  const stored = await getStoredFeatures(sid);
  const effective = computeEffectiveFeatures(stored);

  // Group definitions by category
  const categorized = {};
  for (const cat of Object.values(FEATURE_CATEGORIES)) {
    categorized[cat] = [];
  }

  for (const [key, def] of Object.entries(FEATURE_DEFINITIONS)) {
    const storeInfo = stored[key] || {};
    const depInfo = effective._dependencyInfo?.[key] || {};

    categorized[def.category].push({
      key,
      name: def.name,
      description: def.description,
      type: def.type,
      options: def.options || null,
      dependsOn: def.dependsOn,
      storedEnabled: storeInfo.enabled,
      storedValue: storeInfo.value,
      effectiveEnabled: Boolean(effective[key]),
      isDisabledByDependency: depInfo.isDisabledByDependency || false,
      dependencyReason: depInfo.reason || null,
      updatedAt: storeInfo.updatedAt,
    });
  }

  // Get recent feature audit logs for this school
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      schoolId: sid,
      module: "FEATURE",
    },
    orderBy: { timestamp: "desc" },
    take: 20,
    include: {
      user: { select: { name: true, email: true, role: true } },
    },
  });

  return {
    school,
    categories: categorized,
    effective,
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.actionType,
      featureKey: log.newData?.featureKey || log.oldData?.featureKey,
      previous: log.oldData,
      current: log.newData,
      changedBy: log.user?.email || log.user?.name || "System",
      changedByRole: log.changedByRole,
      timestamp: log.timestamp,
    })),
  };
}

/**
 * Super Admin updates feature configurations for a school.
 * Records audit logs, synchronizes legacy columns, and flushes cache.
 *
 * @param {number} schoolId
 * @param {object} updates - Map of featureKey -> { enabled, value, configuration } or boolean/value
 * @param {object} user - Super admin user object
 */
async function updateSchoolFeatures(schoolId, updates, user) {
  const sid = Number(schoolId);
  const school = await prisma.school.findUnique({
    where: { id: sid },
  });
  if (!school) throw new Error("School not found");

  // Normalize updates if passed as array or wrapped in { features: [...] }
  let normalizedUpdates = {};
  if (Array.isArray(updates)) {
    for (const item of updates) {
      if (item && item.featureKey) {
        normalizedUpdates[item.featureKey] = item;
      }
    }
  } else if (updates && Array.isArray(updates.features)) {
    for (const item of updates.features) {
      if (item && item.featureKey) {
        normalizedUpdates[item.featureKey] = item;
      }
    }
  } else if (updates && typeof updates === "object") {
    if (updates.features && typeof updates.features === "object" && !Array.isArray(updates.features)) {
      normalizedUpdates = { ...updates.features };
    } else {
      normalizedUpdates = { ...updates };
    }
  }

  const existingStored = await getStoredFeatures(sid);
  const auditEntries = [];

  const result = await prisma.$transaction(async (tx) => {
    for (const [key, rawVal] of Object.entries(normalizedUpdates)) {
      if (!FEATURE_DEFINITIONS[key]) continue;

      const def = FEATURE_DEFINITIONS[key];
      let newEnabled;
      let newConfig = null;

      if (typeof rawVal === "object" && rawVal !== null) {
        newEnabled = rawVal.enabled !== undefined ? Boolean(rawVal.enabled) : true;
        if (rawVal.configuration) {
          newConfig = rawVal.configuration;
        } else if (rawVal.value !== undefined) {
          newConfig = def.type === "select" ? { mode: rawVal.value } : null;
        }
      } else if (typeof rawVal === "boolean") {
        newEnabled = rawVal;
      } else if (typeof rawVal === "string") {
        newEnabled = true;
        newConfig = { mode: rawVal };
      } else {
        newEnabled = Boolean(rawVal);
      }

      const prev = existingStored[key];
      const hasChanged =
        !prev ||
        prev.enabled !== newEnabled ||
        JSON.stringify(prev.configuration) !== JSON.stringify(newConfig);

      if (hasChanged) {
        await tx.schoolFeature.upsert({
          where: {
            schoolId_featureKey: {
              schoolId: sid,
              featureKey: key,
            },
          },
          update: {
            enabled: newEnabled,
            configuration: newConfig ? newConfig : undefined,
          },
          create: {
            schoolId: sid,
            featureKey: key,
            enabled: newEnabled,
            configuration: newConfig ? newConfig : undefined,
          },
        });

        auditEntries.push({
          featureKey: key,
          previous: prev ? { enabled: prev.enabled, value: prev.value } : null,
          current: { enabled: newEnabled, value: newConfig?.mode || newEnabled },
        });

        // Backward compatibility sync with School table columns
        if (key === FEATURES.ATTENDANCE) {
          let currentServices = school.activeServices;
          if (typeof currentServices === "string") {
            try { currentServices = JSON.parse(currentServices); } catch { currentServices = {}; }
          }
          currentServices = { ...currentServices, attendance: newEnabled };
          await tx.school.update({
            where: { id: sid },
            data: { activeServices: currentServices },
          });
        } else if (key === FEATURES.ATTENDANCE_MODE) {
          const selectedMode = newConfig?.mode || ATTENDANCE_MODES.TWO_TIMES_PER_DAY;
          await tx.school.update({
            where: { id: sid },
            data: { attendanceMode: mapAttendanceModeToPrisma(selectedMode) },
          });
        } else if (key === FEATURES.PRINCIPAL_CREATE_ACADEMIC_YEAR) {
          await tx.school.update({
            where: { id: sid },
            data: { canCreateAcademicYear: newEnabled },
          });
        }
      }
    }

    return true;
  });

  // Write audit logs for each changed feature
  const revokeExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  let validUserId = user?.id;
  if (validUserId) {
    const userCheck = await prisma.user.findUnique({ where: { id: validUserId }, select: { id: true } });
    if (!userCheck) {
      const fallbackAdmin = await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true } });
      validUserId = fallbackAdmin?.id || null;
    }
  }

  if (validUserId) {
    for (const entry of auditEntries) {
      try {
        await prisma.auditLog.create({
          data: {
            schoolId: sid,
            module: "FEATURE",
            actionType: "UPDATE",
            entityId: sid,
            entityType: "SchoolFeature",
            oldData: {
              featureKey: entry.featureKey,
              ...entry.previous,
            },
            newData: {
              featureKey: entry.featureKey,
              ...entry.current,
            },
            changedBy: validUserId,
            changedByRole: user?.role || "superadmin",
            revokeExpiry,
            ipAddress: user?.ipAddress || null,
            userAgent: user?.userAgent || null,
          },
        });
      } catch (auditErr) {
        console.error("Feature audit log writing failed:", auditErr.message);
      }
    }
  }

  // Invalidate cache immediately
  invalidateCache(sid);

  return getSchoolFeaturesForAdmin(sid);
}

/**
 * Migration utility: ensure all existing schools in DB have initial SchoolFeature rows.
 */
async function migrateExistingSchools() {
  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  for (const school of schools) {
    await ensureSchoolFeatureRows(school.id);
  }

  return schools.length;
}

module.exports = {
  FEATURES,
  FEATURE_CATEGORIES,
  ATTENDANCE_MODES,
  FEATURE_DEFINITIONS,
  getStoredFeatures,
  getEffectiveFeatures,
  isEnabled,
  getFeatureConfig,
  getSchoolFeaturesForAdmin,
  updateSchoolFeatures,
  migrateExistingSchools,
  invalidateCache,
  mapAttendanceModeToPrisma,
  mapPrismaToAttendanceMode,
};
