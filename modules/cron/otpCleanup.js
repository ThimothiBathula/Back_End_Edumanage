const cron = require("node-cron");
const prisma = require("../../config/prisma");

// 🔥 Runs every 10 minutes
cron.schedule("*/10 * * * *", async () => {
  try {
    const result = await prisma.otp.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    console.log(`🧹 OTP Cleanup: ${result.count} records deleted`);

  } catch (err) {
    console.error("OTP Cleanup Error:", err.message);
  }
});