const featureService = require("../modules/feature/feature.service");

/**
 * Feature Guard Middleware
 *
 * Enforces per-school feature toggles at the backend route level.
 * Rejects with 403 FEATURE_DISABLED if the feature is disabled for the user's school.
 *
 * @param {string} featureKey - Feature constant key (e.g. "CLASS_MENTOR", "ATTENDANCE")
 */
module.exports = (featureKey) => {
  return async (req, res, next) => {
    try {
      // Super Admin operating on a specific school passed via params/query/body
      if (req.user?.role === "superadmin") {
        const targetSchoolId = req.params?.schoolId || req.params?.id || req.query?.schoolId || req.body?.schoolId;
        if (targetSchoolId) {
          const isAllowed = await featureService.isEnabled(Number(targetSchoolId), featureKey);
          if (!isAllowed) {
            return res.status(403).json({
              code: "FEATURE_DISABLED",
              message: `This feature is currently disabled for this school.`,
              feature: featureKey,
            });
          }
        }
        return next();
      }

      const schoolId = req.user?.schoolId;
      if (!schoolId) {
        return res.status(401).json({ message: "Unauthorized: No school context found" });
      }

      const isAllowed = await featureService.isEnabled(schoolId, featureKey);
      if (!isAllowed) {
        return res.status(403).json({
          code: "FEATURE_DISABLED",
          message: "This feature is currently disabled for your school. Please contact your school administrator.",
          feature: featureKey,
        });
      }

      // Attach effective features to req for downstream usage without extra DB calls
      req.effectiveFeatures = await featureService.getEffectiveFeatures(schoolId);
      next();
    } catch (err) {
      console.error(`featureGuard [${featureKey}] error:`, err);
      return res.status(500).json({ message: "Feature guard error: " + err.message });
    }
  };
};
