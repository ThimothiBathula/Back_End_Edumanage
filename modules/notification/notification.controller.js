const service = require("./notification.service");

// 📢 PRINCIPAL CREATE
exports.broadcast = async (req, res) => {
  try {
    const data = await service.broadcast(req.body, req.user);
    res.json({
      message: "Notification sent",
      data
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📥 GET
exports.getMine = async (req, res) => {
  try {
    const data = await service.getMyNotifications(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ READ
exports.read = async (req, res) => {
  try {
    await service.markAsRead(Number(req.params.id), req.user);
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};