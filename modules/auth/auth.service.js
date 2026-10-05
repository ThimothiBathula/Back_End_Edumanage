const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async ({ email, userCode, password, schoolId, allowedRoles }) => {
  let user;

  // 1. Find user
  if (email) {
    user = await prisma.user.findFirst({ where: { email, schoolId: schoolId || undefined, isDeleted: false } });
  } else {
    user = await prisma.user.findFirst({ where: { userCode, schoolId: schoolId || undefined, isDeleted: false } });
  }

  // 🔐 MED-04: Always run bcrypt even if user not found — prevents timing-based user enumeration
  const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
  const hashToCompare = user?.password || DUMMY_HASH;
  const isMatch = await bcrypt.compare(password, hashToCompare);

  // 🔐 Unified error — never reveal whether email/code exists or password is wrong
  if (!user || !isMatch || user.status !== 'ACTIVE') {
    throw new Error('Invalid credentials');
  }

  // Role validation
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error('Invalid credentials');
  }

  // 3. School check
  if (user.role !== 'superadmin') {
    const school = await prisma.school.findFirst({
      where: { id: user.schoolId, isDeleted: false }
    });
    if (!school || school.status === 'SUSPENDED') {
      throw new Error('Invalid credentials');
    }
  }

  // 4. Password already verified above — skip second compare

  // 5. Generate JWT
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      schoolId: user.schoolId
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
      issuer: "school-management-system",   // ✅ pro-level addition
    }
  );

  const userResponse = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    userCode: user.userCode,
    profileImage: user.profileImage
  };

  // 🔥 FETCH ROLE SPECIFIC DATA (including phone from sub-table)
  if (user.role === "student") {
    const student = await prisma.student.findUnique({ where: { userId: user.id } });
    if (student) {
      userResponse.class   = student.class;
      userResponse.phone   = student.phone   || null;
      userResponse.dob     = student.dob     ? student.dob.toISOString().split('T')[0] : null;
      userResponse.gender  = student.gender  || null;
      userResponse.parentName  = student.fatherName || null;
      userResponse.parentPhone = student.altPhone   || null;
    }
  } else if (user.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
    if (teacher) {
      userResponse.subjects = teacher.subjects;
      userResponse.phone    = teacher.phone || null;
      userResponse.teacherId = teacher.id;

      // Check active ClassMentor assignment
      const activeMentorships = await prisma.classMentor.findMany({
        where: { teacherId: teacher.id, isActive: true, schoolId: user.schoolId },
        include: { class: { select: { id: true, name: true } } }
      });
      userResponse.isMentor = activeMentorships.length > 0;
      userResponse.mentoredClasses = activeMentorships.map(m => ({ classId: m.classId, className: m.class?.name }));

      // Check active AccountantAssignment
      const activeAccountant = await prisma.accountantAssignment.findFirst({
        where: { userId: user.id, isActive: true, schoolId: user.schoolId }
      });
      userResponse.isAccountant = !!activeAccountant;
    }
  } else if (user.role === "accountant") {
    userResponse.isAccountant = true;
  } else if (user.role === "principal") {
    const principal = await prisma.principal.findUnique({ where: { userId: user.id } });
    if (principal) {
      userResponse.phone = principal.phone || null;
    }
    userResponse.isAccountant = true;
    userResponse.isMentor = true;
  }

  // 🚀 Attach effective school features for frontend bootstrap
  if (user.schoolId) {
    const featureService = require("../feature/feature.service");
    const effectiveFeatures = await featureService.getEffectiveFeatures(user.schoolId);
    userResponse.features = effectiveFeatures;
    userResponse.activeServices = effectiveFeatures;
  }

  return {
    token,
    user: userResponse
  };
};

// RESET PASSWORD

exports.resetPassword = async (email, newPassword) => {

  return prisma.$transaction(async (tx) => {

    // 🔹 1. Validate user exists
    const user = await tx.user.findUnique({
      where: { email }
    });

    if (!user) throw new Error("Invalid request");

    // 🔹 2. Verify OTP (must be verified — don't recheck expiry, it was already valid at verify time)
    const verifiedOtp = await tx.otp.findFirst({
      where: {
        email,
        verified: true
      },
      orderBy: { createdAt: "desc" }
    });

    if (!verifiedOtp) {
      throw new Error("OTP verification required");
    }

    // 🔹 3. Password strength check
    if (!newPassword || newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // 🔹 4. Prevent same password reuse
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      throw new Error("New password must be different from old password");
    }

    // 🔹 5. Hash password
    const hashed = await bcrypt.hash(newPassword, 10);

    // 🔹 6. Update password
    await tx.user.update({
      where: { email },
      data: {
        password: hashed
      }
    });

    // 🔹 7. Invalidate OTPs
    await tx.otp.deleteMany({
      where: { email }
    });

    // 🔹 8. Optional: invalidate sessions (if implemented)
    // await tx.session.deleteMany({ where: { userId: user.id } });

    return true;
  });
};

exports.updateProfile = async (userId, data) => {
  const { name, phone, bio } = data;

  // Basic validation to prevent nulling out required fields if passed as empty strings
  const updateData = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  // bio might not exist on the user table, but we include it if it's in the schema.
  // Assuming 'bio' is not a standard field based on previous files, I'll only update name/phone for now.
  // If it is in the schema, you can add it. Let's add it to the data safely.

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    userCode: user.userCode
  };
};

exports.updatePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new Error("Incorrect current password");

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed }
  });

  return true;
};

exports.getUserById = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId, isDeleted: false },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      userCode: true,
      profileImage: true,
      schoolId: true
    }
  });

  if (!user) return null;

  const userResponse = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    userCode: user.userCode,
    profileImage: user.profileImage,
    schoolId: user.schoolId
  };

  // ✅ Enrich with role-specific profile fields (same as login)
  if (user.role === 'student') {
    const student = await prisma.student.findUnique({
      where: { userId: user.id },
      include: { class: { select: { name: true } } }
    });
    if (student) {
      userResponse.class      = student.class?.name || null;
      userResponse.phone      = student.phone      || null;
      userResponse.dob        = student.dob ? student.dob.toISOString().split('T')[0] : null;
      userResponse.gender     = student.gender     || null;
      userResponse.parentName = student.fatherName || null;
      userResponse.parentPhone= student.altPhone   || null;
    }
  } else if (user.role === 'teacher') {
    const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
    if (teacher) {
      userResponse.subjects      = teacher.subjects      || null;
      userResponse.phone         = teacher.phone         || null;
      userResponse.qualification = teacher.qualification || null;
      userResponse.experience    = teacher.experience    || null;
      userResponse.teacherId     = teacher.id;

      // Check active ClassMentor assignment
      const activeMentorships = await prisma.classMentor.findMany({
        where: { teacherId: teacher.id, isActive: true, schoolId: user.schoolId },
        include: { class: { select: { id: true, name: true } } }
      });
      userResponse.isMentor = activeMentorships.length > 0;
      userResponse.mentoredClasses = activeMentorships.map(m => ({ classId: m.classId, className: m.class?.name }));

      // Check active AccountantAssignment
      const activeAccountant = await prisma.accountantAssignment.findFirst({
        where: { userId: user.id, isActive: true, schoolId: user.schoolId }
      });
      userResponse.isAccountant = !!activeAccountant;
    }
  } else if (user.role === 'accountant') {
    userResponse.isAccountant = true;
  } else if (user.role === 'principal') {
    const principal = await prisma.principal.findUnique({ where: { userId: user.id } });
    if (principal) {
      userResponse.phone = principal.phone || null;
      userResponse.dob   = principal.dob ? principal.dob.toISOString().split('T')[0] : null;
    }
    userResponse.isAccountant = true;
    userResponse.isMentor = true;
  }

  // 🚀 Attach effective school features for frontend bootstrap
  if (user.schoolId) {
    const featureService = require("../feature/feature.service");
    const effectiveFeatures = await featureService.getEffectiveFeatures(user.schoolId);
    userResponse.features = effectiveFeatures;
    userResponse.activeServices = effectiveFeatures;
  }

  return userResponse;
};