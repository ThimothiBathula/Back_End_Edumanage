const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

module.exports = async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Attach capability flags dynamically for base role + assignment model
    if (req.user.role === "teacher") {
      try {
        const [mentorAssigned, accountantAssigned] = await Promise.all([
          prisma.classMentor.findFirst({
            where: { teacher: { userId: req.user.id }, isActive: true, schoolId: req.user.schoolId },
            select: { id: true, classId: true }
          }),
          prisma.accountantAssignment.findFirst({
            where: { userId: req.user.id, isActive: true, schoolId: req.user.schoolId },
            select: { id: true }
          })
        ]);
        req.user.isMentor = !!mentorAssigned;
        req.user.mentorClassId = mentorAssigned?.classId || null;
        req.user.isAccountant = !!accountantAssigned;
      } catch (dbErr) {
        // Fallback gracefully without breaking request
        req.user.isMentor = false;
        req.user.isAccountant = false;
      }
    } else if (req.user.role === "accountant") {
      req.user.isAccountant = true;
    } else if (req.user.role === "principal" || req.user.role === "superadmin") {
      req.user.isAccountant = true;
      req.user.isMentor = true;
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};