/*
  Warnings:

  - Added the required column `week` to the `Syllabus` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Syllabus_teacherId_idx";

-- AlterTable
ALTER TABLE "Syllabus" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "week" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Syllabus_schoolId_class_idx" ON "Syllabus"("schoolId", "class");

-- AddForeignKey
ALTER TABLE "Syllabus" ADD CONSTRAINT "Syllabus_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Syllabus" ADD CONSTRAINT "Syllabus_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
