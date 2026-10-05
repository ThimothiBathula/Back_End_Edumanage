const prisma = require("../../config/prisma");

// CREATE CLASS
exports.createClass = async (data, user) => {
    return prisma.$transaction(async (tx) => {

        // 🔒 Check duplicate class
        const exists = await tx.classConfig.findFirst({
            where: {
                schoolId: user.schoolId,
                name: data.name
            }
        });

        if (exists) throw new Error("Class already exists");

        // 🔥 Remove duplicate subjects
        const uniqueSubjects = [...new Set(data.subjects)];

        if (uniqueSubjects.length !== data.subjects.length) {
            throw new Error("Duplicate subjects not allowed");
        }

        // CREATE CLASS
        const newClass = await tx.classConfig.create({
            data: {
                schoolId: user.schoolId,
                name: data.name,
                periodsPerDay: data.periodsPerDay
            }
        });

        // CREATE SUBJECTS
        await tx.subject.createMany({
            data: uniqueSubjects.map((s) => ({
                name: s,
                classId: newClass.id
            }))
        });

        return newClass;
    });
};


// GET ALL CLASSES
exports.getClasses = async (user) => {
    return prisma.classConfig.findMany({
        where: {
            schoolId: user.schoolId,
            status: "ACTIVE"
        },
        include: {
            subjects: true
        },
        orderBy: { createdAt: "desc" }
    });
};


// GET SINGLE CLASS
exports.getClassById = async (id, user) => {
    const data = await prisma.classConfig.findFirst({
        where: {
            id: Number(id),
            schoolId: user.schoolId
        },
        include: {
            subjects: true
        }
    });

    if (!data) throw new Error("Class not found");

    return data;
};


// UPDATE CLASS
exports.updateClass = async (id, data, user) => {

    const classId = Number(id);

    const existing = await prisma.classConfig.findFirst({
        where: {
            id: classId,
            schoolId: user.schoolId
        }
    });

    if (!existing) {
        throw new Error("Class not found");
    }

    return prisma.$transaction(async (tx) => {

        // ✅ UPDATE CLASS
        await tx.classConfig.update({
            where: { id: classId },
            data: {
                name: data.name,
                periodsPerDay: data.periodsPerDay
            }
        });

        // ✅ UNIQUE SUBJECTS
        const uniqueSubjects =
            [...new Set(data.subjects)];

        // ✅ EXISTING SUBJECTS
        const existingSubjects =
            await tx.subject.findMany({
                where: { classId }
            });

        const existingNames =
            existingSubjects.map(s => s.name);

        // ===================================================
        // ✅ ADD NEW SUBJECTS
        // ===================================================

        for (const subjectName of uniqueSubjects) {

            if (!existingNames.includes(subjectName)) {

                await tx.subject.create({
                    data: {
                        name: subjectName,
                        classId
                    }
                });
            }
        }

        // ===================================================
        // ✅ REMOVE UNUSED SUBJECTS SAFELY
        // ===================================================

        for (const subject of existingSubjects) {

            if (!uniqueSubjects.includes(subject.name)) {

                // CHECK DEPENDENCIES

                const hasDependencies =
                    await tx.schedule.findFirst({
                        where: {
                            subjectId: subject.id
                        }
                    });

                if (hasDependencies) {
                    continue;
                }

                await tx.subject.delete({
                    where: {
                        id: subject.id
                    }
                });
            }
        }

        return true;
    });
};


// DELETE (SOFT DELETE)
exports.deleteClass = async (id, user) => {

    const classData = await prisma.classConfig.findFirst({
        where: {
            id: Number(id),
            schoolId: user.schoolId
        },
        include: {
            students: true,
            schedules: true
        }
    });

    if (!classData) throw new Error("Class not found");

    if (classData.students.length > 0) {
        throw new Error("Cannot delete: students exist");
    }

    if (classData.schedules.length > 0) {
        throw new Error("Cannot delete: schedule exists");
    }

    return prisma.classConfig.update({
        where: { id: Number(id) },
        data: {
            status: "INACTIVE"
        }
    });
};