const Joi = require("joi");

exports.addMarksSchema = Joi.object({
  records: Joi.array().items(
    Joi.object({
      studentId: Joi.number().required(),
      subject: Joi.string().required(),
      examType: Joi.string().required(),
      marks: Joi.number().min(0).required(),
      maxMarks: Joi.number().min(1).optional() // optional, enforced via ExamConfig on backend
    })
  ).min(1).required()
});