const Joi = require("joi");

exports.createTeacherSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().required(),
  qualification: Joi.string().required(),
  subjects: Joi.string().required(),
  experience: Joi.number().optional(),
  gender: Joi.string().required(),
  status: Joi.string().required(),
  dob: Joi.date().optional(),
  profileImage: Joi.any().optional()
});

exports.createStudentSchema = Joi.object({
  name: Joi.string().required(),

  email: Joi.string().email().required(),

  password: Joi.string().min(6).required(),

  phone: Joi.string().required(),

  fatherName: Joi.string().required(),

  motherName: Joi.string().required(),

  gender: Joi.string()
    .valid("MALE", "FEMALE", "OTHER")
    .required(),

  status: Joi.string()
    .valid("ACTIVE", "INACTIVE")
    .default("ACTIVE"),

  address: Joi.string().allow("", null),

  // 🔥 IMPORTANT CHANGE
  classId: Joi.number().required(),

  dob: Joi.date().required(),
  profileImage: Joi.any().optional()
});