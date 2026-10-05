const service = require("./correction.service");
const { createRequestSchema } = require("./correction.validation");

// CREATE
exports.createRequest = async (req, res) => {
  try {
    console.log(req.body);

    const { error } = createRequestSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message
      });
    }

    await service.createRequest(req.body, req.user);

    res.status(201).json({
      message: "Request submitted successfully"
    });

  } catch (err) {
    console.error(err);

    res.status(err.statusCode || 500).json({
      message: err.message || "Internal server error"
    });
  }
};


// GET ALL (PRINCIPAL)
exports.getRequests = async (req, res) => {
  try {
    const data = await service.getRequests(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// APPROVE / REJECT
exports.updateRequest = async (req, res) => {
  try {
    const { status } = req.body;

    await service.updateRequest(
      Number(req.params.id),
      status,
      req.user
    );

    res.json({ message: "Request updated" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyRequestsTeacher = async (req, res) => {
  try {
    const data = await service.getMyRequestsTeacher(req.user);
    res.json(data);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      message: err.message
    });
  }
};