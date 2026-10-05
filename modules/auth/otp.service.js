const prisma = require("../../config/prisma");
const { sendEmail } = require("../../utils/sendEmail");

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// SEND OTP
exports.sendOTP = async (email) => {

  // 🔐 1. CHECK USER EXISTS
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    throw new Error("EMAIL_NOT_FOUND");
  }

  // 🔐 2. RATE LIMIT
  const count = await prisma.otp.count({
    where: {
      email,
      createdAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000)
      }
    }
  });

  if (count >= 3) {
    throw new Error("Too many OTP requests. Try again later.");
  }

  // 🔐 3. DELETE OLD EXPIRED OTPs
  await prisma.otp.deleteMany({
    where: {
      email,
      expiresAt: { lt: new Date() }
    }
  });

  // 🔐 4. GENERATE OTP
  const otp = generateOTP();

  // 🔐 5. STORE OTP
  await prisma.otp.create({
    data: {
      email,
      code: otp,
      verified: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  });

  // 🔐 6. SEND EMAIL (ONLY HERE)
  await sendEmail(
    email,
    "🔐 EduManage | Password Reset OTP",

    // Plain text (fallback for email clients)
    `Your OTP for EduManage password reset is ${otp}. It will expire in 5 minutes. Do not share it with anyone.`,

    // HTML Email
    `
  <!DOCTYPE html>
  <html>
  <body style="margin:0; padding:0; background:#f4f6f8; font-family: Arial, sans-serif;">

    <div style="max-width:600px; margin:40px auto; background:#ffffff; padding:30px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      
      <h2 style="text-align:center; color:#2c3e50; margin-bottom:5px;">
        🔐 EduManage
      </h2>
      
      <p style="text-align:center; color:#7f8c8d; margin-bottom:25px;">
        Password Reset Request
      </p>

      <p style="font-size:16px; color:#333;">
        Hello,
      </p>

      <p style="font-size:15px; color:#555;">
        We received a request to reset your password. Use the OTP below to proceed:
      </p>

      <div style="text-align:center; margin:30px 0;">
        <span style="
          display:inline-block;
          padding:15px 35px;
          font-size:28px;
          font-weight:bold;
          letter-spacing:6px;
          color:#ffffff;
          background:linear-gradient(135deg, #4CAF50, #2ecc71);
          border-radius:8px;
        ">
          ${otp}
        </span>
      </div>

      <p style="text-align:center; font-size:14px; color:#555;">
        ⏳ This OTP is valid for <b>5 minutes</b>.
      </p>

      <p style="text-align:center; font-size:13px; color:#e74c3c;">
        ⚠️ Never share this OTP with anyone.
      </p>

      <hr style="border:none; border-top:1px solid #eee; margin:25px 0;">

      <p style="font-size:13px; color:#777; text-align:center;">
        If you didn’t request this, you can safely ignore this email.
      </p>

      <p style="font-size:12px; color:#bbb; text-align:center;">
        © ${new Date().getFullYear()} EduManage. All rights reserved.
      </p>

    </div>

  </body>
  </html>
  `
  );

  return true;
};

// VERIFY OTP
exports.verifyOTP = async (email, code) => {
  const otp = await prisma.otp.findFirst({
    where: {
      email,
      code,
      verified: false,
      expiresAt: { gte: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!otp) {
    throw new Error("Invalid or expired OTP");
  }

  // Mark as verified
  await prisma.otp.update({
    where: { id: otp.id },
    data: { verified: true }
  });

  return true;
};