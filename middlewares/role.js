module.exports = (...allowed) => {
  // flatten so role(["a","b"]) and role("a","b") both work
  const roles = allowed.flat();
  return (req, res, next) => {
    const userRole = req.user?.role;

    // 1. Direct base role match
    if (roles.includes(userRole)) {
      return next();
    }

    // 2. Capability match: if endpoint allows "accountant" and user has active accountant capability
    if (roles.includes("accountant") && req.user?.isAccountant) {
      return next();
    }

    // 3. Capability match: if endpoint allows "mentor" and user has active mentor capability
    if (roles.includes("mentor") && req.user?.isMentor) {
      return next();
    }

    return res.status(403).json({ message: "Forbidden" });
  };
};