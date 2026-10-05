const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * sendEmail — sends a branded HTML email from EduManage
 * @param {string} to      recipient email
 * @param {string} subject email subject line
 * @param {string} text    plain-text fallback
 * @param {string} html    optional HTML body (if omitted, text is wrapped in basic HTML)
 */
exports.sendEmail = async (to, subject, text, html) => {
  const htmlBody = html || `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;">
        <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:-0.5px;">🎓 EduManage</h1>
        <p style="color:#c7d2fe;margin:4px 0 0;font-size:13px;">School Management System</p>
      </div>
      <div style="padding:32px;">
        <p style="color:#1e293b;font-size:15px;margin:0 0 24px;">${text}</p>
        <p style="color:#64748b;font-size:12px;margin:24px 0 0;border-top:1px solid #e2e8f0;padding-top:16px;">
          This is an automated message from EduManage. Do not reply to this email.
        </p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"EduManage" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html: htmlBody,
  });
};