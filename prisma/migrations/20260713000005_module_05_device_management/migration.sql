-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('SENSOR', 'ACTUATOR', 'GATEWAY');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PROVISIONING', 'PAIRED', 'ACTIVE', 'INACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN "type" "DeviceType" NOT NULL DEFAULT 'SENSOR',
ADD COLUMN "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONING',
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "device_credentials" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "device_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_credentials_deviceId_key" ON "device_credentials"("deviceId");
CREATE INDEX "devices_ownerId_idx" ON "devices"("ownerId");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
