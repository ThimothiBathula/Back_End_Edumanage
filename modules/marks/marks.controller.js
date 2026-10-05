const service = require("./marks.service");
const { addMarksSchema } = require("./marks.validation");

exports.addMarks = async (req, res) => {
  try {
    console.log(req.body)
    const { error } = addMarksSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message
      });
    }

    await service.addMarks(req.body.records, req.user);

    res.json({ message: "Marks added successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMarks = async (req, res) => {
  try {
    const data = await service.getMarks(req.query, req.user);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};