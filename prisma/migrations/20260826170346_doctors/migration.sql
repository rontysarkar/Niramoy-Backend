/*
  Warnings:

  - A unique constraint covering the columns `[licenseNumber]` on the table `doctors` will be added. If there are existing duplicate values, this will fail.
  - Made the column `specialization` on table `doctors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `licenseNumber` on table `doctors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `qualifications` on table `doctors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `experienceYears` on table `doctors` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "doctors" ALTER COLUMN "specialization" SET NOT NULL,
ALTER COLUMN "licenseNumber" SET NOT NULL,
ALTER COLUMN "qualifications" SET NOT NULL,
ALTER COLUMN "experienceYears" SET NOT NULL,
ALTER COLUMN "consultationFee" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "doctors_licenseNumber_key" ON "doctors"("licenseNumber");
