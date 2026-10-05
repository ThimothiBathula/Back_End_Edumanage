const Joi = require("joi");

exports.schema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().optional(),
  date: Joi.date().required()
});