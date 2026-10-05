const prisma = require("../../config/prisma");

// ✅ CREATE
exports.createHoliday = async (data, user) => {

  const date = new Date(data.date);
  date.setHours(0, 0, 0, 0);

  return prisma.$transaction(async (tx) => {

    // 🔥 1. PREVENT DUPLICATE HOLIDAY
    const existingHoliday = await tx.holiday.findFirst({
      where: {
        schoolId: user.schoolId,
        date,
        title: data.title
      }
    });

    if (existingHoliday) {
      throw new Error("Holiday already exists for this date");
    }

    // 🔥 2. CREATE HOLIDAY
    const holiday = await tx.holiday.create({
      data: {
        schoolId: user.schoolId,
        title: data.title,
        description: data.description,
        date
      }
    });

    // 🔥 3. CREATE NOTIFICATION (NO NEED EXTRA CHECK NOW)
    await tx.notification.create({
      data: {
        schoolId: user.schoolId,
        role: "ALL",
        title: "Holiday Declared",
        message: `${data.title} on ${date.toDateString()}`,
        type: "HOLIDAY"
      }
    });

    return holiday;
  });
};
// ✅ GET ALL (for all users)
exports.getHolidays = async (user) => {
  return prisma.holiday.findMany({
    where: {
      schoolId: user.schoolId
    },
    orderBy: {
      date: "asc"
    }
  });
};

// ✅ UPDATE
exports.updateHoliday = async (id, data, user) => {

  const holiday = await prisma.holiday.findFirst({
    where: {
      id,
      schoolId: user.schoolId
    }
  });

  if (!holiday) throw new Error("Holiday not found");

  return prisma.holiday.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      date: new Date(data.date)
    }
  });
};

// ✅ DELETE
exports.deleteHoliday = async (id, user) => {

  const holiday = await prisma.holiday.findFirst({
    where: {
      id,
      schoolId: user.schoolId
    }
  });

  if (!holiday) throw new Error("Holiday not found");

  return prisma.holiday.delete({
    where: { id }
  });
};