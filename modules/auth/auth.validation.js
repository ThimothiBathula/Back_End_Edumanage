const Joi = require("joi");

exports.loginSchema = Joi.object({
  email: Joi.string().email().optional(),
  userCode: Joi.string().optional(),
  password: Joi.string().required()
}).or("email", "userCode");