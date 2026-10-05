const Joi = require("joi");

exports.createRequestSchema = Joi.object({
  studentId: Joi.number().required(),
  type: Joi.string().valid("ATTENDANCE", "MARKS").required(),
  referenceId: Joi.number().optional().allow(null),
  date: Joi.date().optional().allow(null),
  subject: Joi.string().optional().allow(null),
  reason: Joi.string().min(5).required(),
  correctedValue: Joi.string().allow('', null)
});