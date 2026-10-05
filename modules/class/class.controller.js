const service = require("./class.service");
const { createClassSchema } = require("./class.validator");

exports.createClass = async (req, res) => {
    try {
        // console.log(req.body)
        const { error } = createClassSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        const data = await service.createClass(req.body, req.user);

        res.json({
            message: "Class created successfully",
            data
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


exports.getClasses = async (req, res) => {
    try {
        const data = await service.getClasses(req.user);
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


exports.getClassById = async (req, res) => {
    try {
        const data = await service.getClassById(req.params.id, req.user);
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


exports.updateClass = async (req, res) => {
    try {
        // console.log(req.body)
        const { error } = createClassSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        await service.updateClass(req.params.id, req.body, req.user);

        res.json({ message: "Class updated successfully" });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


exports.deleteClass = async (req, res) => {
    try {
        await service.deleteClass(req.params.id, req.user);

        res.json({ message: "Class deactivated successfully" });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};