const cron = require("node-cron");
const prisma = require("../../config/prisma");

// 🗑 Runs daily at 2:00 AM — deletes call queue entries older than 30 days
cron.schedule("0 2 * * *", async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.dailyAbsenteeCallQueue.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo }
      }
    });

    console.log(`🧹 Call Queue Cleanup: ${result.count} records deleted (>30 days old)`);
  } catch (err) {
    console.error("Call Queue Cleanup Error:", err.message);
  }
});
