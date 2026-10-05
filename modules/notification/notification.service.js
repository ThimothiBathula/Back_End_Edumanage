const prisma = require("../../config/prisma");

// 🔔 CREATE NOTIFICATION (GENERIC)
exports.createNotification = async (data) => {
  return prisma.notification.create({
    data
  });
};

// 📢 PRINCIPAL BROADCAST
exports.broadcast = async (data, user) => {
  return prisma.notification.create({
    data: {
      schoolId: user.schoolId,
      // Store role uppercase (e.g. "STUDENT", "TEACHER") or null for "All"
      role: data.role ? data.role.toUpperCase() : null,
      title: data.title,
      message: data.message,
      type: data.type || "ANNOUNCEMENT"
    }
  });
};

// 📥 GET USER NOTIFICATIONS
exports.getMyNotifications = async (user) => {
  if (user.role === 'superadmin') {
    return prisma.notification.findMany({
      where: {
        userId: user.id
      },
      orderBy: { createdAt: "desc" }
    });
  }

  // Role stored uppercase in DB ("STUDENT", "TEACHER", "PRINCIPAL")
  // user.role is lowercase ("student", "teacher", "principal")
  const roleUpper = user.role.toUpperCase();

  return prisma.notification.findMany({
    where: {
      schoolId: user.schoolId,
      OR: [
        { userId: user.id },        // personal
        { role: roleUpper },        // role-based (case-matched)
        { role: null },             // broadcast to ALL (null role = everyone)
      ]
    },
    orderBy: { createdAt: "desc" }
  });
};

// ✅ MARK READ
exports.markAsRead = async (id, user) => {
  const whereClause = { id };
  if (user.role !== 'superadmin') {
    whereClause.schoolId = user.schoolId;
  }

  const notif = await prisma.notification.findFirst({
    where: whereClause
  });

  if (!notif) throw new Error("Notification not found");

  return prisma.notification.update({
    where: { id },
    data: { isRead: true }
  });
};