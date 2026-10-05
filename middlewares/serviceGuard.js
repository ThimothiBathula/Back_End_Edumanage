const prisma = require("../config/prisma");

/**
 * Dynamic service module kill-switch middleware.
 *
 * Usage:
 *   router.post("/mark", auth, role(["teacher"]), checkServiceEnabled("attendance"), controller.mark);
 *
 * Reads school.activeServices JSON and returns 403 if the given service is false.
 * Attaches req.schoolServices to downstream handlers for convenience.
 *
 * @param {string} serviceName - Key in activeServices JSON ("attendance"|"fees"|"marks"|"calls")
 */
module.exports = (serviceName) => {
  return async (req, res, next) => {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) {
        return res.status(401).json({ message: "Unauthorized: no school context" });
      }

      const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { activeServices: true }
      });

      if (!school) {
        return res.status(404).json({ message: "School not found" });
      }

      // activeServices is stored as a Prisma Json field — parse if needed
      let services = school.activeServices;
      if (typeof services === "string") {
        try { services = JSON.parse(services); } catch { services = {}; }
      }

      if (services[serviceName] !== true) {
        return res.status(403).json({
          message: `Module disabled by platform admin`,
          service: serviceName
        });
      }

      // Attach for downstream use (avoids extra DB call)
      req.schoolServices = services;
      next();
    } catch (err) {
      return res.status(500).json({ message: "Service guard error: " + err.message });
    }
  };
};
