require("dotenv").config();

// ============================================================
// 🔐 STARTUP SECURITY VALIDATION — Fail fast on bad config
// ============================================================
const REQUIRED_ENV = ["JWT_SECRET", "DATABASE_URL"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("[FATAL] JWT_SECRET must be at least 32 characters long.");
  process.exit(1);
}

require("./utils/syllabusCron");

const app = require("./app");

app.listen(5000, () => {
  console.log("Server running on port 5000");
});