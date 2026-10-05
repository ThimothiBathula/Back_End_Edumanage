const prisma = require("../config/prisma");

module.exports = (feature) => {
    return async (req, res, next) => {

        const school = await prisma.school.findUnique({
            where: { id: req.user.schoolId }
        });

        if (!school) {
            return res.status(404).json({ message: "School not found" });
        }

        if (!school[feature]) {
            return res.status(403).json({
                message: "Feature disabled by Super Admin"
            });
        }

        next();
    };
};