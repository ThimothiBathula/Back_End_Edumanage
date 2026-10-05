/*
  Warnings:

  - You are about to drop the column `class` on the `AttendanceSession` table. All the data in the column will be lost.
  - You are about to drop the column `class` on the `ExamConfig` table. All the data in the column will be lost.
  - You are about to drop the column `class` on the `Fee` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `Marks` table. All the data in the column will be lost.
  - You are about to drop the column `class` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `class` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `class` on the `Syllabus` table. All the data in the column will be lost.
  - You are about to drop the column `subject` on the `Syllabus` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[schoolId,classId,examType]` on the table `ExamConfig` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `classId` to the `AttendanceSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classId` to the `ExamConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classId` to the `Fee` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectId` to the `Marks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classId` to the `Schedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectId` to the `Schedule` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classId` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classId` to the `Syllabus` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectId` to the `Syllabus` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ExamConfig_schoolId_class_examType_key";

-- DropIndex
DROP INDEX "Fee_schoolId_class_isDeleted_idx";

-- DropIndex
DROP INDEX "Marks_studentId_subject_idx";

-- DropIndex
DROP INDEX "Schedule_schoolId_class_idx";

-- DropIndex
DROP INDEX "Student_class_isDeleted_idx";

-- DropIndex
DROP INDEX "Student_schoolId_class_isDeleted_idx";

-- DropIndex
DROP INDEX "Syllabus_schoolId_class_idx";

-- AlterTable
ALTER TABLE "AttendanceSession" DROP COLUMN "class",
ADD COLUMN     "classId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "ExamConfig" DROP COLUMN "class",
ADD COLUMN     "classId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Fee" DROP COLUMN "class",
ADD COLUMN     "classId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Marks" DROP COLUMN "subject",
ADD COLUMN     "subjectId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Schedule" DROP COLUMN "class",
DROP COLUMN "subject",
ADD COLUMN     "classId" INTEGER NOT NULL,
ADD COLUMN     "subjectId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "enableClassConfig" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "class",
ADD COLUMN     "classId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Syllabus" DROP COLUMN "class",
DROP COLUMN "subject",
ADD COLUMN     "classId" INTEGER NOT NULL,
ADD COLUMN     "subjectId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "ClassConfig" (
    "id" SERIAL NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "periodsPerDay" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "classId" INTEGER NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSubject" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,

    CONSTRAINT "TeacherSubject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassConfig_schoolId_idx" ON "ClassConfig"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassConfig_schoolId_name_key" ON "ClassConfig"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_classId_name_key" ON "Subject"("classId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSubject_teacherId_subjectId_key" ON "TeacherSubject"("teacherId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamConfig_schoolId_classId_examType_key" ON "ExamConfig"("schoolId", "classId", "examType");

-- CreateIndex
CREATE INDEX "Fee_schoolId_classId_isDeleted_idx" ON "Fee"("schoolId", "classId", "isDeleted");

-- CreateIndex
CREATE INDEX "Marks_studentId_subjectId_idx" ON "Marks"("studentId", "subjectId");

-- CreateIndex
CREATE INDEX "Schedule_schoolId_classId_idx" ON "Schedule"("schoolId", "classId");

-- CreateIndex
CREATE INDEX "Student_classId_isDeleted_idx" ON "Student"("classId", "isDeleted");

-- CreateIndex
CREATE INDEX "Student_schoolId_classId_isDeleted_idx" ON "Student"("schoolId", "classId", "isDeleted");

-- CreateIndex
CREATE INDEX "Syllabus_schoolId_classId_idx" ON "Syllabus"("schoolId", "classId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marks" ADD CONSTRAINT "Marks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Syllabus" ADD CONSTRAINT "Syllabus_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Syllabus" ADD CONSTRAINT "Syllabus_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassConfig" ADD CONSTRAINT "ClassConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
