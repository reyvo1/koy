/*
  Warnings:

  - A unique constraint covering the columns `[deviceId,eventId]` on the table `telemetry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `eventId` to the `telemetry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "telemetry" ADD COLUMN     "eventId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_deviceId_eventId_key" ON "telemetry"("deviceId", "eventId");
