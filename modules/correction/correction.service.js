const prisma = require("../../config/prisma");

// 🔹 CREATE REQUEST
exports.createRequest = async (data, user) => {
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) throw new Error("Teacher profile not found");

  return prisma.correctionRequest.create({
    data: {
      schoolId: user.schoolId,
      teacherId: teacher.id, // Fixed: use teacher.id
      studentId: data.studentId,
      type: data.type, // Fixed: missing type
      referenceId: data.referenceId || null,
      date: data.date ? new Date(data.date) : null,
      subject: data.subject || null,
      reason: data.reason,
      correctedValue: data.correctedValue
    }
  });
};


// 🔹 GET ALL REQUESTS (PRINCIPAL)
exports.getRequests = async (user) => {

  return prisma.correctionRequest.findMany({
    where: {
      schoolId: user.schoolId
    },
    include: {
      student: { select: { user: { select: { name: true } }, class: true } },
      teacher: { select: { user: { select: { name: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });
};

// teacher.service.js
exports.getMyRequestsTeacher = async (user) => {

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id }
  });

  if (!teacher) throw new Error("Teacher profile not found");

  return prisma.correctionRequest.findMany({
    where: {
      teacherId: teacher.id   // ✅ ONLY THEIR REQUESTS
    },
    include: {
      student: {
        select: {
          user: { select: { name: true } },
          class: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
};


// 🔹 APPROVE / REJECT
exports.updateRequest = async (id, status, user) => {

  return prisma.$transaction(async (tx) => {

    if (user.role !== "principal") {
      throw new Error("Unauthorized");
    }

    status = status.toUpperCase();

    const request = await tx.correctionRequest.findUnique({
      where: { id }
    });

    if (!request) throw new Error("Request not found");

    if (status === "APPROVED") {
      let referenceId = request.referenceId;

      if (!referenceId) {
        if (request.type === "ATTENDANCE" && request.date) {
          const start = new Date(request.date);
          start.setHours(start.getHours() - 24);
          const end = new Date(request.date);
          end.setHours(end.getHours() + 24);

          const attendance = await tx.attendance.findFirst({
            where: {
              studentId: request.studentId,
              date: { gte: start, lte: end },
              isDeleted: false
            }
          });
          if (attendance) referenceId = attendance.id;
        } else if (request.type === "MARKS" && request.date && request.subject) {
          const start = new Date(request.date);
          start.setHours(start.getHours() - 24);
          const end = new Date(request.date);
          end.setHours(end.getHours() + 24);

          const marks = await tx.marks.findFirst({
            where: {
              studentId: request.studentId,
              date: { gte: start, lte: end },
              subject: { name: request.subject },
              isDeleted: false
            }
          });
          if (marks) referenceId = marks.id;
        }
      }

      if (referenceId) {

        if (request.type === "ATTENDANCE") {
          await tx.attendance.updateMany({
            where: { id: referenceId },
            data: {
              status: request.correctedValue === "PRESENT" ? "PRESENT" : "ABSENT"
            }
          });
        }

        if (request.type === "MARKS") {
          const marksValue = Number(request.correctedValue);

          if (isNaN(marksValue)) {
            throw new Error("Invalid marks value");
          }

          await tx.marks.updateMany({
            where: { id: referenceId },
            data: { marks: marksValue }
          });
        }
      }
    }

    return tx.correctionRequest.update({
      where: { id },
      data: { status }
    });
  });
};