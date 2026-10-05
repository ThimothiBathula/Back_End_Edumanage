const service = require("./superadmin.service");
const { createSchoolSchema } = require("./superadmin.validation");

exports.createSchool = async (req, res) => {
  try {
    const { error } = createSchoolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    const result = await service.createSchoolWithPrincipal(req.body);
    res.json({
      message: "School created successfully",
      principalId: result.userCode,
    });
  } catch (err) {
    if (err.message === "Email already exists" || err.message === "School already exists") {
      return res.status(409).json({ success: false, message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.updateSchoolStatus = async (req, res) => {
  const { schoolId, status } = req.body;
  await require("../../config/prisma").school.update({
    where: { id: schoolId },
    data: { status },
  });
  res.json({ message: "Updated successfully" });
};

exports.getSchools = async (req, res) => {
  try {
    const result = await service.getSchools(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSchoolById = async (req, res) => {
  try {
    const result = await service.getSchoolById(Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

exports.updateSchool = async (req, res) => {
  try {
    const result = await service.updateSchool(Number(req.params.id), req.body);
    res.json({ message: "School updated", result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSchool = async (req, res) => {
  try {
    await service.deleteSchool(Number(req.params.id));
    res.json({ message: "School deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSMS = async (req, res) => {
  try {
    const schoolId = Number(req.params.schoolId);
    await service.updateSMSFeature(schoolId, req.body);
    res.json({ message: "SMS feature updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const result = await service.getDashboard();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.toggleClassConfig = async (req, res) => {
  try {
    const { schoolId, enableClassConfig } = req.body;
    const result = await service.toggleClassConfig(schoolId, enableClassConfig);
    res.json({
      message: `Class config ${enableClassConfig ? "enabled" : "disabled"}`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── NEW: Service Module Kill-Switch ─────────────────────────────────────────

/**
 * PATCH /api/superadmin/school/:id/services
 * Body: { "attendance": true, "fees": false, ... } (partial update supported)
 */
exports.toggleServices = async (req, res) => {
  try {
    const schoolId = Number(req.params.id);
    const result = await service.toggleServices(schoolId, req.body);
    res.json({ message: "Service modules updated", activeServices: result.activeServices });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
};

// ─── NEW: Academic Year Creation Grant ───────────────────────────────────────

/**
 * PATCH /api/superadmin/school/:id/grant-academic-year
 * Re-enables academic year creation for the school (canCreateAcademicYear = true).
 */
exports.grantAcademicYear = async (req, res) => {
  try {
    const schoolId = Number(req.params.id);
    await service.grantAcademicYear(schoolId);
    res.json({ message: "Academic year creation granted for this school" });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ message: err.message });
  }
};