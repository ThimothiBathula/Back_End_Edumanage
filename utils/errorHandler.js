// 🔐 Centralized Error Handler
// MED-03 FIX: Stack traces are NEVER sent in HTTP responses (any environment).
// Full errors are only logged server-side. This prevents internal file paths,
// DB schema details, and logic leaking to clients via error responses.
exports.handleError = (err, req, res, next) => {
  // Always log full error server-side (replace with structured logger in production)
  console.error(`[ERROR] ${req.method} ${req.url} — ${err.message}`);

  const statusCode = err.status || 500;

  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File is too large. Maximum size allowed is 5MB." });
  }

  // Multer file type error
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ message: "Unexpected file field." });
  }

  // Prisma / database constraint errors — sanitize before responding
  const isPrismaError =
    err.code?.startsWith("P") ||
    err.message?.toLowerCase().includes("prisma") ||
    err.message?.toLowerCase().includes("unique constraint") ||
    err.message?.toLowerCase().includes("foreign key constraint");

  if (isPrismaError) {
    return res.status(400).json({
      message: "Database operation failed. Please check your input."
    });
  }

  // Operational errors (thrown intentionally with a user-safe message)
  if (err.isOperational || statusCode < 500) {
    return res.status(statusCode).json({ message: err.message });
  }

  // Generic server errors — never expose internals
  return res.status(500).json({
    message: "An unexpected server error occurred. Please try again later."
  });
};
