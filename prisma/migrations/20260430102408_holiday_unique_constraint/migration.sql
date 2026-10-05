/*
  Warnings:

  - A unique constraint covering the columns `[schoolId,date,title]` on the table `Holiday` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Holiday_schoolId_date_title_key" ON "Holiday"("schoolId", "date", "title");
