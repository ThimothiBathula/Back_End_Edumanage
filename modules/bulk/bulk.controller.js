const XLSX = require("xlsx");
const service = require("./bulk.service");

exports.superAdminUpload = async (req, res) => {
  try {
    // console.log(req.body)
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    console.log(workbook)
    const schoolId = req.body.schoolId ? Number(req.body.schoolId) : null;

    const result = await service.processWorkbook(
      workbook,
      req.user,
      schoolId,
      req.body.type
    );

    res.json(result);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.principalUpload = async (req, res) => {
  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    const result = await service.processWorkbook(
      workbook,
      req.user,
      null,
      req.body.type
    );

    res.json(result);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const { generateTemplate } = require("../../utils/templateGenerator");

exports.downloadTemplate = (req, res) => {
  try {
    const type = (req.query.type || "").toLowerCase().trim();

    if (!type) {
      return res.status(400).json({ message: "Template type is required" });
    }

    const { buffer, filename } = generateTemplate(type);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    return res.status(200).end(buffer);

  } catch (error) {
    console.error("DOWNLOAD TEMPLATE ERROR:", error);
    if (error.message && error.message.startsWith("Unknown template type")) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to generate template" });
  }
};

exports.exportData = async (req, res) => {
  try {

    const buffer = await service.exportWorkbook(req.user);

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=school_data.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};