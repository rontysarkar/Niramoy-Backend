/*
  Warnings:

  - Made the column `paymentId` on table `payments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "paymentId" SET NOT NULL;
