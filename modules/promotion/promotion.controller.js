const service = require("./promotion.service");

/**
 * GET /principal/promotions/students?fromAcademicYearId=&fromClassId=
 * Returns students in the source class with their promotion status.
 */
exports.getStudentsForPromotion = async (req, res) => {
  try {
    const { fromAcademicYearId, fromClassId } = req.query;
    if (!fromAcademicYearId || !fromClassId) {
      return res.status(400).json({ message: "fromAcademicYearId and fromClassId are required" });
    }
    const result = await service.getStudentsForPromotion(
      req.user.schoolId,
      Number(fromAcademicYearId),
      Number(fromClassId)
    );
    res.json(result);
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ message: err.message });
  }
};

/**
 * POST /principal/promotions/promote
 * Body: { fromAcademicYearId, toAcademicYearId, fromClassId, toClassId, studentIds[], notes? }
 */
exports.promoteStudents = async (req, res) => {
  try {
    const {
      fromAcademicYearId, toAcademicYearId,
      fromClassId, toClassId,
      studentIds, notes
    } = req.body;

    if (!fromAcademicYearId || !toAcademicYearId || !fromClassId || !toClassId) {
      return res.status(400).json({ message: "fromAcademicYearId, toAcademicYearId, fromClassId, toClassId are required" });
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: "studentIds must be a non-empty array" });
    }

    // Resolve principal user id (promotedBy)
    const promotedBy = req.user.id;

    const result = await service.promoteStudents({
      schoolId: req.user.schoolId,
      fromAcademicYearId: Number(fromAcademicYearId),
      toAcademicYearId:   Number(toAcademicYearId),
      fromClassId:        Number(fromClassId),
      toClassId:          Number(toClassId),
      studentIds:         studentIds.map(Number),
      promotedBy,
      notes
    });

    res.status(201).json({ message: "Students promoted successfully", data: result });
  } catch (err) {
    const status =
      err.message.includes("not found") ? 404 :
      err.message.includes("already promoted") ? 409 : 400;
    res.status(status).json({ message: err.message });
  }
};

/**
 * GET /principal/promotions/history?fromAcademicYearId=&toAcademicYearId=&fromClassId=
 */
exports.getPromotionHistory = async (req, res) => {
  try {
    const result = await service.getPromotionHistory(req.user.schoolId, req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
