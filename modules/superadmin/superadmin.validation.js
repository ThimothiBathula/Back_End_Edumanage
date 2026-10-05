const Joi = require("joi");

exports.createSchoolSchema = Joi.object({
  name: Joi.string().required(),
  code: Joi.string().uppercase().min(3).max(10).required(),
  location: Joi.string().required(),
  principalName: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().required(),
});