const express = require("express");
const router = express.Router();
const auth = require("../../middlewares/auth");
const role = require("../../middlewares/role");
const controller = require("./fee.controller");
const multer = require("multer");

// Multer setup for bulk upload
const upload = multer({ dest: "uploads/" });

// ─── PRINCIPAL / ACCOUNTANT ROUTES ──────────────────────────────────────────

// Bulk upload fees (Excel/CSV)
router.post("/bulk-upload", auth, role(["principal", "accountant"]), upload.single("file"), controller.bulkUpload);

// Update a payment manually
router.post("/update-payment", auth, role(["principal", "accountant"]), controller.updatePayment);

// Assign fee to class or student
router.post("/assign", auth, role(["principal", "accountant"]), controller.assignFee);

// Get all fees (with filters for analytics)
router.get("/", auth, role(["principal", "accountant", "superadmin"]), controller.getAllFees);

// Export fees report
router.get("/export", auth, role(["principal", "accountant", "superadmin"]), controller.exportFees);

// ─── STUDENT / PARENT ROUTES ────────────────────────────────────────────────

// Get own fee summary
router.get("/my-fees", auth, role(["student"]), controller.getMyFees);

// Download/View receipt
router.get("/receipt/:paymentId", auth, role(["student", "principal", "accountant"]), controller.getReceipt);

module.exports = router;
