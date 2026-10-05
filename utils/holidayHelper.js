const prisma = require("../config/prisma");

exports.isHoliday = async (schoolId, date) => {

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const holiday = await prisma.holiday.findFirst({
    where: {
      schoolId,
      date: {
        gte: start,
        lte: end
      }
    }
  });

  return !!holiday;
};