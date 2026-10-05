const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,

  keyGenerator: (req) => {
    return (
      req.body.email ||
      req.body.userCode ||
      ipKeyGenerator(req)
    );
  },

  handler: (req, res) => {
    res.status(429).json({
      message: "Too many login attempts. Try again later."
    });
  }
});

module.exports = loginLimiter;