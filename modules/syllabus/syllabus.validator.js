const Joi = require("joi");

exports.createPlanSchema = Joi.object({
  academicYear: Joi.string().required(),
  classId: Joi.number().integer().positive().required(),
  subjectId: Joi.number().integer().positive().required(),
  teacherId: Joi.number().integer().positive().required(),
  weeks: Joi.array().items(
    Joi.object({
      weekNumber: Joi.number().integer().min(1).max(52).required(),
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().optional(),
      topics: Joi.array().items(Joi.string().trim().min(2).required()).min(1).required()
    })
  ).min(1).required()
});

exports.updateProgressSchema = Joi.object({
  weekId: Joi.number(),
  progressPercentage: Joi.number().integer().min(0).max(100).required(),
  status: Joi.string().valid("IN_PROGRESS", "COMPLETED", "DELAYED").required(),
  completionNote: Joi.string().allow(null, "").optional(),
  delayReason: Joi.string().allow(null, "").optional(),
  fileUrl: Joi.string().uri().allow(null, "").optional(),
  completedTopics: Joi.array().items(Joi.number().integer().positive()).optional()
});

exports.addRemarkSchema = Joi.object({
  remark: Joi.string().trim().min(2).required()
});