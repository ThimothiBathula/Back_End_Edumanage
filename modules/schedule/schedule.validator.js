const Joi = require("joi");

exports.createScheduleSchema = Joi.object({
  classId: Joi.number().required(),

  subjectId: Joi.number().required(),

  teacherId: Joi.number().required(),

  day: Joi.string()
    .valid("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
    .required(),

  period: Joi.number().min(1).required(),

  startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),

  endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required()
});