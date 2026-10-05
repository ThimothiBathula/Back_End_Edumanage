const service = require("./dashboard.service");

exports.getDashboard = async (req, res) => {
  try {
    const data = await service.getDashboard();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};