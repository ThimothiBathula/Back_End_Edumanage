// 🔐 LOW-02: Never run seed in production
if (process.env.NODE_ENV === "production") {
  console.error("[FATAL] Seed script must not run in production.");
  process.exit(1);
}

const prisma = require("./config/prisma");
const bcrypt = require("bcryptjs");

async function main() {
  const password = await bcrypt.hash("bathula@2089TM", 10);

  await prisma.user.create({
    data: {
      name: "Thimothi Admin",
      email: "bt3811783@gmail.com",
      password,
      role: "superadmin",
      userCode: "SYS-ADMIN",
      schoolId: null
    }
  });

  console.log("Super Admin created");
}

main();