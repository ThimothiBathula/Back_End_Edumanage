-- AlterTable
ALTER TABLE "Marks" ADD COLUMN     "passMarks" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "ExamConfig" (
    "id" SERIAL NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "class" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "passMarks" INTEGER NOT NULL,
    "isUploadEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamConfig_schoolId_class_examType_key" ON "ExamConfig"("schoolId", "class", "examType");

-- AddForeignKey
ALTER TABLE "ExamConfig" ADD CONSTRAINT "ExamConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
