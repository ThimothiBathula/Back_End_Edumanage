const service = require("./holiday.service");
const { schema } = require("./holiday.validator");

// CREATE
exports.create = async (req, res) => {
  try {

    const { error } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const data = await service.createHoliday(req.body, req.user);

    res.json({ message: "Holiday created", data });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET
exports.getAll = async (req, res) => {
  try {
    const data = await service.getHolidays(req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE
exports.update = async (req, res) => {
  try {
    const data = await service.updateHoliday(
      Number(req.params.id),
      req.body,
      req.user
    );

    res.json({ message: "Updated", data });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE
exports.remove = async (req, res) => {
  try {
    await service.deleteHoliday(Number(req.params.id), req.user);

    res.json({ message: "Deleted" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};