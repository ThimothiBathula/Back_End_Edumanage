const cron = require("node-cron");
const prisma = require("../config/prisma");

cron.schedule("0 9 * * *", async () => {
  console.log("⏰ Running syllabus alert job...");

  const currentWeek = Math.ceil(
    (new Date().getDate()) / 7
  );

  const pending = await prisma.syllabus.findMany({
    where: {
      status: "PENDING",
      week: { lt: currentWeek }
    },
    include: {
      teacher: {
        include: {
          user: true
        }
      }
    }
  });

  for (const item of pending) {

    await prisma.notification.create({
      data: {
        userId: item.teacher.userId,
        schoolId: item.schoolId,
        title: "Syllabus Pending",
        message: `Week ${item.week} topic "${item.topic}" is still pending`,
        type: "SYLLABUS_ALERT"
      }
    });

  }

  console.log(`📢 Alerts sent: ${pending.length}`);
});