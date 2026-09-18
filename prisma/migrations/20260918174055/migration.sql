/*
  Warnings:

  - A unique constraint covering the columns `[patientId,doctorId,scheduleId]` on the table `appointments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[scheduleId,serialNumber,joiningTime]` on the table `appointments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `doctorId` to the `appointments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `patientId` to the `appointments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scheduleId` to the `appointments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "doctorId" TEXT NOT NULL,
ADD COLUMN     "joiningTime" TIMESTAMP(3),
ADD COLUMN     "patientId" TEXT NOT NULL,
ADD COLUMN     "prescriptionPublicId" TEXT,
ADD COLUMN     "prescriptionUrl" TEXT,
ADD COLUMN     "recordPublicId" TEXT,
ADD COLUMN     "recordUrl" TEXT,
ADD COLUMN     "scheduleId" TEXT NOT NULL,
ADD COLUMN     "serialNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "appointments_patientId_doctorId_scheduleId_key" ON "appointments"("patientId", "doctorId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_scheduleId_serialNumber_joiningTime_key" ON "appointments"("scheduleId", "serialNumber", "joiningTime");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
