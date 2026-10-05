const featureService = require("./feature.service");

/**
 * GET /api/superadmin/school/:id/features
 * Super Admin retrieves full feature configuration & audit history for a school.
 */
exports.getSchoolFeaturesForAdmin = async (req, res) => {
  try {
    const schoolId = Number(req.params.id);
    if (!schoolId) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const result = await featureService.getSchoolFeaturesForAdmin(schoolId);
    return res.json(result);
  } catch (err) {
    console.error("getSchoolFeaturesForAdmin error:", err);
    return res.status(err.status || 500).json({ message: err.message || "Failed to load features" });
  }
};

/**
 * PATCH /api/superadmin/school/:id/features
 * Super Admin updates feature configurations for a school.
 */
exports.updateSchoolFeatures = async (req, res) => {
  try {
    const schoolId = Number(req.params.id);
    if (!schoolId) {
      return res.status(400).json({ message: "Invalid school ID" });
    }

    const { features } = req.body;
    if (!features || typeof features !== "object") {
      return res.status(400).json({ message: "features object is required" });
    }

    const result = await featureService.updateSchoolFeatures(schoolId, features, {
      id: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.get("User-Agent"),
    });

    return res.json({
      message: "School features updated successfully",
      ...result,
    });
  } catch (err) {
    console.error("updateSchoolFeatures error:", err);
    return res.status(err.status || 500).json({ message: err.message || "Failed to update features" });
  }
};

/**
 * GET /api/superadmin/features/definitions
 * Super Admin retrieves available feature definitions and schema metadata.
 */
exports.getFeatureDefinitions = async (req, res) => {
  try {
    return res.json({
      definitions: featureService.FEATURE_DEFINITIONS,
      categories: featureService.FEATURE_CATEGORIES,
      attendanceModes: featureService.ATTENDANCE_MODES,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to retrieve feature definitions" });
  }
};

/**
 * GET /api/school/features
 * Returns effective features for the logged-in user's school context.
 */
exports.getCurrentSchoolFeatures = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      if (req.user?.role === "superadmin") {
        return res.json({ isSuperAdmin: true, features: {} });
      }
      return res.status(401).json({ message: "No school context found for user" });
    }

    const effective = await featureService.getEffectiveFeatures(schoolId);
    return res.json({
      schoolId,
      features: effective,
    });
  } catch (err) {
    console.error("getCurrentSchoolFeatures error:", err);
    return res.status(500).json({ message: "Failed to retrieve school features" });
  }
};
