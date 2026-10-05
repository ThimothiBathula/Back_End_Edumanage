const roleMap = {
  principal: "P",
  teacher: "T",
  student: "S",
};

async function generateUserCode(tx, schoolId, role) {

  // 🔥 1. VALIDATE ROLE
  if (!roleMap[role]) {
    throw new Error("Invalid role");
  }

  // 🔥 2. GET SCHOOL (needed for code)
  const school = await tx.school.findUnique({
    where: { id: schoolId },
    select: { code: true } // optimized
  });

  if (!school) {
    throw new Error("School not found");
  }

  // 🔥 3. UPSERT COUNTER (SAFE)
  const counter = await tx.counter.upsert({
    where: {
      schoolId_role: { schoolId, role }
    },
    update: {
      value: { increment: 1 } // ✅ atomic increment
    },
    create: {
      schoolId,
      role,
      value: 1
    }
  });

  // 🔥 4. FORMAT NUMBER
  const number = String(counter.value).padStart(3, "0");

  return `${school.code}-${roleMap[role]}-${number}`;
}

module.exports = generateUserCode;