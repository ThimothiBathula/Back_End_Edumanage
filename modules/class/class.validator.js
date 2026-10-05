const Joi = require("joi");

exports.createClassSchema = Joi.object({
    name: Joi.string().trim().required(),

    periodsPerDay: Joi.number()
        .integer()
        .min(1)
        .max(12)
        .required(),

    subjects: Joi.array()
        .items(Joi.string().trim().min(2).required())
        .min(1)
        .required()
});