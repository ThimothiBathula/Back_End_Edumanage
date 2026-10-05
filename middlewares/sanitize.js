// ============================================================
// 🔐 Input Sanitization Middleware
//
// CRIT-04 FIX: The previous regex sanitizer was stripping SQL keywords
// from ALL strings (e.g. "Select Johnson" → " Johnson"), corrupting
// legitimate data. Prisma already uses parameterized queries, so regex-
// based SQL injection stripping is redundant AND harmful.
//
// This replacement:
//   1. Only strips null bytes (which can cause issues in some DBs)
//   2. Trims leading/trailing whitespace
//   3. Does NOT strip any SQL keywords or HTML (React renders text nodes
//      safely by default; XSS prevention is done via Helmet CSP + output encoding)
// ============================================================

function sanitizeValue(value) {
  if (typeof value !== "string") return value;
  // Only strip null bytes — safe and non-destructive
  return value.replace(/\0/g, "").trim();
}

function sanitizeObject(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = typeof value === "object" && value !== null
      ? sanitizeObject(value)
      : sanitizeValue(value);
  }
  return cleaned;
}

module.exports = (req, res, next) => {
  if (req.body   && typeof req.body   === "object") req.body   = sanitizeObject(req.body);
  if (req.query  && typeof req.query  === "object") req.query  = sanitizeObject(req.query);
  if (req.params && typeof req.params === "object") req.params = sanitizeObject(req.params);
  next();
};
