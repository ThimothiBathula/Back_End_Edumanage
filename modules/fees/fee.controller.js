const service = require("./fee.service");
const xlsx = require("xlsx");

exports.bulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const results = await service.bulkUpload(req.file, req.user);

    return res.status(200).json({
      message: "Bulk upload completed",
      results
    });

  } catch (err) {
    return res.status(500).json({
      message: err.message || "Bulk upload failed"
    });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    // console.log(req.body)
    const { feeId, amount, remarks, paymentMode, utrNumber } = req.body;

    if (!feeId || !amount || !paymentMode) {
      return res.status(400).json({
        message: "Fee ID, payment amount, and payment mode are required"
      });
    }

    const updatedFee = await service.updatePayment(
      Number(feeId),
      { amount: Number(amount), remarks, paymentMode, utrNumber },
      req.user
    );

    return res.status(200).json({
      message: "Payment updated successfully",
      fee: updatedFee
    });

  } catch (err) {
    return res.status(400).json({
      message: err.message || "Failed to update payment"
    });
  }
};

exports.getAllFees = async (req, res) => {
  try {

    const filters = {
      classId: req.query.classId,
      status: req.query.status,
      feeType: req.query.feeType,
      minAmount: req.query.minAmount,
      maxAmount: req.query.maxAmount,
      page: req.query.page,
      limit: req.query.limit
    };

    let targetSchoolId;

    if (req.user.role === "superadmin") {

      if (!req.query.schoolId) {
        return res.status(400).json({
          message: "schoolId is required for superadmin"
        });
      }

      targetSchoolId = Number(req.query.schoolId);

    } else {
      targetSchoolId = req.user.schoolId;
    }

    const data = await service.getAllFees(targetSchoolId, filters);

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to fetch fees"
    });
  }
};

exports.exportFees = async (req, res) => {
  try {

    const filters = {
      classId: req.query.classId,
      status: req.query.status,
      feeType: req.query.feeType,
      minAmount: req.query.minAmount,
      maxAmount: req.query.maxAmount,
      limit: 100000 // Export all matching records
    };

    let targetSchoolId;

    if (req.user.role === "superadmin") {

      if (!req.query.schoolId) {
        return res.status(400).json({
          message: "schoolId is required"
        });
      }

      targetSchoolId = Number(req.query.schoolId);

    } else {
      targetSchoolId = req.user.schoolId;
    }

    const data = await service.getAllFees(targetSchoolId, filters);

    const exportData = data.fees.map(f => ({
      "Student Name": f.studentName,

      // ✅ FIXED (relation)
      "Class": f.class?.name || "N/A",
      "Fee Type": f.feeType || "Tuition",

      "Total Fee": f.totalFee,
      "Paid Amount": f.paidAmount,
      "Pending Amount": f.pendingAmount,
      "Payment Status": f.paymentStatus,

      "Due Date": f.dueDate
        ? new Date(f.dueDate).toISOString().split("T")[0]
        : ""
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(workbook, worksheet, "Fees Report");

    const buffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx"
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Fees_Report.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(buffer);

  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to export fees"
    });
  }
};
exports.getMyFees = async (req, res) => {
  try {

    const fees = await service.getMyFees(req.user);

    return res.status(200).json(fees);

  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to fetch student fees"
    });
  }
};

exports.assignFee = async (req, res) => {
  try {
    const result = await service.assignFee(req.body, req.user);
    return res.status(200).json({
      message: "Fee assigned successfully",
      result
    });

  } catch (err) {
    return res.status(400).json({
      message: err.message
    });
  }
};

exports.getReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({ message: "Payment ID is required" });
    }

    const receipt = await service.getReceipt(paymentId, req.user);
    return res.status(200).json(receipt);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
