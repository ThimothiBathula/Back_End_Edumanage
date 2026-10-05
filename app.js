const express = require("express");
const rateLimit = require("express-rate-limit");
const classRoutes = require("./modules/class/class.routes");
const app = express();
const helmet = require("helmet");
require("./modules/cron/otpCleanup");
require("./modules/cron/callQueueCleanup"); // 🗑 30-day DailyAbsenteeCallQueue retention
const cookieParser = require("cookie-parser");
app.use(cookieParser());
const morgan = require("morgan");

// ============================================================
// 🔐 SECURITY HEADERS — Helmet with explicit CSP
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "https://res.cloudinary.com", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// ============================================================
// 🌐 CORS — Production-safe, reads allowed origins from env
// ============================================================
//process.env.CORS_ORIGIN || 
const cors = require("cors");
const allowedOrigins = ("http://localhost:5173,http://localhost:5174,http://localhost:3000,https://edumanag.netlify.app")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {

    // Allow requests without origin
    // (Postman, mobile apps, server requests)
    if (!origin) {
      return callback(null, true);
    }

    // Allow trusted origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Reject unknown origins
    return callback(
      new Error(`CORS policy: origin ${origin} is not allowed`)
    );
  },

  credentials: true
}));

// ============================================================
// 📝 LOGGING
// ============================================================
if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// ============================================================
// 📦 BODY PARSING
// ============================================================
app.use(express.json({ limit: "1mb" }));
app.use(require("./middlewares/sanitize"));

// ============================================================
// 🚦 RATE LIMITING
// ============================================================

// Global: 200 requests per IP per minute across all APIs
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." }
});
app.use("/api/", globalLimiter);

// Strict: Login endpoints — 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again in 15 minutes." }
});
app.use("/api/auth/staff-login", loginLimiter);
app.use("/api/auth/student-login", loginLimiter);
app.use("/api/auth/super-admin-login", loginLimiter);

// Write limiter: upload & feedback endpoints — 30 per minute
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many submissions. Please wait a moment." }
});
app.use("/api/student/feedback", writeLimiter);
app.use("/api/bulk", writeLimiter);

// ============================================================
// 🗂 ROUTES
// ============================================================
app.use("/api/superadmin", require("./modules/superadmin/superadmin.routes"));
app.use("/api/principal", require("./modules/principal/principal.routes"));
app.use("/api/auth", require("./modules/auth/auth.routes"));
app.use("/api/attendance", require("./modules/attendance/attendance.routes"));
app.use("/api/marks", require("./modules/marks/marks.routes"));
app.use("/api/reports", require("./modules/reports/reports.routes"));
app.use("/api/correction", require("./modules/correction/correction.routes"));
app.use("/api/teacher", require("./modules/teacher/teacher.routes"));
app.use("/api/student", require("./modules/student/student.routes"));
app.use("/api/schedule", require("./modules/schedule/schedule.routes"));
app.use("/api/syllabus", require("./modules/syllabus/syllabus.routes"));
app.use("/api/notifications", require("./modules/notification/notification.routes"));
app.use("/api/holidays", require("./modules/holiday/holiday.routes"));
app.use("/api/bulk", require("./modules/bulk/bulk.routes"));
app.use("/api/fees", require("./modules/fees/fee.routes"));
app.use("/api/audit", require("./modules/audit/audit.routes"));
app.use("/api/class", classRoutes);
app.use("/api/mentor", require("./modules/mentor/mentor.routes"));
app.use("/api/features", require("./modules/feature/feature.routes"));
app.use("/api/fee-audit", require("./modules/feeAudit/feeAudit.routes"));
app.use("/api/calling", require("./modules/calling/calling.routes"));

// ============================================================
// 🔧 CENTRALIZED ERROR HANDLER
// ============================================================
const { handleError } = require("./utils/errorHandler");
app.use(handleError);

module.exports = app;