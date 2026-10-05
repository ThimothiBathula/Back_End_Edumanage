const multer = require("multer");

const storage = multer.memoryStorage();

const ALLOWED_EXCEL_MIMES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv",
  "application/csv"
];

const uploadExcel = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXCEL_MIMES.includes(file.mimetype)) {
      return cb(new Error("Only Excel (.xlsx, .xls) or CSV files are allowed"), false);
    }
    cb(null, true);
  }
});

module.exports = uploadExcel;