const service = require("./auth.service");
const { loginSchema } = require("./auth.validation");

const handleLoginResponse = (res, result) => {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("accessToken", result.token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    path: "/",
  });

  return res.status(200).json({
    message: "Login successful",
    user: result.user
  });
};

exports.studentLogin = async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    // Students only
    const result = await service.login({ ...req.body, allowedRoles: ["student"] });
    return handleLoginResponse(res, result);
  } catch (err) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
};

exports.staffLogin = async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    // Staff roles
    const result = await service.login({
      ...req.body,
      allowedRoles: ["teacher", "principal", "hod", "accountant", "receptionist", "fee_auditor", "auditor"]
    });
    return handleLoginResponse(res, result);
  } catch (err) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
};

exports.superAdminLogin = async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    // Super admin only
    const result = await service.login({ ...req.body, allowedRoles: ["superadmin"] });
    return handleLoginResponse(res, result);
  } catch (err) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
};

exports.logout = async (req, res) => {
  try {
    // Clear the cookie — no service call needed
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "Strict" : "Lax",
      path: "/",
    });

    return res.json({ message: "Logged out successfully" });

  } catch (err) {
    return res.status(500).json({ message: "Logout failed" });
  }
};

const otpService = require("./otp.service");
const authService = require("./auth.service");

// SEND OTP
exports.sendOTP = async (req, res) => {
  try {
    let { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Valid email is required" });
    }

    email = email.toLowerCase().trim();

    await otpService.sendOTP(email);

    return res.json({
      message: "OTP sent successfully. Please check your email.",
      otpSent: true
    });

  } catch (err) {

    if (err.message === "EMAIL_NOT_FOUND") {
      return res.status(404).json({
        message: "No account found with this email address.",
        otpSent: false
      });
    }

    if (err.message.includes("Too many")) {
      return res.status(429).json({ message: err.message, otpSent: false });
    }

    return res.status(500).json({
      message: "Failed to send OTP. Please try again.",
      otpSent: false
    });
  }
};

// VERIFY OTP
exports.verifyOTP = async (req, res) => {
  try {
    let { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        message: "Email and code are required"
      });
    }

    email = email.toLowerCase().trim();

    // 🔐 normalize code (important)
    code = String(code).trim();

    await otpService.verifyOTP(email, code);

    return res.json({ message: "OTP verified" });

  } catch (err) {

    return res.status(400).json({
      message: "Invalid or expired OTP"
    });
  }
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
  try {
    let { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        message: "Email and new password are required"
      });
    }

    email = email.toLowerCase().trim();

    // 🔐 Strong password policy
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters with uppercase, lowercase, and a number."
      });
    }

    await authService.resetPassword(email, newPassword);

    // 🔐 Clear session (important)
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "Strict" : "Lax",
      path: "/"
    });

    return res.json({
      message: "Password updated successfully"
    });

  } catch (err) {

    // 🔐 Generic error (no info leak)
    return res.status(400).json({
      message: "Password reset failed. Please request a new OTP."
    });
  }
};

// UPDATE PROFILE
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, bio } = req.body;

    // Pass user.id from token, and the fields to update
    const updatedUser = await authService.updateProfile(req.user.id, { name, phone, bio });

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (err) {
    res.status(400).json({ message: err.message || "Failed to update profile" });
  }
};

// UPDATE PASSWORD (Logged In)
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters with uppercase, lowercase, and a number." });
    }

    await authService.updatePassword(req.user.id, currentPassword, newPassword);

    // Optional: Clear session after password update for security, though many apps just show a success toast.
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message || "Failed to update password" });
  }
};

// GET ME (Session validation)
exports.getMe = async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Return full enriched user data (includes email + role-specific fields)
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to validate session' });
  }
};