-- Additive device location table (ADR-004). ASCII only. No changes to Device.
CREATE TABLE "device_locations" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_locations_deviceId_key" ON "device_locations"("deviceId");
