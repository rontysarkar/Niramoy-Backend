/*
  Warnings:

  - Made the column `verificationStatus` on table `doctors` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "doctors" ALTER COLUMN "verificationStatus" SET NOT NULL,
ALTER COLUMN "verificationStatus" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "totalSlots" INTEGER NOT NULL,
    "availableSlots" INTEGER NOT NULL,
    "meetingLink" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doctorId" TEXT NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedules_doctorId_startDateTime_endDateTime_key" ON "schedules"("doctorId", "startDateTime", "endDateTime");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
