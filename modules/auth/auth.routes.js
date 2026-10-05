const express = require("express");
const router = express.Router();

const controller = require("./auth.controller");

const loginLimiter = require("../../middlewares/loginRateLimiter");
const rateLimit = require("express-rate-limit");

const auth = require("../../middlewares/auth");

// ✅ DEFINE ipLimiter HERE
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

// ✅ APPLY BOTH LIMITERS HERE
router.post("/student-login", ipLimiter, loginLimiter, controller.studentLogin);
router.post("/staff-login", ipLimiter, loginLimiter, controller.staffLogin);
router.post("/super-admin-login", ipLimiter, loginLimiter, controller.superAdminLogin);
router.post("/logout", controller.logout);

router.post("/forgot-password", ipLimiter, controller.sendOTP);
router.post("/verify-otp", ipLimiter, loginLimiter, controller.verifyOTP);
router.post("/reset-password", ipLimiter, loginLimiter, controller.resetPassword);

// ✅ SESSION VALIDATION
router.get("/me", auth, controller.getMe);

// ✅ PROFILE UPDATES
router.put("/profile", auth, controller.updateProfile);
router.put("/password", auth, controller.updatePassword);

module.exports = router;