const Joi = require("joi");

exports.markAttendanceSchema = Joi.object({
  records: Joi.array().items(
    Joi.object({
      studentId: Joi.number().required(),
      status: Joi.string().valid("PRESENT", "ABSENT").required()
    })
  ).min(1).required()
});